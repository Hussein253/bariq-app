-- ============================================================================
-- تهيئة أولى: منح أول حساب دور مالك المنصة
-- ============================================================================
--
-- ⚠️ ليس ترحيلاً. يُشغَّل يدوياً مرة واحدة بعد الترحيل ٠١١، وقبل أول تسجيل
-- دخول. سبب فصله: هوية المالك قرار تشغيلي يخصّ هذا النشر تحديداً، وليست
-- جزءاً من هيكل قاعدة البيانات — ولا يصح أن يُعاد تطبيقها على كل بيئة.
--
-- لماذا يلزم أصلاً: بعد تشغيل المصادقة، الحساب في auth.users وحده لا يمنح
-- صلاحية على شيء. getSessionProfile يرفض أي مستخدم بلا صف في public.profiles
-- ويُنهي جلسته — وهو سلوك مقصود (حساب بلا دور ليس مستخدماً بعد). وجدول
-- profiles يبدأ فارغاً، فبدون هذا الملف لا يستطيع أحد الدخول إطلاقاً.
--
-- كيف يُشغَّل: من Supabase Dashboard → SQL Editor، بعد استبدال البريد أدناه.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) مالك المنصة
-- ----------------------------------------------------------------------------
-- بدّل البريد إلى بريد المالك الفعلي. الحساب يجب أن يكون موجوداً في
-- auth.users مسبقاً (يُنشأ من Dashboard → Authentication → Add user).

insert into public.profiles (user_id, role, merchant_id, store_name)
select u.id, 'platform_owner', null, 'برق'
from auth.users u
where u.email = 'CHANGE_ME@example.com'
on conflict (user_id) do update
  set role = 'platform_owner',
      merchant_id = null,
      updated_at = now();

-- ----------------------------------------------------------------------------
-- 2) موظف برق (اختياري)
-- ----------------------------------------------------------------------------
-- يرى /operations و /operations/chats و /dashboard، ولا يرى /admin
-- (أرصدة التجار والإيرادات والعمولات).
--
-- insert into public.profiles (user_id, role, merchant_id, store_name)
-- select u.id, 'staff', null, null
-- from auth.users u
-- where u.email = 'staff@example.com'
-- on conflict (user_id) do update set role = 'staff', merchant_id = null;

-- ----------------------------------------------------------------------------
-- 3) تاجر (اختياري)
-- ----------------------------------------------------------------------------
-- merchant_id إلزامي هنا: قيد profiles_merchant_link_check يرفض تاجراً بلا
-- تاجر مرتبط، لأن حساباً كهذا يدخل ولا يرى شيئاً.
--
-- insert into public.profiles (user_id, role, merchant_id, store_name)
-- select u.id, 'merchant', 'ضع-معرّف-التاجر-هنا'::uuid, 'اسم المتجر'
-- from auth.users u
-- where u.email = 'merchant@example.com'
-- on conflict (user_id) do update
--   set role = 'merchant', merchant_id = excluded.merchant_id;

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select u.email, p.role, p.merchant_id
-- from public.profiles p join auth.users u on u.id = p.user_id
-- order by p.role;
