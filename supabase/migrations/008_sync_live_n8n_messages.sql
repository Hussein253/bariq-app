-- =====================================================================
-- 008: مزامنة حية من conversation_log (مسار n8n) إلى messages
-- ---------------------------------------------------------------------
-- السياق: مسارات n8n الحية تكتب في conversation_log مباشرةً ولا تمر
-- بتطبيق Next.js. هذا المحفّز يعكس كل رسالة جديدة إلى نموذج المحادثات
-- فتظهر فوراً في لوحة التحكم عبر Realtime، دون تعديل أي مسار n8n.
--
-- مبدأ حاكم: هذا المحفّز يجب ألّا يكسر مسار البوت الحي مهما حدث.
-- كل خطأ يُلتقط ويُسجَّل في failed_events، ويستمر إدراج conversation_log.
-- طُبِّق: 2026-09-05
-- =====================================================================

-- 1) مفتاح التفرد الطبيعي للرسالة
--    ⚠️ يُفهرَس المحتوى عبر md5() لا كنص خام: حد صف فهرس btree ≈ 2704 بايت،
--    ورسالة واتساب قد تبلغ 4096 محرفاً (≈12KB بالعربية UTF-8)، فقيد على
--    النص الخام كان سيُفشل إدراج أي رسالة طويلة ويوقف تسجيل المحادثة.
--    دلالة التفرد تبقى: (conversation_id, content, created_at).
create unique index if not exists messages_natural_key_uidx
  on public.messages (conversation_id, created_at, md5(content));

-- 2) دالة المزامنة
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
  v_merchant_id     uuid;
  v_created_at      timestamptz;
begin
  v_content    := nullif(btrim(coalesce(new.message, new.message_text)), '');
  v_created_at := coalesce(new.created_at, now());

  if new.phone_number is null or v_content is null then
    return null;
  end if;

  -- direction هو المرجع القاطع؛ sender احتياطي عند غيابه
  v_sender := case
    when new.direction in ('incoming', 'inbound')  then 'customer'
    when new.direction in ('outgoing', 'outbound') then 'bot'
    when new.sender = 'customer'                   then 'customer'
    when new.sender = 'bot'                        then 'bot'
    else null
  end;

  -- حالة شاذة: لا نُسقط الرسالة، نسجّلها كـ system ونرفع بلاغاً
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

  -- المحادثة: تُجلب أو تُنشأ عند أول رسالة من رقم جديد
  -- ملاحظة: conversation_log بلا عمود platform، لذا نعتمد 'whatsapp'
  -- مطابقةً للصفوف المُرحَّلة. إضافة عمود platform لاحقاً تسمح بتمييز
  -- ماسنجر وإنستغرام بدقة.
  select id into v_conversation_id
    from public.conversations
   where customer_phone = new.phone_number and platform = 'whatsapp';

  if v_conversation_id is null then
    select id into v_merchant_id from public.merchants order by created_at asc limit 1;

    insert into public.conversations (customer_phone, platform, merchant_id, updated_at)
    values (new.phone_number, 'whatsapp', v_merchant_id, v_created_at)
    on conflict (customer_phone, platform) do update set updated_at = excluded.updated_at
    returning id into v_conversation_id;
  end if;

  -- إدراج idempotent — إعادة تشغيل المسار لا تُنتج ازدواجاً
  insert into public.messages (conversation_id, sender_type, message_type, content, created_at)
  values (v_conversation_id, v_sender, 'text', v_content, v_created_at)
  on conflict do nothing;

  return null;

exception when others then
  -- شبكة الأمان: كسر تسجيل البوت الحي أخطر من فوات صف في اللوحة
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

-- 3) المحفّز
drop trigger if exists trg_sync_live_n8n_messages on public.conversation_log;
create trigger trg_sync_live_n8n_messages
  after insert on public.conversation_log
  for each row
  execute function public.sync_live_n8n_messages();

-- 4) تأكيد منشور Realtime لجدول messages (محلياً وعلى Vercel)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

alter table public.messages replica identity full;

-- 5) ردم الفجوة: صفوف سبقت المحفّز ولم تصل messages
insert into public.messages (conversation_id, sender_type, message_type, content, created_at)
select c.id,
       case when cl.direction in ('incoming','inbound') then 'customer' else 'bot' end,
       'text', btrim(coalesce(cl.message, cl.message_text)), cl.created_at
from public.conversation_log cl
join public.conversations c
  on c.customer_phone = cl.phone_number and c.platform = 'whatsapp'
where nullif(btrim(coalesce(cl.message, cl.message_text)),'') is not null
on conflict do nothing;
