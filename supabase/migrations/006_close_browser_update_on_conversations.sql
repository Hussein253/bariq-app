-- =====================================================================
-- 006: إغلاق تام لعمليات الكتابة على conversations / messages من المتصفح
-- ---------------------------------------------------------------------
-- السياق: زر التحكم بالبوت في LiveConversations.tsx لا يكتب في Supabase
-- مباشرةً إطلاقاً — يمر عبر PATCH /api/conversations/[id]/bot بمفتاح
-- service_role. أي أن مسار UPDATE من anon كان غير مستخدم، فأُزيل بالكامل
-- بدل تضييقه (لا حاجة لمحفّز يقارن OLD/NEW).
--
-- تبقى سياسة SELECT مفتوحة مؤقتاً لضمان استمرار البث الحي (Realtime)
-- إلى حين بناء المصادقة في المرحلة القادمة.
-- طُبِّق: 2026-09-05
-- =====================================================================

-- 1) حذف سياسة التحديث المتساهلة
drop policy if exists "conversations_update_bot_active" on public.conversations;

-- 2) سحب صلاحية التحديث بالكامل
revoke update on table public.conversations from anon;
revoke update on table public.conversations from authenticated;

-- 3) تثبيت مبدأ: لا إدراج ولا حذف من المتصفح على جدولي المحادثات
revoke insert, delete on table public.conversations from anon;
revoke insert, delete on table public.conversations from authenticated;
revoke insert, update, delete on table public.messages from anon;
revoke insert, update, delete on table public.messages from authenticated;
