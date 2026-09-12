import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * الحملات الإعلانية — من جدول public.ad_campaigns الحقيقي.
 *
 * ROAS لا يُستقبل من العميل ولا يُخزَّن: عمود محسوب في قاعدة البيانات
 * من الإيراد المنسوب ÷ الإنفاق. رقم مُدخَل يدوياً ينحرف فور تغيّر أيّهما،
 * فتُتَّخذ قرارات ميزانية على أساس خاطئ.
 */

const PLATFORMS = ['instagram', 'facebook', 'tiktok', 'snapchat', 'google']
const STATUSES = ['active', 'completed', 'under_review', 'paused']

export interface CampaignRecord {
  id: string
  name: string
  merchant_id: string
  merchant_name: string | null
  marketer_id: string | null
  marketer_name: string | null
  platform: string
  status: string
  budget_total_iqd: number
  budget_spent_iqd: number
  daily_budget_iqd: number
  attributed_revenue_iqd: number
  reach: number
  impressions: number
  clicks: number
  conversions: number
  roas: number | null
  start_date: string | null
  end_date: string | null
  target_audience: string | null
  ad_headline: string | null
  marketer_notes: string | null
}

type Row = {
  id: string
  name: string
  merchant_id: string
  marketer_id: string | null
  platform: string
  status: string
  budget_total_iqd: number | string
  budget_spent_iqd: number | string
  daily_budget_iqd: number | string
  attributed_revenue_iqd: number | string
  reach: number
  impressions: number
  clicks: number
  conversions: number
  roas: number | string | null
  start_date: string | null
  end_date: string | null
  target_audience: string | null
  ad_headline: string | null
  marketer_notes: string | null
  merchants: { name: string } | null
  marketers: { name: string } | null
}

const SELECT =
  'id, name, merchant_id, marketer_id, platform, status, budget_total_iqd, budget_spent_iqd, ' +
  'daily_budget_iqd, attributed_revenue_iqd, reach, impressions, clicks, conversions, roas, ' +
  'start_date, end_date, target_audience, ad_headline, marketer_notes, ' +
  'merchants(name), marketers(name)'

function mapRow(r: Row): CampaignRecord {
  return {
    id: r.id,
    name: r.name,
    merchant_id: r.merchant_id,
    merchant_name: r.merchants?.name ?? null,
    marketer_id: r.marketer_id,
    marketer_name: r.marketers?.name ?? null,
    platform: r.platform,
    status: r.status,
    budget_total_iqd: Number(r.budget_total_iqd || 0),
    budget_spent_iqd: Number(r.budget_spent_iqd || 0),
    daily_budget_iqd: Number(r.daily_budget_iqd || 0),
    attributed_revenue_iqd: Number(r.attributed_revenue_iqd || 0),
    reach: r.reach,
    impressions: r.impressions,
    clicks: r.clicks,
    conversions: r.conversions,
    roas: r.roas === null ? null : Number(r.roas),
    start_date: r.start_date,
    end_date: r.end_date,
    target_audience: r.target_audience,
    ad_headline: r.ad_headline,
    marketer_notes: r.marketer_notes,
  }
}

/** GET /api/campaigns?merchant_id=<uuid> */
export async function GET(request: Request) {
  try {
    const merchantId = new URL(request.url).searchParams.get('merchant_id')

    let query = supabaseServer.from('ad_campaigns').select(SELECT)
    if (merchantId) query = query.eq('merchant_id', merchantId)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[CAMPAIGNS][GET_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const campaigns = ((data || []) as unknown as Row[]).map(mapRow)
    return NextResponse.json({ success: true, count: campaigns.length, campaigns })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحميل الحملات'
    console.error('[CAMPAIGNS][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ success: false, error: 'اسم الحملة مطلوب' }, { status: 422 })
    }

    const merchantId = typeof body.merchant_id === 'string' ? body.merchant_id : ''
    if (!merchantId) {
      return NextResponse.json({ success: false, error: 'التاجر مطلوب' }, { status: 422 })
    }

    const platform = String(body.platform || '')
    if (!PLATFORMS.includes(platform)) {
      return NextResponse.json({ success: false, error: 'المنصة الإعلانية غير صالحة' }, { status: 422 })
    }

    const status = body.status ? String(body.status) : 'under_review'
    if (!STATUSES.includes(status)) {
      return NextResponse.json({ success: false, error: 'حالة الحملة غير صالحة' }, { status: 422 })
    }

    // المبالغ والعدادات: أعداد غير سالبة فقط
    const money: Record<string, number> = {}
    for (const field of [
      'budget_total_iqd',
      'budget_spent_iqd',
      'daily_budget_iqd',
      'attributed_revenue_iqd',
    ]) {
      const v = Number(body[field] ?? 0)
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { success: false, error: 'المبالغ يجب أن تكون أرقاماً غير سالبة' },
          { status: 422 }
        )
      }
      money[field] = Math.round(v)
    }

    const counters: Record<string, number> = {}
    for (const field of ['reach', 'impressions', 'clicks', 'conversions']) {
      const v = Number(body[field] ?? 0)
      if (!Number.isInteger(v) || v < 0) {
        return NextResponse.json(
          { success: false, error: 'عدادات الأداء يجب أن تكون أعداداً صحيحة غير سالبة' },
          { status: 422 }
        )
      }
      counters[field] = v
    }

    // قمع التحويل: لا نقرة بلا ظهور، ولا تحويل بلا نقرة
    if (counters.clicks > counters.impressions) {
      return NextResponse.json(
        { success: false, error: 'عدد النقرات لا يفوق عدد مرات الظهور' },
        { status: 422 }
      )
    }
    if (counters.conversions > counters.clicks) {
      return NextResponse.json(
        { success: false, error: 'عدد التحويلات لا يفوق عدد النقرات' },
        { status: 422 }
      )
    }

    const startDate = (body.start_date as string) || null
    const endDate = (body.end_date as string) || null
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return NextResponse.json(
        { success: false, error: 'تاريخ الانتهاء قبل تاريخ البدء' },
        { status: 422 }
      )
    }

    const text = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s === '' ? null : s
    }

    const { data, error } = await supabaseServer
      .from('ad_campaigns')
      .insert({
        name,
        merchant_id: merchantId,
        marketer_id: (body.marketer_id as string) || null,
        platform,
        status,
        ...money,
        ...counters,
        start_date: startDate,
        end_date: endDate,
        target_audience: text(body.target_audience),
        ad_headline: text(body.ad_headline),
        marketer_notes: text(body.marketer_notes),
      })
      .select(SELECT)
      .single()

    if (error) {
      console.error('[CAMPAIGNS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { success: true, campaign: mapRow(data as unknown as Row) },
      { status: 201 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر إنشاء الحملة'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
