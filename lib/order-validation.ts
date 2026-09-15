import { normalizeIraqiPhone } from '@/lib/phone'

/**
 * التحقق من صحة طلب وارد — دوال نقية بلا أي وصول لقاعدة البيانات.
 * ================================================================
 * مفصولة عن lib/order-intake.ts عمداً: منطق المال يجب أن يكون قابلاً
 * للاختبار بلا Supabase ولا متغيّرات بيئة، وإلا بقي بلا اختبار.
 *
 * قاعدة انعدام التخمين (CLAUDE.md بند ٢-أ) مطبَّقة هنا حرفياً: لا قيمة
 * افتراضية لأي مبلغ ولا لرقم هاتف. الحقل الغائب يُرفض ولا يُملأ.
 */

export interface IntakeFields {
  recipientName: string
  recipientPhone: string
  governorate: string
  fullAddress: string
  orderContent: string
  codAmountIqd: unknown
  deliveryFeeIqd: unknown
}

export interface IntakeValidation {
  errors: string[]
  phone: string | null
  cod: number
  fee: number
}

/** غائب = null أو undefined أو نص فارغ. الصفر ليس غائباً — هو مبلغ مشروع. */
function isMissing(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

export function validateIntake(input: IntakeFields): IntakeValidation {
  const errors: string[] = []

  const phone = normalizeIraqiPhone(input.recipientPhone)
  const cod = Number(input.codAmountIqd)
  const fee = Number(input.deliveryFeeIqd)

  if (!input.recipientName?.trim()) errors.push('اسم الزبون مطلوب')
  if (!phone) errors.push('رقم هاتف عراقي صالح مطلوب بصيغة 07XXXXXXXXX')
  if (!input.governorate?.trim()) errors.push('المحافظة مطلوبة')
  if (!input.fullAddress?.trim()) errors.push('العنوان الكامل مطلوب')
  if (!input.orderContent?.trim()) errors.push('محتوى الطلب مطلوب')

  // Number('') = 0 — فخّ صامت يحوّل حقلاً غائباً إلى مبلغ صفر مقبول.
  // لذلك يُفحص الغياب قبل التحويل الرقمي لا بعده.
  if (isMissing(input.codAmountIqd)) {
    errors.push('ثمن البضاعة (cod_amount_iqd) مطلوب — لا يُفترض ولا يُخمَّن')
  } else if (!Number.isFinite(cod) || cod < 0) {
    errors.push('ثمن البضاعة يجب أن يكون رقماً غير سالب')
  }

  if (isMissing(input.deliveryFeeIqd)) {
    errors.push('أجرة التوصيل (delivery_fee_iqd) مطلوبة — لا تُفترض ولا تُخمَّن')
  } else if (!Number.isFinite(fee) || fee < 0) {
    errors.push('أجرة التوصيل يجب أن تكون رقماً غير سالب')
  }

  return { errors, phone, cod, fee }
}
