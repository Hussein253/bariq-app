import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * إدارة واستعلام الطلبات عبر الـ REST API لمنصة برق
 * ------------------------------------------------
 * GET: استعلام وتصفية الطلبات (مع دعم البحث والتصنيف)
 * POST: إنشاء طلب جديد من خلال أنظمة المتاجر والشركات
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const merchantId = searchParams.get('merchant_id') || undefined
  const search = searchParams.get('search') || undefined

  const orders = db.getOrders({ status, merchant_id: merchantId, search })

  return NextResponse.json({
    success: true,
    count: orders.length,
    orders
  })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : null

    // التحقق من صلاحية مفتاح الـ API
    const merchant = apiKey ? db.getMerchantByApiKey(apiKey) : null
    if (!merchant && apiKey) {
      return NextResponse.json({ success: false, error: 'مفتاح الـ API غير صالح أو منتهي الصلاحية' }, { status: 401 })
    }

    const body = await req.json()

    if (!body.customer_name || !body.customer_phone || !body.total_amount) {
      return NextResponse.json({
        success: false,
        error: 'الحقول المطلوبة مفقودة: customer_name, customer_phone, total_amount'
      }, { status: 400 })
    }

    const createdOrder = db.createOrder({
      ...body,
      merchant_name: merchant?.name || body.merchant_name || 'متجر دجلة',
      merchant_id: merchant?.id || body.merchant_id || 'm1'
    })

    return NextResponse.json({
      success: true,
      message: 'تم إنشاء وتوثيق الطلب بنجاح',
      order: createdOrder
    }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء الطلب'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}
