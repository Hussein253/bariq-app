/**
 * إلغاء الطلب من لوحة التشغيل (الترحيل ٠٣٤)
 * ===========================================
 * الإلغاء يلغي الطلب وشحنته معاً في معاملة واحدة (RPC cancel_order)، ولا يحذف
 * شيئاً: الطلب يبقى في السجل بحالة cancelled، والشحنة بحالة CANCELLED النهائية.
 * القواعد الفعلية في القاعدة نفسها؛ هنا ما تحتاجه الواجهة والمسار من تحديد،
 * وترجمة الأخطاء إلى ردود، ونصوص الرفض المشتركة.
 */

export const CANCEL_ORDER_RPC = 'cancel_order'

/**
 * الطلب يُلغى ما دامت شحنته (إن وُجدت) لم تُستلم من التاجر بعد. الطلب الملغى
 * لا يُلغى مرة ثانية.
 */
export function canCancelOrder(order: {
  current_state: string | null
  shipment: { status: string } | null
}): boolean {
  if (order.current_state === 'cancelled') return false
  return order.shipment === null || order.shipment.status === 'ORDER_RECEIVED'
}

/** errcode ← رمز الرد: الترحيل ٠٣٤ يرفع BQ010 و BQ011 و BQ015 وBQ014 من cancel_order والمُحفِّزات. */
const FAILURE_STATUS: Record<string, number> = {
  BQ010: 400,
  BQ011: 404,
  BQ014: 409,
  BQ015: 409,
}

export interface CancelFailure {
  status: number
  error: string
}

/**
 * يحوّل خطأ الـ RPC إلى رد: الرمز من errcode، والرسالة العربية بعد «|» كما تكتبها
 * الترحيلات. أي رمز غير معروف خطأ داخلي، ولا تفاصيل تُعرض للمتصفح.
 */
export function cancelFailure(error: { code?: string | null; message?: string | null }): CancelFailure {
  const status = FAILURE_STATUS[error.code ?? '']
  if (!status) return { status: 500, error: 'تعذّر إلغاء الطلب' }
  const message = (error.message ?? '').split('|').slice(1).join('|').trim()
  return { status, error: message || 'تعذّر إلغاء الطلب' }
}

/** رفض تعديل شحنة ملغاة في مسار التعديل اليدوي (بنص الترحيل ٠٣٤). */
export function cancelledShipmentLockedError(trackingNumber: string): string {
  return `الشحنة ${trackingNumber} ملغية ولا يتغيّر فيها مندوب ولا تسوية ولا حالة — الملاحظات وحدها تُعدَّل`
}

/** تغيير الحالة إلى «ملغية» من شاشة الشحنات مرفوض: الإلغاء من زر الطلب وحده. */
export const CANCEL_VIA_ORDER_ERROR = 'الإلغاء يتم من زر «إلغاء الطلب» في لوحة التشغيل، لا بتغيير الحالة'
