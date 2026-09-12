import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/merchants
 * ------------------
 * التجار الحقيقيون من Supabase، مُثرَون بباقتهم الفعّالة وعدد شحناتهم.
 *
 * يحلّ محل مصفوفة INITIAL_MERCHANTS الوهمية التي كانت مكتوبة في صفحة
 * العمليات. الحقول التي لم يُدخلها التاجر بعد تعود null ولا تُملأ بقيم
 * افتراضية، لأن رقماً مُخترعاً في نسبة عمولة أو رصيد قرار مالي خاطئ.
 */

export interface MerchantRecord {
  id: string
  name: string
  owner_name: string | null
  phone: string | null
  city: string | null
  status: string
  balance_iqd: number
  commission_rate: number | null
  api_key: string | null
  webhook_url: string | null
  api_connected: boolean
  plan_name: string | null
  plan_code: string | null
  subscription_status: string | null
  monthly_fee_iqd: number | null
  orders_count: number
}

const LIVE_SUB = ['trialing', 'active', 'past_due']

export async function GET() {
  try {
    const [merchantsRes, subsRes, shipmentsRes] = await Promise.all([
      supabaseServer
        .from('merchants')
        .select(
          'id, name, owner_name, phone, city, status, balance_iqd, commission_rate, api_key, webhook_url'
        )
        .order('created_at', { ascending: true }),
      supabaseServer
        .from('subscriptions')
        .select('merchant_id, status, plans(code, name_en, price_iqd_monthly)'),
      supabaseServer.from('shipments').select('merchant_id'),
    ])

    if (merchantsRes.error) {
      console.error('[MERCHANTS][GET_ERROR]', merchantsRes.error.message)
      return NextResponse.json(
        { success: false, error: merchantsRes.error.message },
        { status: 500 }
      )
    }
    if (subsRes.error) {
      return NextResponse.json({ success: false, error: subsRes.error.message }, { status: 500 })
    }
    if (shipmentsRes.error) {
      return NextResponse.json(
        { success: false, error: shipmentsRes.error.message },
        { status: 500 }
      )
    }

    const subs = (subsRes.data || []) as unknown as {
      merchant_id: string
      status: string
      plans: { code: string; name_en: string; price_iqd_monthly: number | null } | null
    }[]

    const shipments = (shipmentsRes.data || []) as { merchant_id: string | null }[]

    const merchants: MerchantRecord[] = (
      (merchantsRes.data || []) as {
        id: string
        name: string
        owner_name: string | null
        phone: string | null
        city: string | null
        status: string
        balance_iqd: number | string
        commission_rate: number | string | null
        api_key: string | null
        webhook_url: string | null
      }[]
    ).map((m) => {
      const sub = subs.find((s) => s.merchant_id === m.id && LIVE_SUB.includes(s.status))
      return {
        id: m.id,
        name: m.name,
        owner_name: m.owner_name,
        phone: m.phone,
        city: m.city,
        status: m.status,
        balance_iqd: Number(m.balance_iqd || 0),
        commission_rate: m.commission_rate === null ? null : Number(m.commission_rate),
        api_key: m.api_key,
        webhook_url: m.webhook_url,
        // الربط البرمجي قائم فعلاً متى وُجد مفتاح — لا علم مستقل يُخمَّن
        api_connected: Boolean(m.api_key),
        plan_name: sub?.plans?.name_en ?? null,
        plan_code: sub?.plans?.code ?? null,
        subscription_status: sub?.status ?? null,
        monthly_fee_iqd: sub?.plans?.price_iqd_monthly ?? null,
        orders_count: shipments.filter((s) => s.merchant_id === m.id).length,
      }
    })

    return NextResponse.json({ success: true, count: merchants.length, merchants })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحميل التجار'
    console.error('[MERCHANTS][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * POST /api/merchants — تسجيل تاجر جديد فعلياً في قاعدة البيانات.
 * مفتاح الـ API يُولَّد على الخادم بعشوائية تشفيرية، لا في المتصفح.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string
      owner_name?: string
      phone?: string
      city?: string
      commission_rate?: number
    }

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'اسم المتجر مطلوب' }, { status: 422 })
    }

    const phone = body.phone?.trim() || null
    if (phone && !/^07[0-9]{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: 'رقم الهاتف يجب أن يكون بصيغة ٠٧XXXXXXXXX' },
        { status: 422 }
      )
    }

    let commissionRate: number | null = null
    if (body.commission_rate !== undefined && body.commission_rate !== null) {
      const rate = Number(body.commission_rate)
      if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
        return NextResponse.json(
          { success: false, error: 'نسبة العمولة بين ٠ و ١٠٠' },
          { status: 422 }
        )
      }
      commissionRate = rate
    }

    // مفتاح تشفيري لا Math.random: المفتاح يمنح وصولاً برمجياً لبيانات التاجر
    const apiKey = `brq_live_${crypto.randomUUID().replace(/-/g, '')}`

    const { data, error } = await supabaseServer
      .from('merchants')
      .insert({
        name,
        owner_name: body.owner_name?.trim() || null,
        phone,
        city: body.city?.trim() || null,
        commission_rate: commissionRate,
        api_key: apiKey,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      console.error('[MERCHANTS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, merchant: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تسجيل التاجر'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** PATCH /api/merchants — تحديث بيانات تاجر قائم. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string
      owner_name?: string | null
      city?: string | null
      phone?: string | null
      commission_rate?: number | null
      webhook_url?: string | null
      status?: string
    }

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    const text = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s === '' ? null : s
    }

    for (const field of ['owner_name', 'city', 'phone', 'webhook_url'] as const) {
      if (body[field] !== undefined) patch[field] = text(body[field])
    }

    if (body.commission_rate !== undefined) {
      if (body.commission_rate === null) {
        patch.commission_rate = null
      } else {
        const rate = Number(body.commission_rate)
        // عمولة سالبة تعني أن برق تدفع للتاجر، وفوق ١٠٠٪ تبتلع الطلب كاملاً
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          return NextResponse.json(
            { success: false, error: 'نسبة العمولة بين ٠ و ١٠٠' },
            { status: 422 }
          )
        }
        patch.commission_rate = rate
      }
    }

    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) {
        return NextResponse.json({ success: false, error: 'حالة غير صالحة' }, { status: 422 })
      }
      patch.status = body.status
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'لا يوجد تغيير' }, { status: 400 })
    }

    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabaseServer
      .from('merchants')
      .update(patch)
      .eq('id', body.id)
      .select()
      .maybeSingle()

    if (error) {
      console.error('[MERCHANTS][PATCH_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'لا يوجد تاجر بهذا المعرّف' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, merchant: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث التاجر'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
