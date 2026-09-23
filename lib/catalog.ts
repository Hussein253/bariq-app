/**
 * قاعدة معرفة التاجر — المنتجات والخدمات التي يجيب منها الموظف الذكي.
 * آمن للاستيراد في المتصفح: أنواع ومنطق تحقّق فقط.
 */

export interface Product {
  id: number
  merchant_id: string | null
  name: string | null
  color: string | null
  size: string | null
  /** العمود النصي القديم — مُبقى للتوافق مع لوحة برق. */
  price: string | null
  /** السعر المعتمد للحسابات بالدينار. */
  price_iqd: number | null
  stock: number | null
  status: string | null
  created_at: string
}

export interface ProductDraft {
  name: string
  color?: string
  size?: string
  price_iqd: number
  stock: number
}

/**
 * ⚠️ الرسالة صارت رمزاً: هذه الوحدة تُستدعى من الواجهة (بثلاث لغات) ومن
 * مسار API معاً، فلا تستطيع أن تعرف لغة قارئها. الرمز يُترجَم عند العرض،
 * و`message` يبقى نصّاً عربياً للسجلّ ولردود الـ API.
 */
export type ValidationErrorCode =
  | 'nameRequired'
  | 'nameTooLong'
  | 'priceRequired'
  | 'priceInvalid'
  | 'stockRequired'
  | 'stockInvalid'

export type ValidationError = {
  field: keyof ProductDraft
  code: ValidationErrorCode
  message: string
}

/**
 * يتحقّق من مسوّدة منتج قبل الحفظ.
 * السعر يُعامل كحقل مالي: لا يُقبل فارغاً ولا سالباً ولا نصاً غير رقمي.
 */
export function validateProduct(draft: Partial<ProductDraft>): ValidationError[] {
  const errors: ValidationError[] = []

  if (!draft.name || !draft.name.trim()) {
    errors.push({ field: 'name', code: 'nameRequired', message: 'اسم المنتج مطلوب' })
  } else if (draft.name.trim().length > 200) {
    errors.push({ field: 'name', code: 'nameTooLong', message: 'اسم المنتج طويل جداً (٢٠٠ حرف كحد أقصى)' })
  }

  if (draft.price_iqd === undefined || draft.price_iqd === null || Number.isNaN(draft.price_iqd)) {
    errors.push({ field: 'price_iqd', code: 'priceRequired', message: 'السعر مطلوب' })
  } else if (!Number.isFinite(draft.price_iqd) || draft.price_iqd < 0) {
    errors.push({ field: 'price_iqd', code: 'priceInvalid', message: 'السعر يجب أن يكون رقماً موجباً' })
  }

  if (draft.stock === undefined || draft.stock === null || Number.isNaN(draft.stock)) {
    errors.push({ field: 'stock', code: 'stockRequired', message: 'الكمية مطلوبة' })
  } else if (!Number.isInteger(draft.stock) || draft.stock < 0) {
    errors.push({ field: 'stock', code: 'stockInvalid', message: 'الكمية يجب أن تكون عدداً صحيحاً غير سالب' })
  }

  return errors
}

/** حالة المنتج المعروضة، مشتقّة من المخزون حين لا تُضبط صراحة. */
/** مفتاح حالة العرض — نصّه في قاموس اللغة لا هنا. */
export type ProductDisplayStatus = 'inactive' | 'outOfStock' | 'lowStock' | 'available'

export function displayStatus(p: Product): { key: ProductDisplayStatus; className: string } {
  // ⚠️ 'معطل' قيمة مخزَّنة في قاعدة البيانات لا نصَّ واجهة — تبقى كما هي.
  if (p.status === 'inactive' || p.status === 'معطل') {
    return { key: 'inactive', className: 'bg-surface-3 text-ink-muted border-line' }
  }
  if ((p.stock ?? 0) <= 0) {
    return { key: 'outOfStock', className: 'bg-danger-bg text-danger-ink border-danger-line' }
  }
  if ((p.stock ?? 0) <= 3) {
    return { key: 'lowStock', className: 'bg-warn-bg text-warn-ink border-warn-line' }
  }
  return { key: 'available', className: 'bg-success-bg text-success-ink border-success-line' }
}
