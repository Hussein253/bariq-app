import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { normalizeCouponCode, validateCoupon, type Coupon } from '@/lib/merchant-settings'

export const dynamic = 'force-dynamic'

/**
 * كوبونات الخصم لكل تاجر.
 * ⚠️ لا يوجد تسجيل دخول بعد: merchantId يصل من العميل ولا يمكن التحقق من ملكيته.
 */

/** GET /api/coupons?merchant=<uuid> */
export async function GET(request: Request) {
  try {
    const merchantId = new URL(request.url).searchParams.get('merchant')
    if (!merchantId) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
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
    const message = error instanceof Error ? error.message : 'تعذّر تحميل الكوبونات'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** POST /api/coupons */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { merchantId } = body as { merchantId?: string }

    if (!merchantId) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
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
          { success: false, error: 'هذا الرمز مستعمل أصلاً لدى هذا التاجر' },
          { status: 409 }
        )
      }
      console.error('[COUPONS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, coupon: data as Coupon }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر إنشاء الكوبون'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** PATCH /api/coupons — إيقاف أو تفعيل كوبون. */
export async function PATCH(request: Request) {
  try {
    const { id, merchantId, is_active } = (await request.json()) as {
      id?: string
      merchantId?: string
      is_active?: boolean
    }

    if (!id || !merchantId || typeof is_active !== 'boolean') {
      return NextResponse.json({ success: false, error: 'بيانات ناقصة' }, { status: 400 })
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
        { success: false, error: 'لا يوجد كوبون بهذا المعرّف لدى هذا التاجر' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, coupon: data as Coupon })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث الكوبون'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** DELETE /api/coupons?id=<uuid>&merchant=<uuid> */
export async function DELETE(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const merchantId = params.get('merchant')

    if (!id || !merchantId) {
      return NextResponse.json({ success: false, error: 'بيانات ناقصة' }, { status: 400 })
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
    const message = error instanceof Error ? error.message : 'تعذّر حذف الكوبون'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
