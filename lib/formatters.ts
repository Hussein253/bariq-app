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
