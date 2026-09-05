-- =====================================================================
-- 005: إغلاق جدول whatsapp_messages نهائياً أمام مفاتيح المتصفح
-- ---------------------------------------------------------------------
-- السياق: بعد اعتماد public.messages مصدراً وحيداً للمحادثات، لم يعد
-- لهذا الجدول أي وصول برمجي في تطبيق Next.js. دور service_role يتجاوز
-- RLS بحكم التصميم، فتبقى القراءة للصيانة والأرشفة ممكنة من الخادم،
-- وتبقى مسارات n8n (تستخدم service_role) عاملة دون أي تغيير.
-- البيانات التاريخية تبقى كما هي — الإغلاق لا يحذف شيئاً.
-- طُبِّق: 2026-09-05
-- =====================================================================

-- 1) حذف السياستين العامتين اللتين كانتا تمنحان القراءة والإدراج للجميع
drop policy if exists "Allow public read whatsapp_messages"   on public.whatsapp_messages;
drop policy if exists "Allow public insert whatsapp_messages" on public.whatsapp_messages;

-- 2) تفعيل RLS — صفر سياسات = إغلاق تام أمام anon و authenticated
alter table public.whatsapp_messages enable row level security;

-- 3) دفاع في العمق: سحب الصلاحيات نفسها
revoke all on table public.whatsapp_messages from anon;
revoke all on table public.whatsapp_messages from authenticated;

-- 4) إخراجه من منشور Realtime — لا مشترك له بعد الآن (توفير في WAL)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime drop table public.whatsapp_messages;
  end if;
end $$;
