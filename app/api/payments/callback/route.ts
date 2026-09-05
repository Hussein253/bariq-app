import { NextRequest, NextResponse } from 'next/server'
import { db, type PaymentGateway } from '@/lib/db'

/**
 * معالجة الردود المرتجعة وبلاغات الدفع الإلكتروني (Payment Callbacks & Webhooks)
 * -------------------------------------------------------------------------
 * تحديث حالة الطلب إلى "تم الدفع"، ترقية حالة الطلب اللوجستية إلى "قيد المعالجة"،
 * وإيداع المستحقات في حساب التاجر.
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, gateway, status = 'success', transaction_id, reference_id } = body

    if (!order_id) {
      return NextResponse.json({ success: false, error: 'معرف الطلب order_id مطلوب' }, { status: 400 })
    }

    const order = db.getOrderById(order_id)
    if (!order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }

    if (status === 'success' || status === 'completed') {
      const txRef = reference_id || transaction_id || `REF-${Date.now()}`
      const updatedOrder = db.updateOrderPayment(order_id, 'تم الدفع', txRef, gateway || order.payment_method)
      
      // تحديث حالة المعاملة
      if (transaction_id) {
        db.completeTransaction(transaction_id, txRef)
      }

      return NextResponse.json({
        success: true,
        message: 'تم تأكيد الدفع وتحديث حالة الطلب والمحفظة بنجاح',
        order: updatedOrder
      })
    } else {
      const updatedOrder = db.updateOrderPayment(order_id, 'فشل الدفع', reference_id, gateway || order.payment_method)
      return NextResponse.json({
        success: false,
        message: 'فشلت عملية الدفع الإلكتروني',
        order: updatedOrder
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ في معالجة إشعار الدفع'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const orderId = searchParams.get('order_id')
  const gateway = searchParams.get('gateway') || 'zaincash'
  const token = searchParams.get('token')

  if (orderId) {
    const txRef = `TX-AUTO-${Date.now().toString().slice(-6)}`
    db.updateOrderPayment(orderId, 'تم الدفع', txRef, gateway as PaymentGateway)
  }

  // إعادة توجيه المستخدم لصفحة العمليات مع إشعار النجاح
  return NextResponse.redirect(new URL(`/operations?payment_success=true&order_id=${orderId || ''}`, req.url))
}
