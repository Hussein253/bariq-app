-- =====================================================================
-- 003: تفعيل المحادثات والرسائل الحية (Realtime) + سياسات RLS + الفهارس
-- ---------------------------------------------------------------------
-- الهدف: جعل جدولي public.conversations و public.messages المصدر الوحيد
-- الذي تعرضه لوحة التحكم مباشرةً، مع تمكين زر التحكم بـ bot_active.
-- طُبِّق على المشروع بتاريخ 2026-09-04.
-- =====================================================================

-- 1) قيد فريد لكل (رقم الزبون + المنصة) لتمكين upsert من الـ webhook
create unique index if not exists conversations_phone_platform_key
  on public.conversations (customer_phone, platform);

-- 2) الفهارس الذكية
create index if not exists conversations_updated_at_idx
  on public.conversations (updated_at desc);
create index if not exists conversations_merchant_idx
  on public.conversations (merchant_id);
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at asc);

-- 3) قيود التحقق على نوع المرسل ونوع الرسالة
alter table public.messages drop constraint if exists messages_sender_type_check;
alter table public.messages add constraint messages_sender_type_check
  check (sender_type in ('customer', 'bot', 'agent', 'system'));

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'audio', 'document', 'location', 'template'));

-- 4) محفّز: تحديث conversations.updated_at عند وصول أي رسالة جديدة
--    (يضبط ترتيب قائمة المحادثات ويطلق حدث Realtime على جدول conversations)
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set updated_at = coalesce(new.created_at, now())
   where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_conversation_on_message on public.messages;
create trigger trg_touch_conversation_on_message
  after insert on public.messages
  for each row
  execute function public.touch_conversation_on_message();

-- الدالة تُستدعى من المحفّز فقط - نمنع استدعاءها عبر REST (migration 004)
revoke execute on function public.touch_conversation_on_message() from public;
revoke execute on function public.touch_conversation_on_message() from anon;
revoke execute on function public.touch_conversation_on_message() from authenticated;

-- 5) سياسات RLS
--    القراءة مسموحة للواجهة (anon / authenticated) — شرط ضروري ليعمل Realtime.
--    الكتابة تمر حصراً عبر مسارات API في الخادم بمفتاح service_role.
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

drop policy if exists "conversations_select_client" on public.conversations;
create policy "conversations_select_client"
  on public.conversations for select to anon, authenticated using (true);

drop policy if exists "conversations_update_bot_active" on public.conversations;
create policy "conversations_update_bot_active"
  on public.conversations for update to anon, authenticated
  using (true) with check (true);

drop policy if exists "messages_select_client" on public.messages;
create policy "messages_select_client"
  on public.messages for select to anon, authenticated using (true);

-- 6) REPLICA IDENTITY FULL: لتصل كل الأعمدة في أحداث UPDATE/DELETE
alter table public.conversations replica identity full;
alter table public.messages      replica identity full;

-- 7) إضافة الجدولين إلى منشور Realtime
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- =====================================================================
-- 8) ترحيل البيانات التاريخية (نُفِّذ مرة واحدة — آمن لإعادة التشغيل)
--    المصدر الأساسي: conversation_log (يحتوي sender دقيق)
--    المصدر الثانوي: whatsapp_messages (غير المكرر خلال نافذة 90 ثانية)
-- =====================================================================
with all_phones as (
  select distinct phone_number from public.conversation_log where phone_number is not null
  union
  select distinct phone_number from public.whatsapp_messages where phone_number is not null
),
default_merchant as (select id from public.merchants order by created_at asc limit 1)
insert into public.conversations (merchant_id, customer_phone, platform, bot_active, created_at, updated_at)
select (select id from default_merchant), p.phone_number, 'whatsapp', coalesce(cs.bot_active, true), now(), now()
from all_phones p
left join public.customer_sessions cs on cs.phone_number = p.phone_number
on conflict (customer_phone, platform) do nothing;

insert into public.messages (conversation_id, sender_type, message_type, content, created_at)
select c.id,
       case when cl.sender = 'customer' or cl.direction in ('incoming','inbound') then 'customer' else 'bot' end,
       'text', coalesce(cl.message, cl.message_text), cl.created_at
from public.conversation_log cl
join public.conversations c on c.customer_phone = cl.phone_number and c.platform = 'whatsapp'
where coalesce(cl.message, cl.message_text) is not null
  and coalesce(cl.message, cl.message_text) <> ''
  and not exists (
    select 1 from public.messages m
    where m.conversation_id = c.id
      and m.content = coalesce(cl.message, cl.message_text)
      and m.created_at = cl.created_at
  );

insert into public.messages (conversation_id, sender_type, message_type, content, created_at)
select c.id,
       case when wm.direction = 'inbound' then 'customer' else 'bot' end,
       'text', wm.message_text, wm.created_at
from public.whatsapp_messages wm
join public.conversations c on c.customer_phone = wm.phone_number and c.platform = 'whatsapp'
where wm.message_text is not null and wm.message_text <> ''
  and not exists (
    select 1 from public.messages m
    where m.conversation_id = c.id
      and m.content = wm.message_text
      and abs(extract(epoch from (m.created_at - wm.created_at))) < 90
  );

-- مزامنة ترتيب المحادثات مع آخر رسالة فعلية
update public.conversations c
set updated_at = sub.mx
from (select conversation_id, max(created_at) mx from public.messages group by 1) sub
where sub.conversation_id = c.id and c.updated_at <> sub.mx;
