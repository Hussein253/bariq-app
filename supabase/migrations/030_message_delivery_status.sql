-- ============================================================================
-- 030 — حالة توصيل رد الموظف: الفقاعة تقول الحقيقة
-- ============================================================================
--
-- المشكلة (ماسنجر 2026-10-25، المحادثة 5f31200d، تنفيذ n8n 1946):
-- رد الموظف «مرحبا شلون اساعدك» انحفظ وظهر باللوحة، بس ما وصل للزبون: جهاز n8n
-- انقطع عن Supabase (21 ثانية) ثم عن فيسبوك (10 ثواني). التطبيق قطع بعد 15
-- ثانية وطلّع تنبيهاً مؤقتاً، والفقاعة نفسها ما بيها أي أثر للفشل، فالموظف
-- حسبها وصلت.
--
-- الحل: كل رد موظف يحمل حالة توصيله، تكتبها /api/conversations/:id/reply
-- ومسار إعادة الإرسال (lib/message-delivery.ts):
--
--   null           رسالة زبون أو بوت، أو رد قبل هذا الترحيل — بلا علامة
--   pending        انحفظ والإرسال جاري
--   sent           Meta قبلته (external_message_id = wamid أو mid)
--   failed         فشل مؤكد: خارج نافذة 24 ساعة، رفض Meta أو n8n، أو n8n ما وصله الطلب
--   unknown        انتهت مهلة التطبيق وn8n ممكن أرسله بعدها — «تأكد قبل الإعادة»
--   not_supported  قناة بلا إرسال فعلي (إنستغرام) — «حُفظ داخلياً»
--
-- failed و unknown منفصلتان عمداً: إعادة إرسال رسالة وصلت فعلاً تكررها للزبون.
-- ============================================================================

alter table public.messages
  add column if not exists delivery_status     varchar(16),
  add column if not exists delivery_error      text,
  add column if not exists external_message_id text,
  add column if not exists delivery_attempts   smallint not null default 0,
  add column if not exists delivery_updated_at timestamptz;

alter table public.messages drop constraint if exists messages_delivery_status_check;
alter table public.messages add constraint messages_delivery_status_check
  check (delivery_status is null
         or delivery_status in ('pending', 'sent', 'failed', 'unknown', 'not_supported'));

comment on column public.messages.delivery_status is
  'حالة توصيل رد الموظف: pending/sent/failed/unknown/not_supported. null = رسالة زبون أو بوت، أو رد قبل الترحيل ٠٣٠.';
comment on column public.messages.delivery_error is
  'رمز سبب فشل التوصيل (outside_24h_window، n8n 502: messenger_send_failed، timeout…) — لفريق برق.';
comment on column public.messages.external_message_id is
  'معرّف الرسالة عند Meta بعد قبولها: wamid لواتساب، mid لماسنجر.';
comment on column public.messages.delivery_attempts is
  'عدد محاولات الإرسال (الأولى + كل إعادة من اللوحة).';
comment on column public.messages.delivery_updated_at is
  'آخر تغيير لحالة التوصيل — pending أقدم من دقيقتين تُعامل كـ unknown (دالة انقطعت قبل ما تحدّث الحالة).';

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'messages' and column_name like 'delivery%';  -- 4 صفوف
-- select count(*) from public.messages where delivery_status is not null;  -- 0
