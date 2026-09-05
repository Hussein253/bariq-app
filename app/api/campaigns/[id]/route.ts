import { NextRequest, NextResponse } from 'next/server'
import { db, AdCampaignStatus } from '@/lib/db'

/**
 * تعديل وتحديث حالة وميزانية الحملة الإعلانية من قبل المروج
 * ---------------------------------------------------------
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    if (body.status) {
      const updated = db.updateCampaignStatus(id, body.status as AdCampaignStatus)
      if (!updated) {
        return NextResponse.json({ success: false, error: 'الحملة غير موجودة' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        message: `تم تحديث حالة الحملة إلى ${body.status}`,
        campaign: updated
      })
    }

    if (body.budget_total !== undefined && body.daily_budget !== undefined) {
      const updated = db.updateCampaignBudget(id, Number(body.budget_total), Number(body.daily_budget), body.marketer_notes)
      if (!updated) {
        return NextResponse.json({ success: false, error: 'الحملة غير موجودة' }, { status: 404 })
      }
      return NextResponse.json({
        success: true,
        message: 'تم تحديث ميزانية وملاحظات الحملة بنجاح',
        campaign: updated
      })
    }

    return NextResponse.json({ success: false, error: 'لا توجد حقول صالحة للتعديل' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء تعديل الحملة'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}
