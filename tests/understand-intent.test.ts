import { describe, expect, it } from 'vitest'
import { CHANNELS, INTENT_HEADING, INTENT_RULE, patchWorkflow } from '@/n8n/understand-intent.mjs'

const PROMPT = '=# الهوية\nأنت المساعد الآلي.\n\n# الشكر\n- إذا الزبون شكر…'
const wf = (systemMessage: string) => ({
  nodes: [{ name: CHANNELS.messenger.agent, parameters: { options: { systemMessage } } }],
})
const sys = (w: ReturnType<typeof wf>) => w.nodes[0].parameters.options.systemMessage

describe('understand-intent — قاعدة «افهم قصد الزبون» بأول البرومت (2026-10-31)', () => {
  it('تنزرع قبل «# الهوية» وبعد علامة التعبير «=»', () => {
    const w = wf(PROMPT)
    expect(patchWorkflow(w, CHANNELS.messenger)).toHaveLength(1)
    expect(sys(w)).toBe('=' + INTENT_RULE + PROMPT.slice(1))
  })

  it('آمنة للتكرار، والنسخة القديمة من القسم تتبدل بالحالية', () => {
    const w = wf(PROMPT)
    patchWorkflow(w, CHANNELS.messenger)
    expect(patchWorkflow(w, CHANNELS.messenger)).toEqual([])
    const old = wf('=' + INTENT_HEADING + '\n- قديم\n\n' + PROMPT.slice(1))
    expect(patchWorkflow(old, CHANNELS.messenger)).toHaveLength(1)
    expect(sys(old)).toBe('=' + INTENT_RULE + PROMPT.slice(1))
  })

  it('القاعدة تغطي «You\'re welcome» والترحيب، وتستثني الموافقة على سؤال البوت', () => {
    expect(INTENT_RULE).toContain("You're welcome")
    expect(INTENT_RULE).toContain('مرحبا بك')
    expect(INTENT_RULE).toContain('أثبّتلك الطلب؟')
  })

  it('قاعدة القياس المناسب: قياس واحد بالاسم، جدول التاجر أول، ودليل عام بالأوزان', () => {
    expect(INTENT_RULE).toContain('القياس المناسب')
    expect(INTENT_RULE).toContain('اعتمده حرفياً')
    expect(INTENT_RULE).toContain('دبل اكس لارج 90–105')
    expect(INTENT_RULE).toContain('ممنوع تعدد كل القياسات')
  })

  it('الدفء والتسويق العاطفي: جملة «شكراً لاختيارك» بعد تثبيت الطلب بس، ووردة واحدة', () => {
    expect(INTENT_RULE).toContain('الدفء والتسويق العاطفي')
    expect(INTENT_RULE).toContain('شكراً لاختيارك')
    expect(INTENT_RULE).toContain('لا تحط «شكراً لاختيارك» بالملخص قبل ما ينثبت الطلب')
  })

  it('برومت بلا «# الهوية» ما ينلمس', () => {
    expect(() => patchWorkflow(wf('=بلا عنوان'), CHANNELS.messenger)).toThrow()
  })
})
