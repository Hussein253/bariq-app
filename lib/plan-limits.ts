/**
 * ترجمة أخطاء مُحفّز حدود الباقة إلى ردود HTTP نظيفة.
 * ===================================================
 * الفرض نفسه يقع في قاعدة البيانات (دالة enforce_plan_limit)، فيسري على كل
 * مسار كتابة بلا استثناء. هذا الملف يحوّل الخطأ الخام إلى رسالة عربية
 * ورمز حالة صحيح بدل تسريب نص PostgreSQL للواجهة.
 */

import { toArabicDigits } from '@/lib/formatters'

/** تجاوز حدّ الباقة. */
export const PLAN_LIMIT_EXCEEDED = 'BQ001'
/** لا اشتراك فعّال — لا تُمنح صلاحيات افتراضية. */
export const NO_ACTIVE_SUBSCRIPTION = 'BQ002'

export interface PlanLimitFailure {
  status: number
  error: string
  limitReached: boolean
}

/**
 * يعيد ردّاً جاهزاً إن كان الخطأ من مُحفّز الحدود، وإلا null ليعالجه المستدعي
 * كخطأ خادم عادي.
 *
 * المُحفّز يرسل وسوماً خاماً (BQ_LIMIT|التسمية|الحدّ) لا جملة جاهزة، لأن
 * قاعدة البيانات لا تعرف أن المنصة تعرض أرقاماً عربية. الجملة تُؤلَّف هنا.
 */
export function planLimitFailure(
  error: { code?: string | null; message?: string | null } | null | undefined
): PlanLimitFailure | null {
  if (!error?.code) return null

  if (error.code === PLAN_LIMIT_EXCEEDED) {
    const [, label, limit] = (error.message || '').split('|')
    return {
      status: 409,
      error:
        label && limit
          ? `بلغت حدّ باقتك: ${toArabicDigits(limit)} ${label}. الترقية تفتح المزيد.`
          : 'بلغت حدّ باقتك الحالية',
      limitReached: true,
    }
  }

  if (error.code === NO_ACTIVE_SUBSCRIPTION) {
    const [, label] = (error.message || '').split('|')
    return {
      status: 402,
      error: label
        ? `لا يوجد اشتراك فعّال — إضافة ${label} تحتاج باقة مفعّلة.`
        : 'لا يوجد اشتراك فعّال لهذا التاجر',
      limitReached: false,
    }
  }

  return null
}
