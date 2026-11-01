import { describe, expect, it } from 'vitest'
import { CHANNELS, DISCOUNT_FIELD, OFFER_BLOCK, patchWorkflow } from '@/n8n/discount-channels.mjs'

const OLD_BLOCK = "{{ (() => { const t = $('تحديد التاجر').first().json; const N = String.fromCharCode(10); const pct = Number(t.first_order_discount_pct || 0); if (!(pct > 0)) return ''; const keep = 100 - pct; const ex = Math.round(350000 * keep / 100).toLocaleString('en-US'); return N + N + '# عرض الخصم لهذا المتجر (قديمة)' + ex; })() }}"

// تعبير الكتلة كما يتقيّم داخل n8n: الاستدعاء $('تحديد التاجر').first().json
const evalBlock = (merchant: Record<string, unknown>) => {
  const expr = OFFER_BLOCK.replace(/^\{\{/, '').replace(/\}\}$/, '')
  const $ = () => ({ first: () => ({ json: merchant }) })
  return new Function('$', `return ${expr}`)($) as string
}

const CATALOG = [{ name: 'هودي شتوي', color: 'احمر', price_iqd: 25000 }]
// استعلام بنفس الشكل: آخر عمود «catalog_guard» ثم FROM social_accounts، وjoin على ds
const WA_QUERY = `SELECT sa.merchant_id,
       CASE WHEN NOT EXISTS (SELECT 1 FROM products p WHERE p.merchant_id = sa.merchant_id) THEN 'z' ELSE '' END
       END AS catalog_guard
FROM social_accounts sa
JOIN merchants m ON m.id = sa.merchant_id AND m.status = 'active'
LEFT JOIN merchant_delivery_settings ds ON ds.merchant_id = sa.merchant_id
WHERE sa.platform = 'whatsapp' AND sa.external_id = $1
LIMIT 1;`

const SM = 'x\n{{ $(\'تحديد التاجر\').first().json.merchant_section }}\ny'
const wf = (channel: keyof typeof CHANNELS, opts: { qr?: string, prompt?: string } = {}) => {
  const c = CHANNELS[channel]
  return {
    id: c.id,
    name: 'test',
    nodes: [
      { name: c.agent, parameters: { options: { systemMessage: opts.prompt ?? SM } } },
      { name: 'تحديد التاجر', parameters: { query: WA_QUERY, options: { queryReplacement: opts.qr ?? '={{ $(\'Message Data\').item.json.phoneNumberId }}' } } },
      { name: 'create_order', parameters: { fieldsUi: { fieldValues: [{ fieldId: 'phone_number', fieldValue: 'x' }] } } },
    ],
    connections: {},
  }
}

describe('OFFER_BLOCK — عرض الخصم بالسعر من الكتالوج، مو غسالة 350,000', () => {
  it('أول طلب: السعر من الكتالوج والخصم 15% = 21,250', () => {
    const out = evalBlock({ first_order_discount_pct: '15.00', customer_prior_orders: '1', customer_discounted_orders: '0', catalog: CATALOG })
    expect(out).toContain('مثل: «سعر القطعة 25,000 دينار، والخصم 15% يشمل طلبك فيصير سعرها 21,250 دينار».')
    expect(out).not.toMatch(/350,?000|الغسالة/)
  })

  it('الزبون استفاد قبل: ما يذكر سعر بعد خصم', () => {
    const out = evalBlock({ first_order_discount_pct: '15.00', customer_prior_orders: '1', customer_discounted_orders: '1', catalog: CATALOG })
    expect(out).not.toContain('21,250')
    expect(out).toContain('ممنوع تذكر أو تحسب أي سعر بعد خصم')
  })

  it('ماكو خصم للتاجر: فاضي، وماكو كتالوج: بدون مثال', () => {
    expect(evalBlock({ first_order_discount_pct: '0', catalog: CATALOG })).toBe('')
    const noCatalog = evalBlock({ first_order_discount_pct: '15.00', customer_prior_orders: '0', catalog: [] })
    expect(noCatalog).not.toContain('مثل:')
    expect(noCatalog).toContain('# عرض الخصم لهذا المتجر')
  })
})

describe('DISCOUNT_FIELD — نفس حقل ماسنجر', () => {
  it('يقرا الطلبات المخصومة قبل ما يقرا عدد الطلبات السابقة', () => {
    expect(DISCOUNT_FIELD).toContain("t.customer_discounted_orders ?? t.customer_prior_orders ?? 0")
    expect(DISCOUNT_FIELD).toContain("$('تحديد التاجر')")
  })
})

describe('patchWorkflow — واتساب وإنستغرام', () => {
  it('واتساب: الاستعلام يقرا الخصم، والرقم كـ $2، وdiscount_pct بـ create_order، وكتلة العرض بالبرومت', () => {
    const w = wf('whatsapp')
    const changes = patchWorkflow(w, CHANNELS.whatsapp)
    expect(changes).toHaveLength(4)
    const m = w.nodes[1].parameters as { query: string, options: { queryReplacement: string } }
    expect(m.query).toContain('LEFT JOIN merchant_profiles mp ON mp.merchant_id = sa.merchant_id')
    expect(m.query).toContain('AS customer_discounted_orders')
    expect(m.query).toContain('AS first_order_discount_pct')
    expect(m.query).toContain("o.phone_number = $2::text")
    // الطلب التجريبي ما ينحسب بأهلية الخصم (مثل PR #40 لماسنجر)
    expect(m.query.split('coalesce(o.is_test, false) = false').length - 1).toBe(2)
    expect(m.options.queryReplacement).toBe("={{ $('Message Data').item.json.phoneNumberId }},{{ $('Message Data').item.json.phone }}")
    const co = w.nodes[2].parameters as { fieldsUi: { fieldValues: { fieldId: string, fieldValue: string }[] } }
    expect(co.fieldsUi.fieldValues.find((f) => f.fieldId === 'discount_pct')?.fieldValue).toBe(DISCOUNT_FIELD)
    expect((w.nodes[0].parameters as { options: { systemMessage: string } }).options.systemMessage).toContain('# عرض الخصم لهذا المتجر')
  })

  it('إنستغرام: الرقم من بيانات الرسالة، والمعرّف يبقى أول', () => {
    const w = wf('instagram', { qr: "={{ $('بيانات الرسالة').first().json.igAccountId }}" })
    patchWorkflow(w, CHANNELS.instagram)
    const m = w.nodes[1].parameters as { options: { queryReplacement: string } }
    expect(m.options.queryReplacement).toBe("={{ $('بيانات الرسالة').first().json.igAccountId }},{{ $('بيانات الرسالة').first().json.phone }}")
  })

  it('آمن للتكرار: الإعادة ما تغيّر شي', () => {
    const w = wf('whatsapp')
    patchWorkflow(w, CHANNELS.whatsapp)
    expect(patchWorkflow(w, CHANNELS.whatsapp)).toEqual([])
  })

  it('ماسنجر: يبدّل الكتلة القديمة بالجديدة بدون ما يلمس الاستعلام', () => {
    const prompt = `a\n${OLD_BLOCK}\nb`
    const w = wf('messenger', { prompt })
    const changes = patchWorkflow(w, CHANNELS.messenger)
    expect(changes).toHaveLength(1)
    const out = (w.nodes[0].parameters as { options: { systemMessage: string } }).options.systemMessage
    expect(out).toContain(OFFER_BLOCK)
    expect(out).not.toContain('350000')
    expect(out.startsWith('a\n')).toBe(true)
    expect(out.endsWith('\nb')).toBe(true)
    expect(patchWorkflow(w, CHANNELS.messenger)).toEqual([])
  })
})
