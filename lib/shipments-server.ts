import { supabaseServer } from '@/lib/supabase-server'
import type { MerchantShipment } from '@/lib/shipments'

/**
 * شحنات تاجر واحد لصفحته (/workspace/shipments)
 * =============================================
 * ⚠️ تستخدم service_role — لا تُستورد أبداً في كود المتصفح.
 * التقييد بالتاجر شرط صريح في كل استعلام، والتاجر نفسه يأتي من
 * loadWorkspaceContext (جلسة التاجر، أو اختيار مالك المنصة المُقيَّد في سجل
 * التدقيق) — لا من الرابط.
 */

/** الأعمدة المعتمدة لعرض التاجر — نظير MerchantShipment في lib/shipments.ts حرفياً. */
const MERCHANT_SHIPMENT_COLUMNS = [
  'id',
  'tracking_number',
  'order_id',
  'status',
  'recipient_name',
  'recipient_phone',
  'governorate',
  'district',
  'nearest_landmark',
  'full_address',
  'cod_amount_iqd',
  'delivery_fee_iqd',
  'merchant_net_amount_iqd',
  'settlement_status',
  'settled_at',
  'postponed_reason',
  'returned_reason',
  'notes',
  'picked_up_at',
  'in_transit_at',
  'out_for_delivery_at',
  'delivered_at',
  'postponed_at',
  'returned_at',
  'created_at',
].join(', ')

/** حدّ أولي للقائمة — يُضاف ترقيم الصفحات حين يتجاوزه تاجر فعلاً. */
const MERCHANT_SHIPMENTS_LIMIT = 500

export async function loadMerchantShipments(merchantId: string): Promise<MerchantShipment[]> {
  const { data, error } = await supabaseServer
    .from('shipments')
    .select(MERCHANT_SHIPMENT_COLUMNS)
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(MERCHANT_SHIPMENTS_LIMIT)

  if (error) throw new Error(error.message)

  const shipments = (data || []) as unknown as Omit<MerchantShipment, 'order_content'>[]
  if (shipments.length === 0) return []

  // محتوى الطلب يُطبع على الملصق. استعلام ثانٍ لا ربط، بنفس طريقة /dashboard،
  // ومقيَّد بطلبات هذه الشحنات وحدها وبالتاجر نفسه مرة أخرى.
  const { data: orders, error: ordersError } = await supabaseServer
    .from('orders')
    .select('order_id, order_content')
    .eq('merchant_id', merchantId)
    .in(
      'order_id',
      shipments.map((s) => s.order_id)
    )

  if (ordersError) throw new Error(ordersError.message)

  const contentByOrder = new Map(
    ((orders || []) as { order_id: number; order_content: string | null }[]).map((o) => [
      o.order_id,
      o.order_content,
    ])
  )

  return shipments.map((s) => ({ ...s, order_content: contentByOrder.get(s.order_id) ?? null }))
}
