import { describe, expect, it } from 'vitest'
import { NOT_TEST, patchWorkflow } from '@/n8n/first-order-discount-test-orders.mjs'

// سطرا العدّين بعقدة «تحديد التاجر» بماسنجر حرفياً مثل الحي (2026-10-31)، وحواليهن سطور ما تنلمس
const PRIOR = "       (SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled') AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS customer_prior_orders,"
const DISCOUNTED = "       (SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled') AND coalesce(o.discount_pct, 0) > 0 AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS customer_discounted_orders,"
const query = (prior = PRIOR, discounted = DISCOUNTED) => [
  'SELECT sa.merchant_id,',
  '       m.name AS merchant_name,',
  prior,
  discounted,
  '       coalesce(mp.first_order_discount_pct, 0) AS first_order_discount_pct',
  'FROM social_accounts sa',
  "WHERE sa.platform = 'messenger'",
  '  AND sa.external_id = $1',
  'LIMIT 1;',
].join('\n')

// عقدة ثانية تقرا orders: السكربت ما يلمسها
const ADDRESS = 'SELECT address_details FROM orders WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1;'
const node = (name: string, q: string) => ({ id: name, name, type: 'n8n-nodes-base.postgres', typeVersion: 2.6, position: [0, 0], parameters: { query: q } })
const workflow = (q = query()) => ({ nodes: [node('تحديد التاجر', q), node('Load Previous Address', ADDRESS)] })
const sql = (wf: ReturnType<typeof workflow>, name = 'تحديد التاجر') => wf.nodes.find((x) => x.name === name)!.parameters.query
const line = (q: string, alias: string) => q.split('\n').find((l) => l.endsWith(`AS ${alias},`)) ?? ''

describe('first-order-discount-test-orders — الطلب التجريبي ما ينحسب بأهلية خصم أول طلب', () => {
  it('العدّان يستثنون الطلب التجريبي، وباقي الاستعلام والعقد الثانية ما تنلمس', () => {
    const wf = workflow()
    expect(patchWorkflow(wf)).toHaveLength(2)
    const q = sql(wf)
    for (const alias of ['customer_prior_orders', 'customer_discounted_orders']) {
      expect(line(q, alias)).toContain("NOT IN ('cancelled', 'canceled')")
      expect(line(q, alias)).toContain('AND coalesce(o.is_test, false) = false AND EXISTS (SELECT 1 FROM order_items oi')
      expect(line(q, alias).split('o.is_test')).toHaveLength(2) // مرة وحدة
    }
    expect(line(q, 'customer_discounted_orders')).toContain('AND coalesce(o.discount_pct, 0) > 0 AND coalesce(o.is_test, false) = false')
    expect(q.split(NOT_TEST).join('')).toBe(query()) // ماكو تغيير غير الشرط
    expect(sql(wf, 'Load Previous Address')).toBe(ADDRESS)
  })

  it('آمن للتكرار: المرة الثانية ما تغيّر شي', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const snapshot = JSON.stringify(wf)
    expect(patchWorkflow(wf)).toEqual([])
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('عدّ شكله مو مثل المتوقع يوقف السكربت قبل أي تعديل', () => {
    // قبل harden-order-flow.mjs: العدّ بلا شرط البنود
    const old = PRIOR.replace(' AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)', '')
    const wf = workflow(query(old))
    expect(() => patchWorkflow(wf)).toThrow('customer_prior_orders')
    expect(sql(wf)).toBe(query(old))

    // قبل first-order-discount-eligibility.mjs: ماكو عدّ للخصم، والعدّ الأول ما ينعدّل لحاله
    const noDiscount = workflow(query(PRIOR, ''))
    expect(() => patchWorkflow(noDiscount)).toThrow('customer_discounted_orders')
    expect(sql(noDiscount)).toBe(query(PRIOR, ''))
  })

  it('عقدة «تحديد التاجر» ناقصة توقف السكربت', () => {
    const wf = workflow()
    wf.nodes = wf.nodes.filter((x) => x.name !== 'تحديد التاجر')
    expect(() => patchWorkflow(wf)).toThrow('تحديد التاجر')
  })
})
