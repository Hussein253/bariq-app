import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { normalizeCouponCode, validateCoupon, type Coupon } from '@/lib/merchant-settings'
import { requireMerchantScope } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'

export const dynamic = 'force-dynamic'

/**
 * كوبونات الخصم لكل تاجر.
 * ⚠️ لا يوجد تسجيل دخول بعد: merchantId يصل من العميل ولا يمكن التحقق من ملكيته.
 */

/** GET /api/coupons?merchant=<uuid> */
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
      .from('coupons')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[COUPONS][GET_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, coupons: (data || []) as Coupon[] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.coupons.loadFailed
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** POST /api/coupons */
export async function POST(request: Request) {
  const t = await apiMessages()
  try {
    const body = await request.json()
    const scope = await requireMerchantScope((body as { merchantId?: string }).merchantId)
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    if (!merchantId) {
      return NextResponse.json({ success: false, error: t.merchantIdRequired }, { status: 400 })
    }

    const errors = validateCoupon(body)
    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors[0].message, errors }, { status: 422 })
    }

    const { data, error } = await supabaseServer
      .from('coupons')
      .insert({
        merchant_id: merchantId,
        code: normalizeCouponCode(body.code),
        discount_type: body.discount_type,
        discount_value: Number(body.discount_value),
        min_order_iqd: Number(body.min_order_iqd || 0),
        max_uses: body.max_uses ? Number(body.max_uses) : null,
        expires_at: body.expires_at || null,
      })
      .select()
      .single()

    if (error) {
      // 23505 = خرق قيد الفرادة (merchant_id, code)
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: t.coupons.codeTaken },
          { status: 409 }
        )
      }
      console.error('[COUPONS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, coupon: data as Coupon }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.coupons.createFailed
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** PATCH /api/coupons — إيقاف أو تفعيل كوبون. */
export async function PATCH(request: Request) {
  const t = await apiMessages()
  try {
    const { id, merchantId: requestedMerchantId, is_active } = (await request.json()) as {
      id?: string
      merchantId?: string
      is_active?: boolean
    }
    const scope = await requireMerchantScope(requestedMerchantId)
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    if (!id || !merchantId || typeof is_active !== 'boolean') {
      return NextResponse.json({ success: false, error: t.incompleteData }, { status: 400 })
    }

    const { data, error } = await supabaseServer
      .from('coupons')
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('merchant_id', merchantId)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json(
        { success: false, error: t.coupons.notFound },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, coupon: data as Coupon })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.coupons.updateFailed
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/coupons?id=<uuid>&merchant=<uuid> */
export async function DELETE(request: Request) {
  const t = await apiMessages()
  try {
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const scope = await requireMerchantScope(params.get('merchant'))
    if (!scope.ok) return scope.response
    const merchantId = scope.merchantId

    if (!id || !merchantId) {
      return NextResponse.json({ success: false, error: t.incompleteData }, { status: 400 })
    }

    const { error } = await supabaseServer
      .from('coupons')
      .delete()
      .eq('id', id)
      .eq('merchant_id', merchantId)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.coupons.deleteFailed
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
