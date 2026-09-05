import { supabaseServer } from '@/lib/supabase-server'
import DashboardClient from './DashboardClient'
import type { Shipment, Merchant, Courier } from '@/lib/shipments'

// بيانات حقيقية (شحن، تجار، مندوبين) - تُجلب في كل زيارة، لا تخزين مؤقت
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [shipmentsRes, merchantsRes, couriersRes, ordersRes] = await Promise.all([
    supabaseServer.from('shipments').select('*').order('created_at', { ascending: false }),
    supabaseServer.from('merchants').select('*').order('created_at', { ascending: false }),
    supabaseServer.from('couriers').select('*').order('created_at', { ascending: false }),
    // محتوى الطلب يُطبع على الستيكر — لا يوجد join مباشر عبر PostgREST هنا
    supabaseServer.from('orders').select('order_id, order_content'),
  ])

  const merchants = (merchantsRes.data || []) as Merchant[]
  const couriers = (couriersRes.data || []) as Courier[]

  const merchantMap = new Map(merchants.map((m) => [m.id, m.name]))
  const courierMap = new Map(couriers.map((c) => [c.id, c.name]))
  const orderContentMap = new Map(
    ((ordersRes.data || []) as { order_id: number; order_content: string | null }[])
      .map((o) => [o.order_id, o.order_content])
  )

  const shipments: Shipment[] = ((shipmentsRes.data || []) as Shipment[]).map((s) => ({
    ...s,
    merchant_name: merchantMap.get(s.merchant_id) || 'تاجر غير معروف',
    courier_name: s.courier_id ? courierMap.get(s.courier_id) || 'مندوب غير معروف' : null,
    order_content: orderContentMap.get(s.order_id) ?? null,
  }))

  const loadError = shipmentsRes.error?.message || merchantsRes.error?.message || couriersRes.error?.message || null

  return (
    <DashboardClient
      initialShipments={shipments}
      initialMerchants={merchants}
      initialCouriers={couriers}
      loadError={loadError}
    />
  )
}
