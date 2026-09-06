import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { mapOrderRow, type ConfirmedOrder } from '@/lib/orders'

export const dynamic = 'force-dynamic'

/**
 * GET /api/orders/dashboard
 * --------------------------
 * يُرجع كافة صفوف public.orders (بخلاف /api/orders/confirmed المقيّد بـ
 * current_state = 'confirmed') مع حالة الشحن إن وُجدت — يغذّي الجدول
 * الرئيسي وبطاقات الإحصاءات في لوحة /operations.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from('orders')
      .select(
        `order_id, created_at, phone_number, contact_phone, name, customer_name,
         governorate, district, address, address_details, order_content,
         items_total_iqd, delivery_fee_iqd, grand_total_iqd, current_state, updated_at,
         shipments ( id, tracking_number, status )`
      )
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[ORDERS_DASHBOARD][GET_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const orders: ConfirmedOrder[] = (data || []).map((row) => mapOrderRow(row as Record<string, unknown>))

    return NextResponse.json({ success: true, orders })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذر تحميل الطلبات'
    console.error('[ORDERS_DASHBOARD][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
