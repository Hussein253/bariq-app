/**
 * الطلب التجريبي — orders.is_test (الترحيل ٠٢٧)
 * ==============================================
 * المالك يجرّب البوت من حسابه، فيُنشئ البوت طلباً وشحنته آلياً قبل أن يُعلَّم
 * الطلب تجريبياً (الطلب ٥١ وشحنته BRQ-000011 مثلاً). التعليم لا يحذف شيئاً
 * بقرار ٠٢٧، فالحماية كلها في الاستعلامات وفي مسارات الشحن:
 *
 *   • لا يُعرض ولا يُعدّ ولا يُجمع: كل قائمة أو عدّاد أو مجموع للطلبات يشترط
 *     is_test = false، وكل استعلام شحنات يربط طلبها ربطاً داخلياً
 *     orders!inner(is_test) ويشترط orders.is_test = false. التصفية في القاعدة
 *     لا بعد الجلب: حدّ الصفوف يقع على الحقيقية وحدها، والتجريبي لا يصل
 *     المتصفّح أصلاً.
 *   • لا يُشحن: لا شحنة جديدة لطلب تجريبي، وشحنته القائمة لا تتحرّك — لا حالة
 *     ولا مندوب ولا تسوية. ملاحظاتها وحدها تُعدَّل.
 *
 * ⚠️ شاشة تُظهر التجريبي تُظهره بشارة «تجريبي» صريحة، وبقرار من المالك.
 */

/** أعمدة shipments التي تسلّم الشحنة للمندوب أو تحرّكها في التوصيل والتسوية. */
export const DISPATCH_COLUMNS = [
  'status',
  'courier_id',
  'settlement_status',
  'postponed_reason',
  'returned_reason',
] as const

/** هل يمسّ التعديل شيئاً من التوصيل أو التسوية؟ (الملاحظات وحدها لا تمسّ) */
export function touchesDispatch(patch: Record<string, unknown>): boolean {
  return DISPATCH_COLUMNS.some((column) => column in patch)
}

/**
 * علم is_test من الطلب المربوط بالشحنة عبر orders(is_test). PostgREST يعيده
 * كائناً لعلاقة متعدد-إلى-واحد، ويُقبل هنا مصفوفةً أيضاً كما في mapOrderRow.
 */
export function embeddedOrderIsTest(embedded: unknown): boolean {
  const order = Array.isArray(embedded) ? embedded[0] : embedded
  return Boolean(order) && (order as { is_test?: unknown }).is_test === true
}

/**
 * يُسقط الطلب المربوط من صف الشحنة بعد أن أدّى غرضه (التصفية)، فلا يعبر
 * حقلاً زائداً إلى الواجهة.
 */
export function withoutOrderEmbed<T extends { orders?: unknown }>(row: T): Omit<T, 'orders'> {
  const { orders: _orders, ...rest } = row
  void _orders
  return rest
}

/** رفض إنشاء شحنة لطلب تجريبي — بصياغة رفض BQ012 في create_bot_order_shipment. */
export function testOrderDispatchError(orderId: number | string): string {
  return `الطلب ${orderId} تجريبي (اختبار البوت أو المنصة) ولا يُرسل للشحن`
}

/** رفض تحريك شحنة قائمة لطلب تجريبي: لا تُسلَّم لمندوب ولا تتغيّر حالتها ولا تسويتها. */
export function testShipmentLockedError(trackingNumber: string): string {
  return `الشحنة ${trackingNumber} لطلب تجريبي ولا تُرسل للمندوب — حالتها ومندوبها وتسويتها لا تتغيّر، والملاحظات وحدها تُعدَّل`
}
