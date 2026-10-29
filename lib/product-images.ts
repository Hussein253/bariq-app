/**
 * صور المنتجات — يرفعها التاجر من لوحة برق، والبوت يدزها للزبون إذا طلبها.
 * السكيما في الترحيل supabase/migrations/032_product_images.sql.
 *
 * ⚠️ الصورة تخص «المنتج + اللون» لا صف products الواحد: الصف = لون + قياس،
 * والقياس ما يغيّر الشكل. فصورة رُفعت من صف «تشيرت أسود لارج» تظهر لكل قياسات
 * التشيرت الأسود. التطبيع هنا هو نفسه بالترحيل وبعقدة «تحديد التاجر» في n8n.
 *
 * آمن للاستيراد في المتصفح: أنواع ومنطق خالص، و compressForUpload للمتصفح وحده.
 */

export const PRODUCT_IMAGES_BUCKET = 'product-images'

/** حدّ الصور لكل منتج/لون. البوت يدز ٦ صور كحد أعلى بالرد الواحد (bot_product_images). */
export const MAX_IMAGES_PER_PRODUCT = 5

/**
 * حدّ حجم الملف — نفس حدّ الحاوية وحدّ صورة واتساب (5MB).
 * عملياً الطلب أصغر بكثير: الواجهة تصغّر الصورة قبل الرفع، وجسم الطلب في
 * Vercel ما يتجاوز ٤٫٥MB أصلاً.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** صيغ تقبلها Meta لصورة الرسالة: واتساب يرفض WebP إلا كملصق. */
export type ProductImageMime = 'image/jpeg' | 'image/png'

export interface ProductImage {
  id: number
  product_name: string
  color: string | null
  /** رابط عام بالحاوية product-images — نفس الرابط الي Meta تنزّل منه. */
  url: string
  created_at: string
}

export interface ProductImageGroup {
  product_name: string
  color: string | null
}

/** مجموعة الصور لصف منتج: الاسم واللون مطبّعين. null = صف بلا اسم (ما تنربط بيه صورة). */
export function imageGroupOf(p: { name: string | null; color: string | null }): ProductImageGroup | null {
  const name = (p.name ?? '').trim()
  if (!name) return null
  const color = (p.color ?? '').trim()
  return { product_name: name, color: color || null }
}

/** مفتاح ثابت للمجموعة — لتجميع الصور بالواجهة. */
export function imageGroupKey(g: ProductImageGroup): string {
  return `${g.product_name}\u0000${g.color ?? ''}`
}

/**
 * صيغة الملف من بايتاته الأولى، لا من الامتداد ولا من Content-Type الي يرسله
 * المتصفح: الاثنين يكتبهم المرسل، والحاوية عامة فما ينرفع لها إلا صورة فعلاً.
 */
export function sniffImageType(bytes: Uint8Array): ProductImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= PNG.length && PNG.every((b, i) => bytes[i] === b)) {
    return 'image/png'
  }
  return null
}

export function extensionFor(mime: ProductImageMime): 'jpg' | 'png' {
  return mime === 'image/png' ? 'png' : 'jpg'
}

/** أطول ضلع بعد التصغير: واضح على شاشة الموبايل، وحجمه بحدود ٢٠٠–٤٠٠KB. */
const MAX_EDGE = 1600
const JPEG_QUALITY = 0.85

/**
 * للمتصفح وحده: يصغّر الصورة ويحوّلها JPEG قبل الرفع.
 * صورة الموبايل الخام ٣–٨MB وتتجاوز حدّ جسم الطلب في Vercel (٤٫٥MB)، وتبطّئ
 * إرسال البوت. الخلفية بيضاء لأن PNG الشفاف يصير أسود بـ JPEG.
 * يرمي خطأ إذا المتصفح ما يكدر يفتح الصيغة (مثل HEIC على كروم).
 */
export async function compressForUpload(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d unavailable')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    )
    if (!blob) throw new Error('image encode failed')
    return blob
  } finally {
    bitmap.close()
  }
}
