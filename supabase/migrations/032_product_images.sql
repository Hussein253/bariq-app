-- ============================================================================
-- 032 — صور المنتجات: التاجر يرفعها من لوحة برق، والبوت يدزها للزبون إذا طلبها
-- ============================================================================
--
-- المشكلة:
-- الزبون يكتب «دزلي صورة التشيرت الأسود» والبوت ما عنده أي صورة: products
-- بلا عمود صورة، ولا حاوية تخزين للصور. فالبوت يوصف بالكلام أو يحوّل لموظف.
--
-- القرار:
--   • الصورة تخص «المنتج + اللون» لا صف products الواحد: صف products = لون +
--     قياس قابل للبيع (تشيرت أسود بأربع قياسات = ٤ صفوف)، والقياس ما يغيّر
--     شكل المنتج. رفع الصورة من أي صف يربطها بكل قياسات نفس الاسم واللون.
--     color = NULL ⇒ صورة للمنتج بلا لون محدد (مثل غسالة بلون واحد).
--   • الربط بالقيم المطبّعة btrim(name) و nullif(btrim(color), '') — نفس
--     تطبيع «تحديد التاجر» في n8n — لا بمعرّف صف: حذف صف قياس واحد ما يضيّع
--     الصورة، وإضافة قياس جديد بنفس الاسم واللون تلقى صورتها جاهزة.
--   • الحاوية product-images عامة (public): Meta (واتساب/ماسنجر/إنستغرام)
--     تنزّل الصورة من رابط تفتحه بلا مصادقة، وصورة المنتج معروضة للزبائن
--     أصلاً. المسار فيه UUID عشوائي فلا يُخمَّن، ولا سياسة SELECT على
--     storage.objects للحاوية فلا تُسرد ملفاتها.
--   • الكتابة من الخادم وحده (app/api/catalog/images بمفتاح service_role بعد
--     requireMerchantScope). لا سياسة إدراج/تعديل/حذف للمتصفح.
--
-- شكل الصف (JSON Schema مختصر):
--   { id: bigint, merchant_id: uuid, product_name: text (مطبّع، غير فارغ),
--     color: text | null (مطبّع، غير فارغ إن وُجد),
--     path: "<merchant_id>/<uuid>.<jpg|png>" داخل الحاوية product-images,
--     mime_type: "image/jpeg" | "image/png", size_bytes: 1..5242880,
--     created_at: timestamptz }
--
-- حدود Meta التي بُني عليها الحجم والصيغ: صورة واتساب ≤ 5MB وصيغها JPEG/PNG
-- فقط (WebP للملصقات)، فالحاوية تقبلهما وحدهما. الواجهة تصغّر الصورة وتحوّلها
-- JPEG قبل الرفع (حدّ جسم الطلب في Vercel ٤٫٥MB).
--
-- ⚠️ قابل لإعادة التشغيل: if not exists / or replace / drop ... if exists.
--    إضافي بالكامل: لا يلمس products ولا أي جدول قائم.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الجدول
-- ----------------------------------------------------------------------------

create table if not exists public.product_images (
  id           bigint generated always as identity primary key,
  merchant_id  uuid not null references public.merchants (id) on delete cascade,
  product_name text not null,
  color        text,
  path         text not null unique,
  mime_type    text not null,
  size_bytes   integer not null,
  created_at   timestamptz not null default now(),

  constraint product_images_name_normalized
    check (product_name = btrim(product_name) and product_name <> ''),
  constraint product_images_color_normalized
    check (color is null or (color = btrim(color) and color <> '')),
  constraint product_images_mime
    check (mime_type in ('image/jpeg', 'image/png')),
  constraint product_images_size
    check (size_bytes > 0 and size_bytes <= 5242880),
  -- أول مقطع بالمسار هو التاجر: صورة تاجر ما تنكتب بمجلد تاجر ثاني
  constraint product_images_path_in_merchant_folder
    check (split_part(path, '/', 1) = merchant_id::text)
);

create index if not exists product_images_merchant_product
  on public.product_images (merchant_id, product_name, color);

comment on table public.product_images is
  'صور المنتجات لكل (تاجر، اسم المنتج، اللون). الملف في الحاوية العامة product-images. يكتبها /api/catalog/images وحده؛ البوت يقرأها عبر bot_product_images_section و bot_product_images.';
comment on column public.product_images.color is
  'اللون المطبّع nullif(btrim(color), ''''). NULL = صورة للمنتج بلا لون محدد.';
comment on column public.product_images.path is
  'المسار داخل الحاوية product-images: <merchant_id>/<uuid>.<jpg|png>.';

-- ----------------------------------------------------------------------------
-- 2) الصلاحيات: قراءة بنفس نطاق products، والكتابة لـ service_role وحده
-- ----------------------------------------------------------------------------

alter table public.product_images enable row level security;

revoke all on public.product_images from anon, public;
revoke insert, update, delete, truncate, references, trigger on public.product_images from authenticated;
grant select on public.product_images to authenticated;

drop policy if exists product_images_select_scoped on public.product_images;
create policy product_images_select_scoped
  on public.product_images for select to authenticated
  using (
    (select public.auth_role()) = any (array['platform_owner', 'staff'])
    or merchant_id = (select public.auth_merchant_id())
  );

-- ----------------------------------------------------------------------------
-- 3) الحاوية: عامة، JPEG/PNG، ٥ ميغابايت
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 4) ما يقرأه البوت (n8n عبر عقدة Postgres)
--
-- «رمز الصور» = أصغر id بمجموعة (الاسم، اللون). الوكيل يكتبه بسطر
-- IMAGES: <رمز> وn8n يمرره لـ bot_product_images، والدالة تقبل أي id من
-- المجموعة فرمز قديم بذاكرة المحادثة يبقى يشتغل ما دامت صورة منها موجودة.
-- ----------------------------------------------------------------------------

-- قائمة الصور للوكيل: سطر لكل منتج/لون عنده صور ومتوفر بالمخزون (نفس شرط
-- stock > 0 بـ get_available_products و«تحديد التاجر»). '' = ماكو صور.
create or replace function public.bot_product_images_section(p_merchant_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(string_agg(
           format('- %s%s ← رمز الصور: %s',
                  g.product_name,
                  coalesce(' — ' || g.color, ''),
                  g.code),
           E'\n' order by g.product_name, g.color nulls first), '')
    from (
      select pi.product_name, pi.color, min(pi.id) as code
        from public.product_images pi
       where pi.merchant_id = p_merchant_id
       group by pi.product_name, pi.color
    ) g
   where exists (
     select 1
       from public.products p
      where p.merchant_id = p_merchant_id
        and coalesce(p.stock, 0) > 0
        and btrim(p.name) = g.product_name
        and (g.color is null or nullif(btrim(p.color), '') = g.color)
   )
$$;

-- صور الرموز المطلوبة، لهذا التاجر وحده: أول ٣ رموز، وكحد أعلى ٦ صور بالمجموع
-- (كل صورة رسالة مستقلة عند الزبون). الترتيب: ترتيب الرموز ثم أقدم صورة أول.
-- رمز لتاجر ثاني أو غير موجود يُهمَل بصمت — الوكيل ما يكدر يفتح صور غيره.
create or replace function public.bot_product_images(p_merchant_id uuid, p_codes bigint[])
returns table (code bigint, product_name text, color text, path text, mime_type text)
language sql
stable
set search_path = ''
as $$
  with wanted as (
    select c.code, c.ord
      from unnest(p_codes[1:3]) with ordinality as c(code, ord)
  ),
  groups as (
    select distinct on (pi.product_name, pi.color)
           w.code, w.ord, pi.product_name, pi.color
      from wanted w
      join public.product_images pi
        on pi.id = w.code and pi.merchant_id = p_merchant_id
     order by pi.product_name, pi.color, w.ord
  )
  select g.code, pi.product_name, pi.color, pi.path, pi.mime_type
    from groups g
    join public.product_images pi
      on pi.merchant_id = p_merchant_id
     and pi.product_name = g.product_name
     and pi.color is not distinct from g.color
   order by g.ord, pi.id
   limit 6
$$;

revoke execute on function public.bot_product_images_section(uuid) from anon, authenticated, public;
revoke execute on function public.bot_product_images(uuid, bigint[]) from anon, authenticated, public;
grant execute on function public.bot_product_images_section(uuid) to service_role;
grant execute on function public.bot_product_images(uuid, bigint[]) to service_role;

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'product-images';  -- true, 5242880, {image/jpeg,image/png}
-- select policyname from pg_policies where tablename = 'product_images';                                     -- product_images_select_scoped
-- select public.bot_product_images_section('<merchant uuid>');                                               -- '' قبل أي رفع
-- select * from public.bot_product_images('<merchant uuid>', array[1]::bigint[]);                            -- صفر صفوف قبل أي رفع
