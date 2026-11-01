import { describe, expect, it } from 'vitest'
import { AGENT_SWAPS, CHANNEL, EXCEPT, GUARD_SWAPS, patchWorkflow } from '@/n8n/first-order-discount-price.mjs'

// rrOffer كما هو بالكود الأساسي لعقدة «Drop Repeated Blocks» (قبل التعديل)
const RR_OFFER = [
  'const rrOffer = (() => {',
  '    try {',
  "      const m = $('تحديد التاجر').first().json;",
  '      const items = [].concat(m.catalog || []).filter((c) => c && Number(c.price_iqd) > 0);',
  '      if (items.length !== 1) return null;',
  '      return { price: Number(items[0].price_iqd), pct: Number(m.first_order_discount_pct) || 0, eligible: Number(m.customer_discounted_orders || 0) === 0 };',
  '    } catch (e) { return null; }',
  '  })();',
].join('\n')

// قواعد البرومت المتعارضة مع الخصم (نفس نصوصها بالحي)
const RULES = [
  '- ممنوع أي خصم أو تخفيض أو هدية من عندك.',
  '- السعر ثابت مثل ما هو بالأداة. ممنوع تعرض أو تعطي أي خصم أو تخفيض أو هدية أو توصيل مجاني من عندك.',
  '- الأسعار من get_available_products حصراً وبدون أي خصم.',
  '- سؤال عن المنتجات («شنو عدكم؟»): اذكر أسماء المتوفر بس. سؤال عن السعر: سعر القطعة بس. وخلي الزبون يكمّل هو.',
  '4. لا تعطي تعويض أو خصم أو موعد من عندك.',
].join('\n')

// قسم الخصم: سطر الملخص داخل فرع «مؤهل»، والسطر الأخير بعد الفرع
const BLOCK = "{{ (() => { const N = String.fromCharCode(10); const first = true; return N + '# عرض الخصم لهذا المتجر' + N + (first ? '- سعر القطعة بعد الخصم = السعر × 85 ÷ 100.' + N + '- بالملخص وبكل رد فيه مبالغ: اكتب السعر.' : '- حالة غير مؤهل.') + N + '- ممنوع أي خصم أو تخفيض ثاني غير هذا.'; })() }}"

const workflow = (guardCode = RR_OFFER, sys = `${RULES}\n${BLOCK}`) => ({
  nodes: [
    { id: 'g', name: CHANNEL.guard, type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], parameters: { jsCode: guardCode } },
    { id: 'a', name: CHANNEL.agent, type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 3, position: [0, 0], parameters: { options: { systemMessage: sys } } },
  ],
})

/** rrOffer كما يعمل بعد التعديل، بتجربة كتالوج معيّن */
const offerFor = (wf: ReturnType<typeof workflow>, catalog: { price_iqd: number }[]) => {
  const merchant = { catalog, first_order_discount_pct: '15.00', customer_discounted_orders: '0' }
  const code = String(wf.nodes[0].parameters.jsCode)
  return new Function('$', `${code}\nreturn rrOffer`)(() => ({ first: () => ({ json: merchant }) }))
}

describe('first-order-discount-price — خصم أول طلب بسؤال السعر', () => {
  it('الحارس والبرومت يتعدّلان بكل الأجزاء المتوقعة', () => {
    const wf = workflow()
    expect(patchWorkflow(wf)).toHaveLength(GUARD_SWAPS.length + AGENT_SWAPS.length)
  })

  it('الحارس: سعر واحد يكفي لكل صفوف الكتالوج، والأسعار المختلفة تبقى null', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const sameColours = [{ price_iqd: 25000 }, { price_iqd: 25000 }, { price_iqd: 25000 }]
    expect(offerFor(wf, sameColours)).toEqual({ price: 25000, pct: 15, eligible: true })
    expect(offerFor(wf, [{ price_iqd: 25000 }])).toEqual({ price: 25000, pct: 15, eligible: true })
    expect(offerFor(wf, [{ price_iqd: 25000 }, { price_iqd: 30000 }])).toBeNull()
    expect(offerFor(wf, [])).toBeNull()
  })

  it('البرومت: كل قاعدة تمنع الخصم تستثني أول طلب، والسطر الجديد داخل فرع المؤهل', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const sys = String(wf.nodes.find((x) => x.name === CHANNEL.agent)!.parameters.options!.systemMessage)
    expect(sys.split(EXCEPT).length - 1).toBe(4)
    const at = (s: string) => sys.indexOf(s)
    expect(at("'- الخصم يتغلب")).toBeGreaterThan(at("'- سعر القطعة بعد الخصم"))
    expect(at("'- الخصم يتغلب")).toBeLessThan(at("'- بالملخص وبكل رد فيه مبالغ:"))
    expect(sys).toContain("'- ممنوع أي خصم أو تخفيض ثاني غير هذا.'")
  })

  it('آمن للتكرار: المرة الثانية ما تغيّر شي', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const snapshot = JSON.stringify(wf)
    expect(patchWorkflow(wf)).toEqual([])
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('موضع غير متوقع يوقف السكربت قبل أي تعديل', () => {
    const wf = workflow(RR_OFFER.replace('if (items.length !== 1) return null;', 'return null;'))
    const snapshot = JSON.stringify(wf)
    expect(() => patchWorkflow(wf)).toThrow('rrOffer: صفوف الكتالوج')
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('عقدة ناقصة توقف السكربت', () => {
    const wf = workflow()
    wf.nodes = wf.nodes.filter((x) => x.name !== CHANNEL.agent)
    expect(() => patchWorkflow(wf)).toThrow(CHANNEL.agent)
  })
})
