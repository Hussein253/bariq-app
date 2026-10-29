import { describe, expect, it } from 'vitest'
import { asksAboutSizes, dropUnaskedSizes, isOrderingTurn } from '@/n8n/reply-scope.js'
import { CHANNELS, HINT_FIXES, PROMPT_FIXES, RULE_ANCHOR, SCOPE_RULE, guardCode, patchWorkflow } from '@/n8n/reply-scope.mjs'

const browsing = { said: 'شنو عدكم منتجات', ordering: false }

describe('dropUnaskedSizes — القياسات بس إذا الزبون سأل عنها (قاعدة صاحب المتجر 2026-10-29)', () => {
  it('التنفيذ 2940 «شنو عدكم منتجات»: قوائم «- أسود: سمول، ميديم…» تنشال، والألوان تبقى', () => {
    const reply = 'إي عدنا هودي شتوي، وكل الألوان متوفرة بسعر 25,000 دينار. الألوان هي:\n\n'
      + '- أسود: سمول، ميديم، لارج، اكس لارج\n- أبيض: سمول، ميديم، لارج، اكس لارج، دبل اكس لارج\n'
      + '- أحمر: سمول، ميديم، لارج، اكس لارج، دبل اكس لارج\nSTAGE: 1'
    expect(dropUnaskedSizes(reply, browsing)).toBe('إي عدنا هودي شتوي، وكل الألوان متوفرة بسعر 25,000 دينار. الألوان هي:\n\n'
      + '- أسود\n- أبيض\n- أحمر\nSTAGE: 1')
  })

  it('التنفيذ 2845: «القياسات:» ويا القائمة، والسعر بنفس السطر يبقى', () => {
    const reply = '- الأسود: القياسات: سمول، ميديم، لارج، اكس لارج.\n- الأبيض: S، M، L، اكس لارج، 2XL — 25,000 دينار.'
    expect(dropUnaskedSizes(reply, { said: 'ماجاوبتني' })).toBe('- الأسود.\n- الأبيض — 25,000 دينار.')
  })

  it('جملة بقت عنوان بلا قائمة تنشال كلها، و«بالقياسات» بنص الجملة', () => {
    expect(dropUnaskedSizes('عدنا هودي شتوي. القياسات المتاحة للهودي الأسود هي: سمول، لارج، واكس لارج.', browsing))
      .toBe('عدنا هودي شتوي.')
    expect(dropUnaskedSizes('كل الألوان متوفرة بالقياسات سمول وميديم ولارج بسعر 25,000 دينار.', browsing))
      .toBe('كل الألوان متوفرة بسعر 25,000 دينار.')
  })

  it.each([
    ['شنو القياسات الي عندك', false],
    ['اني طولي ١٧٠ ووزني ١٠٠ شنو يجيني', false],
    ['عندك XL؟', false],
    ['اريد الاسود', true],
  ])('«%s» (طلب: %s): القياسات تبقى', (said, ordering) => {
    const reply = '- أسود: سمول، ميديم، لارج'
    expect(dropUnaskedSizes(reply, { said, ordering })).toBe(reply)
  })

  it('قياس واحد بالجواب أو بالملخص مو قائمة: يبقى', () => {
    for (const reply of ['تم عزيزي، هودي شتوي أسود قياس لارج.', 'إي عدنا أسود سمول ✅', 'تريد سمول لو لارج؟']) {
      expect(dropUnaskedSizes(reply, browsing)).toBe(reply)
    }
  })

  it('رد بلا قياسات يرجع مثل ما هو، حتى الفراغات', () => {
    const reply = 'عدنا هودي شتوي عزيزي 🌷\n\n\nSTAGE: 1'
    expect(dropUnaskedSizes(reply, browsing)).toBe(reply)
  })
})

describe('isOrderingTurn', () => {
  it('من orderContext: نية شراء أو سلة أو طلب جاري', () => {
    expect(isOrderingTurn({ browsing: true, explicitIntent: false }, 'اريد اطلب')).toBe(false)
    expect(isOrderingTurn({ explicitIntent: true })).toBe(true)
    expect(isOrderingTurn({ itemsKnown: true })).toBe(true)
    expect(isOrderingTurn({ confirmedOnce: true })).toBe(true)
  })

  it('بلا orderContext (إنستغرام): كلمات الشراء', () => {
    expect(isOrderingTurn(null, 'اريد وحدة سوده')).toBe(true)
    expect(isOrderingTurn(null, 'شنو عدكم')).toBe(false)
  })

  it('asksAboutSizes بعد التطبيع', () => {
    expect(asksAboutSizes('شنو المقاسات؟')).toBe(true)
    expect(asksAboutSizes('عندك صورة؟')).toBe(false)
  })
})

// مسار مصغّر بالعقد الي يعتمد عليها السكربت بس، والنصوص القديمة مثل الحي
type Node = { name: string, parameters: Record<string, unknown> } & Record<string, unknown>
const OLD_PROMPT = ['=القواعد', RULE_ANCHOR, ...PROMPT_FIXES.map(([from]) => from + ' تكملة السطر')].join('\n')
const OLD_HINT = "const BROWSING_HINT = '[استفسار:'\n" + HINT_FIXES.map(([from]) => "  + '" + from + "'").join('\n')
const GUARD = "let text = String($json.output || '');\nreturn { json: { ...$json, output: text } };"
const workflow = () => ({
  id: CHANNELS.messenger.id,
  nodes: [
    { name: 'Iraqi Store AI Agent', parameters: { options: { systemMessage: OLD_PROMPT } } },
    { name: 'Order Context Hint', parameters: { jsCode: OLD_HINT } },
    { name: 'Drop Repeated Blocks', parameters: { jsCode: GUARD } },
  ] as Node[],
})
const by = (wf: { nodes: Node[] }, name: string) => wf.nodes.find((n) => n.name === name)!.parameters

describe('reply-scope.mjs — زرع المسار', () => {
  it('البرومت والتنبيه والحارس، والمرة الثانية ما تغيّر شي', () => {
    const wf = workflow()
    expect(patchWorkflow(wf, CHANNELS.messenger)).toHaveLength(4)
    const sm = (by(wf, 'Iraqi Store AI Agent').options as { systemMessage: string }).systemMessage
    for (const [from, to] of PROMPT_FIXES) {
      expect(sm).not.toContain(from)
      expect(sm).toContain(to)
    }
    expect(sm).toContain(RULE_ANCHOR + '\n' + SCOPE_RULE)
    expect(String(by(wf, 'Order Context Hint').jsCode)).toContain('«إي عدنا [المنتج]»؛')
    const guard = String(by(wf, 'Drop Repeated Blocks').jsCode)
    expect(guard).toContain('dropUnaskedSizes(text, { said, ordering: isOrderingTurn(orderContext, said) })')
    expect(guard.indexOf('n8n/reply-scope.js')).toBeLessThan(guard.indexOf('return { json:'))
    expect(patchWorkflow(wf, CHANNELS.messenger)).toEqual([])
  })

  it('الكود المحقون يشتغل لحاله (بلا export)', () => {
    const code = guardCode()
    expect(code).not.toMatch(/^export /m)
    const run = new Function('text', 'said', `${code}\nreturn dropUnaskedSizes(text, { said, ordering: isOrderingTurn(null, said) });`)
    expect(run('- أسود: سمول، ميديم', 'شنو عدكم')).toBe('- أسود')
  })

  it('نص قديم مو موجود: يوكف بخطأ بدل ما يزرع نص', () => {
    const wf = workflow()
    ;(by(wf, 'Iraqi Store AI Agent').options as { systemMessage: string }).systemMessage = '=برومت ثاني'
    expect(() => patchWorkflow(wf, CHANNELS.messenger)).toThrow(/البرومت/)
  })
})
