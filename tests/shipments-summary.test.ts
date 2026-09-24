import { describe, it, expect } from 'vitest'
import { summarizeMerchantSettlement, type SettlementStatus, type ShipmentStatus } from '@/lib/shipments'

/**
 * مجاميع التسوية يراها التاجر في صفحة شحناته وفريق برق في /dashboard من
 * الدالة نفسها — خطأ هنا خطأ مالي في الشاشتين معاً (بند ٤-٤ في CLAUDE.md).
 */

type Row = Parameters<typeof summarizeMerchantSettlement>[0][number]

function row(
  status: ShipmentStatus,
  settlement: SettlementStatus,
  cod: number | string,
  fee: number | string,
  net: number | string
): Row {
  return {
    status,
    settlement_status: settlement,
    cod_amount_iqd: cod as number,
    delivery_fee_iqd: fee as number,
    merchant_net_amount_iqd: net as number,
  }
}

describe('summarizeMerchantSettlement', () => {
  it('القائمة الفارغة تعطي أصفاراً', () => {
    expect(summarizeMerchantSettlement([])).toEqual({
      deliveredCount: 0,
      codCollectedIqd: 0,
      deliveryFeesIqd: 0,
      pendingPayoutIqd: 0,
    })
  })

  it('لا يدخل المجاميع إلا المسلَّم وما سُوّي بعد تسليمه', () => {
    const summary = summarizeMerchantSettlement([
      row('ORDER_RECEIVED', 'PENDING', 10000, 5000, 5000),
      row('OUT_FOR_DELIVERY', 'PENDING', 20000, 5000, 15000),
      row('POSTPONED', 'PENDING', 30000, 5000, 25000),
      row('RETURNED', 'PENDING', 40000, 5000, 35000),
      row('DELIVERED', 'PENDING', 50000, 5000, 45000),
      row('SETTLED_FINANCIALLY', 'DEPOSITED', 60000, 6000, 54000),
    ])

    expect(summary.deliveredCount).toBe(2)
    expect(summary.codCollectedIqd).toBe(110000)
    expect(summary.deliveryFeesIqd).toBe(11000)
  })

  it('لا يدخل المستحق إلا ما تسويته PENDING', () => {
    const summary = summarizeMerchantSettlement([
      row('DELIVERED', 'PENDING', 50000, 5000, 45000),
      row('DELIVERED', 'DEPOSITED', 30000, 5000, 25000),
      row('DELIVERED', 'DEFERRED', 20000, 5000, 15000),
    ])

    expect(summary.pendingPayoutIqd).toBe(45000)
    // المودَع والمؤجَّل يبقيان في مجموع المحصَّل والأجور
    expect(summary.codCollectedIqd).toBe(100000)
    expect(summary.deliveryFeesIqd).toBe(15000)
  })

  it('يجمع الكسور بدقة لا بالفاصلة العائمة', () => {
    // 10.1 + 20.2 بالجمع العشري المباشر = 30.299999999999997
    const summary = summarizeMerchantSettlement([
      row('DELIVERED', 'PENDING', 10.1, 0.1, 10),
      row('DELIVERED', 'PENDING', 20.2, 0.2, 20),
    ])

    expect(summary.codCollectedIqd).toBe(30.3)
    expect(summary.deliveryFeesIqd).toBe(0.3)
    expect(summary.pendingPayoutIqd).toBe(30)
  })

  it('يقبل numeric نصاً كما قد يعيده PostgREST', () => {
    const summary = summarizeMerchantSettlement([row('DELIVERED', 'PENDING', '25000.00', '5000.00', '20000.00')])

    expect(summary.codCollectedIqd).toBe(25000)
    expect(summary.pendingPayoutIqd).toBe(20000)
  })
})
