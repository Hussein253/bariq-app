/**
 * تطبيع والتحقق من أرقام الهواتف العراقية
 * ========================================
 * صيغة واحدة معتمدة في كامل المنصة: 07XXXXXXXXX (11 رقماً).
 * مطابق تماماً لقيد shipments.recipient_phone (supabase/migrations/002).
 */

export const IRAQI_PHONE = /^07[0-9]{9}$/

/** يطبّع رقم هاتف عراقي بأي صيغة شائعة (964..., 7xxxxxxxxx, 07xxxxxxxxx) إلى 07XXXXXXXXX */
export function normalizeIraqiPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/[^0-9]/g, '')
  if (digits.startsWith('964') && digits.length === 13) digits = '0' + digits.slice(3)
  if (digits.length === 10 && digits.startsWith('7')) digits = '0' + digits
  return IRAQI_PHONE.test(digits) ? digits : null
}
