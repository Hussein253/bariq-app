-- ============================================================================
-- 027 — شحنة طلب البوت: آلياً عند التثبيت، وبزر «تأكيد» للاستثناءات
-- ============================================================================
--
-- المشكلة:
-- البوت يُنشئ الطلب بحالة pending (أداة create_order). وكانت عقدة «Trigger
-- Shipment Intake» ترسله إلى مسار استقبال على n8n Cloud حُذف مع مساحة العمل،
-- ثم عُطِّلت العقدة. ولا شيء في التطبيق ولا في n8n ينقل الطلب من pending إلى
-- confirmed — وزر الإرسال للشحن في لوحة التشغيل يشترط confirmed. فطلب البوت
-- لا يصير شحنة إطلاقاً، والزبون قيل له «المندوب يتصل بيك قبل لا يوصل».
--
-- الحل (قرار المالك: آلياً مع استثناءات للتشغيل):
-- دالة واحدة تثبّت الطلب وتُنشئ شحنته في معاملة واحدة. يستدعيها مسار n8n
-- بعد create_order، وتستدعيها لوحة التشغيل لطلب فشل آلياً ثم صُحِّح —
-- منطق واحد لا نسختان.
--
-- قواعد مالية (CLAUDE.md بندا ٢-أ و٤):
--   • ثمن البضاعة (COD) = مجموع البنود من القاعدة (الترحيل ٠٢٣ يفرض سعر
--     البند من المنتج)، منفصلاً عن أجرة التوصيل.
--   • أجرة التوصيل من merchant_delivery_settings لا مما كتبه البوت: محافظة
--     الأساس ← local_fee_iqd، وغيرها ← other_fee_iqd. بلا إعدادات للتاجر =
--     رفض صريح لا أجرة مُخمَّنة.
--   • منع التكرار: شحنة قائمة للطلب تُعاد كما هي (created = false)، بنفس
--     مفتاح الإرسال اليدوي bot-order-<id>، وقيد shipments.order_id الفريد
--     يحمي من السباق.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الطلب التجريبي
-- ----------------------------------------------------------------------------

alter table public.orders add column if not exists is_test boolean not null default false;

comment on column public.orders.is_test is
  'طلب تجريبي (اختبار البوت أو المنصة): لا يُشحن ولا يُحسب. لا تُحذف الطلبات التجريبية — تُعلَّم هنا.';

-- ----------------------------------------------------------------------------
-- 2) تطبيع الهاتف العراقي — مطابق حرفياً لـ normalizeIraqiPhone في lib/phone.ts
-- ----------------------------------------------------------------------------

create or replace function public.normalize_iraqi_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_digits text;
begin
  if p_raw is null then
    return null;
  end if;

  v_digits := regexp_replace(p_raw, '[^0-9]', '', 'g');

  if left(v_digits, 3) = '964' and length(v_digits) = 13 then
    v_digits := '0' || substr(v_digits, 4);
  end if;
  if length(v_digits) = 10 and left(v_digits, 1) = '7' then
    v_digits := '0' || v_digits;
  end if;

  if v_digits ~ '^07[0-9]{9}$' then
    return v_digits;
  end if;
  return null;
end;
$function$;

comment on function public.normalize_iraqi_phone(text) is
  'يطبّع رقماً عراقياً (964… / 7… / 07…) إلى 07XXXXXXXXX أو null. نسخة مطابقة لـ lib/phone.ts — أي تعديل يكون في الاثنين.';

-- ----------------------------------------------------------------------------
-- 3) تثبيت طلب البوت وإنشاء شحنته
--
-- أخطاء الرفض بنمط «BQ_…|رسالة عربية» (كنمط enforce_plan_limit) فيقرؤها
-- n8n والتطبيق كما هي:
--   BQ010 مدخلات ناقصة · BQ011 الطلب غير موجود لهذا التاجر
--   BQ012 الطلب لا يُشحن (تجريبي، أو حالته لا تسمح)
--   BQ013 بيانات الطلب لا تكفي لشحنة (كل الأسباب معاً في رسالة واحدة)
-- ----------------------------------------------------------------------------

create or replace function public.create_bot_order_shipment(
  p_order_id bigint,
  p_merchant_id uuid
)
returns table (shipment_id uuid, tracking_number text, created boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order        public.orders%rowtype;
  v_settings     public.merchant_delivery_settings%rowtype;
  v_has_settings boolean;
  v_shipment_id  uuid;
  v_tracking     text;
  v_items_count  integer;
  v_items_sum    numeric;
  v_gov          text;
  v_base         text;
  v_fee          numeric;
  v_phone        text;
  v_name         text;
  v_address      text;
  v_errors       text[] := '{}';
begin
  if p_order_id is null or p_merchant_id is null then
    raise exception 'BQ_SHIPMENT_INPUT|رقم الطلب والتاجر مطلوبان' using errcode = 'BQ010';
  end if;

  -- القفل يُسلسل استدعاءين متزامنين لنفس الطلب (n8n واللوحة مثلاً)
  select * into v_order from public.orders where order_id = p_order_id for update;

  if not found or v_order.merchant_id is distinct from p_merchant_id then
    raise exception 'BQ_ORDER_NOT_FOUND|الطلب % غير موجود لهذا التاجر', p_order_id
      using errcode = 'BQ011';
  end if;

  -- (أ) شحنة قائمة = نجاح بلا أثر جديد
  select s.id, s.tracking_number into v_shipment_id, v_tracking
    from public.shipments s
   where s.order_id = p_order_id;

  if v_shipment_id is not null then
    return query select v_shipment_id, v_tracking, false;
    return;
  end if;

  -- (ب) طلب لا يُشحن أصلاً
  if v_order.is_test then
    raise exception 'BQ_ORDER_NOT_SHIPPABLE|الطلب % تجريبي ولا يُشحن', p_order_id
      using errcode = 'BQ012';
  end if;
  if coalesce(v_order.current_state, '') not in ('pending', 'confirmed') then
    raise exception 'BQ_ORDER_NOT_SHIPPABLE|حالة الطلب % لا تسمح بالشحن: %',
      p_order_id, coalesce(v_order.current_state, 'غير محددة')
      using errcode = 'BQ012';
  end if;

  -- (ج) البنود: ثمن البضاعة من القاعدة
  select count(*), coalesce(sum(i.quantity * i.unit_price_iqd), 0)
    into v_items_count, v_items_sum
    from public.order_items i
   where i.order_id = p_order_id;

  if v_items_count = 0 then
    v_errors := v_errors || 'الطلب بلا بنود'::text;
  elsif v_items_sum <> coalesce(v_order.items_total_iqd, -1) then
    v_errors := v_errors || format('ثمن الطلب (%s) لا يطابق مجموع بنوده (%s)',
                                   coalesce(v_order.items_total_iqd::text, 'فارغ'), v_items_sum);
  end if;

  -- (د) المحافظة وأجرة التوصيل من إعدادات التاجر
  v_gov := regexp_replace(public.ar_normalize(v_order.governorate), '^محافظه\s*', '');

  if v_gov = '' then
    v_errors := v_errors || 'المحافظة غير محددة'::text;
  elsif not exists (
    select 1 from public.delivery_areas da
     where regexp_replace(public.ar_normalize(da.governorate), '^محافظه\s*', '') = v_gov
  ) then
    v_errors := v_errors || format('محافظة غير معروفة: %s', btrim(v_order.governorate));
  end if;

  select * into v_settings from public.merchant_delivery_settings where merchant_id = p_merchant_id;
  v_has_settings := found;

  if not v_has_settings then
    v_errors := v_errors || 'لا إعدادات توصيل لهذا التاجر — تُضبط من إعدادات المتجر'::text;
  else
    v_base := regexp_replace(public.ar_normalize(v_settings.base_governorate), '^محافظه\s*', '');
    v_fee  := case when v_gov = v_base then v_settings.local_fee_iqd else v_settings.other_fee_iqd end;
  end if;

  -- (هـ) المستلم
  v_phone   := coalesce(public.normalize_iraqi_phone(v_order.contact_phone),
                        public.normalize_iraqi_phone(v_order.phone_number));
  v_name    := coalesce(nullif(btrim(v_order.customer_name), ''), nullif(btrim(v_order.name), ''));
  v_address := nullif(btrim(v_order.address), '');

  if v_phone is null then
    v_errors := v_errors || 'لا رقم هاتف عراقي صالح للمستلم (07XXXXXXXXX)'::text;
  end if;
  if v_name is null then
    v_errors := v_errors || 'اسم المستلم غير متوفر'::text;
  end if;
  if v_address is null then
    v_errors := v_errors || 'العنوان غير متوفر'::text;
  end if;

  if array_length(v_errors, 1) > 0 then
    raise exception 'BQ_SHIPMENT_INVALID|الطلب %: %', p_order_id, array_to_string(v_errors, ' · ')
      using errcode = 'BQ013';
  end if;

  -- (و) تثبيت الطلب بالأجرة الرسمية
  update public.orders
     set delivery_fee_iqd = v_fee,
         grand_total_iqd  = v_items_sum + v_fee,
         current_state    = 'confirmed',
         updated_at       = now()
   where order_id = p_order_id;

  -- (ز) الشحنة — رقم التتبع تولّده القاعدة، والحالة ORDER_RECEIVED افتراضياً
  begin
    insert into public.shipments
      (order_id, merchant_id, recipient_name, recipient_phone, governorate, district,
       nearest_landmark, full_address, cod_amount_iqd, delivery_fee_iqd, idempotency_key)
    values
      (p_order_id, p_merchant_id, v_name, v_phone, btrim(v_order.governorate),
       nullif(btrim(v_order.district), ''), nullif(btrim(v_order.address_details), ''),
       v_address, v_items_sum, v_fee, 'bot-order-' || p_order_id)
    returning id, shipments.tracking_number into v_shipment_id, v_tracking;
  exception when unique_violation then
    -- إرسال يدوي سبقنا إليها (لا يقفل الطلب): شحنته هي الشحنة
    select s.id, s.tracking_number into v_shipment_id, v_tracking
      from public.shipments s
     where s.order_id = p_order_id;
    return query select v_shipment_id, v_tracking, false;
    return;
  end;

  return query select v_shipment_id, v_tracking, true;
end;
$function$;

comment on function public.create_bot_order_shipment(bigint, uuid) is
  'يثبّت طلب البوت (pending → confirmed) بأجرة التوصيل من merchant_delivery_settings ويُنشئ شحنته في معاملة واحدة. شحنة قائمة تُعاد (created = false). يستدعيها n8n بعد create_order ولوحة التشغيل للاستثناءات.';

-- ----------------------------------------------------------------------------
-- 4) التنفيذ لـ service_role وحده (نمط الترحيل ٠١٣). الدالة الثابتة للتطبيع
--    بلا أثر جانبي، لكنها تُقفل بالمثل اتساقاً.
-- ----------------------------------------------------------------------------

revoke execute on function public.create_bot_order_shipment(bigint, uuid) from anon, authenticated, public;
revoke execute on function public.normalize_iraqi_phone(text) from anon, authenticated, public;
grant execute on function public.create_bot_order_shipment(bigint, uuid) to service_role;
grant execute on function public.normalize_iraqi_phone(text) to service_role;
