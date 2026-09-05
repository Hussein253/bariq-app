import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

/**
 * تحديث شحنة محددة (حالة، مندوب، تسوية مالية، ملاحظات)
 * ------------------------------------------------------
 * لا يفرض هذا المسار قواعد آلة الحالات بنفسه - الفرض الفعلي يتم عبر
 * enforce_shipment_status_transition() Trigger في قاعدة البيانات، ونعيد
 * رسالة الخطأ العربية القادمة من الـ Trigger مباشرة للواجهة عند رفض الانتقال.
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const updates: Record<string, unknown> = {}
    if (body.status !== undefined) updates.status = body.status
    if (body.postponed_reason !== undefined) updates.postponed_reason = body.postponed_reason
    if (body.returned_reason !== undefined) updates.returned_reason = body.returned_reason
    if (body.courier_id !== undefined) updates.courier_id = body.courier_id
    if (body.settlement_status !== undefined) updates.settlement_status = body.settlement_status
    if (body.notes !== undefined) updates.notes = body.notes

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'لا توجد بيانات لتحديثها' }, { status: 400 })
    }

    const { data, error } = await supabaseServer
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 })
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'الشحنة غير موجودة' }, { status: 404 })
    }

    return NextResponse.json({ success: true, shipment: data })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء تعديل الشحنة'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
