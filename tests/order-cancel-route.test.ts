import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANCEL_VIA_ORDER_ERROR } from '@/lib/order-cancel'

/**
 * مسار الإلغاء ومسار تعديل الشحنة (شحنة ملغاة لا تتغيّر إلا ملاحظاتها).
 * قاعدة الإلغاء الفعلية في cancel_order (الترحيل ٠٣٤) وتُفحص في جدول تجريبي
 * منفصل؛ هنا نختبر ما يقرّره المسار: من يُسمح له، وماذا يُنادى، وكيف تُترجم
 * الأخطاء إلى ردود.
 */

const rpc = vi.hoisted(() => vi.fn())
const session = vi.hoisted(() => ({ ok: true as boolean }))
const shipment = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}))

vi.mock('@/lib/supabase-server', () => {
  const chain = () => {
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.eq = () => c
    c.maybeSingle = async () => ({ data: shipment.current, error: null })
    c.update = (patch: Record<string, unknown>) => {
      shipment.updates.push(patch)
      return c
    }
    c.single = async () => ({ data: { ...shipment.current, ...shipment.updates.at(-1) }, error: null })
    return c
  }
  return { supabaseServer: { rpc, from: () => chain() } }
})

vi.mock('@/lib/api-session', () => ({
  requireSession: async () =>
    session.ok
      ? { ok: true, profile: { id: 'staff-1', role: 'staff' } }
      : { ok: false, response: NextResponse.json({ success: false, error: 'signIn' }, { status: 401 }) },
}))

// تُستورد بعد vi.mock (يرفعه vitest تلقائياً فوق الاستيرادات)
import { POST as cancelOrder } from '@/app/api/orders/[id]/cancel/route'
import { PATCH as patchShipment } from '@/app/api/shipments/[id]/route'

const cancel = (id: string) =>
  cancelOrder(new Request(`http://localhost/api/orders/${id}/cancel`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })

const patch = (id: string, body: Record<string, unknown>) =>
  patchShipment(
    new NextRequest(`http://localhost/api/shipments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )

beforeEach(() => {
  session.ok = true
  rpc.mockReset()
  shipment.current = null
  shipment.updates = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/orders/:id/cancel', () => {
  it('بلا جلسة ← 401 ولا نداء للقاعدة', async () => {
    session.ok = false
    const res = await cancel('30')
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('معرّف غير صالح ← 400 ولا نداء', async () => {
    const res = await cancel('abc')
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ينادي cancel_order بالمعرّف، ويعيد هل أُلغيت الشحنة معه', async () => {
    rpc.mockResolvedValue({ data: [{ cancelled_order_id: 30, cancelled_shipment: true }], error: null })
    const res = await cancel('30')
    expect(rpc).toHaveBeenCalledWith('cancel_order', { p_order_id: 30 })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ success: true, order_id: 30, shipment_cancelled: true })
  })

  it('طلب بلا شحنة يُلغى ويعود shipment_cancelled = false', async () => {
    rpc.mockResolvedValue({ data: [{ cancelled_order_id: 47, cancelled_shipment: false }], error: null })
    const res = await cancel('47')
    expect(await res.json()).toMatchObject({ success: true, shipment_cancelled: false })
  })

  it('الطلب غير موجود (BQ011) ← 404 بنصه العربي', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'BQ011', message: 'BQ_ORDER_NOT_FOUND|الطلب 99 غير موجود' },
    })
    const res = await cancel('99')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ success: false, error: 'الطلب 99 غير موجود' })
  })

  it('شحنة تجاوزت الاستلام (BQ015) ← 409', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'BQ015', message: 'BQ_SHIPMENT_NOT_CANCELLABLE|الشحنة BRQ-000012 في حالة PICKED_UP_SAME_DAY ولا تُلغى بعد الاستلام' },
    })
    const res = await cancel('34')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('BRQ-000012')
  })

  it('خطأ داخلي ← 500 بنص عام، ولا يتسرّب نص القاعدة', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "x" does not exist' } })
    const res = await cancel('30')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('relation')
  })
})

describe('PATCH /api/shipments/:id — الإلغاء والشحنة الملغاة', () => {
  it('تغيير الحالة إلى CANCELLED من الشاشة ← 409 ولا تعديل', async () => {
    shipment.current = { id: 's1', tracking_number: 'BRQ-000012', status: 'ORDER_RECEIVED', orders: { is_test: false } }
    const res = await patch('s1', { status: 'CANCELLED' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(CANCEL_VIA_ORDER_ERROR)
    expect(shipment.updates).toHaveLength(0)
  })

  it('شحنة ملغاة: تغيير التسوية ← 409 ولا تعديل', async () => {
    shipment.current = { id: 's1', tracking_number: 'BRQ-000011', status: 'CANCELLED', orders: { is_test: true } }
    const res = await patch('s1', { settlement_status: 'DEPOSITED' })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('BRQ-000011')
    expect(shipment.updates).toHaveLength(0)
  })

  it('شحنة ملغاة: تغيير المندوب ← 409 ولا تعديل', async () => {
    shipment.current = { id: 's1', tracking_number: 'BRQ-000011', status: 'CANCELLED', orders: { is_test: false } }
    const res = await patch('s1', { courier_id: 'courier-1' })
    expect(res.status).toBe(409)
    expect(shipment.updates).toHaveLength(0)
  })

  it('شحنة ملغاة: الملاحظات وحدها تُعدَّل', async () => {
    shipment.current = { id: 's1', tracking_number: 'BRQ-000011', status: 'CANCELLED', orders: { is_test: false } }
    const res = await patch('s1', { notes: 'طلب خاطئ' })
    expect(res.status).toBe(200)
    expect(shipment.updates).toEqual([{ notes: 'طلب خاطئ' }])
  })

  it('شحنة قائمة تتحرك كما كانت', async () => {
    shipment.current = { id: 's2', tracking_number: 'BRQ-000012', status: 'ORDER_RECEIVED', orders: { is_test: false } }
    const res = await patch('s2', { status: 'PICKED_UP_SAME_DAY' })
    expect(res.status).toBe(200)
    expect(shipment.updates).toEqual([{ status: 'PICKED_UP_SAME_DAY' }])
  })
})
