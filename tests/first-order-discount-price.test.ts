import { describe, expect, it } from 'vitest'
import { AGENT_SWAPS, CHANNEL, ELIGIBLE_LINE, GUARD_SWAPS, patchWorkflow } from '@/n8n/first-order-discount-price.mjs'

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

// قواعد البرومت المتعارضة مع الخصم (نفس نصوصها بالحي)، وطلب الخصم، والاستثناء الموجود
const RULES = [
  '- ممنوع أي خصم أو تخفيض أو هدية من عندك.',
  '- السعر ثابت مثل ما هو بالأداة. ممنوع تعرض أو تعطي أي خصم أو تخفيض أو هدية أو توصيل مجاني من عندك.',
  '- الأسعار من get_available_products حصراً وبدون أي خصم.',
  '- سؤال عن المنتجات («شنو عدكم؟»): اذكر أسماء المتوفر بس. سؤال عن السعر: سعر القطعة بس. وخلي الزبون يكمّل هو.',
  '4. لا تعطي تعويض أو خصم أو موعد من عندك.',
  '- إذا طلب الزبون تخفيض أول مرة: وضّح بلطف إن السعر ثابت، مثل: "هذا السعر ثابت وما نكدر ننزّله."',
  '- إذا عاد طلب الخصم أو أصرّ: لا تعيد نفس الجملة؛ جاوب باختصار واعرض التحويل: "ما عندي صلاحية أغيّر السعر، تحب أحوّلك لموظف من الفريق؟"',
  '- ممنوع أي تلميح لسعر خاص أو سعر جملة. جوابك السعر ثابت، وإذا أصرّ اعرض التحويل لموظف. (الاستثناء الوحيد خصم أول طلب إذا مذكور بقسم «عرض الخصم لهذا المتجر».)',
].join('\n')

// قسم الخصم: سطر «سعر القطعة بعد الخصم = السعر ×» داخل فرع المؤهل بس، والسطر الأخير بعد الفرع
const BLOCK = "{{ (() => { const t = $('تحديد التاجر').first().json; const N = String.fromCharCode(10); const first = Number(t.customer_discounted_orders ?? 0) === 0; const keep = 85; return N + '# عرض الخصم لهذا المتجر' + N + (first ? '- سعر القطعة بعد الخصم = السعر × ' + keep + ' ÷ 100.' + N + '- بالملخص وبكل رد فيه مبالغ: اكتب السعر.' : '- حالة هذا الزبون: استفاد من خصم أول طلب بطلب سابق.') + N + '- ممنوع أي خصم أو تخفيض ثاني غير هذا.'; })() }}"

const ELIGIBLE = { customer_discounted_orders: '0', first_order_discount_pct: '15.00', customer_prior_orders: '1', catalog: [{ price_iqd: 25000 }] }
const NOT_ELIGIBLE = { ...ELIGIBLE, customer_discounted_orders: '1' }

const workflow = (guardCode = RR_OFFER, sys = `${RULES}\n${BLOCK}`) => ({
  nodes: [
    { id: 'g', name: CHANNEL.guard, type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 0], parameters: { jsCode: guardCode } },
    { id: 'a', name: CHANNEL.agent, type: '@n8n/n8n-nodes-langchain.agent', typeVersion: 3, position: [0, 0], parameters: { options: { systemMessage: sys } } },
  ],
})

const agentSys = (wf: ReturnType<typeof workflow>) => String(wf.nodes.find((x) => x.name === CHANNEL.agent)!.parameters.options!.systemMessage)

/** قسم الخصم كما يطلع للزبون: المؤهل أو غير المؤهل */
const renderBlock = (sys: string, merchant: Record<string, unknown>) => {
  const t = sys.indexOf('# عرض الخصم لهذا المتجر')
  const i = sys.lastIndexOf('{{ (() =>', t)
  const j = sys.indexOf('})() }}', t) + '})() }}'.length
  return String(new Function('$', `return ${sys.slice(i + 2, j - 2)}`)(() => ({ first: () => ({ json: merchant }) })))
}

/** rrOffer كما يعمل بعد التعديل، بتجربة كتالوج معيّن */
const offerFor = (wf: ReturnType<typeof workflow>, catalog: { price_iqd: number }[]) => {
  const merchant = { catalog, first_order_discount_pct: '15.00', customer_discounted_orders: '0' }
  const code = String(wf.nodes[0].parameters.jsCode)
  return new Function('$', `${code}\nreturn rrOffer`)(() => ({ first: () => ({ json: merchant }) }))
}

describe('first-order-discount-price — خصم أول طلب بسؤال السعر', () => {
  it('بدون خيار الحارس: البرومت بس، والحارس ما يتغيّر', () => {
    const wf = workflow()
    expect(patchWorkflow(wf)).toHaveLength(AGENT_SWAPS.length)
    expect(String(wf.nodes[0].parameters.jsCode)).toBe(RR_OFFER)
  })

  it('مع خيار الحارس: الحارس والبرومت يتعدّلان', () => {
    const wf = workflow()
    expect(patchWorkflow(wf, { guard: true })).toHaveLength(GUARD_SWAPS.length + AGENT_SWAPS.length)
  })

  it('الحارس: سعر واحد يكفي لكل صفوف الكتالوج، والأسعار المختلفة تبقى null', () => {
    const wf = workflow()
    patchWorkflow(wf, { guard: true })
    const sameColours = [{ price_iqd: 25000 }, { price_iqd: 25000 }, { price_iqd: 25000 }]
    expect(offerFor(wf, sameColours)).toEqual({ price: 25000, pct: 15, eligible: true })
    expect(offerFor(wf, [{ price_iqd: 25000 }])).toEqual({ price: 25000, pct: 15, eligible: true })
    expect(offerFor(wf, [{ price_iqd: 25000 }, { price_iqd: 30000 }])).toBeNull()
    expect(offerFor(wf, [])).toBeNull()
  })

  it('كل شرط يرجع لسطر «سعر القطعة بعد الخصم = السعر ×»، مو لعنوان القسم', () => {
    const wf = workflow()
    const before = agentSys(wf).split(ELIGIBLE_LINE).length - 1
    patchWorkflow(wf)
    const sys = agentSys(wf)
    expect(sys.split(ELIGIBLE_LINE).length - 1 - before).toBe(8)
    expect(sys).not.toContain('إذا فيه قسم «عرض الخصم لهذا المتجر»')
    expect(sys).not.toContain('إلا خصم أول طلب المذكور بقسم')
  })

  it('المؤهل يطلع سطر الخصم، وغير المؤهل ما يطلعه', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const sys = agentSys(wf)
    expect(renderBlock(sys, ELIGIBLE)).toContain('الخصم يتغلب')
    expect(renderBlock(sys, NOT_ELIGIBLE)).not.toContain('الخصم يتغلب')
    expect(renderBlock(sys, NOT_ELIGIBLE)).not.toContain(ELIGIBLE_LINE)
  })

  it('البرومت: السطر الجديد داخل فرع المؤهل', () => {
    const wf = workflow()
    patchWorkflow(wf)
    const sys = agentSys(wf)
    const at = (s: string) => sys.indexOf(s)
    expect(at("'- الخصم يتغلب")).toBeGreaterThan(at("'- سعر القطعة بعد الخصم"))
    expect(at("'- الخصم يتغلب")).toBeLessThan(at("'- بالملخص وبكل رد فيه مبالغ:"))
  })

  it('آمن للتكرار: المرة الثانية ما تغيّر شي', () => {
    const wf = workflow()
    patchWorkflow(wf, { guard: true })
    const snapshot = JSON.stringify(wf)
    expect(patchWorkflow(wf, { guard: true })).toEqual([])
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('موضع غير متوقع يوقف السكربت قبل أي تعديل', () => {
    const rules = RULES.replace('سؤال عن السعر: سعر القطعة بس.', 'سؤال عن السعر.')
    const wf = workflow(RR_OFFER, `${rules}\n${BLOCK}`)
    const snapshot = JSON.stringify(wf)
    expect(() => patchWorkflow(wf)).toThrow('سعر القطعة بس')
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('عقدة ناقصة توقف السكربت', () => {
    const wf = workflow()
    wf.nodes = wf.nodes.filter((x) => x.name !== CHANNEL.agent)
    expect(() => patchWorkflow(wf)).toThrow(CHANNEL.agent)
  })
})
