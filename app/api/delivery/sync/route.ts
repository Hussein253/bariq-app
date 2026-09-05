import { NextRequest, NextResponse } from 'next/server'
import { db, OrderStatus } from '@/lib/db'

/**
 * نقطة ربط وتزامن عمليات التوصيل والشحن (Delivery & Courier Sync API)
 * -----------------------------------------------------------------
 * تستقبل تحديثات المناديب وأنظمة شركات النقل والتوصيل:
 * - assignment: إسناد الشحنة لمندوب وتحديد موعد الوصول المتوقع
 * - pickup: تأكيد استلام الشحنة من المتجر
 * - in_transit: الشحنة بالطريق للزبون
 * - delivered: تأكيد التسليم مع التحصيل المالي
 * - failed / returned: تعذر التسليم وإعادة الشحنة
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { order_id, action, driver_name, driver_phone, notes } = body

    if (!order_id) {
      return NextResponse.json({ success: false, error: 'معرف الطلب order_id مطلوب' }, { status: 400 })
    }

    const order = db.getOrderById(order_id)
    if (!order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود في النظام' }, { status: 404 })
    }

    let nextStatus: OrderStatus = order.status

    switch (action) {
      case 'assign_driver':
        order.driver_name = driver_name || 'مندوب برق السريع'
        order.driver_phone = driver_phone || '07701122334'
        nextStatus = 'قيد المعالجة'
        break
      case 'pickup':
        nextStatus = 'قيد المعالجة'
        break
      case 'out_for_delivery':
        nextStatus = 'بالطريق'
        break
      case 'delivered':
        nextStatus = 'تم التسليم'
        if (order.payment_method === 'عند الاستلام') {
          order.payment_status = 'تم الدفع'
        }
        break
      case 'cancelled':
      case 'returned':
        nextStatus = 'ملغي'
        break
      default:
        break
    }

    const updated = db.updateOrderStatus(order_id, nextStatus, notes || `تحديث من نظام التوصيل: ${action}`)

    return NextResponse.json({
      success: true,
      message: `تمت مزامنة حالة التوصيل للطلب #${order_id}`,
      order: updated
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ في مزامنة بيانات التوصيل'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}
