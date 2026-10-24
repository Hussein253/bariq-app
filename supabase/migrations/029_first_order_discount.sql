-- ============================================================================
-- 029 — خصم أول طلب يثبت بالطلب نفسه: السعر المخصوم يُحفَظ بالبند ولا يرجع للأصلي
-- ============================================================================
--
-- المشكلة (ماسنجر 2026-10-22، الزبون 28960616086881740، الطلبان 42 و43)
-- --------------------------------------------------------------------
-- البوت قال للزبون: «297,500 بعد خصم 15% + توصيل 3,000 = 300,500». الزبون كال «ثبت»، والبوت
-- سجّل الطلب بـ 297,500، لكن بعد `add_order_item` رجع المجموع 353,000. السبب بالقاعدة مو بالنموذج:
--
--   • enforce_order_item_integrity (ترحيل ٠٢٣) يفرض order_items.unit_price_iqd = products.price_iqd
--     دائماً ويتجاهل ما يرسله البوت، فالخصم الي حسبه النموذج يُمحى عند أول بند.
--   • sync_order_totals_from_items يعيد items_total_iqd = Σ(الكمية × سعر البند) فيرجع المجموع للأصلي،
--     وبعدها create_bot_order_shipment يشحن الطلب بـ COD = 350,000 (مجموع البنود).
--
-- العقد بعد هذا الترحيل
-- ---------------------
--   merchant_profiles.first_order_discount_pct  ← نسبة خصم أول طلب للتاجر (0 = ماكو خصم).
--   orders.discount_pct                          ← نسبة الخصم المطبّقة على هذا الطلب، تكتبها n8n بحقل ثابت
--                                                  (مو من النموذج) وتُقصّ تلقائياً على نسبة التاجر.
--   order_items.list_price_iqd                   ← سعر الكتالوج قبل الخصم (سجل للتسوية المالية).
--   order_items.unit_price_iqd                   ← سعر الكتالوج × (100 − discount_pct) ÷ 100 مقرّباً لأقرب دينار.
--
-- كل شي بعده يبقى كما هو بلا تعديل: orders.items_total_iqd = Σ(الكمية × unit_price_iqd) = بعد الخصم،
-- grand_total_iqd = items_total_iqd + أجرة التوصيل، و create_bot_order_shipment يطابق مجموع البنود
-- مع items_total_iqd ويكتب COD = بعد الخصم. ما ينلمس sync_order_totals_from_items ولا create_bot_order_shipment.
--
-- ⚠️ ما لا يلمسه هذا الترحيل عمداً
-- --------------------------------
--   • الطلبات القائمة (بما فيها 42 و43) ما تنعاد كتابتها. الإصلاح اليدوي لطلب قائم:
--       update orders set discount_pct = 15 where order_id = <id>;
--       update order_items set quantity = quantity where order_id = <id>;   -- يعيد تسعير البنود وإجماليات الطلب
--     (وشحنته القائمة، إن وجدت، تحتاج قرار التاجر لأن cod_amount_iqd لا يتبع الطلب بعد إنشائها.)
--   • أهلية «أول طلب» (ماكو طلب سابق بالبنود) تقرّرها n8n بـ SQL عقدة «تحديد التاجر»، لا هذا الترحيل؛
--     القاعدة تضمن بس السقف (نسبة التاجر) والتطبيق على البنود.
--   • قناة بلا `discount_pct` بحقول create_order (واتساب حالياً) تبقى بنسبة 0 = سلوكها كما كان.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الأعمدة
-- ----------------------------------------------------------------------------
alter table public.merchant_profiles
  add column if not exists first_order_discount_pct numeric(5,2) not null default 0;

alter table public.merchant_profiles
  drop constraint if exists merchant_profiles_first_order_discount_pct_range;
alter table public.merchant_profiles
  add constraint merchant_profiles_first_order_discount_pct_range
  check (first_order_discount_pct >= 0 and first_order_discount_pct <= 100);

comment on column public.merchant_profiles.first_order_discount_pct is
  'نسبة خصم أول طلب للزبون على سعر المنتجات (لا على التوصيل). 0 = ماكو خصم — الترحيل ٠٢٩';

alter table public.orders
  add column if not exists discount_pct numeric(5,2) not null default 0;

alter table public.orders
  drop constraint if exists orders_discount_pct_range;
alter table public.orders
  add constraint orders_discount_pct_range
  check (discount_pct >= 0 and discount_pct <= 100);

comment on column public.orders.discount_pct is
  'نسبة الخصم المطبّقة على بنود هذا الطلب عند إدراجها. تُقصّ على merchant_profiles.first_order_discount_pct — الترحيل ٠٢٩';

alter table public.order_items
  add column if not exists list_price_iqd numeric;

comment on column public.order_items.list_price_iqd is
  'سعر الكتالوج قبل الخصم وقت إضافة البند (null = بند قبل الترحيل ٠٢٩). الخصم = الكمية × (list_price_iqd − unit_price_iqd)';

-- نسبة العرض الحالي لمتجر مميز للإلكترونيات: نفس النص المكتوب بـ merchant_profiles.current_offers
update public.merchant_profiles
   set first_order_discount_pct = 15
 where merchant_id = '0a79b83f-b1e9-4bb7-ba95-670833bf706f'
   and first_order_discount_pct = 0;

-- ----------------------------------------------------------------------------
-- (٢) نسبة الطلب لا تتجاوز نسبة التاجر، حتى لو انكتبت من أي مصدر
-- ----------------------------------------------------------------------------
create or replace function public.clamp_order_discount()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max numeric;
begin
  if new.discount_pct is null or new.discount_pct <= 0 then
    new.discount_pct := 0;
    return new;
  end if;

  select coalesce(mp.first_order_discount_pct, 0)
    into v_max
    from merchant_profiles mp
   where mp.merchant_id = new.merchant_id;

  new.discount_pct := least(new.discount_pct, coalesce(v_max, 0));
  return new;
end;
$$;

drop trigger if exists orders_clamp_discount on public.orders;
create trigger orders_clamp_discount
  before insert or update of discount_pct, merchant_id
  on public.orders
  for each row execute function public.clamp_order_discount();

-- ----------------------------------------------------------------------------
-- (٣) سعر البند: من الكتالوج دائماً، بعد خصم الطلب إن وجد (التغيير الوحيد عن ٠٢٣: v_disc و list_price)
-- ----------------------------------------------------------------------------
create or replace function public.enforce_order_item_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order_merchant uuid;
  v_order_phone    text;
  v_disc           numeric;
  v_price          numeric;
begin
  if new.quantity is null or new.quantity <= 0 then
    raise exception using
      errcode = 'BQ010',
      message = format('order item quantity must be a positive integer, got %s', coalesce(new.quantity::text, 'null'));
  end if;

  select o.merchant_id, o.phone_number, coalesce(o.discount_pct, 0)
    into v_order_merchant, v_order_phone, v_disc
    from orders o
   where o.order_id = new.order_id;

  if v_order_merchant is null then
    raise exception using
      errcode = 'BQ011',
      message = format('order %s not found or has no merchant', new.order_id);
  end if;

  if new.customer_phone_number is not null
     and new.customer_phone_number is distinct from v_order_phone then
    raise exception using
      errcode = 'BQ012',
      message = format('order %s does not belong to this customer', new.order_id);
  end if;

  if new.variant_id is null or new.variant_id !~ '^[0-9]+$' then
    raise exception using
      errcode = 'BQ011',
      message = format('unknown product id %s', coalesce(new.variant_id, 'null'));
  end if;

  select p.price_iqd
    into v_price
    from products p
   where p.id = new.variant_id::bigint
     and p.merchant_id = v_order_merchant;

  if v_price is null then
    raise exception using
      errcode = 'BQ011',
      message = format('product %s is not a priced product of this store', new.variant_id);
  end if;

  new.list_price_iqd := v_price;
  new.unit_price_iqd := round(v_price * (100 - v_disc) / 100);
  return new;
end;
$$;
