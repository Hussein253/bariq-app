import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeDb, type Row } from './helpers/fake-supabase'

/**
 * الطلب الملغى وشحنته خارج التقارير والعدّادات والمجاميع، كما التجريبي
 * (tests/test-orders-routes.test.ts). الشحنة الملغاة تبقى في القوائم بشارتها،
 * ولا تدخل شيئاً من الأرقام هنا.
 */

const db = new FakeDb()
const M = '11111111-1111-4111-8111-111111111111'

vi.mock('@/lib/supabase-server', () => ({
  supabaseServer: { from: (table: string) => db.from(table) },
}))
vi.mock('@/lib/api-session', () => ({
  requireSession: async () => ({ ok: true, profile: { id: 'owner-1', role: 'platform_owner' } }),
}))
vi.mock('@/lib/auth', () => ({
  requireRole: async () => ({ id: 'owner-1', role: 'platform_owner' }),
}))

// تُستورد بعد vi.mock (يرفعه vitest تلقائياً فوق الاستيرادات)
import { GET as getMerchants } from '@/app/api/merchants/route'
import { loadPlatformOverview } from '@/lib/admin-server'

const TABLES: Record<string, Row[]> = {
  merchants: [{ id: M, name: 'متجر', phone: null, status: 'active', balance_iqd: 0, created_at: '2026-09-01T00:00:00Z' }],
  subscriptions: [],
  products: [],
  conversations: [],
  messages: [],
  couriers: [],
  delivery_areas: [],
  orders: [
    { order_id: 1, merchant_id: M, is_test: false, current_state: 'cancelled' },
    { order_id: 2, merchant_id: M, is_test: false, current_state: 'confirmed' },
  ],
  shipments: [
    {
      id: 'a',
      tracking_number: 'BRQ-000001',
      order_id: 1,
      merchant_id: M,
      status: 'CANCELLED',
      settlement_status: 'PENDING',
      cod_amount_iqd: '25000.00',
      delivery_fee_iqd: '3000.00',
      merchant_net_amount_iqd: null,
    },
    {
      id: 'b',
      tracking_number: 'BRQ-000002',
      order_id: 2,
      merchant_id: M,
      status: 'DELIVERED',
      settlement_status: 'PENDING',
      cod_amount_iqd: '10000.00',
      delivery_fee_iqd: '3000.00',
      merchant_net_amount_iqd: '7000.00',
    },
  ],
}

beforeEach(() => {
  db.reset(TABLES)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('الملغى خارج التقارير (لوحة المالك)', () => {
  it('الشحنة الملغاة والطلب الملغى لا يدخلان الأعداد ولا الحالات ولا المجاميع', async () => {
    const overview = await loadPlatformOverview()
    expect(overview.totals.orders).toBe(1)
    expect(overview.totals.shipments).toBe(1)
    expect(overview.shipmentsByStatus).toEqual([{ status: 'DELIVERED', count: 1 }])
    expect(overview.totals.codCollected).toBe(10000)
    expect(overview.totals.deliveryFeesEarned).toBe(3000)
    expect(overview.totals.pendingSettlement).toBe(7000)
    expect(overview.merchants[0]).toMatchObject({ shipments: 1, codCollected: 10000, pendingSettlement: 7000 })
  })
})

describe('الملغى خارج عدّ شحنات التاجر في لوحة التشغيل', () => {
  it('GET /api/merchants: orders_count لا يعدّ الشحنة الملغاة', async () => {
    const json = await (await getMerchants()).json()
    expect(json.merchants[0].orders_count).toBe(1)
  })
})
