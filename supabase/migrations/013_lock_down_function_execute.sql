-- ============================================================================
-- 013 — سحب صلاحية تنفيذ الدوال من أدوار الـ API
-- ============================================================================
--
-- ما كشفه مدقّق Supabase بعد تطبيق ٠١١:
--
--   auth_role() و auth_merchant_id() و enforce_plan_limit() قابلة للاستدعاء
--   من دور anon عبر /rest/v1/rpc/<name> — أي من أي زائر بلا تسجيل دخول.
--
-- لماذا لم يكفِ `revoke execute ... from public` في الترحيل ٠١١:
-- Supabase تمنح EXECUTE على دوال public مباشرةً لدورَي anon و authenticated
-- عبر ALTER DEFAULT PRIVILEGES، لا عبر الدور الجامع PUBLIC. وسحب صلاحية من
-- PUBLIC لا يمسّ منحاً مباشراً لدور بعينه. الدرس: في Supabase، السحب يجب أن
-- يُسمّي anon و authenticated صراحةً.
--
-- حجم الخطر الفعلي: محدود — الدالتان تُرشِّحان بـ auth.uid()، فاستدعاؤهما
-- من anon يعيد null. لكن كشف دالة SECURITY DEFINER تقرأ profiles على واجهة
-- عامة لا مبرّر له، وأي تعديل مستقبلي على جسمها يصبح خطراً مباشراً.
--
-- ⚠️ authenticated يحتفظ بـ EXECUTE على دالتَي الهوية عمداً: سياسات RLS في
-- الترحيل ٠١٢ تستدعيهما، وتعبير السياسة يُقيَّم بصلاحية المستخدم المُستعلِم.
-- سحبها منه يُسقط كل سياسات القراءة ويحجب التاجر عن بياناته.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) دوال الهوية — تُمنع عن anon، وتبقى لـ authenticated (تحتاجها السياسات)
-- ----------------------------------------------------------------------------

revoke execute on function public.auth_role() from anon;
revoke execute on function public.auth_merchant_id() from anon;

-- ----------------------------------------------------------------------------
-- 2) دوال المُحفِّزات — لا يستدعيها مستخدم إطلاقاً
--
-- تنفيذ دالة مُحفِّز لا يمرّ بفحص صلاحية المستخدم الذي نفّذ INSERT/UPDATE،
-- فسحب EXECUTE منه لا يعطّل المُحفِّز. الدليل قائم في هذه القاعدة نفسها:
-- touch_conversation_on_message مسحوبة من anon و authenticated منذ الترحيل
-- ٠٠٤ ومُحفِّزها يعمل.
-- ----------------------------------------------------------------------------

revoke execute on function public.enforce_plan_limit() from anon, authenticated, public;
revoke execute on function public.enforce_shipment_status_transition() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- 3) تثبيت search_path على دالتَي المُحفِّز المتبقيتين
--
-- دالة بمسار بحث مفتوح تُخدَع بجدول يحمل نفس الاسم في مخطط آخر يسبقه في
-- المسار. الدالتان هنا SECURITY INVOKER فالخطر أقل، لكن التثبيت تغيير في
-- البيانات الوصفية لا في الجسم — بلا كلفة ولا مخاطرة.
-- ----------------------------------------------------------------------------

alter function public.set_updated_at() set search_path to 'public', 'pg_temp';
alter function public.enforce_shipment_status_transition() set search_path to 'public', 'pg_temp';

-- ملاحظة: المدقّق يرصد كذلك upsert_order_items و decrement_stock_atomic
-- بمسار بحث مفتوح. لم تُمسّا هنا لأن جسمهما لم يُراجَع بعد، وتعديل دالة
-- مالية بلا قراءة ما تفعله مخالف لبند ٢-أ. تُعالَجان بعد مراجعتهما.
