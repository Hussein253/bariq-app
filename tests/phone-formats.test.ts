import { describe, expect, it } from 'vitest'
import { iraqiPhone, knownPhone } from '@/n8n/phone-formats.js'
import { CHANNELS, patchWorkflow } from '@/n8n/phone-formats.mjs'

describe('iraqiPhone — الرقم العراقي بأي صيغة يصير 07 (11 رقم)', () => {
  it.each([
    ['07847544021', '07847544021'],
    ['0784 754 4021', '07847544021'],
    ['+964 784 754 4021', '07847544021'],
    ['00964-784-754-4021', '07847544021'],
    ['964 784 754 4021', '07847544021'],
    ['784 754 4021', '07847544021'],
    ['+964 0784 754 4021', '07847544021'],
    ['رقمي ٠٧٨٤٧٥٤٤٠٢١ شكراً', '07847544021'],
    ['رقمي +٩٦٤٧٨٤٧٥٤٤٠٢١', '07847544021'],
  ])('«%s» ← %s', (input, expected) => {
    expect(iraqiPhone(input)).toBe(expected)
  })

  it.each([
    'عندي 3 قطع',
    'رقمي 0784754402',
    'السعر 25000',
    '',
  ])('«%s» ما فيه رقم موبايل', (input) => {
    expect(iraqiPhone(input)).toBe('')
  })
})

const PROMPT_OLD = 'رقم موبايل عراقي 11 مرتبة يبدي بـ 07 (أو +964)'
const GATE_CODE = `const PHONE_RE = /x/;
const PHONE_WORD = /رقم (?:ال)?(?:هاتف|موبايل|تلفون)/;
const CONFIRM_Q = /q/u;
const stageOf = (s) => 0;
const ran = (n) => false;
const userPrompt = '';
const toLatin = (s) => s;
const text = '';
  const given = (userPrompt.match(/contact_phone\\)\\s*:\\s*(0\\d{10})/) || [])[1];
const x = 'رقم الهاتف الي وصلني مو كامل أو غلط؛ رقم الموبايل لازم يكون 11 رقم ويبدي بـ 07. ' + 'y' + ' مرة ثانية حتى أثبّت الطلب.';
const y = (fem ? 'اكتبي رقم موبايلچ' : 'اكتب رقم موبايلك') + ' (يبدي بـ 07) حتى أثبّت الطلب.';
if (stageOf(text) !== 4 && !/order_completed/i.test(text) && CONFIRM_Q.test(text) && !PHONE_RE.test(toLatin(text))) {
  return 1;
}
return { json: { ...$json, output: text } };`

const wf = (systemMessage: string, jsCode: string) => ({
  id: CHANNELS.messenger.id,
  name: 'test',
  nodes: [
    { name: 'Iraqi Store AI Agent', parameters: { options: { systemMessage } } },
    { name: 'Clean Agent Reply', parameters: { jsCode } },
    { name: 'Build User Prompt', parameters: {} },
    { name: 'Load Recent Customer Messages', parameters: {} },
    { name: 'Load Previous Address', parameters: {} },
  ],
  connections: {},
})

describe('patchWorkflow — سطر الرقم وبوابة الرقم (ماسنجر)', () => {
  it('يزرع المولّد ويغيّر صياغة الرقم، وآمن للتكرار', () => {
    const w = wf(`x ${PROMPT_OLD} y`, GATE_CODE)
    const first = patchWorkflow(w, CHANNELS.messenger)
    expect(first).toHaveLength(2)
    const code = w.nodes[1].parameters.jsCode as string
    expect(code).toContain('n8n/phone-formats.js')
    expect(code).toContain('knownPhone({ current: customerText')
    expect(code).not.toContain('يبدي بـ 07) حتى')
    expect(code).toContain('مثلاً 07... أو +964...')
    expect(code).toContain("!ran('create_order') && CONFIRM_Q.test(text)")
    expect((w.nodes[0].parameters.options as { systemMessage: string }).systemMessage).not.toContain(PROMPT_OLD)
    expect(patchWorkflow(w, CHANNELS.messenger)).toEqual([])
  })

  it('الكود المزروع يحتوي دالة الرقم بالمولّد، والمكالمة بعدها بنفس الصيغة', () => {
    const w = wf(`x ${PROMPT_OLD} y`, GATE_CODE)
    patchWorkflow(w, CHANNELS.messenger)
    const code = w.nodes[1].parameters.jsCode as string
    expect(code).not.toContain('export function')
    expect(code).toContain('function iraqiPhone(text)')
    expect(code).toContain('function knownPhone(')
  })
})

describe('knownPhone — الرقم الي انكتب قبل ما ينطلب مرة ثانية (التنفيذ 3141)', () => {
  it('الرقم بالرسالة الحالية يكفي', () => {
    expect(knownPhone({ current: '+964 784 754 4021', recent: [], previous: '' })).toBe('07847544021')
  })

  it('الرسالة الحالية بلا رقم: يرجع للرسائل السابقة (الأحدث أول)', () => {
    expect(knownPhone({ current: 'أكدلي الحجز', recent: ['تمام', '0784 754 4021', 'ثبتلي'], previous: '' })).toBe('07847544021')
  })

  it('ماكو رقم بالرسائل: يرجع لرقم الطلب السابق', () => {
    expect(knownPhone({ current: 'تمام', recent: ['عدنا هودي'], previous: '07731048129' })).toBe('07731048129')
  })

  it('ماكو رقم بأي مكان: فاضي، وأكثر من رقم بالرسائل: الأحدث', () => {
    expect(knownPhone({ current: 'تمام', recent: ['عندي 3 قطع'], previous: '' })).toBe('')
    expect(knownPhone({ current: '07800000000', recent: ['07847544021'], previous: '' })).toBe('07800000000')
    expect(knownPhone({})).toBe('')
  })
})
