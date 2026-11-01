import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { requireSession } from '@/lib/api-session'
import { CANCEL_ORDER_RPC, cancelFailure } from '@/lib/order-cancel'

export const dynamic = 'force-dynamic'

/**
 * POST /api/orders/:id/cancel — إلغاء طلب من لوحة التشغيل (الترحيل ٠٣٤)
 * =====================================================================
 * :id هو orders.order_id. الإلغاء يلغي الطلب وشحنته معاً في معاملة واحدة داخل
 * cancel_order، فلا تبقى شحنة عند المندوب بطلب ملغى. لا حذف: الطلب يبقى في
 * السجل، والشحنة بحالة CANCELLED النهائية، ولا يُحسب أي منهما في مجموع.
 *
 * يُرفض بـ 409 إن تجاوزت الشحنة الاستلام من التاجر (BQ015).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession(['platform_owner', 'staff'])
  if (!guard.ok) return guard.response

  const { id } = await params
  const orderId = Number(id)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ success: false, error: 'معرّف الطلب غير صالح' }, { status: 400 })
  }

  const { data, error } = await supabaseServer.rpc(CANCEL_ORDER_RPC, { p_order_id: orderId })

  if (error) {
    const failure = cancelFailure(error)
    if (failure.status === 500) console.error('[ORDER_CANCEL][ERROR]', error.message)
    return NextResponse.json({ success: false, error: failure.error }, { status: failure.status })
  }

  const row = Array.isArray(data) ? data[0] : data
  return NextResponse.json({
    success: true,
    message: 'تم إلغاء الطلب',
    order_id: orderId,
    shipment_cancelled: Boolean(row?.cancelled_shipment),
  })
}
