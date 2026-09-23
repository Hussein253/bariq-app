/**
 * اللغات المدعومة في واجهة برق — بيانات نقية بلا أي قراءة كوكيز
 * ==============================================================
 * مفصولة عن lib/i18n/server.ts عمداً: ذاك يقرأ الكوكي عبر next/headers فلا
 * يصلح للاستيراد من مكوّن عميل. وهذا الملف يُستورد من الطرفين — مبدّل اللغة
 * في المتصفح يحتاج الأسماء والاتجاهات، والخادم يحتاج التحقق والتطبيع.
 *
 * ⚠️ السوق العراقي ليس عربياً وحده: التاجر في أربيل والسليمانية يقرأ الكردية
 * السورانية، ومن يصل من خارج العراق يقرأ الإنجليزية. اللغة الافتراضية تبقى
 * العربية لأنها لغة أغلب التجّار، لكن الزائر يبدّلها من أول شاشة يراها —
 * قبل أن يُطلب منه إنشاء حساب.
 */

export const LOCALES = ['ar', 'ku', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/** الافتراضي لمن لم يختر بعد. */
export const DEFAULT_LOCALE: Locale = 'ar'

/** اسم كوكي اللغة. يُقرأ في الخادم ويُكتب في المتصفح — فلا httpOnly له. */
export const LOCALE_COOKIE = 'bariq_locale'

/** سنة كاملة: اللغة تفضيل لا جلسة، ومن اختار الكردية لا يُسأل كل أسبوع. */
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365

/**
 * قيمة سمة lang في <html>.
 * ⚠️ الكردية تُكتب ckb لا ku: رمز ku يعني «الكردية» كمجموعة لهجات، والواجهة
 * مكتوبة بالسورانية بالأبجدية العربية تحديداً (ckb). قارئ الشاشة يختار
 * صوته على هذا الرمز، وخطأه يجعله يقرأ النص بلفظ لغة أخرى.
 */
export const HTML_LANG: Record<Locale, string> = {
  ar: 'ar',
  ku: 'ckb',
  en: 'en',
}

/** اتجاه الصفحة. السورانية تُكتب من اليمين إلى اليسار كالعربية. */
export const LOCALE_DIR: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  ku: 'rtl',
  en: 'ltr',
}

/** اسم كل لغة بلغتها هي — لا يُترجم: من يبحث عن الكردية يبحث عن «کوردی». */
export const LOCALE_LABELS: Record<Locale, string> = {
  ar: 'العربية',
  ku: 'کوردی',
  en: 'English',
}

/** اختصار يُعرض في زرّ المبدّل حين تضيق الشاشة. */
export const LOCALE_SHORT: Record<Locale, string> = {
  ar: 'ع',
  ku: 'ک',
  en: 'EN',
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * يطبّع أي قيمة واردة إلى لغة مدعومة.
 * يقبل ما يصل من ترويسة Accept-Language أيضاً (ar-IQ ، ckb-IQ ، en-US)
 * فلا يسقط زائر لغته مدعومة لمجرد أن متصفّحه يرسل الرمز الإقليمي معها.
 */
export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE
  const raw = value.trim().toLowerCase()
  if (isLocale(raw)) return raw

  const base = raw.split(/[-_]/)[0]
  if (isLocale(base)) return base
  if (base === 'ckb' || base === 'kur' || base === 'kmr') return 'ku'

  return DEFAULT_LOCALE
}
