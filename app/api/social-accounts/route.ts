import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { planLimitFailure } from '@/lib/plan-limits'

export const dynamic = 'force-dynamic'

/**
 * حسابات التواصل المربوطة — public.social_accounts.
 *
 * التسجيل هنا يدوي: يُدخل المسؤول معرّف الحساب لدى Meta
 * (phone_number_id لواتساب، page_id / ig_user_id لغيره). لا يوجد تدفّق
 * OAuth بعد، ولا يُختلق واحد — زرّ "ربط" لا يربط شيئاً أسوأ من غيابه.
 */

const PLATFORMS = ['whatsapp', 'instagram', 'messenger']
const STATUSES = ['connected', 'needs_reauth', 'disconnected']

export async function GET(request: Request) {
  const merchantId = new URL(request.url).searchParams.get('merchant_id')
  if (!merchantId) {
    return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('social_accounts')
    .select('*, ai_agents(id, name)')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[SOCIAL_ACCOUNTS][GET_ERROR]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: data?.length ?? 0, accounts: data ?? [] })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      merchant_id?: string
      platform?: string
      external_id?: string
      display_name?: string
      handle?: string
      ai_agent_id?: string | null
    }

    if (!body.merchant_id) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
    }

    const platform = String(body.platform || '')
    if (!PLATFORMS.includes(platform)) {
      return NextResponse.json({ success: false, error: 'المنصة غير مدعومة' }, { status: 422 })
    }

    const externalId = body.external_id?.trim()
    if (!externalId) {
      return NextResponse.json(
        { success: false, error: 'معرّف الحساب لدى Meta مطلوب' },
        { status: 422 }
      )
    }

    const { data, error } = await supabaseServer
      .from('social_accounts')
      .insert({
        merchant_id: body.merchant_id,
        platform,
        external_id: externalId,
        display_name: body.display_name?.trim() || null,
        handle: body.handle?.trim() || null,
        ai_agent_id: body.ai_agent_id || null,
      })
      .select()
      .single()

    if (error) {
      const limit = planLimitFailure(error)
      if (limit) {
        return NextResponse.json(
          { success: false, error: limit.error, limitReached: limit.limitReached },
          { status: limit.status }
        )
      }
      if (error.code === '23505') {
        return NextResponse.json(
          { success: false, error: 'هذا الحساب مربوط بالفعل — لا يُربط حساب واحد بتاجرين' },
          { status: 409 }
        )
      }
      console.error('[SOCIAL_ACCOUNTS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, account: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر ربط الحساب'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string
      merchant_id?: string
      display_name?: string | null
      handle?: string | null
      status?: string
      ai_agent_id?: string | null
    }

    if (!body.id || !body.merchant_id) {
      return NextResponse.json(
        { success: false, error: 'معرّف الحساب والتاجر مطلوبان' },
        { status: 400 }
      )
    }

    const patch: Record<string, unknown> = {}
    const text = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s === '' ? null : s
    }

    if (body.display_name !== undefined) patch.display_name = text(body.display_name)
    if (body.handle !== undefined) patch.handle = text(body.handle)
    if (body.ai_agent_id !== undefined) patch.ai_agent_id = body.ai_agent_id || null

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ success: false, error: 'حالة غير صالحة' }, { status: 422 })
      }
      patch.status = body.status
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'لا يوجد تغيير' }, { status: 400 })
    }
    patch.updated_at = new Date().toISOString()

    const { data, error } = await supabaseServer
      .from('social_accounts')
      .update(patch)
      .eq('id', body.id)
      .eq('merchant_id', body.merchant_id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'الحساب غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ success: true, account: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث الحساب'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** فكّ الربط يحذف الصف ويحرّر مقعداً من حدّ الباقة. */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const merchantId = params.get('merchant_id')

  if (!id || !merchantId) {
    return NextResponse.json(
      { success: false, error: 'معرّف الحساب والتاجر مطلوبان' },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from('social_accounts')
    .delete()
    .eq('id', id)
    .eq('merchant_id', merchantId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
