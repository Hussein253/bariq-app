import { supabaseServer } from '@/lib/supabase-server'

/**
 * نظرة المالك على المنصة كاملة — كل الأرقام محسوبة من الجداول الحقيقية.
 * ⚠️ يستعمل service_role — لا يُستورد أبداً في كود المتصفح.
 *
 * لا يوجد رقم واحد هنا مكتوب يدوياً أو مُقدَّر. ما لا يمكن حسابه يُعاد صفراً
 * حقيقياً لا رقماً تجميلياً، لأن لوحة المالك أساس قرارات مالية.
 */

export interface MerchantRow {
  id: string
  name: string
  phone: string | null
  status: string
  balance_iqd: number
  planName: string | null
  planCode: string | null
  subscriptionStatus: string | null
  products: number
  shipments: number
  conversations: number
  codCollected: number
  pendingSettlement: number
}

export interface PlatformOverview {
  totals: {
    merchants: number
    activeSubscriptions: number
    products: number
    orders: number
    shipments: number
    conversations: number
    botMessages: number
    couriers: number
    deliveryAreas: number
    codCollected: number
    deliveryFeesEarned: number
    pendingSettlement: number
  }
  shipmentsByStatus: { status: string; count: number }[]
  conversationsByPlatform: { platform: string; count: number }[]
  planDistribution: { planName: string; merchants: number }[]
  merchants: MerchantRow[]
}

type ShipmentRow = {
  merchant_id: string | null
  status: string
  cod_amount_iqd: number | string | null
  delivery_fee_iqd: number | string | null
  merchant_net_amount_iqd: number | string | null
  settlement_status: string
}

const DELIVERED = ['DELIVERED', 'SETTLED_FINANCIALLY']

export async function loadPlatformOverview(): Promise<PlatformOverview> {
  const [
    merchantsRes,
    subsRes,
    productsRes,
    shipmentsRes,
    conversationsRes,
    ordersCountRes,
    botMessagesRes,
    couriersCountRes,
    areasCountRes,
  ] = await Promise.all([
    supabaseServer.from('merchants').select('id, name, phone, status, balance_iqd').order('created_at'),
    supabaseServer.from('subscriptions').select('merchant_id, status, plans(code, name_en)'),
    supabaseServer.from('products').select('merchant_id'),
    supabaseServer
      .from('shipments')
      .select('merchant_id, status, cod_amount_iqd, delivery_fee_iqd, merchant_net_amount_iqd, settlement_status'),
    supabaseServer.from('conversations').select('merchant_id, platform'),
    supabaseServer.from('orders').select('order_id', { count: 'exact', head: true }),
    supabaseServer.from('messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'bot'),
    supabaseServer.from('couriers').select('id', { count: 'exact', head: true }),
    supabaseServer.from('delivery_areas').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const firstError = [merchantsRes, subsRes, productsRes, shipmentsRes, conversationsRes].find((r) => r.error)
  if (firstError?.error) throw new Error(firstError.error.message)

  const merchants = (merchantsRes.data || []) as {
    id: string
    name: string
    phone: string | null
    status: string
    balance_iqd: number | string
  }[]

  const subs = (subsRes.data || []) as unknown as {
    merchant_id: string
    status: string
    plans: { code: string; name_en: string } | null
  }[]

  const products = (productsRes.data || []) as { merchant_id: string | null }[]
  const shipments = (shipmentsRes.data || []) as ShipmentRow[]
  const conversations = (conversationsRes.data || []) as {
    merchant_id: string | null
    platform: string | null
  }[]

  const liveSub = (merchantId: string) =>
    subs.find(
      (s) => s.merchant_id === merchantId && ['trialing', 'active', 'past_due'].includes(s.status)
    )

  const num = (v: number | string | null) => Number(v || 0)

  const merchantRows: MerchantRow[] = merchants.map((m) => {
    const sub = liveSub(m.id)
    const mShipments = shipments.filter((s) => s.merchant_id === m.id)
    const delivered = mShipments.filter((s) => DELIVERED.includes(s.status))

    return {
      id: m.id,
      name: m.name,
      phone: m.phone,
      status: m.status,
      balance_iqd: num(m.balance_iqd),
      planName: sub?.plans?.name_en ?? null,
      planCode: sub?.plans?.code ?? null,
      subscriptionStatus: sub?.status ?? null,
      products: products.filter((p) => p.merchant_id === m.id).length,
      shipments: mShipments.length,
      conversations: conversations.filter((c) => c.merchant_id === m.id).length,
      codCollected: delivered.reduce((sum, s) => sum + num(s.cod_amount_iqd), 0),
      pendingSettlement: mShipments
        .filter((s) => s.settlement_status === 'PENDING' && DELIVERED.includes(s.status))
        .reduce((sum, s) => sum + num(s.merchant_net_amount_iqd), 0),
    }
  })

  const byStatus = new Map<string, number>()
  for (const s of shipments) byStatus.set(s.status, (byStatus.get(s.status) || 0) + 1)

  const byPlatform = new Map<string, number>()
  for (const c of conversations) {
    const p = c.platform || 'غير محدّد'
    byPlatform.set(p, (byPlatform.get(p) || 0) + 1)
  }

  const byPlan = new Map<string, number>()
  for (const row of merchantRows) {
    const key = row.planName ?? 'بلا اشتراك'
    byPlan.set(key, (byPlan.get(key) || 0) + 1)
  }

  const deliveredAll = shipments.filter((s) => DELIVERED.includes(s.status))

  return {
    totals: {
      merchants: merchants.length,
      activeSubscriptions: subs.filter((s) =>
        ['trialing', 'active', 'past_due'].includes(s.status)
      ).length,
      products: products.length,
      orders: ordersCountRes.count ?? 0,
      shipments: shipments.length,
      conversations: conversations.length,
      botMessages: botMessagesRes.count ?? 0,
      couriers: couriersCountRes.count ?? 0,
      deliveryAreas: areasCountRes.count ?? 0,
      codCollected: deliveredAll.reduce((sum, s) => sum + num(s.cod_amount_iqd), 0),
      deliveryFeesEarned: deliveredAll.reduce((sum, s) => sum + num(s.delivery_fee_iqd), 0),
      pendingSettlement: shipments
        .filter((s) => s.settlement_status === 'PENDING' && DELIVERED.includes(s.status))
        .reduce((sum, s) => sum + num(s.merchant_net_amount_iqd), 0),
    },
    shipmentsByStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    conversationsByPlatform: [...byPlatform.entries()]
      .map(([platform, count]) => ({ platform, count }))
      .sort((a, b) => b.count - a.count),
    planDistribution: [...byPlan.entries()]
      .map(([planName, merchants]) => ({ planName, merchants }))
      .sort((a, b) => b.merchants - a.merchants),
    merchants: merchantRows,
  }
}
