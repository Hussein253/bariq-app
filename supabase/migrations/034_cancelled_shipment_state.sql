-- ============================================================================
-- 034 — حالة «ملغية» للشحنة، وإلغاء الطلب من لوحة التشغيل
-- ============================================================================
--
-- القرار (المالك، 2026-11-01): الطلبات الخاطئة أو التجريبية تُلغى ولا تُحذف،
-- لأن الحذف يكسر تسلسل الطلبات والشحنات. الإلغاء يعني:
--   • الطلب: orders.current_state = 'cancelled' (القيمة نفسها التي تعرفها لوحة
--     التشغيل من قبل)، ويبقى في السجل.
--   • الشحنة: الحالة CANCELLED، وهي نهائية: لا حالة بعدها، ولا مندوب، ولا تسوية،
--     ولا سبب تأجيل أو إرجاع. الملاحظات وحدها تُعدَّل.
--   • لا تُرسل للمندوب، ولا تدخل أي مجموع مالي (التسوية تحسب DELIVERED وحدها).
--
-- الإلغاء مسموح من ORDER_RECEIVED فقط: بعد استلام التاجر الشحنة صارت عند
-- المندوب، ولا تُلغى من هنا. (CLAUDE.md بند ٤-٢ يُحدَّث بهذا.)
--
-- ما يفرضه هذا الترحيل في القاعدة:
--   • enforce_shipment_status_transition: ORDER_RECEIVED تنتقل إلى CANCELLED،
--     وCANCELLED لا تنتقل إلى شيء. وأي تغيير لمندوب أو تسوية أو سبب في شحنة
--     ملغاة يُرفض بـ BQ014.
--   • block_test_order_shipment (يعدّل الترحيل ٠٣٣): ينتقل إلى CANCELLED حتى
--     شحنة الطلب التجريبي، وهذا وحده. ويمنع إنشاء شحنة لطلب ملغى أو نقلها إليه
--     (الإرسال المتزامن من لوحة التشغيل مثلاً لا يُنشئ شحنة لطلب ملغى).
--   • create_bot_order_shipment: لا تُعيد شحنة ملغاة كأنها مُثبَّتة (BQ012).
--   • cancel_order(p_order_id): الإلغاء ذرّي، الطلب والشحنة في معاملة واحدة.
--
-- ⚠️ لا يغيّر هذا الترحيل أي صف. الإلغاء الجماعي للبيانات الحالية خطوة منفصلة
-- تُنفَّذ بعد نشر التطبيق الذي يعرف الحالة الجديدة (انظر وصف الـ PR).
--
-- الرفض بنمط «BQ_…|رسالة عربية» كالترحيلين ٠٢٧ و٠٣٣:
--   BQ014 شحنة ملغاة لا تتغيّر · BQ015 الشحنة تجاوزت الاستلام فلا تُلغى
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) القيد: CANCELLED حالة مسموحة
-- ----------------------------------------------------------------------------

alter table public.shipments drop constraint shipments_status_check;

alter table public.shipments add constraint shipments_status_check check (
  status = any (array[
    'ORDER_RECEIVED'::text, 'PICKED_UP_SAME_DAY'::text, 'IN_TRANSIT_HUB'::text,
    'OUT_FOR_DELIVERY'::text, 'DELIVERED'::text, 'POSTPONED'::text, 'RETURNED'::text,
    'SETTLED_FINANCIALLY'::text, 'CANCELLED'::text
  ])
);

-- ----------------------------------------------------------------------------
-- 2) آلة الحالات: ORDER_RECEIVED ← CANCELLED، والملغاة نهائية
-- ----------------------------------------------------------------------------

create or replace function public.enforce_shipment_status_transition()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  allowed_next jsonb := '{
    "ORDER_RECEIVED": ["PICKED_UP_SAME_DAY", "CANCELLED"],
    "PICKED_UP_SAME_DAY": ["IN_TRANSIT_HUB"],
    "IN_TRANSIT_HUB": ["OUT_FOR_DELIVERY"],
    "OUT_FOR_DELIVERY": ["DELIVERED", "POSTPONED", "RETURNED"],
    "DELIVERED": ["SETTLED_FINANCIALLY"],
    "POSTPONED": ["OUT_FOR_DELIVERY", "SETTLED_FINANCIALLY"],
    "RETURNED": ["SETTLED_FINANCIALLY"],
    "CANCELLED": [],
    "SETTLED_FINANCIALLY": []
  }'::jsonb;
begin
  -- الملغاة نهائية: لا مندوب ولا تسوية ولا سبب يتغيّر فيها
  if old.status = 'CANCELLED' and (
       new.courier_id        is distinct from old.courier_id
    or new.settlement_status is distinct from old.settlement_status
    or new.postponed_reason  is distinct from old.postponed_reason
    or new.returned_reason   is distinct from old.returned_reason
  ) then
    raise exception 'BQ_SHIPMENT_CANCELLED|الشحنة % ملغية ولا يتغيّر فيها مندوب ولا تسوية ولا سبب', old.tracking_number
      using errcode = 'BQ014';
  end if;

  if new.status is distinct from old.status then
    if not (allowed_next -> old.status) ? new.status then
      raise exception 'انتقال حالة غير مسموح للشحنة %: % -> %', old.tracking_number, old.status, new.status
        using errcode = '22023';
    end if;

    case new.status
      when 'PICKED_UP_SAME_DAY' then new.picked_up_at = coalesce(new.picked_up_at, now());
      when 'IN_TRANSIT_HUB' then new.in_transit_at = coalesce(new.in_transit_at, now());
      when 'OUT_FOR_DELIVERY' then new.out_for_delivery_at = coalesce(new.out_for_delivery_at, now());
      when 'DELIVERED' then new.delivered_at = coalesce(new.delivered_at, now());
      when 'POSTPONED' then new.postponed_at = coalesce(new.postponed_at, now());
      when 'RETURNED' then new.returned_at = coalesce(new.returned_at, now());
      when 'SETTLED_FINANCIALLY' then new.settled_at = coalesce(new.settled_at, now());
      else null;
    end case;
  end if;

  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3) حارس الطلب التجريبي والملغى (يعدّل الترحيل ٠٣٣)
--
-- الإلغاء وحده يمرّ على الطلب التجريبي والملغى، وكل ما عداه يُرفض. ونقل شحنة
-- إلى طلب ملغى أو إنشاؤها له يُرفض كما للتجريبي.
-- ----------------------------------------------------------------------------

create or replace function public.block_test_order_shipment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_test      boolean;
  v_cancelled boolean;
begin
  -- (أ) تعديل لا يغيّر الطلب ولا عموداً من أعمدة التسليم والتسوية، أو لا يغيّر
  --     الحالة إلا إلى CANCELLED: يمرّ
  if tg_op = 'UPDATE'
     and new.order_id          is not distinct from old.order_id
     and new.courier_id        is not distinct from old.courier_id
     and new.settlement_status is not distinct from old.settlement_status
     and new.postponed_reason  is not distinct from old.postponed_reason
     and new.returned_reason   is not distinct from old.returned_reason
     and (new.status is not distinct from old.status or new.status = 'CANCELLED') then
    return new;
  end if;

  -- (ب) شحنة ملغاة لا يتغيّر فيها شيء من التوصيل أو التسوية (BQ014 بالتفصيل في الترحيل)
  if tg_op = 'UPDATE' and old.status = 'CANCELLED' then
    raise exception 'BQ_SHIPMENT_CANCELLED|الشحنة % ملغية نهائياً: لا تنتقل إلى حالة أخرى ولا يتغيّر فيها مندوب أو تسوية أو سبب', old.tracking_number
      using errcode = 'BQ014';
  end if;

  -- (ج) طلب حقيقي وغير ملغى: لا شأن لهذا الحارس به
  select o.is_test, o.current_state = 'cancelled' into v_test, v_cancelled
    from public.orders o
   where o.order_id = new.order_id;

  if not coalesce(v_test or v_cancelled, false) then
    return new;
  end if;

  -- (د) شحنة جديدة لطلب كهذا، أو شحنة قائمة تُنقل إليه (OLD فارغ عند الإدراج)
  if tg_op = 'INSERT' or new.order_id is distinct from old.order_id then
    if v_test then
      raise exception 'BQ_ORDER_NOT_SHIPPABLE|الطلب % تجريبي (اختبار البوت أو المنصة) ولا يُرسل للشحن', new.order_id
        using errcode = 'BQ012';
    end if;
    raise exception 'BQ_ORDER_NOT_SHIPPABLE|الطلب % ملغى ولا يُرسل للشحن', new.order_id
      using errcode = 'BQ012';
  end if;

  -- (هـ) شحنة قائمة لطلب كهذا: لا حالة ولا مندوب ولا تسوية
  if v_test then
    raise exception 'BQ_ORDER_NOT_SHIPPABLE|الشحنة % لطلب تجريبي ولا تُرسل للمندوب — حالتها ومندوبها وتسويتها لا تتغيّر، والملاحظات وحدها تُعدَّل', old.tracking_number
      using errcode = 'BQ012';
  end if;
  raise exception 'BQ_ORDER_NOT_SHIPPABLE|الشحنة % لطلب ملغى ولا تُرسل للمندوب — الملاحظات وحدها تُعدَّل', old.tracking_number
    using errcode = 'BQ012';
end;
$function$;

-- ----------------------------------------------------------------------------
-- 4) شحنة قائمة لطلب ملغى لا تُعاد كأنها مُثبَّتة (يعدّل الترحيل ٠٢٧)
--
-- النسخة السابقة كانت تُعيد أي شحنة قائمة قبل فحص حالة الطلب. والتغيير الوحيد
-- هنا: (أ) يرفض الشحنة الملغاة بـ BQ012 بدل إعادتها.
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
  v_status       text;
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

  -- (أ) شحنة قائمة = نجاح بلا أثر جديد، إلا الملغاة فتُرفض
  select s.id, s.tracking_number, s.status into v_shipment_id, v_tracking, v_status
    from public.shipments s
   where s.order_id = p_order_id;

  if v_shipment_id is not null then
    if v_status = 'CANCELLED' then
      raise exception 'BQ_ORDER_NOT_SHIPPABLE|الطلب % ملغى ولا يُرسل للشحن', p_order_id
        using errcode = 'BQ012';
    end if;
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

-- ----------------------------------------------------------------------------
-- 5) الإلغاء: الطلب والشحنة معاً في معاملة واحدة
--
-- يُرفض بـ BQ015 إن كانت الشحنة قد تجاوزت الاستلام، فلا تبقى شحنة عند المندوب
-- بطلب ملغى. وإن لم تكن للطلب شحنة يُلغى الطلب وحده.
-- ----------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id bigint)
returns table (cancelled_order_id bigint, cancelled_shipment boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order        public.orders%rowtype;
  v_shipment     public.shipments%rowtype;
  v_has_shipment boolean;
begin
  if p_order_id is null then
    raise exception 'BQ_CANCEL_INPUT|رقم الطلب مطلوب' using errcode = 'BQ010';
  end if;

  select * into v_order from public.orders o where o.order_id = p_order_id for update;
  if not found then
    raise exception 'BQ_ORDER_NOT_FOUND|الطلب % غير موجود', p_order_id
      using errcode = 'BQ011';
  end if;

  select * into v_shipment from public.shipments s where s.order_id = p_order_id for update;
  v_has_shipment := found;

  if v_has_shipment and v_shipment.status not in ('ORDER_RECEIVED', 'CANCELLED') then
    raise exception 'BQ_SHIPMENT_NOT_CANCELLABLE|الشحنة % في حالة % ولا تُلغى بعد الاستلام',
      v_shipment.tracking_number, v_shipment.status
      using errcode = 'BQ015';
  end if;

  update public.orders o
     set current_state = 'cancelled',
         updated_at    = now()
   where o.order_id = p_order_id;

  if v_has_shipment and v_shipment.status = 'ORDER_RECEIVED' then
    update public.shipments s
       set status = 'CANCELLED'
     where s.id = v_shipment.id;
    return query select p_order_id, true;
    return;
  end if;

  return query select p_order_id, false;
end;
$function$;

comment on function public.cancel_order(bigint) is
  'يلغي طلباً وشحنته معاً (الترحيل ٠٣٤): الطلب cancelled، والشحنة ORDER_RECEIVED → CANCELLED. يُرفض بـ BQ015 إن تجاوزت الشحنة الاستلام. لا يحذف شيئاً.';

-- ----------------------------------------------------------------------------
-- 6) التنفيذ لـ service_role وحده (نمط الترحيلين ٠١٣ و٠٢٧)
-- ----------------------------------------------------------------------------

revoke execute on function public.cancel_order(bigint) from anon, authenticated, public;
grant execute on function public.cancel_order(bigint) to service_role;
