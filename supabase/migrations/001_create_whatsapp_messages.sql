-- ============================================================================
-- إنشاء جدول whatsapp_messages في Supabase
-- مع تفعيل Realtime لعرض الرسائل الجديدة فوراً في واجهة المستخدم
-- ============================================================================

-- 1) إنشاء الجدول
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  message_text text not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  created_at timestamptz not null default now()
);

-- 2) فهرس لرفع أداء الاستعلامات حسب رقم الهاتف والوقت
create index if not exists whatsapp_messages_phone_idx
  on public.whatsapp_messages (phone_number, created_at desc);

-- 3) تفعيل Row Level Security (RLS)
alter table public.whatsapp_messages enable row level security;

-- 4) سياسات الوصول (مؤقتة للتطوير: قراءة وكتابة للجميع عبر anon key)
--    ⚠️ في الإنتاج يُنصح بتقييدها باستخدام Auth أو Service Role فقط
create policy "Allow public read whatsapp_messages"
  on public.whatsapp_messages for select
  using (true);

create policy "Allow public insert whatsapp_messages"
  on public.whatsapp_messages for insert
  with check (true);

-- 5) تفعيل Realtime على جدول whatsapp_messages
--    هذا يجعل أي صف جديد يُضاف ينعكس فوراً في واجهة المستخدم عبر الاشتراك
alter publication supabase_realtime add table public.whatsapp_messages;