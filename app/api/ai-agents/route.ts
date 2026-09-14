import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { planLimitFailure } from '@/lib/plan-limits'

export const dynamic = 'force-dynamic'

/**
 * الموظفون الأذكياء — public.ai_agents.
 * حدّ العدد مفروض بمُحفّز في قاعدة البيانات (plans.max_ai_agents)،
 * فلا حاجة لفحص مسبق هنا يمكن أن يتعارض معه.
 */

export async function GET(request: Request) {
  const merchantId = new URL(request.url).searchParams.get('merchant_id')
  if (!merchantId) {
    return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('ai_agents')
    .select('*, catalogs(id, name), social_accounts(id, platform, display_name, handle, status)')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[AI_AGENTS][GET_ERROR]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: data?.length ?? 0, agents: data ?? [] })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      merchant_id?: string
      name?: string
      role?: string
      system_prompt?: string
      catalog_id?: string | null
    }

    if (!body.merchant_id) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
    }

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'اسم الموظف مطلوب' }, { status: 422 })
    }

    const { data, error } = await supabaseServer
      .from('ai_agents')
      .insert({
        merchant_id: body.merchant_id,
        name,
        role: body.role?.trim() || null,
        system_prompt: body.system_prompt?.trim() || null,
        catalog_id: body.catalog_id || null,
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
          { success: false, error: 'لديك موظف بهذا الاسم مسبقاً' },
          { status: 409 }
        )
      }
      console.error('[AI_AGENTS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, agent: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر إنشاء الموظف'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string
      merchant_id?: string
      name?: string
      role?: string | null
      system_prompt?: string | null
      catalog_id?: string | null
      is_active?: boolean
    }

    if (!body.id || !body.merchant_id) {
      return NextResponse.json(
        { success: false, error: 'معرّف الموظف والتاجر مطلوبان' },
        { status: 400 }
      )
    }

    const patch: Record<string, unknown> = {}
    const text = (v: unknown) => {
      const s = typeof v === 'string' ? v.trim() : ''
      return s === '' ? null : s
    }

    if (body.name !== undefined) {
      const name = text(body.name)
      if (!name) {
        return NextResponse.json({ success: false, error: 'اسم الموظف مطلوب' }, { status: 422 })
      }
      patch.name = name
    }
    if (body.role !== undefined) patch.role = text(body.role)
    if (body.system_prompt !== undefined) patch.system_prompt = text(body.system_prompt)
    if (body.catalog_id !== undefined) patch.catalog_id = body.catalog_id || null
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'لا يوجد تغيير' }, { status: 400 })
    }
    patch.updated_at = new Date().toISOString()

    // القيد على merchant_id يمنع تعديل موظف تاجر آخر بمعرّف مُخمَّن
    const { data, error } = await supabaseServer
      .from('ai_agents')
      .update(patch)
      .eq('id', body.id)
      .eq('merchant_id', body.merchant_id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'الموظف غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ success: true, agent: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث الموظف'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/** الحذف يحرّر مقعداً من حدّ الباقة. */
export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const merchantId = params.get('merchant_id')

  if (!id || !merchantId) {
    return NextResponse.json(
      { success: false, error: 'معرّف الموظف والتاجر مطلوبان' },
      { status: 400 }
    )
  }

  const { error } = await supabaseServer
    .from('ai_agents')
    .delete()
    .eq('id', id)
    .eq('merchant_id', merchantId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
