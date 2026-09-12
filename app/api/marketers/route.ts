import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * المروّجون — من جدول public.marketers الحقيقي.
 * حلّ محل lib/db.ts، وهو مخزن في الذاكرة كان يُفرَّغ مع كل إعادة تشغيل
 * للخادم فيختفي كل مروّج يُسجَّل.
 */

export interface MarketerRecord {
  id: string
  name: string
  agency_name: string | null
  email: string | null
  phone: string | null
  status: string
  commission_rate: number | null
  created_at: string
  assigned_merchants: { id: string; name: string }[]
  active_campaigns_count: number
  total_ad_budget_managed: number
}

const ACTIVE_CAMPAIGN = ['active', 'under_review']

export async function GET() {
  try {
    const [marketersRes, assignmentsRes, campaignsRes] = await Promise.all([
      supabaseServer
        .from('marketers')
        .select('id, name, agency_name, email, phone, status, commission_rate, created_at')
        .order('created_at', { ascending: true }),
      supabaseServer.from('marketer_merchants').select('marketer_id, merchants(id, name)'),
      supabaseServer.from('ad_campaigns').select('marketer_id, status, budget_total_iqd'),
    ])

    for (const res of [marketersRes, assignmentsRes, campaignsRes]) {
      if (res.error) {
        console.error('[MARKETERS][GET_ERROR]', res.error.message)
        return NextResponse.json({ success: false, error: res.error.message }, { status: 500 })
      }
    }

    const assignments = (assignmentsRes.data || []) as unknown as {
      marketer_id: string
      merchants: { id: string; name: string } | null
    }[]

    const campaigns = (campaignsRes.data || []) as {
      marketer_id: string | null
      status: string
      budget_total_iqd: number | string
    }[]

    const marketers: MarketerRecord[] = (
      (marketersRes.data || []) as {
        id: string
        name: string
        agency_name: string | null
        email: string | null
        phone: string | null
        status: string
        commission_rate: number | string | null
        created_at: string
      }[]
    ).map((m) => {
      const mine = campaigns.filter((c) => c.marketer_id === m.id)
      return {
        id: m.id,
        name: m.name,
        agency_name: m.agency_name,
        email: m.email,
        phone: m.phone,
        status: m.status,
        commission_rate: m.commission_rate === null ? null : Number(m.commission_rate),
        created_at: m.created_at,
        assigned_merchants: assignments
          .filter((a) => a.marketer_id === m.id && a.merchants)
          .map((a) => a.merchants!),
        active_campaigns_count: mine.filter((c) => ACTIVE_CAMPAIGN.includes(c.status)).length,
        total_ad_budget_managed: mine.reduce((sum, c) => sum + Number(c.budget_total_iqd || 0), 0),
      }
    })

    return NextResponse.json({ success: true, count: marketers.length, marketers })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحميل المروّجين'
    console.error('[MARKETERS][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string
      agency_name?: string
      email?: string
      phone?: string
      commission_rate?: number
      merchant_ids?: string[]
    }

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'اسم المروّج مطلوب' }, { status: 422 })
    }

    const phone = body.phone?.trim() || null
    if (phone && !/^07[0-9]{9}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: 'رقم الهاتف يجب أن يكون بصيغة ٠٧XXXXXXXXX' },
        { status: 422 }
      )
    }

    const email = body.email?.trim() || null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'صيغة البريد الإلكتروني غير صحيحة' },
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

    const { data, error } = await supabaseServer
      .from('marketers')
      .insert({
        name,
        agency_name: body.agency_name?.trim() || null,
        email,
        phone,
        commission_rate: commissionRate,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      console.error('[MARKETERS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const marketer = data as { id: string }

    // إسناد التجار إن مُرّروا — فشل الإسناد لا يلغي المروّج المُنشأ
    if (body.merchant_ids?.length) {
      const { error: assignError } = await supabaseServer.from('marketer_merchants').insert(
        body.merchant_ids.map((merchant_id) => ({ marketer_id: marketer.id, merchant_id }))
      )
      if (assignError) {
        console.error('[MARKETERS][ASSIGN_ERROR]', assignError.message)
        return NextResponse.json(
          {
            success: true,
            marketer: data,
            warning: `أُنشئ المروّج لكن تعذّر إسناد التجار: ${assignError.message}`,
          },
          { status: 201 }
        )
      }
    }

    return NextResponse.json({ success: true, marketer: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تسجيل المروّج'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** PATCH /api/marketers — تحديث مروّج أو إيقافه. */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string
      status?: string
      commission_rate?: number | null
      agency_name?: string | null
      email?: string | null
      phone?: string | null
    }

    if (!body.id) {
      return NextResponse.json({ success: false, error: 'معرّف المروّج مطلوب' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    const text = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s === '' ? null : s
    }

    for (const field of ['agency_name', 'email', 'phone'] as const) {
      if (body[field] !== undefined) patch[field] = text(body[field])
    }

    if (body.status !== undefined) {
      if (!['active', 'suspended'].includes(body.status)) {
        return NextResponse.json({ success: false, error: 'حالة غير صالحة' }, { status: 422 })
      }
      patch.status = body.status
    }

    if (body.commission_rate !== undefined) {
      if (body.commission_rate === null) {
        patch.commission_rate = null
      } else {
        const rate = Number(body.commission_rate)
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          return NextResponse.json(
            { success: false, error: 'نسبة العمولة بين ٠ و ١٠٠' },
            { status: 422 }
          )
        }
        patch.commission_rate = rate
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'لا يوجد تغيير' }, { status: 400 })
    }
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabaseServer
      .from('marketers')
      .update(patch)
      .eq('id', body.id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'لا يوجد مروّج بهذا المعرّف' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, marketer: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث المروّج'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
