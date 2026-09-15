/**
 * التحقق من توقيع الـ Webhooks (HMAC-SHA256)
 * ===========================================
 * كل مسار webhook يكتب في قاعدة البيانات يجب أن يثبت أن المرسل يملك السرّ
 * المشترك. بدون ذلك أي شخص على الإنترنت يحقن طلبات ورسائل باسم زبائن حقيقيين.
 *
 * مبدأ الفشل المغلق (Fail Closed): إن لم يُضبط السرّ في البيئة، يُرفض الطلب.
 * الخيار الآخر — القبول عند غياب السرّ — يحوّل نسياناً في الإعداد إلى باب مفتوح.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export type SignatureCheck =
  | { ok: true }
  | { ok: false; status: number; error: string }

/** يقارن بزمن ثابت — المقارنة النصية العادية تسرّب التوقيع بقياس الزمن. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * يتحقق من توقيع الجسم الخام.
 *
 * @param rawBody   نص الجسم كما وصل بالضبط — لا JSON.parse ثم stringify،
 *                  لأن إعادة التسلسل تغيّر الفراغات وترتيب المفاتيح فيفشل التوقيع.
 * @param signature قيمة الترويسة. يُقبل الشكلان: "sha256=<hex>" و "<hex>".
 * @param secret    السرّ المشترك من متغيّرات البيئة.
 */
export function verifySignature(params: {
  rawBody: string
  signature: string | null
  secret: string | undefined
}): SignatureCheck {
  const { rawBody, signature, secret } = params

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: 'سرّ التوقيع غير مضبوط على الخادم — المسار مغلق حتى يُضبط',
    }
  }
  if (!signature) {
    return { ok: false, status: 401, error: 'ترويسة التوقيع مفقودة' }
  }

  const received = signature.startsWith('sha256=') ? signature.slice(7) : signature
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

  if (!safeEqual(received, expected)) {
    return { ok: false, status: 401, error: 'توقيع غير صالح' }
  }
  return { ok: true }
}
