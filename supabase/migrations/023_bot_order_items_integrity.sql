-- ============================================================================
-- 023 — سلامة بنود طلبات البوت: السعر من المنتج، والمجموع من البنود،
--       والبند لا يُضاف إلا إلى طلب صاحبه
-- ============================================================================
--
-- المشكلة (docs/launch-readiness.md، البندان C1 و C2)
-- ---------------------------------------------------
-- بوتات n8n تُنشئ البنود بأداة `add_order_item` التي يملأ نموذجُ الذكاء
-- الاصطناعي حقولها، ومنها `unit_price_iqd` و`order_id`. فزبون يقنع البوت بأن
-- السعر ١٠٠٠ دينار يحصل على طلب بهذا المبلغ، وزبون يذكر رقم طلب غيره (الأرقام
-- متسلسلة) يضيف إليه بنوداً فيرفع مبلغ الدفع عند الاستلام على شخص آخر.
-- ولا شيء في القاعدة يطابق أياً منهما — مخالفة صريحة للبند ٢-أ في CLAUDE.md.
--
-- العقد بعد هذا الترحيل
-- ---------------------
--   order_items.unit_price_iqd  ← products.price_iqd دائماً، وما أُرسل يُتجاهَل.
--                                 منتج غير موجود، أو لتاجر غير تاجر الطلب، أو
--                                 بلا سعر ⇒ رفض (BQ011). لا سعر يُخمَّن.
--   order_items.quantity        ← عدد صحيح موجب، وإلا رفض (BQ010).
--   order_items.customer_phone_number (عمود جديد، اختياري)
--                               ← هوية الزبون كما وصلت في رسالته (رقم واتساب أو
--                                 PSID ماسنجر)، يملؤها n8n من الرسالة الواردة
--                                 لا من النموذج. إن حضرت وجب أن تطابق
--                                 orders.phone_number للطلب، وإلا رفض (BQ012).
--                                 غيابها = المسار القديم (upsert_order_items
--                                 ومسار إنستغرام) كما كان.
--   orders.items_total_iqd      ← مجموع (الكمية × سعر الوحدة) لبنوده، يُعاد
--                                 حسابه بعد كل إضافة أو تعديل أو حذف بند.
--   orders.grand_total_iqd      ← items_total_iqd + delivery_fee_iqd، للطلبات
--                                 التي لها بنود فقط.
--
-- ⚠️ ما لا يلمسه هذا الترحيل عمداً
-- --------------------------------
--   • طلبات اللوحة والـ API (lib/order-intake.ts، /api/orders/book) لا بنود
--     لها، وتحفظ grand_total_iqd = قيمة البضاعة بلا الأجرة. المُحفِّز يعمل من
--     order_items وحدها، فلا يمرّ عليها أبداً.
--   • delivery_fee_iqd: لا مصدر معتمَد لها في القاعدة بعد (جدول
--     merchant_delivery_settings فارغ)، وفرضها بلا مصدر تخمين. تبقى كما يكتبها
--     البوت حتى يملأ التاجر إعدادات توصيله.
--   • البنود القائمة لا تُعاد كتابتها: ٩ من ١٠ تطابق أسعار المنتجات فعلاً
--     وقت كتابة هذا الترحيل، والعاشر لمنتج محذوف.
-- ============================================================================

alter table public.order_items
  add column if not exists customer_phone_number text;

comment on column public.order_items.customer_phone_number is
  'هوية الزبون من الرسالة الواردة (لا من نموذج الذكاء الاصطناعي). إن حضرت وجب أن تطابق orders.phone_number — الترحيل ٠٢٣';

-- ----------------------------------------------------------------------------
-- (١) قبل الإدراج/التعديل: السعر من المنتج، والكمية موجبة، والبند لصاحب الطلب
-- ----------------------------------------------------------------------------
create or replace function public.enforce_order_item_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order_merchant uuid;
  v_order_phone    text;
  v_price          numeric;
begin
  if new.quantity is null or new.quantity <= 0 then
    raise exception using
      errcode = 'BQ010',
      message = format('order item quantity must be a positive integer, got %s', coalesce(new.quantity::text, 'null'));
  end if;

  select o.merchant_id, o.phone_number
    into v_order_merchant, v_order_phone
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

  new.unit_price_iqd := v_price;
  return new;
end;
$$;

drop trigger if exists order_items_enforce_integrity on public.order_items;
create trigger order_items_enforce_integrity
  before insert or update of order_id, variant_id, quantity, unit_price_iqd, customer_phone_number
  on public.order_items
  for each row execute function public.enforce_order_item_integrity();

-- ----------------------------------------------------------------------------
-- (٢) بعد أي تغيير في البنود: مجموع الطلب من بنوده
-- ----------------------------------------------------------------------------
create or replace function public.sync_order_totals_from_items()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_order_ids bigint[];
begin
  if tg_op = 'DELETE' then
    v_order_ids := array[old.order_id];
  elsif tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    v_order_ids := array[old.order_id, new.order_id];
  else
    v_order_ids := array[new.order_id];
  end if;

  update orders o
     set items_total_iqd = t.items_total,
         grand_total_iqd = t.items_total + coalesce(o.delivery_fee_iqd, 0),
         updated_at      = now()
    from (
      select ids.order_id,
             coalesce(sum(oi.quantity * oi.unit_price_iqd), 0) as items_total
        from unnest(v_order_ids) as ids(order_id)
        left join order_items oi on oi.order_id = ids.order_id
       group by ids.order_id
    ) t
   where o.order_id = t.order_id;

  return null;
end;
$$;

drop trigger if exists order_items_sync_order_totals on public.order_items;
create trigger order_items_sync_order_totals
  after insert or update or delete
  on public.order_items
  for each row execute function public.sync_order_totals_from_items();

-- دوال مُحفِّزات لا تُنادى من الـ API — نفس نهج الترحيل ٠١٣
revoke execute on function public.enforce_order_item_integrity() from public, anon, authenticated;
revoke execute on function public.sync_order_totals_from_items() from public, anon, authenticated;
