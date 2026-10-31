import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb, type Row } from './helpers/fake-supabase'

/**
 * الطلب التجريبي في التطبيق — يعيد حادثة الطلب ٥١: محادثة اختبار المالك على
 * ماسنجر أنشأت طلباً وشحنته BRQ-000011، ثم عُلِّم الطلب تجريبياً. المطلوب:
 * لا يظهر في قائمة ولا عدّاد ولا مجموع، ولا يُرسل للشحن ولا تتحرّك شحنته.
 *
 * المسارات تُستدعى كما هي على قاعدة وهمية (tests/helpers/fake-supabase.ts)
 * تطبّق الفلاتر فعلاً — فحذف شرط is_test من أي استعلام يُفشل اختباره.
 */

const db = new FakeDb()

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: (table: string) => db.from(table) },
}))
vi.mock('@/lib/api-session', () => ({
  requireSession: async () => ({ ok: true, profile: { id: 'staff-1', role: 'staff' } }),
  requireMerchantScope: async (requested?: string | null) => ({
    ok: true,
    profile: { id: 'owner-1', role: 'platform_owner' },
    merchantId: requested ?? MERCHANT,
    impersonating: false,
  }),
}))
vi.mock('@/lib/api-auth', () => ({
  authenticateMerchant: async () => ({ ok: true, merchant: { id: MERCHANT } }),
}))
vi.mock('@/lib/auth', () => ({
  requireRole: async () => ({ id: 'staff-1', role: 'staff' }),
}))
vi.mock('@/lib/i18n/server', async () => {
  const { getDictionary } = await import('@/lib/i18n')
  return {
    getLocale: async () => 'ar',
    getTranslations: async () => ({ locale: 'ar', t: getDictionary('ar') }),
  }
})

// تُستورد بعد vi.mock (يرفعه vitest تلقائياً فوق الاستيرادات)
import { GET as getOrdersDashboard } from '@/app/api/orders/dashboard/route'
import { GET as getConfirmedOrders } from '@/app/api/orders/confirmed/route'
import { GET as getMerchantApiOrders } from '@/app/api/orders/route'
import { GET as getMerchants } from '@/app/api/merchants/route'
import { GET as getOrderBooks } from '@/app/api/order-books/route'
import { POST as dispatchOrder } from '@/app/api/orders/[id]/dispatch/route'
import { PATCH as patchShipment } from '@/app/api/shipments/[id]/route'
import { POST as deliverySync } from '@/app/api/delivery/sync/route'
import DashboardPage from '@/app/dashboard/page'
import { loadMerchantOrders } from '@/lib/orders-server'
import { loadMerchantShipments } from '@/lib/shipments-server'
import { loadPlatformOverview } from '@/lib/admin-server'
import { summarizeMerchantSettlement } from '@/lib/shipments'

const MERCHANT = '11111111-1111-4111-8111-111111111111'
const OTHER_MERCHANT = '22222222-2222-4222-8222-222222222222'
const BOOK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SYNC_SECRET = 'test-delivery-secret'

function order(partial: Row & { order_id: number }): Row {
  return {
    merchant_id: MERCHANT,
    is_test: false,
    current_state: 'confirmed',
    phone_number: '07701234567',
    contact_phone: '07701234567',
    customer_name: 'زبون',
    name: null,
    governorate: 'بغداد',
    district: 'الكرادة',
    address: 'شارع ٦٢',
    address_details: null,
    order_content: 'قميص',
    items_total_iqd: '25000',
    delivery_fee_iqd: '3000',
    grand_total_iqd: '28000',
    order_book_id: null,
    updated_at: null,
    ...partial,
  }
}

function shipment(partial: Row & { id: string; tracking_number: string; order_id: number }): Row {
  return {
    merchant_id: MERCHANT,
    courier_id: null,
    status: 'ORDER_RECEIVED',
    settlement_status: 'PENDING',
    recipient_name: 'زبون',
    recipient_phone: '07701234567',
    governorate: 'بغداد',
    district: null,
    nearest_landmark: null,
    full_address: 'شارع ٦٢',
    cod_amount_iqd: '25000.00',
    delivery_fee_iqd: '3000.00',
    merchant_net_amount_iqd: null,
    currency: 'IQD',
    notes: null,
    ...partial,
  }
}

const TABLES: Record<string, Row[]> = {
  merchants: [
    { id: MERCHANT, name: 'متجر التجربة', phone: null, status: 'active', balance_iqd: 0, created_at: '2026-09-01T00:00:00Z' },
    { id: OTHER_MERCHANT, name: 'متجر آخر', phone: null, status: 'active', balance_iqd: 0, created_at: '2026-09-02T00:00:00Z' },
  ],
  orders: [
    order({ order_id: 50, created_at: '2026-10-30T09:00:00Z', order_book_id: BOOK }),
    // الحادثة: طلب محادثة المالك، شحنته أُنشئت قبل تعليمه تجريبياً
    order({
      order_id: 51,
      is_test: true,
      created_at: '2026-10-31T10:19:54Z',
      order_book_id: BOOK,
      items_total_iqd: '63750',
      grand_total_iqd: '66750',
    }),
    order({ order_id: 52, created_at: '2026-10-31T11:00:00Z' }),
    // تجريبي بلا شحنة، وتجريبي سُلِّمت شحنته (ليُختبر استثناؤه من المجاميع المالية)
    order({ order_id: 29, is_test: true, created_at: '2026-08-30T12:15:05Z' }),
    order({ order_id: 39, is_test: true, created_at: '2026-10-04T11:12:29Z' }),
    order({ order_id: 60, merchant_id: OTHER_MERCHANT, current_state: 'pending', created_at: '2026-10-29T08:00:00Z' }),
  ],
  shipments: [
    shipment({
      id: 'ship-10',
      tracking_number: 'BRQ-000010',
      order_id: 50,
      status: 'DELIVERED',
      courier_id: 'courier-1',
      merchant_net_amount_iqd: '22000.00',
      created_at: '2026-10-30T09:30:00Z',
    }),
    shipment({
      id: 'fc06fed4-9013-4fe0-9619-381b4b69c211',
      tracking_number: 'BRQ-000011',
      order_id: 51,
      cod_amount_iqd: '63750.00',
      created_at: '2026-10-31T10:20:20Z',
    }),
    shipment({
      id: 'ship-09',
      tracking_number: 'BRQ-000009',
      order_id: 39,
      status: 'DELIVERED',
      cod_amount_iqd: '60000.00',
      merchant_net_amount_iqd: '57000.00',
      created_at: '2026-10-04T12:00:00Z',
    }),
    shipment({
      id: 'ship-12',
      tracking_number: 'BRQ-000012',
      order_id: 60,
      merchant_id: OTHER_MERCHANT,
      created_at: '2026-10-29T08:30:00Z',
    }),
  ],
  order_items: [],
  order_books: [
    { id: BOOK, merchant_id: MERCHANT, name: 'الفرع الرئيسي', is_default: true, created_at: '2026-09-01T00:00:00Z' },
  ],
  couriers: [{ id: 'courier-1', name: 'مندوب', status: 'active', created_at: '2026-09-01T00:00:00Z' }],
}

const TEST_TRACKING = ['BRQ-000011', 'BRQ-000009']
const TEST_ORDER_IDS = [51, 29, 39]

const sign = (body: string) => createHmac('sha256', SYNC_SECRET).update(body, 'utf8').digest('hex')

function sync(payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload)
  return deliverySync(
    new Request('http://localhost/api/delivery/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bariq-signature': sign(raw) },
      body: raw,
    })
  )
}

function patch(id: string, body: Record<string, unknown>) {
  return patchShipment(
    new NextRequest(`http://localhost/api/shipments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
}

function dispatch(orderId: number) {
  return dispatchOrder(new NextRequest(`http://localhost/api/orders/${orderId}/dispatch`, { method: 'POST' }), {
    params: Promise.resolve({ id: String(orderId) }),
  })
}

const stored = (tracking: string) => db.table('shipments').find((s) => s.tracking_number === tracking)!

beforeEach(() => {
  db.reset(TABLES)
  vi.stubEnv('BARIQ_DELIVERY_SYNC_SECRET', SYNC_SECRET)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('القوائم والعدّادات والمجاميع تستثني الطلب التجريبي', () => {
  it('لوحة التشغيل (/api/orders/dashboard): لا طلب تجريبي في الجدول ولا في الإحصاءات', async () => {
    const json = await (await getOrdersDashboard()).json()
    const ids = json.orders.map((o: { order_id: number }) => o.order_id)
    expect(ids).toEqual([52, 50, 60])
    for (const id of TEST_ORDER_IDS) expect(ids).not.toContain(id)
  })

  it('الطلبات المؤكدة تحت المحادثات (/api/orders/confirmed): الطلب ٥١ لا يظهر بزر «إرسال للشحن»', async () => {
    const json = await (await getConfirmedOrders()).json()
    expect(json.orders.map((o: { order_id: number }) => o.order_id)).toEqual([52, 50])
  })

  it('طلبات التاجر (/workspace/orders)', async () => {
    const orders = await loadMerchantOrders(MERCHANT)
    expect(orders.map((o) => o.order_id)).toEqual([52, 50])
  })

  it('شحنات التاجر ومجاميع تسويته (/workspace/shipments): بلا شحنات تجريبية ولا حقل مربوط زائد', async () => {
    const shipments = await loadMerchantShipments(MERCHANT)
    expect(shipments.map((s) => s.tracking_number)).toEqual(['BRQ-000010'])
    expect(shipments[0]).not.toHaveProperty('orders')
    expect(shipments[0].order_content).toBe('قميص')

    // BRQ-000009 التجريبية مُسلَّمة: لو دخلت لصار المحصَّل ٨٥٬٠٠٠
    expect(summarizeMerchantSettlement(shipments)).toEqual({
      deliveredCount: 1,
      codCollectedIqd: 25000,
      deliveryFeesIqd: 3000,
      pendingPayoutIqd: 22000,
    })
  })

  it('لوحة الشحنات (/dashboard): القائمة والمؤشرات بلا شحنات تجريبية', async () => {
    const element = await DashboardPage()
    const shipments = element.props.initialShipments as Row[]
    expect(shipments.map((s) => s.tracking_number)).toEqual(['BRQ-000010', 'BRQ-000012'])
    for (const s of shipments) expect(s).not.toHaveProperty('orders')
    expect(element.props.loadError).toBeNull()
  })

  it('نظرة المالك (/admin): الأعداد والمجاميع المالية بلا التجريبي', async () => {
    const overview = await loadPlatformOverview()
    expect(overview.totals.orders).toBe(3)
    expect(overview.totals.shipments).toBe(2)
    expect(overview.totals.codCollected).toBe(25000)
    expect(overview.totals.deliveryFeesEarned).toBe(3000)
    expect(overview.totals.pendingSettlement).toBe(22000)
    expect(overview.shipmentsByStatus).toEqual(
      expect.arrayContaining([
        { status: 'DELIVERED', count: 1 },
        { status: 'ORDER_RECEIVED', count: 1 },
      ])
    )
    expect(overview.shipmentsByStatus).toHaveLength(2)

    const row = overview.merchants.find((m) => m.id === MERCHANT)!
    expect(row).toMatchObject({ shipments: 1, codCollected: 25000, pendingSettlement: 22000 })
  })

  it('عدد شحنات كل تاجر في لوحة التشغيل (/api/merchants)', async () => {
    const json = await (await getMerchants()).json()
    const counts = Object.fromEntries(
      json.merchants.map((m: { id: string; orders_count: number }) => [m.id, m.orders_count])
    )
    expect(counts).toEqual({ [MERCHANT]: 1, [OTHER_MERCHANT]: 1 })
  })

  it('عدد طلبات سجل الطلبات (/api/order-books)', async () => {
    const res = await getOrderBooks(new Request(`http://localhost/api/order-books?merchant_id=${MERCHANT}`))
    const json = await res.json()
    expect(json.books).toHaveLength(1)
    expect(json.books[0].orders_count).toBe(1)
  })

  it('واجهة التاجر البرمجية (GET /api/orders): لا شحنة تجريبية، وشكل الرد كما كان', async () => {
    const json = await (await getMerchantApiOrders(new Request('http://localhost/api/orders'))).json()
    expect(json.orders.map((s: { tracking_number: string }) => s.tracking_number)).toEqual(['BRQ-000010'])
    expect(json.orders[0].orders).toEqual({ order_content: 'قميص', current_state: 'confirmed' })
    expect(json.count).toBe(1)
  })
})

describe('الطلب التجريبي لا يُرسل للشحن (POST /api/orders/:id/dispatch)', () => {
  it('الطلب ٥١ (له شحنة قائمة) ← 409 بسبب كونه تجريبياً لا «سبق إرساله»', async () => {
    const res = await dispatch(51)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('51')
    expect(json.error).toContain('تجريبي')
    expect(db.callsTo('shipments', 'insert')).toHaveLength(0)
  })

  it('طلب تجريبي مؤكَّد بلا شحنة ← 409 ولا شحنة تُنشأ', async () => {
    const res = await dispatch(29)
    expect(res.status).toBe(409)
    expect(db.callsTo('shipments', 'insert')).toHaveLength(0)
    expect(db.table('shipments').some((s) => s.order_id === 29)).toBe(false)
  })

  it('الطلب الحقيقي يُرسل كما كان', async () => {
    const res = await dispatch(52)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(db.callsTo('shipments', 'insert')).toHaveLength(1)
    expect(db.table('shipments').find((s) => s.order_id === 52)).toMatchObject({
      merchant_id: MERCHANT,
      cod_amount_iqd: 25000,
      delivery_fee_iqd: 3000,
      idempotency_key: 'bot-order-52',
    })
  })
})

describe('شحنة الطلب التجريبي لا تتحرّك (PATCH /api/shipments/:id)', () => {
  const TEST_SHIPMENT_ID = 'fc06fed4-9013-4fe0-9619-381b4b69c211'

  it.each([
    ['الاستلام من التاجر', { status: 'PICKED_UP_SAME_DAY' }],
    ['إسناد مندوب', { courier_id: 'courier-1' }],
    ['التسوية', { settlement_status: 'DEPOSITED' }],
    ['الحالة مع ملاحظة', { status: 'PICKED_UP_SAME_DAY', notes: 'عاجل' }],
  ])('BRQ-000011: %s ← 409 ولا تعديل', async (_label, body) => {
    const res = await patch(TEST_SHIPMENT_ID, body)
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('BRQ-000011')
    expect(db.callsTo('shipments', 'update')).toHaveLength(0)
    expect(stored('BRQ-000011')).toMatchObject({ status: 'ORDER_RECEIVED', courier_id: null, notes: null })
  })

  it('شحنة تجريبية مُسلَّمة لا تُسوّى (BRQ-000009)', async () => {
    const res = await patch('ship-09', { settlement_status: 'DEPOSITED' })
    expect(res.status).toBe(409)
    expect(stored('BRQ-000009').settlement_status).toBe('PENDING')
  })

  it('الملاحظات وحدها تُعدَّل على الشحنة التجريبية', async () => {
    const res = await patch(TEST_SHIPMENT_ID, { notes: 'طلب تجريبي — لا يُشحن' })
    expect(res.status).toBe(200)
    expect(stored('BRQ-000011').notes).toBe('طلب تجريبي — لا يُشحن')
    // ولا فحص زائد للطلب: التعديل نفسه وحده
    expect(db.callsTo('shipments', 'select')).toHaveLength(1)
  })

  it('الشحنة الحقيقية تتحرّك كما كانت', async () => {
    const res = await patch('ship-12', { status: 'PICKED_UP_SAME_DAY', courier_id: 'courier-1' })
    expect(res.status).toBe(200)
    expect(stored('BRQ-000012')).toMatchObject({ status: 'PICKED_UP_SAME_DAY', courier_id: 'courier-1' })
  })
})

describe('مزامنة نظام التوصيل ترفض شحنة الطلب التجريبي (POST /api/delivery/sync)', () => {
  it('BRQ-000011: pickup ← 409 ولا تعديل', async () => {
    const res = await sync({ tracking_number: 'BRQ-000011', action: 'pickup', courier_id: 'courier-1' })
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('BRQ-000011')
    expect(db.callsTo('shipments', 'update')).toHaveLength(0)
    expect(stored('BRQ-000011')).toMatchObject({ status: 'ORDER_RECEIVED', courier_id: null })
  })

  it('شحنة تجريبية مُسلَّمة لا تُسوّى عبر المزامنة (BRQ-000009)', async () => {
    const res = await sync({ tracking_number: 'BRQ-000009', action: 'settled' })
    expect(res.status).toBe(409)
    expect(stored('BRQ-000009').status).toBe('DELIVERED')
  })

  it('الشحنة الحقيقية تتحرّك كما كانت', async () => {
    const res = await sync({ tracking_number: 'BRQ-000012', action: 'pickup' })
    expect(res.status).toBe(200)
    expect(stored('BRQ-000012').status).toBe('PICKED_UP_SAME_DAY')
  })

  it('إعادة إرسال تحديث سابق تعود «بلا تغيير» بشكل الرد القديم (لا حقل مربوط)', async () => {
    const res = await sync({ tracking_number: 'BRQ-000010', action: 'delivered' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.unchanged).toBe(true)
    expect(json.shipment).toEqual({
      id: 'ship-10',
      tracking_number: 'BRQ-000010',
      status: 'DELIVERED',
      courier_id: 'courier-1',
    })
  })
})

describe('لا شيء يُحذف', () => {
  it('الطلب ٥١ وشحنته باقيان بعد كل محاولات الإرسال', async () => {
    await dispatch(51)
    await patch('fc06fed4-9013-4fe0-9619-381b4b69c211', { status: 'PICKED_UP_SAME_DAY' })
    await sync({ tracking_number: 'BRQ-000011', action: 'pickup' })

    expect(db.table('orders').find((o) => o.order_id === 51)).toMatchObject({ is_test: true })
    expect(stored('BRQ-000011')).toMatchObject({ order_id: 51, status: 'ORDER_RECEIVED' })
    for (const tracking of TEST_TRACKING) expect(stored(tracking)).toBeDefined()
  })
})
