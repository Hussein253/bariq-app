import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { planLimitFailure } from '@/lib/plan-limits'

export const dynamic = 'force-dynamic'

/** سجلات الطلبات — public.order_books. خط استقبال طلبات مستقل لكل فرع أو نشاط. */

export async function GET(request: Request) {
  const merchantId = new URL(request.url).searchParams.get('merchant_id')
  if (!merchantId) {
    return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('order_books')
    .select('*')
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[ORDER_BOOKS][GET_ERROR]', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  // عدد الطلبات في كل سجل — من جدول orders الحقيقي لا من عدّاد مخزّن
  const books = data ?? []
  const counts = await Promise.all(
    books.map(async (b) => {
      const { count } = await supabaseServer
        .from('orders')
        .select('order_id', { count: 'exact', head: true })
        .eq('order_book_id', (b as { id: string }).id)
      return count ?? 0
    })
  )

  return NextResponse.json({
    success: true,
    count: books.length,
    books: books.map((b, i) => ({ ...(b as object), orders_count: counts[i] })),
  })
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      merchant_id?: string
      name?: string
      is_default?: boolean
    }

    if (!body.merchant_id) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
    }

    const name = body.name?.trim()
    if (!name) {
      return NextResponse.json({ success: false, error: 'اسم السجل مطلوب' }, { status: 422 })
    }

    // أول سجل للتاجر يصير الافتراضي تلقائياً: طلب بلا سجل يضيع
    const { count } = await supabaseServer
      .from('order_books')
      .select('id', { count: 'exact', head: true })
      .eq('merchant_id', body.merchant_id)

    const { data, error } = await supabaseServer
      .from('order_books')
      .insert({
        merchant_id: body.merchant_id,
        name,
        is_default: body.is_default ?? (count ?? 0) === 0,
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
          { success: false, error: 'لديك سجل بهذا الاسم، أو سجل افتراضي آخر' },
          { status: 409 }
        )
      }
      console.error('[ORDER_BOOKS][INSERT_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, book: data }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر إنشاء السجل'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string
      merchant_id?: string
      name?: string
      is_default?: boolean
    }

    if (!body.id || !body.merchant_id) {
      return NextResponse.json(
        { success: false, error: 'معرّف السجل والتاجر مطلوبان' },
        { status: 400 }
      )
    }

    // فهرس فريد يسمح بسجل افتراضي واحد، فيُنزع القديم أولاً
    if (body.is_default === true) {
      const { error: clearError } = await supabaseServer
        .from('order_books')
        .update({ is_default: false })
        .eq('merchant_id', body.merchant_id)
        .neq('id', body.id)
      if (clearError) {
        return NextResponse.json({ success: false, error: clearError.message }, { status: 500 })
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) {
        return NextResponse.json({ success: false, error: 'اسم السجل مطلوب' }, { status: 422 })
      }
      patch.name = name
    }
    if (body.is_default !== undefined) patch.is_default = body.is_default

    const { data, error } = await supabaseServer
      .from('order_books')
      .update(patch)
      .eq('id', body.id)
      .eq('merchant_id', body.merchant_id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ success: false, error: 'السجل غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ success: true, book: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحديث السجل'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const params = new URL(request.url).searchParams
  const id = params.get('id')
  const merchantId = params.get('merchant_id')

  if (!id || !merchantId) {
    return NextResponse.json(
      { success: false, error: 'معرّف السجل والتاجر مطلوبان' },
      { status: 400 }
    )
  }

  // السجل الحامل لطلبات لا يُحذف: الطلبات تفقد نسبتها لخط الاستقبال
  const { count, error: countError } = await supabaseServer
    .from('orders')
    .select('order_id', { count: 'exact', head: true })
    .eq('order_book_id', id)

  if (countError) {
    return NextResponse.json({ success: false, error: countError.message }, { status: 500 })
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { success: false, error: `السجل يحتوي ${count} طلباً — انقلها أو أفرغه أولاً` },
      { status: 409 }
    )
  }

  const { error } = await supabaseServer
    .from('order_books')
    .delete()
    .eq('id', id)
    .eq('merchant_id', merchantId)

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
