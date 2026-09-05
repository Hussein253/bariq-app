-- ============================================================================
-- المرحلة 1 (Schema-First): هيكل بيانات جدول الشحنات وآلة الحالات الصارمة
-- شركة المندوب للتوصيل السريع - منصة "برق"
--
-- يستبدل هذا الملف جدول public.shipments البدائي الحالي (0 صفوف حاليًا،
-- لذا الحذف وإعادة الإنشاء آمن) بجدول متوافق مع:
--   - آلة حالات الشحنة الصارمة (بند 4-2 من CLAUDE.md)
--   - فصل COD عن أجور التوصيل (بند 4-4)
--   - التوزيع الجغرافي العراقي (بند 4-3)
--   - ضمان عدم التكرار (بند 4-1)
--
-- ملاحظة: جدولا merchants و couriers لم يكونا موجودين في القاعدة، فتم
-- إنشاؤهما هنا بحد أدنى من الحقول (بناءً على قرارك) لتفعيل الربط الحقيقي.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) جدول التجار (حد أدنى - قابل للتوسعة لاحقًا دون كسر التوافق)
-- ----------------------------------------------------------------------------
create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  api_key text unique,
  balance_iqd numeric(14, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.merchants is 'التجار المستخدمون لمنصة برق. حد أدنى من الحقول - يُوسّع عند الحاجة (مثال: عنوان المتجر، شخص التواصل).';

-- ----------------------------------------------------------------------------
-- 2) جدول المندوبين/السائقين (حد أدنى - قابل للتوسعة لاحقًا)
-- ----------------------------------------------------------------------------
create table if not exists public.couriers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'on_leave')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.couriers is 'مندوبو التوصيل. حد أدنى من الحقول - يُوسّع عند الحاجة (مثال: المحافظة المخصصة، المركبة).';

-- ----------------------------------------------------------------------------
-- 3) جدول الشحنات
-- ----------------------------------------------------------------------------

-- الجدول القديم فارغ (0 صفوف) ولا توجد جداول أخرى تعتمد عليه (لا FK واردة) -> حذف آمن.
drop table if exists public.shipments cascade;

create sequence if not exists public.shipments_tracking_seq;

create table public.shipments (
  -- ===== المعرّفات =====
  id uuid primary key default gen_random_uuid(),

  -- رقم تتبع بشري يُولَّد داخليًا عبر Sequence. إن كانت شركة الشحن الخارجية
  -- تُصدر رقم تتبع خاص بها لاحقًا، يُضاف كحقل منفصل (external_tracking_number)
  -- بعد تأكيد شكل استجابة الـ API الخاص بها - لا تخمين لصيغته الآن.
  tracking_number text not null unique
    default ('BRQ-' || lpad(nextval('public.shipments_tracking_seq')::text, 6, '0')),

  -- كل شحنة تنتمي لطلب واحد بالضبط (ربط حقيقي بجدول orders الفعلي، bigint).
  order_id bigint not null unique references public.orders (order_id) on delete restrict,

  merchant_id uuid not null references public.merchants (id) on delete restrict,
  courier_id uuid references public.couriers (id) on delete set null, -- يُعيَّن عند الاستلام، لذا nullable

  -- مفتاح Idempotency لمنع تكرار إنشاء الشحنة عند إعادة إرسال Webhook (بند 4-1).
  idempotency_key text unique,

  -- ===== آلة الحالات (بند 4-2) - القيم فقط هنا؛ منع القفز العشوائي عبر Trigger أدناه =====
  status text not null default 'ORDER_RECEIVED'
    check (
      status in (
        'ORDER_RECEIVED',
        'PICKED_UP_SAME_DAY',
        'IN_TRANSIT_HUB',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'POSTPONED',
        'RETURNED',
        'SETTLED_FINANCIALLY'
      )
    ),

  -- ===== بيانات المستلم والعنوان (بند 4-3) =====
  recipient_name text not null,

  -- تحقق عام من صيغة الرقم العراقي (07 + 9 أرقام = 11 رقمًا).
  -- تعيين نطاقات البادئة الدقيقة لكل شركة اتصالات (Zain/Asiacell/Korek) يتطلب
  -- تأكيدًا من فريق العمل قبل تشديد هذا القيد - لم يُفترض هنا تجنبًا للتخمين.
  recipient_phone text not null check (recipient_phone ~ '^07[0-9]{9}$'),

  governorate text not null, -- المحافظة
  district text, -- القضاء/الناحية
  nearest_landmark text, -- أقرب نقطة دالة
  full_address text not null, -- تفصيل العنوان الكامل

  -- ===== المطابقة المالية (بند 4-4) =====
  cod_amount_iqd numeric(12, 2) not null default 0 check (cod_amount_iqd >= 0), -- سعر البضاعة (يُحصَّل من الزبون)
  delivery_fee_iqd numeric(12, 2) not null default 0 check (delivery_fee_iqd >= 0), -- أجرة التوصيل الصافية

  -- محسوب تلقائيًا لمنع أي انحراف يدوي بين الحقلين (دقة متناهية).
  merchant_net_amount_iqd numeric(12, 2) generated always as (cod_amount_iqd - delivery_fee_iqd) stored,

  currency text not null default 'IQD' check (currency = 'IQD'),

  -- حالات تسوية كشوفات التجار: مؤجلة (DEFERRED) أو مودعة (DEPOSITED).
  settlement_status text not null default 'PENDING'
    check (settlement_status in ('PENDING', 'DEPOSITED', 'DEFERRED')),
  settled_at timestamptz,

  -- أسباب إلزامية عند التأجيل أو الإرجاع (يُنفَّذ عبر Constraint أدناه).
  postponed_reason text,
  returned_reason text,
  notes text,

  -- ===== طوابع زمنية لكل مرحلة (تُملأ تلقائيًا عبر Trigger عند الانتقال) =====
  picked_up_at timestamptz,
  in_transit_at timestamptz,
  out_for_delivery_at timestamptz,
  delivered_at timestamptz,
  postponed_at timestamptz,
  returned_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint shipments_postponed_reason_required
    check (status <> 'POSTPONED' or postponed_reason is not null),
  constraint shipments_returned_reason_required
    check (status <> 'RETURNED' or returned_reason is not null)
);

comment on column public.shipments.merchant_net_amount_iqd is 'عمود محسوب (generated) = cod_amount_iqd - delivery_fee_iqd. لا يُدخل يدويًا أبدًا.';
comment on column public.shipments.recipient_phone is 'تحقق عام من صيغة رقم عراقي (07XXXXXXXXX). البادئات الدقيقة لكل شركة اتصالات غير مؤكدة بعد.';

-- ----------------------------------------------------------------------------
-- 4) الفهارس
-- ----------------------------------------------------------------------------
create index shipments_status_idx on public.shipments (status);
create index shipments_merchant_id_idx on public.shipments (merchant_id);
create index shipments_courier_id_idx on public.shipments (courier_id);
create index shipments_governorate_idx on public.shipments (governorate);
create index shipments_created_at_idx on public.shipments (created_at desc);
create index shipments_settlement_status_idx on public.shipments (settlement_status);

-- ----------------------------------------------------------------------------
-- 5) updated_at تلقائي
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shipments_set_updated_at
  before update on public.shipments
  for each row
  execute function public.set_updated_at();

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row
  execute function public.set_updated_at();

create trigger couriers_set_updated_at
  before update on public.couriers
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6) فرض آلة الحالات الصارمة (منع القفز العشوائي - بند 4-2)
--
-- التسلسل المعتمد (مؤكَّد من المستخدم):
--   ORDER_RECEIVED -> PICKED_UP_SAME_DAY -> IN_TRANSIT_HUB -> OUT_FOR_DELIVERY
--   -> (DELIVERED | POSTPONED | RETURNED) -> SETTLED_FINANCIALLY
--
-- POSTPONED يسمح بحلقة إعادة محاولة تسليم (رجوع إلى OUT_FOR_DELIVERY)،
-- بالإضافة إلى إمكانية تسويتها ماليًا مباشرة (POSTPONED -> SETTLED_FINANCIALLY)
-- في حال تقرر إغلاق الشحنة دون إعادة محاولة أخرى.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_shipment_status_transition()
returns trigger
language plpgsql
as $$
declare
  allowed_next jsonb := '{
    "ORDER_RECEIVED": ["PICKED_UP_SAME_DAY"],
    "PICKED_UP_SAME_DAY": ["IN_TRANSIT_HUB"],
    "IN_TRANSIT_HUB": ["OUT_FOR_DELIVERY"],
    "OUT_FOR_DELIVERY": ["DELIVERED", "POSTPONED", "RETURNED"],
    "DELIVERED": ["SETTLED_FINANCIALLY"],
    "POSTPONED": ["OUT_FOR_DELIVERY", "SETTLED_FINANCIALLY"],
    "RETURNED": ["SETTLED_FINANCIALLY"],
    "SETTLED_FINANCIALLY": []
  }'::jsonb;
begin
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
$$;

create trigger shipments_enforce_status_transition
  before update on public.shipments
  for each row
  execute function public.enforce_shipment_status_transition();

-- ----------------------------------------------------------------------------
-- 7) أمان الصفوف (RLS)
--
-- تُفعَّل RLS بدون أي policy للأدوار anon/authenticated -> رفض افتراضي تام
-- لهذه البيانات المالية الحساسة (service_role وحده يتجاوز RLS، كما تستخدمه
-- مسارات n8n/الخلفية). عند بناء واجهة تسجيل دخول للتجار أو المندوبين لاحقًا،
-- تُضاف Policies محددة (مثال: التاجر يرى شحناته فقط عبر merchant_id).
-- ----------------------------------------------------------------------------
alter table public.shipments enable row level security;
alter table public.merchants enable row level security;
alter table public.couriers enable row level security;
