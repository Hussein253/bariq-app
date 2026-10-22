-- ============================================================================
-- 029 — معرفة المنتج للموظف الذكي: مجموعات المنتجات + سياستا الضمان والإرجاع
-- ============================================================================
--
-- ⚠️ مسودة المرحلة الأولى (سكيما أولاً — بند ٢-ب في CLAUDE.md): لم تُطبَّق على
-- أي قاعدة، وتنتظر اعتماد المالك قبل كتابة أي استعلام أو أداة فوقها.
--
-- المشكلة
-- -------
-- صف products اليوم = لون + قياس قابل للبيع (color, size, price_iqd, stock)،
-- و order_items.variant_id يشير إلى products.id، ومُحفِّز ٠٢٣ وحارس المخزون
-- يعتمدان على ذلك. لا مكان لما يخص «المنتج» نفسه لا «لونه وقياسه»: الوصف،
-- المميزات، الفئة، مدة الضمان وأيام الإرجاع. كتابتها على كل صف تكرّر النص
-- على عشرات الصفوف وتفتح باب التضارب عند التعديل.
--
-- القرار (اعتمده المالك: ٢٠٢٦-١٠-٢١)
-- -----------------------------------
--   ١) product_groups: «عائلة المنتج». products.group_id (اختياري) يربط كل
--      صف قابل للبيع بعائلته. الصفوف الحالية تبقى المتغيّرات كما هي، فلا
--      يتأثر order_items ولا ٠٢٣ ولا حارس المخزون ولا decrement_stock_atomic.
--   ٢) التوصيل: لا جداول جديدة. الأداة ستقرأ merchant_delivery_settings
--      (أجرة التاجر المعلنة) و delivery_areas (دليل المناطق) الموجودين.
--   ٣) الضمان والإرجاع: عمودان اختياريان على merchant_profiles (سياسة نصية
--      للمتجر كله) + warranty_months / return_days على عائلة المنتج.
--   ٤) product_cards: واجهة قراءة مضغوطة لبطاقة العائلة (ما يراه الوكيل
--      افتراضياً بدل سجلات products الكاملة).
--
-- دلالة NULL (بند ٢-أ — انعدام التخمين)
-- -------------------------------------
--   warranty_months / return_days / return_policy / warranty_policy:
--     NULL = غير محدَّد ⇒ الوكيل لا يخمّن ويحوّل الزبون لموظف.
--     0    = لا ضمان / لا إرجاع (قرار صريح من التاجر).
--   price_iqd NULL ⇒ لا سعر يُذكر (نفس قاعدة ٠٢٣: لا سعر يُخمَّن).
--
-- ما لا يلمسه هذا الترحيل عمداً
-- -----------------------------
--   • products.price (النصي القديم) و products.stock و products.status.
--   • حدّ الباقة max_products: يعدّ صفوف products (المتغيّرات)، لا العائلات.
--   • لا تغيير في n8n: أداة get_available_products تعمل كما هي.
--
-- افتراض يحتاج تأكيداً من القاعدة الحية (لم يُتحقَّق منه — لا وصول إليها هنا):
--   قيم products.status المستعملة. الكود (lib/catalog.ts) يعرف فقط
--   'inactive' و 'معطل' كحالتين معطّلتين، والواجهة تعدّ ما سواهما (وNULL)
--   غير معطَّل. product_cards يتبع التعريف نفسه. للتحقق قبل التطبيق:
--     select status, count(*) from public.products group by 1 order by 2 desc;
--
-- ⚠️ قابل لإعادة التشغيل: if not exists / or replace / drop ... if exists.
--    لا يحذف ولا يعدّل بيانات قائمة سوى تعبئة products.group_id حيث NULL.
--
-- ⚠️ يتطلب PostgreSQL 15+ (NULLS NOT DISTINCT — مستعمل أصلاً في ٠٢٤، و
--    security_invoker للواجهات).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) التحقق من شكل key_features
--
-- مصفوفة نصوص قصيرة: حتى ٨ عناصر وكل عنصر ≤ ١٢٠ حرفاً. بلا هذا القيد يتحوّل
-- العمود إلى مكبّ نصوص تُرسَل كلها إلى النموذج في كل رد (كلفة توكنز) أو إلى
-- أشياء غير نصية يعجز الوكيل عن عرضها.
-- CASE لا AND: SQL لا يضمن ترتيب تقييم AND، و jsonb_array_length على غير مصفوفة
-- يرمي خطأً بدل أن يُرجع false.
-- ----------------------------------------------------------------------------
create or replace function public.is_valid_key_features(f jsonb)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when jsonb_typeof(f) = 'array' then
      jsonb_array_length(f) <= 8
      and not exists (
        select 1 from jsonb_array_elements(f) e
        where jsonb_typeof(e) <> 'string' or length(e #>> '{}') > 120
      )
    else false
  end
$$;

comment on function public.is_valid_key_features(jsonb) is
  'مصفوفة JSON نصوص: ≤٨ عناصر، كل عنصر ≤١٢٠ حرفاً — قيد product_groups.key_features (الترحيل ٠٢٩).';

-- نفس نمط ar_normalize (٠٢٢): تُستعمل في قيد، فيحتاجها من يكتب الصف (service_role).
revoke execute on function public.is_valid_key_features(jsonb) from anon, authenticated, public;
grant execute on function public.is_valid_key_features(jsonb) to service_role;

-- ----------------------------------------------------------------------------
-- 2) عائلة المنتج
-- ----------------------------------------------------------------------------
create table if not exists public.product_groups (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  catalog_id uuid references public.catalogs (id) on delete set null,
  name text not null,
  category text,
  description text,
  key_features jsonb not null default '[]'::jsonb,
  warranty_months smallint,
  return_days smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- نسختان مطبَّعتان للبحث العربي (ة/ه، ى/ي، أ/ا…) بنفس نمط delivery_areas.area_name_norm
  -- (٠٢٢). يطبّق الكود على نص الزبون التحويل نفسه بـ JavaScript — أي تعديل على
  -- ar_normalize يُعدَّل هناك معه، وإلا انقطعت المطابقة بصمت.
  name_norm text generated always as (public.ar_normalize(name)) stored,
  category_norm text generated always as (public.ar_normalize(category)) stored,
  constraint product_groups_name_not_blank check (btrim(name) <> ''),
  constraint product_groups_key_features_valid check (public.is_valid_key_features(key_features)),
  constraint product_groups_warranty_months_check
    check (warranty_months is null or warranty_months >= 0),
  constraint product_groups_return_days_check
    check (return_days is null or return_days >= 0),
  -- عائلة واحدة لكل (تاجر، قاعدة منتجات، اسم). NULLS NOT DISTINCT لأن catalog_id اختياري.
  constraint product_groups_identity_unique
    unique nulls not distinct (merchant_id, catalog_id, name)
);

comment on table public.product_groups is
  'عائلة المنتج: ما يخص المنتج نفسه لا لونه وقياسه (وصف، مميزات، فئة، ضمان). صفوف products القابلة للبيع ترتبط بها عبر products.group_id — الترحيل ٠٢٩.';
comment on column public.product_groups.key_features is
  'مصفوفة JSON نصوص قصيرة تُعرض في بطاقة الوكيل (أول ٣). القيد is_valid_key_features.';
comment on column public.product_groups.warranty_months is
  'NULL = غير محدَّد (الوكيل يحوّل لموظف ولا يخمّن)، 0 = لا ضمان صراحةً.';
comment on column public.product_groups.return_days is
  'NULL = غير محدَّد (الوكيل يحوّل لموظف ولا يخمّن)، 0 = لا إرجاع صراحةً.';

create index if not exists product_groups_merchant_catalog_idx
  on public.product_groups (merchant_id, catalog_id);

drop trigger if exists product_groups_set_updated_at on public.product_groups;
create trigger product_groups_set_updated_at
  before update on public.product_groups
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3) ربط الصفوف القابلة للبيع بعائلتها
-- ----------------------------------------------------------------------------
alter table public.products
  add column if not exists group_id uuid references public.product_groups (id) on delete set null;

comment on column public.products.group_id is
  'عائلة هذا المتغيّر (لون/قياس). NULL = غير مصنَّف: لا يظهر في product_cards. المُحفِّز يمنع ربطه بعائلة تاجر آخر — الترحيل ٠٢٩.';

create index if not exists products_group_idx on public.products (group_id);

-- منتج تاجر لا يُربط بعائلة تاجر آخر: وإلا عرضت بطاقة تاجرٍ وصفَ ومميزات تاجرٍ
-- ثانٍ (نفس درس C3 في docs/launch-readiness.md). مُحفِّز لا مفتاح أجنبي مركّب:
-- products.merchant_id اختياري، والمفتاح المركّب لا يفرض شيئاً حين يكون NULL.
-- يعمل عند الإدراج وعند تعديل group_id/merchant_id فقط، فلا يمرّ عليه
-- decrement_stock_atomic (يعدّل stock وحده).
create or replace function public.enforce_product_group_same_merchant()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_group_merchant uuid;
begin
  if new.group_id is null then
    return new;
  end if;

  select g.merchant_id into v_group_merchant
    from public.product_groups g
   where g.id = new.group_id;

  if v_group_merchant is distinct from new.merchant_id then
    raise exception using
      errcode = 'BQ020',
      message = format('product %s cannot join group %s of another merchant',
                       coalesce(new.id::text, 'new'), new.group_id);
  end if;

  return new;
end;
$$;

drop trigger if exists products_enforce_group_merchant on public.products;
create trigger products_enforce_group_merchant
  before insert or update of group_id, merchant_id on public.products
  for each row execute function public.enforce_product_group_same_merchant();

-- دالة مُحفِّز لا تُنادى من الـ API — نفس نهج الترحيل ٠١٣
revoke execute on function public.enforce_product_group_same_merchant() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) أمان الصفوف
--
-- قراءة مقيّدة بتاجر المستخدم (نمط ٠١٢). لا سياسة كتابة: كل الكتابة من مسارات
-- الخادم بـ service_role بعد فحص الصلاحية. المسارات التي تقرأ بـ service_role
-- (أدوات البوت) تتجاوز RLS، فتقيّد بـ merchant_id في الاستعلام نفسه.
-- ----------------------------------------------------------------------------
alter table public.product_groups enable row level security;

drop policy if exists "product_groups_select_scoped" on public.product_groups;
create policy "product_groups_select_scoped"
  on public.product_groups for select to authenticated
  using (
    public.auth_role() in ('platform_owner', 'staff')
    or merchant_id = public.auth_merchant_id()
  );

revoke all on table public.product_groups from anon;
revoke insert, update, delete, truncate, trigger, references
  on table public.product_groups from authenticated;

-- ----------------------------------------------------------------------------
-- 5) سياستا الضمان والإرجاع على مستوى المتجر
--
-- merchant_profiles هو الجدول الذي يشارك الوكيل محتواه مع الزبائن (الدوام،
-- الموقع، العروض). السياسة النصية للمتجر كله تعيش معه. التخصيص حسب الفئة لم
-- يُطلب بعد، فلا جدول سياسات منفصل.
-- ----------------------------------------------------------------------------
alter table public.merchant_profiles
  add column if not exists return_policy text,
  add column if not exists warranty_policy text;

comment on column public.merchant_profiles.return_policy is
  'سياسة الإرجاع/الاستبدال كما يعلنها التاجر. NULL = غير محدَّدة (الوكيل يحوّل لموظف ولا يخمّن) — الترحيل ٠٢٩.';
comment on column public.merchant_profiles.warranty_policy is
  'سياسة الضمان كما يعلنها التاجر. NULL = غير محدَّدة (الوكيل يحوّل لموظف ولا يخمّن) — الترحيل ٠٢٩.';

-- ----------------------------------------------------------------------------
-- 6) تعبئة العائلات من الصفوف القائمة
--
-- مفتاح التجميع: (merchant_id, catalog_id, btrim(name)). صفوف بلا تاجر أو
-- باسم NULL/فارغ تبقى بلا عائلة (group_id = NULL) ولا تظهر في product_cards.
-- ⚠️ التجميع بالاسم حرفياً (بعد قصّ الفراغات الطرفية): «تيشيرت» و«تي شيرت»
-- عائلتان. يُراجَع الناتج بالاستعلام في آخر الملف ويدمجه التاجر يدوياً.
-- ----------------------------------------------------------------------------
insert into public.product_groups (merchant_id, catalog_id, name)
select distinct p.merchant_id, p.catalog_id, btrim(p.name)
  from public.products p
 where p.merchant_id is not null
   and p.name is not null
   and btrim(p.name) <> ''
on conflict on constraint product_groups_identity_unique do nothing;

update public.products p
   set group_id = g.id
  from public.product_groups g
 where p.group_id is null
   and g.merchant_id = p.merchant_id
   and g.catalog_id is not distinct from p.catalog_id
   and g.name = btrim(p.name);

-- ----------------------------------------------------------------------------
-- 7) بطاقة المنتج المضغوطة (ما يراه الوكيل افتراضياً)
--
-- صف لكل عائلة. التجميع على صفوف products غير المعطَّلة:
--   • السعر: أدنى/أعلى price_iqd لغير المعطَّل (سعر القائمة، حتى لو نفد المخزون).
--     NULL = لا صف مُسعَّر ⇒ لا سعر يُذكر.
--   • التوفر: مجموع stock للصفوف التي stock > 0 فقط، والألوان/القياسات المتوفرة
--     (مصفوفتان — لا تحفظان الأزواج: «أسود/لارج» متوفر؟ تجيب عنه check_availability).
--   • المعطَّل: status IN ('inactive','معطل') — كما في lib/catalog.ts. NULL غير معطَّل.
-- security_invoker: تُطبَّق RLS للمستعلِم على products و product_groups، لا على مالك
-- الواجهة (الافتراضي يتجاوز RLS).
-- ----------------------------------------------------------------------------
create or replace view public.product_cards
with (security_invoker = true) as
select
  g.id                                                 as group_id,
  g.merchant_id,
  g.catalog_id,
  g.name,
  g.category,
  a.price_from_iqd,
  a.price_to_iqd,
  coalesce(a.available_units, 0)                       as available_units,
  coalesce(a.available_units, 0) > 0                   as in_stock,
  a.available_colors,
  a.available_sizes,
  g.warranty_months,
  g.return_days,
  jsonb_path_query_array(g.key_features, '$[0 to 2]')  as top_features,
  g.description is not null                            as has_details,
  -- للبحث العربي المطبَّع في أدوات البوت (ilike على النسخة المطبَّعة): لولاهما
  -- يحتاج البحث استعلامين (product_groups ثم الواجهة) بدل استعلام واحد.
  g.name_norm,
  g.category_norm
from public.product_groups g
left join lateral (
  select
    min(p.price_iqd)                                                          as price_from_iqd,
    max(p.price_iqd)                                                          as price_to_iqd,
    coalesce(sum(p.stock) filter (where p.stock > 0), 0)::integer             as available_units,
    array_agg(distinct p.color) filter (where p.stock > 0 and p.color is not null) as available_colors,
    array_agg(distinct p.size)  filter (where p.stock > 0 and p.size  is not null) as available_sizes
  from public.products p
  where p.group_id = g.id
    and coalesce(p.status, '') not in ('inactive', 'معطل')
) a on true;

comment on view public.product_cards is
  'بطاقة عائلة المنتج للوكيل: سعر/توفر مجمَّع من products + محتوى product_groups. اقرأها بـ service_role مع فلتر merchant_id صريح — الترحيل ٠٢٩.';

revoke all on table public.product_cards from anon;
revoke insert, update, delete, truncate, trigger, references
  on table public.product_cards from authenticated;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل (للقراءة فقط)
-- ----------------------------------------------------------------------------
-- 1) العائلات الناتجة وعدد متغيّراتها (راجع الأسماء المتشابهة لدمجها):
--    select g.merchant_id, g.name, count(p.id) as variants
--      from public.product_groups g
--      left join public.products p on p.group_id = g.id
--     group by 1, 2 order by 1, 2;
-- 2) صفوف بقيت بلا عائلة (اسم فارغ أو بلا تاجر):
--    select count(*) from public.products where group_id is null;
-- 3) لا عائلة عابرة للتجار (يجب أن يرجع صفراً):
--    select count(*) from public.products p
--      join public.product_groups g on g.id = p.group_id
--     where g.merchant_id is distinct from p.merchant_id;
-- 4) البطاقات:
--    select * from public.product_cards order by merchant_id, name;
