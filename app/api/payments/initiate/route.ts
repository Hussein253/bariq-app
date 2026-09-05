import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { zainCashService } from '@/lib/payments/zaincash'
import { qiCardService } from '@/lib/payments/qicard'

/**
 * بدء عملية دفع إلكتروني عبر بوابات الدفع العراقية (Zain Cash & Qi Card)
 * -------------------------------------------------------------------
 * يقبل:
 * - order_id: معرف الطلب
 * - gateway: "zaincash" | "qicard"
 * - amount: المبلغ الإجمالي
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, gateway = 'zaincash', amount, customer_phone } = body

    if (!order_id) {
      return NextResponse.json({ success: false, error: 'معرف الطلب مطلوب' }, { status: 400 })
    }

    const order = db.getOrderById(order_id)
    if (!order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }

    const payAmount = Number(amount) || order.total_amount
    const redirectUrl = `${req.nextUrl.origin}/api/payments/callback?order_id=${order_id}&gateway=${gateway}`

    if (gateway === 'zaincash' || gateway === 'زين كاش') {
      const zcRes = await zainCashService.initiatePayment({
        orderId: order_id,
        amount: payAmount,
        serviceType: `طلب شحن منصة برق #${order_id}`,
        customerPhone: customer_phone || order.customer_phone,
        redirectUrl
      })

      // تسجيل المعاملة في قاعدة البيانات
      const tx = db.createTransaction({
        order_id,
        gateway: 'zaincash',
        amount: payAmount,
        currency: 'IQD',
        status: 'pending',
        customer_phone: customer_phone || order.customer_phone,
        reference_id: zcRes.transactionId
      })

      return NextResponse.json({
        success: true,
        gateway: 'zaincash',
        transaction_id: tx.id,
        reference_id: zcRes.transactionId,
        payment_url: zcRes.paymentUrl,
        qr_payload: zcRes.qrPayload,
        amount: payAmount,
        currency: 'د.ع',
        message: 'تم إنشاء جلسة الدفع عبر زين كاش بنجاح'
      })
    }

    if (gateway === 'qicard' || gateway === 'كي كارد' || gateway === 'ماستركارد') {
      const qiRes = await qiCardService.initiatePayment({
        orderId: order_id,
        amount: payAmount,
        customerName: order.customer_name,
        customerPhone: customer_phone || order.customer_phone,
        redirectUrl
      })

      const tx = db.createTransaction({
        order_id,
        gateway: 'qicard',
        amount: payAmount,
        currency: 'IQD',
        status: 'pending',
        customer_phone: customer_phone || order.customer_phone,
        reference_id: qiRes.transactionId
      })

      return NextResponse.json({
        success: true,
        gateway: 'qicard',
        transaction_id: tx.id,
        reference_id: qiRes.transactionId,
        session_id: qiRes.sessionId,
        payment_url: qiRes.paymentUrl,
        auth_code: qiRes.authCode,
        amount: payAmount,
        currency: 'د.ع',
        message: 'تم إنشاء جلسة الدفع الآمنة عبر كي كارد / ماستركارد العراق بنجاح'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'بوابة الدفع المحددة غير مدعومة. يرجى اختيار zaincash أو qicard'
    }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ أثناء تهيئة جلسة الدفع'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}
