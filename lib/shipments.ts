/**
 * أنواع بيانات الشحنات وآلة الحالات - مطابقة تماماً لهيكل جدول shipments في Supabase
 * (supabase/migrations/002_create_shipments_schema.sql)
 * ------------------------------------------------------------------------------
 * خريطة الانتقالات هنا نسخة طبق الأصل من enforce_shipment_status_transition() في
 * قاعدة البيانات - تُستخدم فقط لتوجيه الواجهة (تعطيل الخيارات غير المسموحة)،
 * أما الفرض الفعلي فيبقى في الـ Trigger على مستوى القاعدة.
 */

export type ShipmentStatus =
  | 'ORDER_RECEIVED'
  | 'PICKED_UP_SAME_DAY'
  | 'IN_TRANSIT_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'POSTPONED'
  | 'RETURNED'
  | 'SETTLED_FINANCIALLY'

export type SettlementStatus = 'PENDING' | 'DEPOSITED' | 'DEFERRED'
export type MerchantStatus = 'active' | 'suspended'
export type CourierStatus = 'active' | 'inactive' | 'on_leave'

export interface Shipment {
  id: string
  tracking_number: string
  order_id: number
  merchant_id: string
  courier_id: string | null
  idempotency_key: string | null
  status: ShipmentStatus
  recipient_name: string
  recipient_phone: string
  governorate: string
  district: string | null
  nearest_landmark: string | null
  full_address: string
  cod_amount_iqd: number
  delivery_fee_iqd: number
  merchant_net_amount_iqd: number
  currency: string
  settlement_status: SettlementStatus
  settled_at: string | null
  postponed_reason: string | null
  returned_reason: string | null
  notes: string | null
  picked_up_at: string | null
  in_transit_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  postponed_at: string | null
  returned_at: string | null
  created_at: string
  updated_at: string
  // تُضاف في طبقة العرض بعد الربط اليدوي مع merchants/couriers/orders (لا يوجد join مباشر بعد)
  merchant_name?: string
  courier_name?: string | null
  /** من orders.order_content — يُطبع على الستيكر ليعرف المندوب طبيعة الطرد */
  order_content?: string | null
}

export interface Merchant {
  id: string
  name: string
  phone: string | null
  api_key: string | null
  balance_iqd: number
  status: MerchantStatus
  created_at: string
  updated_at: string
}

export interface Courier {
  id: string
  name: string
  phone: string | null
  status: CourierStatus
  created_at: string
  updated_at: string
}

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  'ORDER_RECEIVED',
  'PICKED_UP_SAME_DAY',
  'IN_TRANSIT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'POSTPONED',
  'RETURNED',
  'SETTLED_FINANCIALLY',
]

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  ORDER_RECEIVED: 'تم استلام الطلب',
  PICKED_UP_SAME_DAY: 'تم الاستلام من التاجر',
  IN_TRANSIT_HUB: 'في مركز الفرز',
  OUT_FOR_DELIVERY: 'خارج للتسليم',
  DELIVERED: 'تم التسليم',
  POSTPONED: 'مؤجلة',
  RETURNED: 'مرتجعة',
  SETTLED_FINANCIALLY: 'تمت التسوية المالية',
}

// نسخة طبق الأصل من allowed_next في enforce_shipment_status_transition()
export const STATUS_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  ORDER_RECEIVED: ['PICKED_UP_SAME_DAY'],
  PICKED_UP_SAME_DAY: ['IN_TRANSIT_HUB'],
  IN_TRANSIT_HUB: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'POSTPONED', 'RETURNED'],
  DELIVERED: ['SETTLED_FINANCIALLY'],
  POSTPONED: ['OUT_FOR_DELIVERY', 'SETTLED_FINANCIALLY'],
  RETURNED: ['SETTLED_FINANCIALLY'],
  SETTLED_FINANCIALLY: [],
}

export const STATUS_COLORS: Record<ShipmentStatus, { bg: string; text: string; border: string; dot: string }> = {
  ORDER_RECEIVED: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', dot: 'bg-slate-500' },
  PICKED_UP_SAME_DAY: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
  IN_TRANSIT_HUB: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  OUT_FOR_DELIVERY: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
  DELIVERED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  POSTPONED: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  RETURNED: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
  SETTLED_FINANCIALLY: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
}

export const SETTLEMENT_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'قيد التسوية',
  DEPOSITED: 'تم الإيداع للتاجر',
  DEFERRED: 'مؤجلة',
}

export const SETTLEMENT_COLORS: Record<SettlementStatus, { bg: string; text: string; border: string }> = {
  PENDING: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  DEPOSITED: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  DEFERRED: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
}

export const TIMELINE_STEPS: { status: ShipmentStatus; atField: keyof Shipment }[] = [
  { status: 'ORDER_RECEIVED', atField: 'created_at' },
  { status: 'PICKED_UP_SAME_DAY', atField: 'picked_up_at' },
  { status: 'IN_TRANSIT_HUB', atField: 'in_transit_at' },
  { status: 'OUT_FOR_DELIVERY', atField: 'out_for_delivery_at' },
  { status: 'DELIVERED', atField: 'delivered_at' },
  { status: 'SETTLED_FINANCIALLY', atField: 'settled_at' },
]

/** تنسيق تاريخ/وقت مقروء بالأرقام العربية (لا يوجد مكتبة تواريخ في المشروع بعد) */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  const formatted = new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
  return formatted
}
