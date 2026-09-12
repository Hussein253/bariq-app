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

export type ValidationError = { field: keyof ProductDraft; message: string }

/**
 * يتحقّق من مسوّدة منتج قبل الحفظ.
 * السعر يُعامل كحقل مالي: لا يُقبل فارغاً ولا سالباً ولا نصاً غير رقمي.
 */
export function validateProduct(draft: Partial<ProductDraft>): ValidationError[] {
  const errors: ValidationError[] = []

  if (!draft.name || !draft.name.trim()) {
    errors.push({ field: 'name', message: 'اسم المنتج مطلوب' })
  } else if (draft.name.trim().length > 200) {
    errors.push({ field: 'name', message: 'اسم المنتج طويل جداً (٢٠٠ حرف كحد أقصى)' })
  }

  if (draft.price_iqd === undefined || draft.price_iqd === null || Number.isNaN(draft.price_iqd)) {
    errors.push({ field: 'price_iqd', message: 'السعر مطلوب' })
  } else if (!Number.isFinite(draft.price_iqd) || draft.price_iqd < 0) {
    errors.push({ field: 'price_iqd', message: 'السعر يجب أن يكون رقماً موجباً' })
  }

  if (draft.stock === undefined || draft.stock === null || Number.isNaN(draft.stock)) {
    errors.push({ field: 'stock', message: 'الكمية مطلوبة' })
  } else if (!Number.isInteger(draft.stock) || draft.stock < 0) {
    errors.push({ field: 'stock', message: 'الكمية يجب أن تكون عدداً صحيحاً غير سالب' })
  }

  return errors
}

/** حالة المنتج المعروضة، مشتقّة من المخزون حين لا تُضبط صراحة. */
export function displayStatus(p: Product): { label: string; className: string } {
  if (p.status === 'inactive' || p.status === 'معطل') {
    return { label: 'معطّل', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  }
  if ((p.stock ?? 0) <= 0) {
    return { label: 'نفد المخزون', className: 'bg-rose-50 text-rose-700 border-rose-200' }
  }
  if ((p.stock ?? 0) <= 3) {
    return { label: 'مخزون منخفض', className: 'bg-amber-50 text-amber-800 border-amber-200' }
  }
  return { label: 'متوفّر', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}
