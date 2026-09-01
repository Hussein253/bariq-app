import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * استعلام وتحديث طلب محدد عبر المعرف (ID)
 * ---------------------------------------
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const order = db.getOrderById(id)

  if (!order) {
    return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    order
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const order = db.getOrderById(id)
    if (!order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (body.status) {
      const updated = db.updateOrderStatus(id, body.status, body.notes)
      return NextResponse.json({
        success: true,
        message: `تم تحديث حالة الطلب إلى ${body.status}`,
        order: updated
      })
    }

    if (body.payment_status) {
      const updated = db.updateOrderPayment(id, body.payment_status, body.transaction_id, body.payment_method)
      return NextResponse.json({
        success: true,
        message: `تم تحديث حالة الدفع إلى ${body.payment_status}`,
        order: updated
      })
    }

    return NextResponse.json({
      success: true,
      order
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'حدث خطأ أثناء تعديل الطلب'
    }, { status: 500 })
  }
}
