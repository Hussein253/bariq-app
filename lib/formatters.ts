import type { Locale } from '@/lib/i18n/config'

/**
 * دوال تحويل وتنسيق الأرقام إلى الأرقام العربية (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩)
 * -------------------------------------------------------------------------
 * تستخدم لتوحيد عرض كافة الأرقام، المبالغ، النسب، والتواريخ في منصة "برق"
 */

const ARABIC_DIGITS: Record<string, string> = {
  '0': '٠',
  '1': '١',
  '2': '٢',
  '3': '٣',
  '4': '٤',
  '5': '٥',
  '6': '٦',
  '7': '٧',
  '8': '٨',
  '9': '٩',
}

/**
 * تحويل أي نص أو رقم يحتوي على أرقام إنجليزية (0-9) إلى أرقام عربية (٠-٩)
 */
export function toArabicDigits(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  return str.replace(/[0-9]/g, (match) => ARABIC_DIGITS[match] || match)
}

/**
 * تنسيق الأرقام مع فواصل الآلاف وتحويلها للأرقام العربية
 * مثال: 1250000 -> ١,٢٥٠,٠٠٠
 */
export function formatArabicNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return '٠'
  const formatted = new Intl.NumberFormat('en-US').format(value)
  return toArabicDigits(formatted)
}

/**
 * تنسيق المبالغ المالية بالدينار العراقي بالأرقام العربية
 * مثال: 45000 -> ٤٥,٠٠٠ د.ع
 */
export function formatArabicCurrency(value: number | undefined | null): string {
  return `${formatArabicNumber(value)} د.ع`
}

/**
 * تنسيق النسب المئوية بالأرقام العربية
 * مثال: 18.4 -> ١٨.٤%
 */
export function formatArabicPercent(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return '٠%'
  return `${toArabicDigits(value)}%`
}

/**
 * تنسيق أرقام الهواتف بالأرقام العربية مع الحفاظ على الترتيب
 */
export function formatArabicPhone(phone: string | undefined | null): string {
  if (!phone) return ''
  return toArabicDigits(phone)
}

/**
 * تنسيق التواريخ إلى الأرقام العربية
 */
export function formatArabicDate(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  return toArabicDigits(dateStr)
}

/**
 * تنسيق التاريخ والوقت بالكامل بالأرقام العربية
 */
export function formatDateTime(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }
    const formatted = new Intl.DateTimeFormat('ar-IQ', options).format(date)
    return formatted
  } catch {
    return toArabicDigits(dateStr)
  }
}

// ---------- تنسيق يتبع لغة الواجهة ----------

/**
 * الأرقام العربية الهندية (٠١٢) تُستعمل في العربية والكردية السورانية معاً —
 * كلتاهما تُكتبان بالأبجدية العربية وبالأرقام نفسها في السوق العراقي.
 * الإنجليزية وحدها تُعرض بالأرقام الغربية.
 *
 * ⚠️ الدوالّ القديمة أعلاه (toArabicDigits وأخواتها) تبقى كما هي: تستعملها
 * شاشات التشغيل الداخلية وملصقات الشحن، وتحويلها كلها إلى لغة الواجهة عمل
 * قائم بذاته. ما يُترجَم اليوم هو الواجهات العامة ومسار التسجيل.
 */
const LOCALE_USES_ARABIC_DIGITS: Record<Locale, boolean> = {
  ar: true,
  ku: true,
  en: false,
}

/** يحوّل أرقام النص إلى أرقام اللغة المعروضة. */
export function localizeDigits(
  value: string | number | undefined | null,
  locale: Locale
): string {
  if (value === undefined || value === null) return ''
  const str = String(value)
  return LOCALE_USES_ARABIC_DIGITS[locale] ? toArabicDigits(str) : str
}

/** رقم بفواصل الآلاف، بأرقام اللغة المعروضة. */
export function formatNumberFor(
  locale: Locale,
  value: number | undefined | null
): string {
  if (value === undefined || value === null || isNaN(value)) return localizeDigits(0, locale)
  return localizeDigits(new Intl.NumberFormat('en-US').format(value), locale)
}

/** لغة تنسيق التاريخ لكل لغة واجهة — الكردية بـ ckb لتظهر أسماء الأشهر سورانية لا عربية. */
export const DATE_LOCALE: Record<Locale, string> = { ar: 'ar-IQ', ku: 'ckb-IQ', en: 'en-US' }

/**
 * ⚠️ المنطقة الزمنية صريحة لا من الخادم: صفحات الخادم تُرسم على Vercel
 * بتوقيت UTC، فيرى التاجر في بغداد وقت شحنته متأخراً ثلاث ساعات.
 */
const DISPLAY_TIME_ZONE = 'Asia/Baghdad'

/** تاريخ ووقت مختصران بلغة الواجهة وأرقامها — «—» لقيمة غائبة أو غير صالحة. */
export function formatDateTimeFor(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (isNaN(date.getTime())) return '—'
  return localizeDigits(
    new Intl.DateTimeFormat(DATE_LOCALE[locale], {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: DISPLAY_TIME_ZONE,
    }).format(date),
    locale
  )
}
