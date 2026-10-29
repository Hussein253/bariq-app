import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { requireMerchantScope } from '@/lib/api-session'
import { apiFill, apiMessages } from '@/lib/i18n/api'
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
  PRODUCT_IMAGES_BUCKET,
  extensionFor,
  imageGroupOf,
  sniffImageType,
  type ProductImage,
} from '@/lib/product-images'

export const dynamic = 'force-dynamic'

/**
 * صور المنتجات (الترحيل ٠٣٢).
 * ⚠️ merchantId طلبٌ يُمحَّص لا هوية — requireMerchantScope كما في /api/catalog.
 * الكتابة هنا وحدها (service_role): لا سياسة إدراج للمتصفح على الجدول ولا الحاوية.
 */

type ImageRow = { id: number; product_name: string; color: string | null; path: string; created_at: string }

const toImage = (row: ImageRow): ProductImage => ({
  id: row.id,
  product_name: row.product_name,
  color: row.color,
  url: supabaseServer.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(row.path).data.publicUrl,
  created_at: row.created_at,
})

/** GET /api/catalog/images?merchant=<uuid> — كل صور التاجر، الأقدم أول. */
export async function GET(request: Request) {
  const t = await apiMessages()
  try {
    const scope = await requireMerchantScope(new URL(request.url).searchParams.get('merchant'))
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId
    if (!merchantId) {
      return NextResponse.json({ success: false, error: t.merchantIdRequired }, { status: 400 })
    }

    const { data, error } = await supabaseServer
      .from('product_images')
      .select('id, product_name, color, path, created_at')
      .eq('merchant_id', merchantId)
      .order('id', { ascending: true })

    if (error) {
      console.error('[CATALOG_IMAGES][GET_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, images: ((data || []) as ImageRow[]).map(toImage) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.imageLoadFailed
    console.error('[CATALOG_IMAGES][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * POST /api/catalog/images — multipart: merchantId, productId, file.
 * الصورة تنربط باسم المنتج ولونه (من صف المنتج نفسه، لا مما يرسله المتصفح).
 */
export async function POST(request: Request) {
  const t = await apiMessages()
  try {
    const form = await request.formData()
    const scope = await requireMerchantScope(String(form.get('merchantId') ?? '') || null)
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    const productId = Number(form.get('productId'))
    if (!merchantId || !Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ success: false, error: t.catalog.idsRequired }, { status: 400 })
    }

    const file = form.get('file')
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ success: false, error: t.catalog.imageRequired }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, error: t.catalog.imageTooLarge }, { status: 413 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = sniffImageType(bytes)
    if (!mime) {
      return NextResponse.json({ success: false, error: t.catalog.imageType }, { status: 415 })
    }

    // شرط merchant_id: معرّف منتج تاجر ثاني ما يفتح مجموعته
    const { data: product, error: productError } = await supabaseServer
      .from('products')
      .select('id, name, color')
      .eq('id', productId)
      .eq('merchant_id', merchantId)
      .maybeSingle()

    if (productError) {
      console.error('[CATALOG_IMAGES][PRODUCT_ERROR]', productError.message)
      return NextResponse.json({ success: false, error: productError.message }, { status: 500 })
    }
    const group = product ? imageGroupOf(product) : null
    if (!group) {
      return NextResponse.json({ success: false, error: t.catalog.notFound }, { status: 404 })
    }

    let countQuery = supabaseServer
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', merchantId)
      .eq('product_name', group.product_name)
    countQuery = group.color === null ? countQuery.is('color', null) : countQuery.eq('color', group.color)
    const { count, error: countError } = await countQuery

    if (countError) {
      console.error('[CATALOG_IMAGES][COUNT_ERROR]', countError.message)
      return NextResponse.json({ success: false, error: countError.message }, { status: 500 })
    }
    if ((count ?? 0) >= MAX_IMAGES_PER_PRODUCT) {
      return NextResponse.json(
        { success: false, error: apiFill(t.catalog.imageLimit, { n: MAX_IMAGES_PER_PRODUCT }), limitReached: true },
        { status: 409 }
      )
    }

    // المسار يبدأ بالتاجر (قيد product_images_path_in_merchant_folder) واسمه عشوائي
    const path = `${merchantId}/${randomUUID()}.${extensionFor(mime)}`
    const bucket = supabaseServer.storage.from(PRODUCT_IMAGES_BUCKET)
    const { error: uploadError } = await bucket.upload(path, bytes, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    })
    if (uploadError) {
      console.error('[CATALOG_IMAGES][UPLOAD_ERROR]', uploadError.message)
      return NextResponse.json({ success: false, error: t.catalog.imageUploadFailed }, { status: 502 })
    }

    const { data: row, error: insertError } = await supabaseServer
      .from('product_images')
      .insert({
        merchant_id: merchantId,
        product_name: group.product_name,
        color: group.color,
        path,
        mime_type: mime,
        size_bytes: bytes.length,
      })
      .select('id, product_name, color, path, created_at')
      .single()

    if (insertError) {
      console.error('[CATALOG_IMAGES][INSERT_ERROR]', insertError.message)
      // ملف بلا صف ما يشوفه أحد، بس يشغل مساحة: يُحذف
      const { error: cleanupError } = await bucket.remove([path])
      if (cleanupError) console.error('[CATALOG_IMAGES][CLEANUP_ERROR]', path, cleanupError.message)
      return NextResponse.json({ success: false, error: t.catalog.imageUploadFailed }, { status: 500 })
    }

    return NextResponse.json({ success: true, image: toImage(row as ImageRow) }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.imageUploadFailed
    console.error('[CATALOG_IMAGES][POST_ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/catalog/images?id=<n>&merchant=<uuid>
 * الصف أول (البوت يبطّل يدزها فوراً)، بعدين الملف. فشل حذف الملف يُسجَّل ولا
 * يُرجع خطأ: الصورة انحذفت من عين التاجر والبوت، والباقي ملف يتيم بلا رابط بأي مكان.
 */
export async function DELETE(request: Request) {
  const t = await apiMessages()
  try {
    const params = new URL(request.url).searchParams
    const scope = await requireMerchantScope(params.get('merchant'))
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    const id = Number(params.get('id'))
    if (!merchantId || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: t.catalog.idsRequired }, { status: 400 })
    }

    const { data, error } = await supabaseServer
      .from('product_images')
      .delete()
      .eq('id', id)
      .eq('merchant_id', merchantId)
      .select('path')
      .maybeSingle()

    if (error) {
      console.error('[CATALOG_IMAGES][DELETE_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: t.catalog.imageNotFound }, { status: 404 })
    }

    const { error: removeError } = await supabaseServer.storage.from(PRODUCT_IMAGES_BUCKET).remove([data.path])
    if (removeError) console.error('[CATALOG_IMAGES][REMOVE_FILE_ERROR]', data.path, removeError.message)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.imageDeleteFailed
    console.error('[CATALOG_IMAGES][DELETE_ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
