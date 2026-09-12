/**
 * كوبونات التاجر ومعلومات نشاطه وقواعد توصيله.
 * آمن للاستيراد في المتصفح: أنواع ومنطق تحقّق فقط.
 */

export type DiscountType = 'percent' | 'fixed'

export interface Coupon {
  id: string
  merchant_id: string
  code: string
  discount_type: DiscountType
  discount_value: number
  min_order_iqd: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface MerchantProfile {
  merchant_id: string
  about: string | null
  working_hours: string | null
  contact_phone: string | null
  address: string | null
  maps_url: string | null
  delivery_zone: string | null
  current_offers: string | null
}

export interface DeliverySettings {
  merchant_id: string
  base_governorate: string
  local_fee_iqd: number
  local_days: number
  local_note: string | null
  other_fee_iqd: number
  other_days: number
  other_note: string | null
}

export interface Catalog {
  id: string
  merchant_id: string
  name: string
  is_default: boolean
}

export const IRAQI_GOVERNORATES = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'النجف', 'كربلاء', 'ذي قار', 'بابل',
  'الأنبار', 'ديالى', 'كركوك', 'واسط', 'صلاح الدين', 'المثنى', 'القادسية',
  'ميسان', 'دهوك', 'السليمانية',
] as const

export type FieldError = { field: string; message: string }

/** تطبيع رمز الكوبون: حروف كبيرة بلا فراغات، فلا يفشل المطابقة فرق حالة حرف. */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '')
}

export function validateCoupon(draft: {
  code?: string
  discount_type?: string
  discount_value?: number
  min_order_iqd?: number
  max_uses?: number | null
  expires_at?: string | null
}): FieldError[] {
  const errors: FieldError[] = []

  const code = draft.code ? normalizeCouponCode(draft.code) : ''
  if (!code) {
    errors.push({ field: 'code', message: 'رمز الكوبون مطلوب' })
  } else if (!/^[A-Z0-9_-]{2,32}$/.test(code)) {
    errors.push({
      field: 'code',
      message: 'الرمز يقبل الحروف اللاتينية والأرقام والشرطة فقط (٢ إلى ٣٢ خانة)',
    })
  }

  if (draft.discount_type !== 'percent' && draft.discount_type !== 'fixed') {
    errors.push({ field: 'discount_type', message: 'نوع الخصم غير صالح' })
  }

  const value = Number(draft.discount_value)
  if (!Number.isFinite(value) || value <= 0) {
    errors.push({ field: 'discount_value', message: 'قيمة الخصم يجب أن تكون أكبر من صفر' })
  } else if (draft.discount_type === 'percent' && value > 100) {
    // خصم فوق ١٠٠٪ يجعل المبلغ سالباً، أي أن التاجر يدفع للزبون
    errors.push({ field: 'discount_value', message: 'نسبة الخصم لا تتجاوز ١٠٠٪' })
  }

  if (draft.min_order_iqd !== undefined && draft.min_order_iqd !== null) {
    const min = Number(draft.min_order_iqd)
    if (!Number.isFinite(min) || min < 0) {
      errors.push({ field: 'min_order_iqd', message: 'الحد الأدنى للطلب لا يكون سالباً' })
    }
  }

  if (draft.max_uses !== undefined && draft.max_uses !== null) {
    const uses = Number(draft.max_uses)
    if (!Number.isInteger(uses) || uses <= 0) {
      errors.push({ field: 'max_uses', message: 'عدد مرات الاستخدام عدد صحيح أكبر من صفر' })
    }
  }

  if (draft.expires_at) {
    const when = new Date(draft.expires_at)
    if (Number.isNaN(when.getTime())) {
      errors.push({ field: 'expires_at', message: 'تاريخ الانتهاء غير صالح' })
    }
  }

  return errors
}

export function validateDeliverySettings(draft: Partial<DeliverySettings>): FieldError[] {
  const errors: FieldError[] = []

  if (!draft.base_governorate || !draft.base_governorate.trim()) {
    errors.push({ field: 'base_governorate', message: 'محافظة الانطلاق مطلوبة' })
  }

  for (const [field, label] of [
    ['local_fee_iqd', 'أجرة التوصيل المحلي'],
    ['other_fee_iqd', 'أجرة توصيل بقية المحافظات'],
  ] as const) {
    const v = Number(draft[field])
    if (!Number.isFinite(v) || v < 0) {
      errors.push({ field, message: `${label} يجب أن تكون رقماً غير سالب` })
    }
  }

  for (const [field, label] of [
    ['local_days', 'مدة التوصيل المحلي'],
    ['other_days', 'مدة توصيل بقية المحافظات'],
  ] as const) {
    const v = Number(draft[field])
    if (!Number.isInteger(v) || v < 0) {
      errors.push({ field, message: `${label} يجب أن تكون عدداً صحيحاً غير سالب` })
    }
  }

  return errors
}

/** هل انتهت صلاحية الكوبون أو نفد رصيده؟ */
export function couponState(c: Coupon): { label: string; className: string } {
  if (!c.is_active) {
    return { label: 'موقوف', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) {
    return { label: 'منتهٍ', className: 'bg-rose-50 text-rose-700 border-rose-200' }
  }
  if (c.max_uses !== null && c.used_count >= c.max_uses) {
    return { label: 'نفد رصيده', className: 'bg-amber-50 text-amber-800 border-amber-200' }
  }
  return { label: 'فعّال', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}
