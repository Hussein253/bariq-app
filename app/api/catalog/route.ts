import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { validateProduct, type Product, type ProductDraft } from '@/lib/catalog'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { requireMerchantScope } from '@/lib/api-session'
import { apiFill, apiMessages } from '@/lib/i18n/api'

export const dynamic = 'force-dynamic'

/**
 * قاعدة معرفة التاجر (المنتجات والخدمات).
 * ⚠️ لا يوجد تسجيل دخول بعد: merchantId يصل من العميل ولا يمكن التحقق
 * من ملكيته. تُستبدل كل قراءة لـ merchantId هنا بجلسة auth عند بنائها.
 */

/** GET /api/catalog?merchant=<uuid> */
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
      .from('products')
      .select('id, merchant_id, name, color, size, price, price_iqd, stock, status, created_at')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[CATALOG][GET_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, products: (data || []) as Product[] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.loadFailed
    console.error('[CATALOG][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * POST /api/catalog
 * يضيف منتجاً بعد التحقق من حدّ الباقة.
 * الحدّ يُفحص على الخادم لا في الواجهة: زر معطّل في المتصفح ليس تطبيقاً لحدّ.
 */
export async function POST(request: Request) {
  const t = await apiMessages()
  try {
    const body = (await request.json()) as { merchantId?: string } & Partial<ProductDraft>
    const { merchantId: requestedMerchantId, ...draft } = body
    const scope = await requireMerchantScope(requestedMerchantId)
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    if (!merchantId) {
      return NextResponse.json({ success: false, error: t.merchantIdRequired }, { status: 400 })
    }

    const errors = validateProduct(draft)
    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors[0].message, errors }, { status: 422 })
    }

    const entitlements = await loadMerchantEntitlements(merchantId)
    if (!entitlements) {
      return NextResponse.json(
        { success: false, error: t.catalog.noSubscription },
        { status: 403 }
      )
    }

    const { used, limit } = entitlements.usage.products
    if (used !== null && used >= limit) {
      return NextResponse.json(
        {
          success: false,
          error: apiFill(t.catalog.planLimit, { plan: entitlements.plan.name_en, n: limit }),
          limitReached: true,
        },
        { status: 409 }
      )
    }

    const priceIqd = Number(draft.price_iqd)
    const { data, error } = await supabaseServer
      .from('products')
      .insert({
        merchant_id: merchantId,
        name: draft.name!.trim(),
        color: draft.color?.trim() || null,
        size: draft.size?.trim() || null,
        price_iqd: priceIqd,
        // العمود النصي القديم يُكتب معه للتوافق مع لوحة برق الحالية
        price: String(priceIqd),
        stock: Number(draft.stock),
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      console.error('[CATALOG][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, product: data as Product }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.addFailed
    console.error('[CATALOG][POST_ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** PATCH /api/catalog — تعديل سعر أو مخزون أو حالة منتج قائم. */
export async function PATCH(request: Request) {
  const t = await apiMessages()
  try {
    const body = (await request.json()) as {
      id?: number
      merchantId?: string
      price_iqd?: number
      stock?: number
      status?: string
    }
    const { id } = body
    const scope = await requireMerchantScope(body.merchantId)
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    if (!id || !merchantId) {
      return NextResponse.json(
        { success: false, error: t.catalog.idsRequired },
        { status: 400 }
      )
    }

    const patch: Record<string, unknown> = {}

    if (body.price_iqd !== undefined) {
      const price = Number(body.price_iqd)
      if (!Number.isFinite(price) || price < 0) {
        return NextResponse.json(
          { success: false, error: t.catalog.priceInvalid },
          { status: 422 }
        )
      }
      patch.price_iqd = price
      patch.price = String(price)
    }

    if (body.stock !== undefined) {
      const stock = Number(body.stock)
      if (!Number.isInteger(stock) || stock < 0) {
        return NextResponse.json(
          { success: false, error: t.catalog.stockInvalid },
          { status: 422 }
        )
      }
      patch.stock = stock
    }

    if (body.status !== undefined) patch.status = body.status

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: t.noChange }, { status: 400 })
    }

    // شرط merchant_id يمنع تعديل منتج تاجر آخر بتمرير معرّف منتج لا يخصّه.
    // maybeSingle لا single: عدم مطابقة أي صف حالة رفض متوقّعة، لا عطل خادم —
    // وإعادتها كـ 500 تخفي محاولة الوصول غير المصرّح خلف رسالة عطل عام.
    const { data, error } = await supabaseServer
      .from('products')
      .update(patch)
      .eq('id', id)
      .eq('merchant_id', merchantId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('[CATALOG][PATCH_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: t.catalog.notFound },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, product: data as Product })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.updateFailed
    console.error('[CATALOG][PATCH_ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/catalog?id=<n>&merchant=<uuid> */
export async function DELETE(request: Request) {
  const t = await apiMessages()
  try {
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const scope = await requireMerchantScope(params.get('merchant'))
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    if (!id || !merchantId) {
      return NextResponse.json(
        { success: false, error: t.catalog.idsRequired },
        { status: 400 }
      )
    }

    const { error } = await supabaseServer
      .from('products')
      .delete()
      .eq('id', Number(id))
      .eq('merchant_id', merchantId)

    if (error) {
      console.error('[CATALOG][DELETE_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.catalog.deleteFailed
    console.error('[CATALOG][DELETE_ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
