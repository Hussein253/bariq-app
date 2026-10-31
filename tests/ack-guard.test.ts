import { describe, expect, it } from 'vitest'
import { dropRepeatedConfirm, isAckMessage } from '@/n8n/ack-guard.js'
import { CHANNELS, patchWorkflow } from '@/n8n/ack-guard.mjs'

const ASKED_COLOR = 'وتأكدلي إذا تبقى اللون الأحمر.'
const ASKED_COLOR_OK = 'وتأكدلي بعد إذا اللون الأحمر مضبوط.'

describe('isAckMessage — الموافقة بكل صيغها بلا سؤال', () => {
  it.each([
    'تمام',
    'تمااام',
    'تم',
    'اوكي',
    'ok',
    'أكيد',
    'إي',
    'اعجاب',
    '👍',
    '(ستيكر 👍)',
    'تمام 👍',
    'اوك تمام',
  ])('«%s» موافقة', (said) => {
    expect(isAckMessage(said)).toBe(true)
  })

  it.each([
    'تمام؟',
    'تمام بس غير العنوان',
    'شكد التوصيل',
    'احجزلي 3 قطع',
    '',
    '   ',
  ])('«%s» مو موافقة بس', (said) => {
    expect(isAckMessage(said)).toBe(false)
  })
})

describe('dropRepeatedConfirm — ما يعيد سؤال التأكيد بعد الموافقة', () => {
  it('ستيكر 👍 بعد «وتأكدلي إذا تبقى اللون الأحمر»: الجملة المكررة تنشال، والسؤال الجديد يبقى', () => {
    const text = 'تدلل عزيزي، شكم قطعة هودي شتوي تريد؟ وتأكدلي إذا تبقى اللون الأحمر.\nSTAGE: 0'
    expect(dropRepeatedConfirm(text, { said: '(ستيكر 👍)', lastBot: ASKED_COLOR })).toBe('تدلل عزيزي، شكم قطعة هودي شتوي تريد؟\nSTAGE: 0')
  })

  it('ما بقى غير السؤال المكرر: يرد «تمام عزيزي 🌷» بدل ما يعيده', () => {
    expect(dropRepeatedConfirm(`${ASKED_COLOR_OK}\nSTAGE: 0`, { said: 'تمام', lastBot: ASKED_COLOR_OK }))
      .toBe('تمام عزيزي 🌷\nSTAGE: 0')
  })

  it('تمام بعد «وتأكدلي إذا تبقى اللون الأحمر»، والرد بصياغة ثانية «ونعتمد اللون الأحمر، تمام؟» (التنفيذ 3127): تنشال، والسؤال عن الكمية يبقى', () => {
    const text = 'تدلل عزيزي، شكم قطعة هودي شتوي تريد؟ ونعتمد اللون الأحمر، تمام؟\nSTAGE: 0'
    expect(dropRepeatedConfirm(text, { said: 'تمام', lastBot: ASKED_COLOR })).toBe('تدلل عزيزي، شكم قطعة هودي شتوي تريد؟\nSTAGE: 0')
  })

  it('الرد يسأل عن شي ثاني غير تأكيد التفاصيل: يبقى كما هو', () => {
    const text = 'تمام عزيزي، شنو اسمك الثلاثي؟\nSTAGE: 0'
    expect(dropRepeatedConfirm(text, { said: 'تمام', lastBot: ASKED_COLOR })).toBe(text)
  })

  it('الرد ما يعيد السؤال: يبقى كما هو', () => {
    const text = 'تمام عزيزي، شكم قطعة تريد؟\nSTAGE: 0'
    expect(dropRepeatedConfirm(text, { said: 'تمام', lastBot: ASKED_COLOR })).toBe(text)
  })

  it('الزبون ما وافق (كلام جديد): ما ينلمس', () => {
    const text = `${ASKED_COLOR}`
    expect(dropRepeatedConfirm(text, { said: 'احجزلي وحدة', lastBot: ASKED_COLOR })).toBe(text)
  })

  it('آخر رد للبوت ما فيه سؤال تأكيد: ما ينلمس', () => {
    const text = `${ASKED_COLOR}`
    expect(dropRepeatedConfirm(text, { said: 'تمام', lastBot: 'تم عزيزي، شنو تحب تطلب؟' })).toBe(text)
  })

  it('سطر STAGE يبقى كما هو', () => {
    expect(dropRepeatedConfirm(`${ASKED_COLOR}\nSTAGE: 1`, { said: '👍', lastBot: ASKED_COLOR }))
      .toBe('تمام عزيزي 🌷\nSTAGE: 1')
  })
})

const OC_CODE = [
  'const ITEM_STATED = /تم تاكيد طلب|طلب[كچ] هسه صار|تفاصيل طلب[كچ]/;',
  'const AFFIRM = new Set([',
  "  'كمل', 'نكمل', 'صح', 'صحيح', 'خلص',",
  ']);',
  'function confirmedOnce({ combinedMessage = \'\', botReplies = [] } = {}) {',
  '  return tokens.some((t) => AFFIRM.has(t));',
  '  const itemsFromBot = threadActive && itemsStatedByBot(lastBotNorm);',
  '}',
].join('\n')
const GUARD_CODE = 'const x = 1;\ntext = text;\nreturn { json: { ...$json, output: text } };'
const wf = () => ({
  id: CHANNELS.messenger.id,
  name: 'test',
  nodes: [
    { name: 'Order Context Hint', parameters: { jsCode: OC_CODE } },
    { name: 'Drop Repeated Blocks', parameters: { jsCode: GUARD_CODE } },
  ],
  connections: {},
})

describe('patchWorkflow — الموافقة والحارس بالعقد', () => {
  it('يزرع الحارس، ويوسّع الموافقة، وآمن للتكرار', () => {
    const w = wf()
    expect(patchWorkflow(w, CHANNELS.messenger)).toHaveLength(3)
    const oc = w.nodes[0].parameters.jsCode as string
    expect(oc).toContain('|ملخص طلب[كچ]/;')
    expect(oc).toContain('const itemsFromBot = (threadActive && itemsStatedByBot(lastBotNorm)) || (() => {')
    expect(oc).toContain('if (ALREADY_PLACED.test(n)) return false;')
    expect(oc).toContain("'تم', 'اعجاب', 'لايك', 'ستيكر',")
    expect(oc).toContain('/[👍👌✅💯🙏❤🥰😊🌷👏]/u.test(combinedMessage)')
    const guard = w.nodes[1].parameters.jsCode as string
    expect(guard).toContain('n8n/ack-guard.js')
    expect(guard).toContain('dropRepeatedConfirm(text, { said, lastBot })')
    expect(guard).not.toContain('export function')
    expect(patchWorkflow(w, CHANNELS.messenger)).toEqual([])
  })
})
