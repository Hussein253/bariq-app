/**
 * طبقة الأنواع لطلبات public.orders — قسم "الطلبات المؤكدة"
 * ===========================================================
 * المصدر الوحيد للحقيقة: جدول public.orders (لا يوجد جدول confirmed_orders
 * منفصل). الطلبات المؤكدة = orders WHERE current_state = 'confirmed'.
 *
 * ⚠️ العمود current_state نصي بلا قيد CHECK في قاعدة البيانات (تحقق مباشر
 * بتاريخ 2026-09-06) — القيم المُلاحظة فعلياً حتى الآن: 'confirmed',
 * 'cancelled'. لا تُفترض أي قيمة أخرى.
 */

export interface OrderShipmentRef {
  id: string
  tracking_number: string
  status: string
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
}

export function orderDisplayName(order: ConfirmedOrder): string {
  return order.customer_name?.trim() || order.name?.trim() || 'بلا اسم'
}

export function orderDisplayPhone(order: ConfirmedOrder): string {
  return order.contact_phone?.trim() || order.phone_number
}

/**
 * يحوّل صف خام من استعلام Supabase (orders + join shipments) إلى ConfirmedOrder.
 * مشتركة بين /api/orders/confirmed و/api/orders/dashboard لتفادي تكرار منطق
 * فك تعشيش join الشحنة (Supabase يُعيده كمصفوفة أو كائن حسب العلاقة).
 */
export function mapOrderRow(row: Record<string, unknown>): ConfirmedOrder {
  const rawShipment = row.shipments as unknown
  const shipment = (Array.isArray(rawShipment) ? rawShipment[0] ?? null : rawShipment ?? null) as OrderShipmentRef | null
  const { shipments: _shipments, ...rest } = row
  void _shipments
  return { ...(rest as Omit<ConfirmedOrder, 'shipment'>), shipment }
}
