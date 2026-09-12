import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * تعديل حملة إعلانية قائمة — الحالة، الميزانية، الأداء.
 * ROAS غير قابل للتعديل: عمود محسوب في قاعدة البيانات.
 */

const STATUSES = ['active', 'completed', 'under_review', 'paused']

const MONEY_FIELDS = [
  'budget_total_iqd',
  'budget_spent_iqd',
  'daily_budget_iqd',
  'attributed_revenue_iqd',
] as const

const COUNTER_FIELDS = ['reach', 'impressions', 'clicks', 'conversions'] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await req.json()) as Record<string, unknown>

    const patch: Record<string, unknown> = {}

    if (body.status !== undefined) {
      const status = String(body.status)
      if (!STATUSES.includes(status)) {
        return NextResponse.json({ success: false, error: 'حالة الحملة غير صالحة' }, { status: 422 })
      }
      patch.status = status
    }

    for (const field of MONEY_FIELDS) {
      if (body[field] === undefined) continue
      const v = Number(body[field])
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json(
          { success: false, error: 'المبالغ يجب أن تكون أرقاماً غير سالبة' },
          { status: 422 }
        )
      }
      patch[field] = Math.round(v)
    }

    for (const field of COUNTER_FIELDS) {
      if (body[field] === undefined) continue
      const v = Number(body[field])
      if (!Number.isInteger(v) || v < 0) {
        return NextResponse.json(
          { success: false, error: 'عدادات الأداء يجب أن تكون أعداداً صحيحة غير سالبة' },
          { status: 422 }
        )
      }
      patch[field] = v
    }

    if (body.marketer_notes !== undefined) {
      const s = typeof body.marketer_notes === 'string' ? body.marketer_notes.trim() : ''
      patch.marketer_notes = s === '' ? null : s
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: 'لا توجد حقول صالحة للتعديل' },
        { status: 400 }
      )
    }

    // قيود القمع تُفحص على الصف بعد الدمج، لا على المُرسَل وحده:
    // تعديل الظهور وحده قد يجعله أقل من نقرات مخزّنة أصلاً.
    const { data: current, error: readError } = await supabaseServer
      .from('ad_campaigns')
      .select('impressions, clicks, conversions')
      .eq('id', id)
      .maybeSingle()

    if (readError) {
      return NextResponse.json({ success: false, error: readError.message }, { status: 500 })
    }
    if (!current) {
      return NextResponse.json({ success: false, error: 'الحملة غير موجودة' }, { status: 404 })
    }

    const merged = { ...(current as Record<string, number>), ...patch } as {
      impressions: number
      clicks: number
      conversions: number
    }
    if (merged.clicks > merged.impressions) {
      return NextResponse.json(
        { success: false, error: 'عدد النقرات لا يفوق عدد مرات الظهور' },
        { status: 422 }
      )
    }
    if (merged.conversions > merged.clicks) {
      return NextResponse.json(
        { success: false, error: 'عدد التحويلات لا يفوق عدد النقرات' },
        { status: 422 }
      )
    }

    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabaseServer
      .from('ad_campaigns')
      .update(patch)
      .eq('id', id)
      .select('*, merchants(name), marketers(name)')
      .maybeSingle()

    if (error) {
      console.error('[CAMPAIGN][PATCH_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'الحملة غير موجودة' }, { status: 404 })
    }

    return NextResponse.json({ success: true, campaign: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء تعديل الحملة'
    console.error('[CAMPAIGN][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { error } = await supabaseServer.from('ad_campaigns').delete().eq('id', id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر حذف الحملة'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
