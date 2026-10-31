import { describe, expect, it } from 'vitest'
import { pendingSummary, withPendingSummary } from '@/n8n/order-summary.js'
import { CHANNELS, patchWorkflow } from '@/n8n/order-summary.mjs'

// نفس تعابير «Order Context Hint» (بعد norm: بدون همزات، والتاء المربوطة هاء، والألف المقصورة ياء)
const norm = (s: string) => String(s ?? '').replace(/[ً-ٰٟـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
const SHOWED_TOTAL = /المجموع الكلي|كاش عند الاستلام|اثبتلك الطلب/
const ALREADY_PLACED = /رقم الطلب|تم تثبيت|تثبت بنجاح|طلبك تثبت|طلبك انحجز|المندوب يتصل/
const opts = { norm, showedTotal: SHOWED_TOTAL, placed: ALREADY_PLACED }

const SUMMARY = 'تمام عزيزي، هذا ملخص طلبك: ٣ قطع هودي شتوي أحمر (قياس دبل اكس لارج). أجور التوصيل هي 5,000 دينار. المجموع الكلي المطلوب كاش عند الاستلام هو 80,000 دينار. أثبّتلك الطلب؟'
// ردود البوت قبل «تمام» بالتنفيذ 3134، الأحدث أول
const RUN_3134 = ['ونعتمد اللون الأحمر، تمام؟', 'وتأكدلي إذا تبقى اللون الأحمر.', 'وتأكدلي بعد إذا اللون الأحمر مضبوط.', SUMMARY]

describe('pendingSummary — آخر ملخص ما تثبّت بعده', () => {
  it('التنفيذ 3134: الملخص قبل ثلاث أسئلة تأكيد يبقى هو الي ينوافق عليه', () => {
    expect(pendingSummary(RUN_3134, opts)).toBe(SUMMARY)
  })

  it('الطلب تثبّت بعد الملخص: ماكو ملخص معلّق', () => {
    expect(pendingSummary(['تم تثبيت طلبك عزيزي، رقم الطلب 51 🌷', SUMMARY], opts)).toBe('')
  })

  it('ماكو ملخص بالردود: فاضي', () => {
    expect(pendingSummary(['عدنا هودي شتوي', 'هلا بيك نورتنا 🌷'], opts)).toBe('')
  })

  it('آخر رد هو الملخص نفسه: يرجعه (السلوك القديم)', () => {
    expect(pendingSummary([SUMMARY], opts)).toBe(SUMMARY)
  })
})

describe('withPendingSummary — الملخص المعلّق ينضاف بالآخر إذا طلع من آخر 4 ردود', () => {
  const four = ['شنو رايد بعد؟', ...RUN_3134.slice(0, 3)]

  it('الملخص مو بالأربعة: ينضاف بالآخر، والأحدث يبقى أول', () => {
    const list = withPendingSummary(four, SUMMARY)
    expect(list).toEqual([...four, SUMMARY])
    expect(pendingSummary(list, opts)).toBe(SUMMARY)
  })

  it('الملخص موجود بينها، أو ماكو ملخص: ما يتكرر وما يتغير شي', () => {
    expect(withPendingSummary(RUN_3134, SUMMARY)).toEqual(RUN_3134)
    expect(withPendingSummary(four, null)).toEqual(four)
    expect(withPendingSummary(null, '')).toEqual([])
  })
})

const OC_CODE = [
  "const SHOWED_TOTAL = /المجموع الكلي|كاش عند الاستلام|اثبتلك الطلب/;",
  'const ALREADY_PLACED = /رقم الطلب|تم تثبيت|تثبت بنجاح|طلبك تثبت|طلبك انحجز|المندوب يتصل/;',
  "function confirmedOnce({ combinedMessage = '', botReplies = [] } = {}) {",
  '  const msg = norm(combinedMessage);',
  "  const last = norm(Array.isArray(botReplies) ? botReplies[0] : '');",
  '}',
  "const CONFIRM_ONCE_HINT ='[تأكيد الزبون واصل: رسالته هذي موافقة صريحة على ردك السابق (البنود والمبلغ الكلي)، وهذا هو التأكيد الوحيد المطلوب.';",
  'const botReplies = (() => {',
  '  try {',
  '    let r = $(NODES.bot).first().json.replies;',
  "    return Array.isArray(r) ? r.map((x) => String(x || '')) : [];",
  '  } catch (e) { return []; }',
  '})();',
].join('\n')
const QUERY = "SELECT coalesce(json_agg(message_text ORDER BY created_at DESC), '[]'::json) AS replies,\n       max(created_at) AS last_reply_at\nFROM (SELECT 1) t;"
const wf = () => ({
  id: CHANNELS.messenger.id,
  name: 'test',
  nodes: [
    { name: 'Order Context Hint', parameters: { jsCode: OC_CODE } },
    { name: 'Load Recent Bot Replies', parameters: { query: QUERY } },
  ],
  connections: {},
})

describe('patchWorkflow — الاستعلام وسياق الطلب', () => {
  it('يضيف عمود الملخص المعلّق، ويخلي الموافقة على آخر ملخص، وآمن للتكرار', () => {
    const w = wf()
    expect(patchWorkflow(w, CHANNELS.messenger)).toHaveLength(2)
    const code = w.nodes[0].parameters.jsCode as string
    const query = w.nodes[1].parameters.query as string
    expect(query).toContain('AS pending_summary')
    expect(query).toContain("s.created_at > now() - interval '6 hours'")
    expect(code).toContain('function pendingSummary(botReplies')
    expect(code).not.toContain('export function')
    expect(code).toContain('const last = norm(pendingSummary(botReplies, { norm, showedTotal: SHOWED_TOTAL, placed: ALREADY_PLACED }));')
    expect(code).toContain('return withPendingSummary(r, $(NODES.bot).first().json.pending_summary);')
    expect(code).toContain('موافقة صريحة على آخر ملخص عرضته')
    expect(code.indexOf('function pendingSummary')).toBeGreaterThan(code.indexOf('const ALREADY_PLACED'))
    expect(patchWorkflow(w, CHANNELS.messenger)).toEqual([])
  })
})
