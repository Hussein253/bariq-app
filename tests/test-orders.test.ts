import { describe, expect, it } from 'vitest'
import {
  DISPATCH_COLUMNS,
  embeddedOrderIsTest,
  testOrderDispatchError,
  testShipmentLockedError,
  touchesDispatch,
  withoutOrderEmbed,
} from '@/lib/test-orders'

describe('touchesDispatch — ما يُقفل على شحنة الطلب التجريبي', () => {
  it.each(DISPATCH_COLUMNS)('%s يمسّ التوصيل أو التسوية', (column) => {
    expect(touchesDispatch({ [column]: 'x' })).toBe(true)
  })

  it('القيمة null تُحسب تعديلاً (فكّ المندوب تعديل على التوصيل)', () => {
    expect(touchesDispatch({ courier_id: null })).toBe(true)
  })

  it('الملاحظات وحدها لا تمسّ', () => {
    expect(touchesDispatch({ notes: 'طلب تجريبي — لا يُشحن' })).toBe(false)
  })

  it('الملاحظات مع الحالة تمسّ', () => {
    expect(touchesDispatch({ notes: 'x', status: 'PICKED_UP_SAME_DAY' })).toBe(true)
  })

  it('تعديل فارغ لا يمسّ', () => {
    expect(touchesDispatch({})).toBe(false)
  })
})

describe('embeddedOrderIsTest — علم is_test من orders(is_test)', () => {
  it('كائن (علاقة متعدد-إلى-واحد كما يعيدها PostgREST)', () => {
    expect(embeddedOrderIsTest({ is_test: true })).toBe(true)
    expect(embeddedOrderIsTest({ is_test: false })).toBe(false)
  })

  it('مصفوفة', () => {
    expect(embeddedOrderIsTest([{ is_test: true }])).toBe(true)
    expect(embeddedOrderIsTest([{ is_test: false }])).toBe(false)
    expect(embeddedOrderIsTest([])).toBe(false)
  })

  it('غياب الطلب أو العلم ليس تجريبياً', () => {
    expect(embeddedOrderIsTest(null)).toBe(false)
    expect(embeddedOrderIsTest(undefined)).toBe(false)
    expect(embeddedOrderIsTest({})).toBe(false)
  })

  it('true الصريحة وحدها: النص "true" لا يُقبل', () => {
    expect(embeddedOrderIsTest({ is_test: 'true' })).toBe(false)
  })
})

describe('withoutOrderEmbed', () => {
  it('يُسقط الطلب المربوط ويُبقي الباقي دون أن يغيّر الأصل', () => {
    const row = { id: 's1', tracking_number: 'BRQ-000010', orders: { is_test: false } }
    expect(withoutOrderEmbed(row)).toEqual({ id: 's1', tracking_number: 'BRQ-000010' })
    expect(row.orders).toEqual({ is_test: false })
  })
})

describe('رسائل الرفض', () => {
  it('رفض الإرسال للشحن يسمّي الطلب ويقول إنه تجريبي', () => {
    const message = testOrderDispatchError(51)
    expect(message).toContain('51')
    expect(message).toContain('تجريبي')
    expect(message).toContain('لا يُرسل للشحن')
  })

  it('رفض تحريك الشحنة يسمّيها ويقول إن الملاحظات وحدها تُعدَّل', () => {
    const message = testShipmentLockedError('BRQ-000011')
    expect(message).toContain('BRQ-000011')
    expect(message).toContain('تجريبي')
    expect(message).toContain('الملاحظات وحدها')
  })
})
