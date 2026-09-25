/**
 * اختيار القاموس وحقن القيم فيه — آمن للاستيراد في الخادم والمتصفح معاً
 * ======================================================================
 * ⚠️ استيراد هذا الملف من مكوّن عميل يجرّ القواميس الثلاثة إلى حزمة
 * المتصفح. فالقاعدة في هذه الشجرة: الصفحات (مكوّنات خادم) تقرأ القاموس،
 * والمكوّنات التفاعلية تستقبل النصوص التي تخصّها **كخصائص** لا تستوردها.
 * هكذا لا يحمّل زائر عربي نصوص الكردية والإنجليزية معه. والمكوّن التفاعلي
 * الذي يحتاج fill يستوردها من '@/lib/i18n/fill' لا من هنا.
 */

import { ar, type Dictionary } from './locales/ar'
import { en } from './locales/en'
import { ku } from './locales/ku'
import { DEFAULT_LOCALE, type Locale } from './config'

export type { Dictionary }

const DICTIONARIES: Record<Locale, Dictionary> = { ar, ku, en }

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]
}

export { fill } from './fill'
