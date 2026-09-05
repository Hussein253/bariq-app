-- =====================================================================
-- 009: عمود المنصة + محتوى الطلب + رفع قيد التفرد عن هاتف الطلبات
-- ---------------------------------------------------------------------
-- استند حذف القيد إلى تدقيق كامل لمسارات n8n الخمسة الحية:
--   • لا توجد أي عملية Upsert / ON CONFLICT على جدول orders إطلاقاً —
--     كل الكتابات عبر أداة create_order هي INSERT عادي.
--   • كل قراءات orders بـ phone_number تحمل orderBy صريحاً
--     (created_at.desc) فتبقى حتمية بعد السماح بتعدد الطلبات.
--   • عمليتا الـ Upsert على phone_number موجودتان لكن على جدول
--     customer_sessions لا orders — وقيدهما هناك يبقى كما هو ولا يُمس.
-- بل إن القيد كان عيباً كامناً: أول طلب ثانٍ لزبون عائد كان سيفشل
-- بخطأ duplicate key داخل البوت الحي.
-- طُبِّق: 2026-09-05
-- =====================================================================

-- 1) عمود المنصة في سجل المحادثات
alter table public.conversation_log
  add column if not exists platform text default 'whatsapp';

comment on column public.conversation_log.platform is
  'قناة المحادثة: whatsapp | messenger | instagram | telegram. تملؤها مسارات n8n من الـ Webhook.';

update public.conversation_log set platform = 'whatsapp' where platform is null;

create index if not exists conversation_log_platform_idx
  on public.conversation_log (platform);

-- 2) محتوى الطلب (نوع المنتجات)
alter table public.orders
  add column if not exists order_content text;

comment on column public.orders.order_content is
  'وصف محتوى الطلب كما يُدخله الموظف أو البوت (مثال: تيشرتات، عطور، إلكترونيات). يُطبع على ستيكر الشحنة.';

-- 3) رفع قيد التفرد عن رقم هاتف الطلب + فهارس البحث
alter table public.orders drop constraint if exists orders_phone_number_key;

create index if not exists orders_phone_number_idx
  on public.orders (phone_number);

-- فهرس مركّب يخدم النمط الفعلي في n8n واللوحة: أحدث طلب لرقم معيّن
create index if not exists orders_phone_created_idx
  on public.orders (phone_number, created_at desc);

-- 4) تحديث دالة المزامنة لتأخذ platform من conversation_log
create or replace function public.sync_live_n8n_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_content         text;
  v_sender          text;
  v_platform        text;
  v_merchant_id     uuid;
  v_created_at      timestamptz;
begin
  v_content    := nullif(btrim(coalesce(new.message, new.message_text)), '');
  v_created_at := coalesce(new.created_at, now());

  if new.phone_number is null or v_content is null then
    return null;
  end if;

  -- المنصة: تُؤخذ من السجل وتُطبَّع إلى القيم المعتمدة.
  -- أي قيمة غير معروفة تعود إلى 'whatsapp' حفاظاً على اتساق المحادثات.
  v_platform := lower(btrim(coalesce(new.platform, 'whatsapp')));
  if v_platform not in ('whatsapp', 'messenger', 'instagram', 'telegram') then
    v_platform := 'whatsapp';
  end if;

  -- direction هو المرجع القاطع؛ sender احتياطي عند غيابه
  v_sender := case
    when new.direction in ('incoming', 'inbound')  then 'customer'
    when new.direction in ('outgoing', 'outbound') then 'bot'
    when new.sender = 'customer'                   then 'customer'
    when new.sender = 'bot'                        then 'bot'
    else null
  end;

  if v_sender is null then
    v_sender := 'system';
    begin
      insert into public.failed_events
        (workflow_name, node_name, phone_number, raw_input, error_message, status)
      values
        ('sync_live_n8n_messages', 'conversation_log_trigger', new.phone_number,
         to_jsonb(new),
         'تعذر تحديد المرسل: direction و sender غير معروفين — سُجّلت الرسالة كـ system',
         'OPEN');
    exception when others then null;
    end;
  end if;

  select id into v_conversation_id
    from public.conversations
   where customer_phone = new.phone_number and platform = v_platform;

  if v_conversation_id is null then
    select id into v_merchant_id from public.merchants order by created_at asc limit 1;

    insert into public.conversations (customer_phone, platform, merchant_id, updated_at)
    values (new.phone_number, v_platform, v_merchant_id, v_created_at)
    on conflict (customer_phone, platform) do update set updated_at = excluded.updated_at
    returning id into v_conversation_id;
  end if;

  insert into public.messages (conversation_id, sender_type, message_type, content, created_at)
  values (v_conversation_id, v_sender, 'text', v_content, v_created_at)
  on conflict do nothing;

  return null;

exception when others then
  begin
    insert into public.failed_events
      (workflow_name, node_name, phone_number, raw_input, error_message, status)
    values
      ('sync_live_n8n_messages', 'conversation_log_trigger', new.phone_number,
       to_jsonb(new), 'فشل المزامنة: ' || sqlerrm, 'OPEN');
  exception when others then null;
  end;
  return null;
end;
$$;

revoke execute on function public.sync_live_n8n_messages() from public;
revoke execute on function public.sync_live_n8n_messages() from anon;
revoke execute on function public.sync_live_n8n_messages() from authenticated;
