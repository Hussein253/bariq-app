import { describe, expect, it } from 'vitest'
import { prematureConfirmFix } from '@/n8n/premature-confirm.js'
import { CHANNELS, patchWorkflow } from '@/n8n/premature-confirm.mjs'

// رسالة ماسنجر 13:28 (بدون order): ما انحفظ طلب
const MSG_1328 = 'تم عزيزي، تم تأكيد طلبك. هودي شتوي، وحدة. وياريت تدزلي اسمك وعنوانك الكامل (المحافظة والمنطقة وأقرب نقطة دالة) ورقم التليفون'
// رسالة واتساب 09:45 (بدون order)
const MSG_0945 = 'المعلومات كاملة عندي، تم عزيزي، تم تأكيد طلبك. تفاصيل الطلب: ٧ قطع هودي أبيض (قياس دبل اكس لارج). التوصيل سيكون إلى بغداد'

describe('prematureConfirmFix — ما ينقال «تم تأكيد طلبك» إلا بعد ما ينحفظ الطلب', () => {
  it('الطلب انحفظ بهالدور: الرد يبقى كما هو', () => {
    expect(prematureConfirmFix(MSG_1328, true)).toBe(MSG_1328)
    expect(prematureConfirmFix('تم عزيزي، تم تثبيت طلبك: رقم الطلب 55', true)).toBe('تم عزيزي، تم تثبيت طلبك: رقم الطلب 55')
  })

  it('ماسنجر 13:28: «تم عزيزي، تم تأكيد طلبك» ← «تمام عزيزي، هذا ملخص طلبك»', () => {
    expect(prematureConfirmFix(MSG_1328, false)).toBe('تمام عزيزي، هذا ملخص طلبك. هودي شتوي، وحدة. وياريت تدزلي اسمك وعنوانك الكامل (المحافظة والمنطقة وأقرب نقطة دالة) ورقم التليفون')
  })

  it('واتساب 09:45: الجملة الوسط تتصلح والبقية تبقى', () => {
    const out = prematureConfirmFix(MSG_0945, false)
    expect(out).toBe('المعلومات كاملة عندي، تمام عزيزي، هذا ملخص طلبك. تفاصيل الطلب: ٧ قطع هودي أبيض (قياس دبل اكس لارج). التوصيل سيكون إلى بغداد')
  })

  it('«تم تأكيد طلبك» بدون «تم عزيزي»، و«طلبك هسة صار»، و«تم تثبيت طلبك»', () => {
    expect(prematureConfirmFix('تم تأكيد طلبك. ما عندك شي ثاني؟', false)).toBe('هذا ملخص طلبك. ما عندك شي ثاني؟')
    expect(prematureConfirmFix('طلبك هسة صار: ٣ قطع', false)).toBe('هذا ملخص طلبك: ٣ قطع')
    expect(prematureConfirmFix('تم تثبيت طلبك', false)).toBe('هذا ملخص طلبك')
  })

  it('رد ما فيه تأكيد: ما ينلمس، والسطور المخفية تبقى', () => {
    const plain = 'عدنا هودي شتوي بثلاث ألوان.\nSTAGE: 1'
    expect(prematureConfirmFix(plain, false)).toBe(plain)
    expect(prematureConfirmFix('تم عزيزي، تم تأكيد طلبك.\nSTAGE: 3', false)).toBe('تمام عزيزي، هذا ملخص طلبك.\nSTAGE: 3')
  })
})

const GUARD = 'let text = $json.output;\ntext = text;\nreturn { json: { ...$json, output: text } };'
const wf = (channel: keyof typeof CHANNELS) => ({
  id: CHANNELS[channel].id,
  name: 'test',
  nodes: [{ name: CHANNELS[channel].guard, parameters: { jsCode: GUARD } }],
  connections: {},
})

describe('patchWorkflow — الحارس الأخير لكل القنوات', () => {
  it('يزرع الحارس قبل سطر الإرجاع، ويعرف create_order، وآمن للتكرار', () => {
    for (const ch of ['messenger', 'whatsapp', 'instagram'] as const) {
      const w = wf(ch)
      expect(patchWorkflow(w, CHANNELS[ch])).toHaveLength(1)
      const code = w.nodes[0].parameters.jsCode as string
      expect(code).toContain('$("create_order").isExecuted === true')
      expect(code).toContain('prematureConfirmFix(text, orderCreated)')
      expect(code).not.toContain('export ')
      expect(code.indexOf('n8n/premature-confirm.js')).toBeLessThan(code.indexOf(RETURN))
      expect(patchWorkflow(w, CHANNELS[ch])).toEqual([])
    }
  })

  it('الكود المزروع يصحح الرد بدون طلب، ويتركه بعد طلب', () => {
    const w = wf('whatsapp')
    patchWorkflow(w, CHANNELS.whatsapp)
    const block = (w.nodes[0].parameters.jsCode as string).split('// ---- n8n/premature-confirm.js')[1]
    const body = '// ---- n8n/premature-confirm.js' + block.split('// ---- نهاية n8n/premature-confirm.js ----')[0] + '// ---- نهاية n8n/premature-confirm.js ----'
    const run = (created: boolean, input: string) => new Function('$', 'text', `${body}\nreturn text;`)(
      () => ({ isExecuted: created }), input,
    )
    expect(run(false, MSG_1328)).toContain('هذا ملخص طلبك')
    expect(run(true, MSG_1328)).toBe(MSG_1328)
  })
})

const RETURN = 'return { json: { ...$json, output: text } };'
