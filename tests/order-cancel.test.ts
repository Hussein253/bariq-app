import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getDictionary } from '@/lib/i18n'
import {
  CANCEL_VIA_ORDER_ERROR,
  canCancelOrder,
  cancelFailure,
  cancelledShipmentLockedError,
} from '@/lib/order-cancel'
import {
  CANCELLED_STATUS,
  SHIPMENT_STATUSES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  amountDueLine,
  isReportableShipment,
  manualNextStatuses,
} from '@/lib/shipments'

const MIGRATION = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/034_cancelled_shipment_state.sql', import.meta.url)),
  'utf8'
)

describe('canCancelOrder — الإلغاء ما دامت الشحنة لم تُستلم', () => {
  it.each([
    ['طلب بلا شحنة (pending)', { current_state: 'pending', shipment: null }, true],
    ['طلب مؤكد بلا شحنة', { current_state: 'confirmed', shipment: null }, true],
    ['طلب في الطريق ولم تُستلم شحنته', { current_state: 'confirmed', shipment: { status: 'ORDER_RECEIVED' } }, true],
    ['شحنة استلمها التاجر', { current_state: 'confirmed', shipment: { status: 'PICKED_UP_SAME_DAY' } }, false],
    ['شحنة عند المندوب', { current_state: 'confirmed', shipment: { status: 'OUT_FOR_DELIVERY' } }, false],
    ['شحنة مسلَّمة', { current_state: 'confirmed', shipment: { status: 'DELIVERED' } }, false],
    ['طلب ملغى من قبل', { current_state: 'cancelled', shipment: null }, false],
    ['طلب ملغى وشحنته ملغاة', { current_state: 'cancelled', shipment: { status: 'CANCELLED' } }, false],
  ])('%s ← %s', (_label, order, expected) => {
    expect(canCancelOrder(order)).toBe(expected)
  })
})

describe('cancelFailure — خطأ الـ RPC إلى رد', () => {
  it('الطلب غير موجود (BQ011) ← 404 مع النص العربي بعد «|»', () => {
    expect(cancelFailure({ code: 'BQ011', message: 'BQ_ORDER_NOT_FOUND|الطلب 99 غير موجود' })).toEqual({
      status: 404,
      error: 'الطلب 99 غير موجود',
    })
  })

  it('الشحنة تجاوزت الاستلام (BQ015) ← 409', () => {
    expect(
      cancelFailure({
        code: 'BQ015',
        message: 'BQ_SHIPMENT_NOT_CANCELLABLE|الشحنة BRQ-000012 في حالة PICKED_UP_SAME_DAY ولا تُلغى بعد الاستلام',
      })
    ).toEqual({
      status: 409,
      error: 'الشحنة BRQ-000012 في حالة PICKED_UP_SAME_DAY ولا تُلغى بعد الاستلام',
    })
  })

  it('شحنة ملغاة (BQ014) ← 409', () => {
    expect(cancelFailure({ code: 'BQ014', message: 'BQ_SHIPMENT_CANCELLED|الشحنة X ملغية' }).status).toBe(409)
  })

  it('مدخلات ناقصة (BQ010) ← 400', () => {
    expect(cancelFailure({ code: 'BQ010', message: 'BQ_CANCEL_INPUT|رقم الطلب مطلوب' }).status).toBe(400)
  })

  it('خطأ غير معروف ← 500 بنص عام، لا تفاصيل قاعدة البيانات', () => {
    expect(cancelFailure({ code: '42P01', message: 'relation "orders_x" does not exist' })).toEqual({
      status: 500,
      error: 'تعذّر إلغاء الطلب',
    })
  })

  it('خطأ بلا رمز ← 500', () => {
    expect(cancelFailure({ message: 'network down' }).status).toBe(500)
  })

  it('رمز معروف برسالة بلا «|» ← نص عام، لا الرسالة الخام', () => {
    expect(cancelFailure({ code: 'BQ011', message: 'raw text' })).toEqual({ status: 404, error: 'تعذّر إلغاء الطلب' })
  })
})

describe('الشحنة الملغاة — خارج العدّ والنسب والتحصيل', () => {
  it('CANCELLED_STATUS هي الحالة الجديدة', () => {
    expect(CANCELLED_STATUS).toBe('CANCELLED')
  })

  it('الملغاة لا تُعَدّ، وما عداها يُعَدّ', () => {
    expect(isReportableShipment({ status: 'CANCELLED' })).toBe(false)
    expect(isReportableShipment({ status: 'ORDER_RECEIVED' })).toBe(true)
    expect(isReportableShipment({ status: 'DELIVERED' })).toBe(true)
  })

  it('أزرار التغيير اليدوي لا تعرض الإلغاء: الإلغاء من زر الطلب وحده', () => {
    expect(manualNextStatuses('ORDER_RECEIVED')).toEqual(['PICKED_UP_SAME_DAY'])
    expect(manualNextStatuses('CANCELLED')).toEqual([])
    expect(manualNextStatuses('OUT_FOR_DELIVERY')).toEqual(['DELIVERED', 'POSTPONED', 'RETURNED'])
  })

  it('الانتقالات تسمح بالإلغاء من الاستلام فقط، والملغاة نهائية', () => {
    expect(STATUS_TRANSITIONS.ORDER_RECEIVED).toContain('CANCELLED')
    expect(STATUS_TRANSITIONS.PICKED_UP_SAME_DAY).not.toContain('CANCELLED')
    expect(STATUS_TRANSITIONS.CANCELLED).toEqual([])
  })

  it('رسالة الزبون لا تذكر مبلغاً لشحنة ملغاة', () => {
    expect(amountDueLine('CANCELLED', '28,000 د.ع')).toBe('')
    expect(amountDueLine('ORDER_RECEIVED', '28,000 د.ع')).toBe('\nالمطلوب عند الاستلام: 28,000 د.ع')
  })

  it('رسائل الرفض تسمّي الشحنة وتقول إن الملاحظات وحدها تُعدَّل', () => {
    expect(cancelledShipmentLockedError('BRQ-000011')).toContain('BRQ-000011')
    expect(cancelledShipmentLockedError('BRQ-000011')).toContain('الملاحظات وحدها')
    expect(CANCEL_VIA_ORDER_ERROR).toContain('إلغاء الطلب')
  })
})

describe('الترجمات تغطي الحالة الجديدة في اللغات الثلاث', () => {
  it('لكل حالة شحنة تسمية عربية', () => {
    for (const status of SHIPMENT_STATUSES) expect(STATUS_LABELS[status]).toBeTruthy()
    expect(STATUS_LABELS.CANCELLED).toBe('ملغية')
  })

  it.each(['ar', 'en', 'ku'] as const)('%s: اسم الحالة وأزرار الإلغاء موجودة', (locale) => {
    const app = getDictionary(locale).app
    expect(app.shipmentStatus.CANCELLED).toBeTruthy()
    const detail = app.operations.orderDetail
    expect(detail.cancelOrder).toBeTruthy()
    expect(detail.confirmCancel).toBeTruthy()
    expect(detail.cancelHint).toBeTruthy()
    expect(detail.cancelDone).toContain('{n}')
    expect(detail.cancelFailed).toBeTruthy()
  })
})

describe('مواءمة الترحيل ٠٣٤ مع الكود', () => {
  it('آلة الحالات في القاعدة تطابق STATUS_TRANSITIONS في الكود', () => {
    const match = MIGRATION.match(/allowed_next jsonb := '([^']*)'::jsonb/)
    expect(match).not.toBeNull()
    expect(JSON.parse(match![1])).toEqual(STATUS_TRANSITIONS)
  })

  it('قيد الحالات في القاعدة يطابق SHIPMENT_STATUSES في الكود', () => {
    const start = MIGRATION.indexOf('add constraint shipments_status_check')
    expect(start).toBeGreaterThan(-1)
    const end = MIGRATION.indexOf(');', start)
    const listed = [...MIGRATION.slice(start, end).matchAll(/'([A-Z_]+)'::text/g)].map((m) => m[1])
    expect([...listed].sort()).toEqual([...SHIPMENT_STATUSES].sort())
  })

  it('cancel_order يرفع BQ015 لشحنة تجاوزت الاستلام، والتنفيذ لـ service_role وحده', () => {
    expect(MIGRATION).toContain("errcode = 'BQ015'")
    expect(MIGRATION).toContain('revoke execute on function public.cancel_order(bigint) from anon, authenticated, public;')
    expect(MIGRATION).toContain('grant execute on function public.cancel_order(bigint) to service_role;')
  })
})
