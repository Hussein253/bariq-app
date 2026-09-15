-- ============================================================================
-- 011 — نموذج الأدوار، وإغلاق تصعيد الصلاحيات في profiles
-- ============================================================================
--
-- ⚠️ ثغرة تصعيد صلاحيات تُغلق هنا:
--
-- كانت على public.profiles سياستان قائمتان في القاعدة الحية:
--     "Users can insert own profile"  — insert to authenticated
--                                       with check (auth.uid() = user_id)
--     "Users can update own profile"  — update to authenticated
--                                       using (auth.uid() = user_id)
--
-- أي أن كل مستخدم مسجَّل يستطيع كتابة صفّه في profiles وتعديله — بما فيه
-- عمودا role و merchant_id. مستخدم عادي كان يرفع نفسه إلى platform_owner
-- أو يربط نفسه بأي تاجر بنداء واحد من المتصفح. تُحذف السياستان هنا:
-- الأدوار يمنحها مالك المنصة بـ service_role، ولا يمنحها المستخدم لنفسه.
--
-- (لم تُستغل هذه الثغرة عملياً لأن profiles كان فارغاً ولا يوجد تسجيل دخول
-- أصلاً — لكنها كانت ستُصبح قابلة للاستغلال لحظة تشغيل المصادقة.)
--
-- ويُوثَّق هنا أيضاً ما فات الترحيل ٠١٠: السياسات القائمة على الجداول. ذلك
-- الترحيل وثّق الجداول والقيود والفهارس وأغفل السياسات، فكانت إعادة بناء
-- القاعدة منه تُنتج صفحة تعريف بلا باقات (plans محجوبة بلا سياسة قراءة).
--
-- الأدوار الثلاثة (قرار مُعتمد من المالك):
--   platform_owner → كل شيء بما فيه /admin، وله فتح مساحة أي تاجر بأثر مُقيَّد
--   staff          → /operations و /operations/chats و /dashboard
--   merchant       → /workspace، مقيّداً بتاجره وحده
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ما فات الترحيل ٠١٠: سياسة قراءة الباقات العامة
-- ----------------------------------------------------------------------------

-- صفحة التعريف تقرأ الباقات بمفتاح anon. القيد `is_active` مقصود: الباقة
-- المعطّلة (تسعيرة قيد الإعداد مثلاً) لا تظهر للعامة.
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read"
  on public.plans for select to anon, authenticated
  using (is_active);

-- ----------------------------------------------------------------------------
-- 2) نموذج الأدوار على profiles
-- ----------------------------------------------------------------------------

-- 'employee' لم يكن دوراً معرّفاً في أي مكان — لا في الكود ولا في قيد. الدور
-- الآن إلزامي وصريح عند الإنشاء: قيمة افتراضية تعني حساباً يُولد بصلاحية لم
-- يقصدها أحد.
alter table public.profiles alter column role drop default;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('platform_owner', 'staff', 'merchant'));

-- التاجر بلا merchant_id حساب معطَّل عملياً (لا يرى شيئاً)، وموظف برق مع
-- merchant_id تناقض يفتح له مساحة تاجر بلا قصد. القيد يمنع الحالتين.
alter table public.profiles drop constraint if exists profiles_merchant_link_check;
alter table public.profiles add constraint profiles_merchant_link_check
  check (
    (role = 'merchant' and merchant_id is not null)
    or (role <> 'merchant' and merchant_id is null)
  );

comment on column public.profiles.role is
  'platform_owner | staff | merchant — تُمنح بـ service_role فقط، ولا يعدّلها المستخدم على نفسه.';
comment on column public.profiles.merchant_id is
  'إلزامي للدور merchant، وممنوع لغيره (قيد profiles_merchant_link_check).';

-- ----------------------------------------------------------------------------
-- 3) سياسات profiles — قراءة الذات فقط، ولا كتابة إطلاقاً
-- ----------------------------------------------------------------------------

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "users_view_own_profile" on public.profiles;

-- القراءة للصفّ الخاص فقط. لا سياسة insert ولا update ولا delete: غياب
-- السياسة منعٌ تام، وهو المقصود — إدارة الحسابات تمرّ بـ service_role.
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4) دوال الهوية — تُستعمل في سياسات الجداول الأخرى (ترحيل ٠١٢)
--
-- SECURITY DEFINER لأنها تقرأ profiles الذي تحرسه سياسته الخاصة، ولولا ذلك
-- لاحتاجت كل سياسة أن تفتح profiles للقراءة فتدور في حلقة.
-- STABLE ليُقيّمها المخطِّط مرة لكل استعلام لا مرة لكل صف.
-- search_path مثبَّت: دالة SECURITY DEFINER بمسار بحث مفتوح تُخدَع بجدول
-- يحمل نفس الاسم في مخطط آخر.
-- ----------------------------------------------------------------------------

create or replace function public.auth_role()
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.auth_merchant_id()
returns uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select merchant_id from public.profiles where user_id = auth.uid()
$$;

comment on function public.auth_role() is
  'دور المستخدم الحالي من profiles، أو null إن لم يكن داخلاً أو بلا ملف.';
comment on function public.auth_merchant_id() is
  'تاجر المستخدم الحالي. null لمالك المنصة ولموظفي برق — وهو ما يجعل سياسات التجار ترفضهم تلقائياً بدل منحهم كل شيء.';

revoke execute on function public.auth_role() from public;
revoke execute on function public.auth_merchant_id() from public;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_merchant_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 5) سجل دخول مالك المنصة إلى مساحات التجار
--
-- الصلاحية بلا أثر تعني أن لا أحد يعرف من اطّلع على بيانات من ومتى. التاجر
-- من حقه أن يُسأل عن ذلك ويُجاب بدقة.
-- ----------------------------------------------------------------------------

create table if not exists public.admin_impersonation_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  occurred_at timestamptz not null default now()
);

comment on table public.admin_impersonation_log is
  'كل فتح لمساحة تاجر من مالك المنصة. on delete restrict على الطرفين: حذف حساب أو تاجر لا يجوز أن يمحو أثر الاطّلاع على بياناته.';

create index if not exists admin_impersonation_merchant_idx
  on public.admin_impersonation_log (merchant_id, occurred_at desc);
create index if not exists admin_impersonation_actor_idx
  on public.admin_impersonation_log (actor_user_id, occurred_at desc);

-- سجل تدقيق يُكتب بـ service_role ويُقرأ بمراجعة مقصودة. لا سياسة لأي دور:
-- لا يُعدَّل ولا يُحذف من التطبيق بحال.
alter table public.admin_impersonation_log enable row level security;
