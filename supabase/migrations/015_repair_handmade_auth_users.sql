-- ============================================================================
-- 015 — إصلاح صفوف auth.users المُدرَجة يدوياً
-- ============================================================================
--
-- العطل: حساب مالك المنصة لم يستطع الدخول إطلاقاً، والرسالة "البريد أو كلمة
-- المرور غير صحيحة" — فبدا أنه نسي كلمة المرور. ولم يكن ذلك السبب.
--
-- ما كُشف بالفحص: صفّه في auth.users أُدرج بـ INSERT مباشر لا عبر نظام
-- المصادقة (GoTrue)، فبقيت فيه أعمدة NULL يملؤها GoTrue عادةً:
--
--     instance_id  = NULL   (المتوقع: 00000000-0000-0000-0000-000000000000)
--     aud          = NULL   (المتوقع: 'authenticated')
--     role         = NULL   (المتوقع: 'authenticated')
--     *_token      = NULL   (المتوقع: '' — نص فارغ لا NULL)
--
-- الأثر مزدوج:
--   • GoTrue يُرشِّح باستعلامه على instance_id، فالحساب **لا يظهر** في
--     /auth/v1/admin/users إطلاقاً — أي أن إعادة ضبط كلمة المرور عبر الـ API
--     كانت تردّ 404 بلا أن يفهم أحد لماذا.
--   • منح كلمة المرور يفشل، فيبدو العطل وكأنه كلمة مرور خاطئة.
--
-- لماذا الأعمدة النصية '' لا NULL: GoTrue مكتوب بـ Go ويقرأ هذه الأعمدة في
-- حقول string غير قابلة لـ NULL، فالقيمة NULL تُفشل القراءة من أساسها.
--
-- الدرس: لا يُنشأ حساب بـ INSERT في auth.users أبداً. الطريق الوحيد هو
-- /auth/v1/admin/users (وهو ما تستعمله lib/users-server.ts)، أو لوحة
-- Supabase. سكربت supabase/seed/001 يمنح الدور فقط ولا ينشئ الحساب — وهذا
-- صحيح، لكن من أنشأ الحساب يدوياً خارجه وقع في هذا.
--
-- الأداة التشغيلية المرافقة: scripts/set-password.sh — تضبط كلمة المرور
-- ثم **تُجرّب دخولاً حقيقياً** وتقول إن نجح أم لا، بدل الاكتفاء بـ 200.
-- ============================================================================

update auth.users
set
  instance_id                = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
  aud                        = coalesce(aud, 'authenticated'),
  role                       = coalesce(role, 'authenticated'),
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change               = coalesce(email_change, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where
  instance_id is null
  or aud is null
  or role is null
  or confirmation_token is null
  or recovery_token is null
  or email_change_token_new is null
  or email_change_token_current is null
  or email_change is null
  or phone_change is null
  or phone_change_token is null
  or reauthentication_token is null;

-- ملاحظة: phone يبقى NULL عمداً. عليه فهرس فريد، والنص الفارغ يجعل كل
-- حساب بلا هاتف يتعارض مع الآخر.

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل — يجب أن يعيد صفراً
-- ----------------------------------------------------------------------------
-- select count(*) from auth.users
-- where instance_id is null or aud is null or role is null;
