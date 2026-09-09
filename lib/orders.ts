/**
 * طبقة الأنواع لطلبات public.orders — قسم "الطلبات المؤكدة"
 * ===========================================================
 * المصدر الوحيد للحقيقة: جدول public.orders (لا يوجد جدول confirmed_orders
 * منفصل). الطلبات المؤكدة = orders WHERE current_state = 'confirmed'.
 *
 * ⚠️ العمود current_state نصي بلا قيد CHECK في قاعدة البيانات (تحقق مباشر
 * بتاريخ 2026-09-06) — القيم المُلاحظة فعلياً حتى الآن: 'confirmed',
 * 'cancelled'. لا تُفترض أي قيمة أخرى.
 *
 * ⚠️ أعمدة numeric (items_total_iqd, delivery_fee_iqd, grand_total_iqd,
 * unit_price_iqd) يُعيدها PostgREST كسلاسل نصية لا كأرقام. استعمل toNumber
 * قبل أي عملية حسابية عليها.
 */

export interface OrderShipmentRef {
  id: string
  tracking_number: string
  status: string
}

/**
 * صف من public.order_items — عنصر واحد داخل الطلب.
 * الحقول مطابقة لأعمدة الجدول (تحقق مباشر بتاريخ 2026-09-09).
 * الربط: order_items.order_id -> orders.order_id عبر order_items_order_id_fkey.
 */
export interface OrderItem {
  id: number
  variant_id: string | null
  product_name_snapshot: string | null
  color_snapshot: string | null
  size_snapshot: string | null
  quantity: number | null
  unit_price_iqd: number | string | null
}

/** صف من public.orders بالحقول المستخدمة في قسم الطلبات المؤكدة فقط */
export interface ConfirmedOrder {
  order_id: number
  created_at: string
  phone_number: string
  contact_phone: string | null
  name: string | null
  customer_name: string | null
  governorate: string | null
  district: string | null
  address: string | null
  address_details: string | null
  order_content: string | null
  items_total_iqd: number | null
  delivery_fee_iqd: number | null
  grand_total_iqd: number | null
  current_state: string | null
  updated_at: string | null
  /** من join مع shipments — موجودة فقط إن سبق إرسال الطلب للشحن */
  shipment: OrderShipmentRef | null
  /**
   * من join مع order_items. مصفوفة فارغة إن لم يطلب المسار جلبها
   * (‏/api/orders/dashboard لا يجلبها) أو إن لم يُسجَّل أي عنصر للطلب.
   */
  items: OrderItem[]
}

export function orderDisplayName(order: ConfirmedOrder): string {
  return order.customer_name?.trim() || order.name?.trim() || 'بلا اسم'
}

export function orderDisplayPhone(order: ConfirmedOrder): string {
  return order.contact_phone?.trim() || order.phone_number
}

/** يحوّل قيمة numeric قادمة من PostgREST (نص أو رقم) إلى رقم آمن للحساب */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** مجموع سطر العنصر = الكمية × سعر الوحدة */
export function itemLineTotal(item: OrderItem): number {
  return toNumber(item.quantity) * toNumber(item.unit_price_iqd)
}

/**
 * ينظّف قيمة لقطة (snapshot) من الأقواس والفراغات الزائدة.
 * لقطات الطلبات القديمة نُسخت من products.color قبل تنظيف الجدول، فتحمل
 * صيغة "  (اسود)" — بدون هذا التنظيف يظهر اللون بقوسين مزدوجين.
 */
function cleanSnapshot(value: string | null | undefined): string {
  return (value ?? '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** وصف مقروء للعنصر: الاسم (اللون) — القياس */
export function itemLabel(item: OrderItem): string {
  const name = cleanSnapshot(item.product_name_snapshot) || 'منتج بلا اسم'
  const color = cleanSnapshot(item.color_snapshot)
  const size = cleanSnapshot(item.size_snapshot)
  const parts = [name]
  if (color) parts.push(`(${color})`)
  if (size) parts.push(`— ${size}`)
  return parts.join(' ')
}

/**
 * يحوّل صف خام من استعلام Supabase (orders + join shipments + join order_items)
 * إلى ConfirmedOrder. مشتركة بين /api/orders/confirmed و/api/orders/dashboard
 * لتفادي تكرار منطق فك تعشيش الـ joins (Supabase يُعيد العلاقة كمصفوفة أو
 * كائن حسب نوعها). المسارات التي لا تجلب order_items تحصل على items = [].
 */
export function mapOrderRow(row: Record<string, unknown>): ConfirmedOrder {
  const rawShipment = row.shipments as unknown
  const shipment = (Array.isArray(rawShipment) ? rawShipment[0] ?? null : rawShipment ?? null) as OrderShipmentRef | null

  const rawItems = row.order_items as unknown
  const items = (Array.isArray(rawItems) ? rawItems : []) as OrderItem[]

  const { shipments: _shipments, order_items: _orderItems, ...rest } = row
  void _shipments
  void _orderItems

  return { ...(rest as Omit<ConfirmedOrder, 'shipment' | 'items'>), shipment, items }
}
