import { describe, expect, it } from 'vitest'
import {
  deliveryFeeFor,
  fixSummaryMoney,
  formatIqd,
  orderDiscountPct,
  parseDeliveryFees,
  summaryQuantity,
  unitListPrice,
} from '@/n8n/order-money.js'
import { CHANNELS, guardBlock, patchWorkflow } from '@/n8n/order-money.mjs'

// بيانات «تحديد التاجر» بالتنفيذ 3155 (الطلب 51)
const CATALOG = [
  { name: 'هودي شتوي', color: 'اسود', size: 'small/large/x-large/m', price_iqd: 25000 },
  { name: 'هودي شتوي', color: 'ابيض', size: 'S / M / L / XL / 2XL', price_iqd: 25000 },
  { name: 'هودي شتوي', color: 'احمر', size: 'S / M / L / XL / 2XL', price_iqd: 25000 },
]
const FEES = 'أجور التوصيل: 3,000 دينار لبغداد، و5,000 دينار لباقي المحافظات.'
const MERCHANT = { first_order_discount_pct: '15.00', customer_prior_orders: '1', customer_discounted_orders: '0' }
const MESSENGER = { catalog: CATALOG, deliveryFees: FEES, discountPct: orderDiscountPct(MERCHANT) }

// رد التثبيت بالتنفيذ 3155: الزبون انقال له 80,000، والطلب انحفظ 66,750 (3 × 21,250 + 3,000)
const PLACED_51 = 'تم عزيزي، تم تثبيت طلبك: ٣ قطع هودي شتوي أحمر (قياس دبل اكس لارج). \n\n'
  + 'تم اعتماد عنوانك: بغداد، العامرية، شارع العمل الشعبي قرب اسواق أثير - العامرية - العامرية. ورقم الهاتف هو 07847544021.\n\n'
  + 'أجور التوصيل هي 5,000 دينار، والمجموع الكلي المطلوب كاش عند الاستلام هو 80,000 دينار.\n\n'
  + 'المندوب يتصل بيك قبل لا يوصل.'
// ملخص التنفيذ 3148 (قبل التثبيت)
const SUMMARY_3148 = 'تمام عزيزي، هذا ملخص طلبك: ٣ قطع هودي شتوي أحمر (قياس دبل اكس لارج). نعتمد عنوانك السابق بـ بغداد، العامرية. '
  + 'أجور التوصيل هي 5,000 دينار. المجموع الكلي المطلوب كاش عند الاستلام هو 80,000 دينار. أثبّتلك الطلب؟\nSTAGE: 3'

describe('أجزاء الحساب — نفس قواعد القاعدة', () => {
  it('formatIqd وparseDeliveryFees', () => {
    expect(formatIqd(66750)).toBe('66,750')
    expect(formatIqd(3000)).toBe('3,000')
    expect(formatIqd(250)).toBe('250')
    expect(parseDeliveryFees(FEES)).toEqual({ base: 'بغداد', local: 3000, other: 5000 })
    expect(parseDeliveryFees('أجور التوصيل بعدها ما محددة بإعدادات المتجر')).toBeNull()
  })

  it('نسبة الخصم = حقل discount_pct بـ create_order: ما أخذ خصم قبل ← 15، أخذ ← 0', () => {
    expect(orderDiscountPct(MERCHANT)).toBe(15)
    expect(orderDiscountPct({ ...MERCHANT, customer_discounted_orders: '1' })).toBe(0)
    expect(orderDiscountPct({ first_order_discount_pct: '0', customer_prior_orders: '0' })).toBe(0)
  })

  it('أجرة التوصيل حسب المحافظة بالرد: بغداد ← 3,000، البصرة ← 5,000، ماكو أو اثنين ← null', () => {
    const fees = parseDeliveryFees(FEES)
    expect(deliveryFeeFor(PLACED_51, fees)).toBe(3000)
    expect(deliveryFeeFor('العنوان: البصرة، الجزائر قرب المستشفى', fees)).toBe(5000)
    expect(deliveryFeeFor('العنوان: الموصل، حي الزهور', fees)).toBe(5000)
    expect(deliveryFeeFor('التوصيل بالبصرة', fees)).toBe(5000)
    expect(deliveryFeeFor('نعتمد عنوانك السابق بـ بغداد، الكرادة', fees)).toBe(3000)
    expect(deliveryFeeFor('مطعم بغدادي قرب الجامعة', fees)).toBeNull()
    expect(deliveryFeeFor('العنوان: شارع فلسطين', fees)).toBeNull()
    expect(deliveryFeeFor('من بغداد للبصرة', fees)).toBeNull()
    expect(deliveryFeeFor(PLACED_51, null)).toBeNull()
  })

  it('العدد: بند واحد بس', () => {
    expect(summaryQuantity(PLACED_51)).toBe(3)
    expect(summaryQuantity('قطعتين هودي أسود')).toBe(2)
    expect(summaryQuantity('٢ قطعة أسود و١ قطعة أبيض')).toBeNull()
    expect(summaryQuantity('هودي شتوي أحمر')).toBeNull()
  })

  it('سعر القطعة: سعر واحد بالكتالوج، أو للمنتج، أو للونه', () => {
    expect(unitListPrice(PLACED_51, CATALOG)).toBe(25000)
    const mixed = [{ name: 'هودي', color: 'اسود', price_iqd: 25000 }, { name: 'هودي', color: 'احمر', price_iqd: 30000 }]
    expect(unitListPrice('٢ قطعة هودي أحمر', mixed)).toBe(30000)
    expect(unitListPrice('٢ قطعة هودي', mixed)).toBeNull()
  })
})

describe('fixSummaryMoney — مبلغ الملخص = مبلغ الطلب المحفوظ', () => {
  it('الطلب 51: التوصيل 3,000 والمجموع 66,750، ويذكر خصم أول طلب', () => {
    expect(fixSummaryMoney(PLACED_51, MESSENGER)).toBe(PLACED_51
      .replace('أجور التوصيل هي 5,000 دينار، والمجموع الكلي المطلوب كاش عند الاستلام هو 80,000 دينار.',
        'خصم أول طلب 15%: سعر القطعة 21,250 دينار بدل 25,000. أجور التوصيل هي 3,000 دينار، والمجموع الكلي المطلوب كاش عند الاستلام هو 66,750 دينار.'))
  })

  it('ملخص قبل التثبيت (التنفيذ 3148): نفس التصحيح، وسطر STAGE يبقى', () => {
    const out = fixSummaryMoney(SUMMARY_3148, MESSENGER)
    expect(out).toContain('خصم أول طلب 15%: سعر القطعة 21,250 دينار بدل 25,000. أجور التوصيل هي 3,000 دينار.')
    expect(out).toContain('المجموع الكلي المطلوب كاش عند الاستلام هو 66,750 دينار.')
    expect(out.endsWith('\nSTAGE: 3')).toBe(true)
  })

  it('واتساب بلا خصم: 3 × 25,000 + 3,000 = 78,000 وبدون سطر خصم', () => {
    const out = fixSummaryMoney(PLACED_51, { catalog: CATALOG, deliveryFees: FEES, discountPct: 0 })
    expect(out).toContain('أجور التوصيل هي 3,000 دينار، والمجموع الكلي المطلوب كاش عند الاستلام هو 78,000 دينار.')
    expect(out).not.toContain('خصم')
  })

  it('«سعر القطع» (مجموع البنود) يتصحح ويا المجموع', () => {
    const text = '٣ قطع هودي شتوي أحمر، بغداد. سعر القطع 75,000 دينار، أجور التوصيل 3,000 دينار، المجموع الكلي 78,000 دينار. أثبّتلك الطلب؟'
    const out = fixSummaryMoney(text, MESSENGER)
    expect(out).toContain('سعر القطع 63,750 دينار')
    expect(out).toContain('المجموع الكلي 66,750 دينار')
  })

  it('الأرقام صحيحة أصلاً: ما يتغير شي، والتصحيح مرتين نفس النتيجة', () => {
    const fixed = fixSummaryMoney(PLACED_51, MESSENGER)
    expect(fixSummaryMoney(fixed, MESSENGER)).toBe(fixed)
  })

  it('ما يقدر يحسب بثقة: يخلي الرد مثل ما هو', () => {
    const two = '٢ قطعة أسود و١ قطعة أبيض، بغداد. أجور التوصيل 3,000 دينار، المجموع الكلي 78,000 دينار.'
    expect(fixSummaryMoney(two, MESSENGER)).toBe(two)
    expect(fixSummaryMoney('عدنا هودي شتوي بـ 25,000 دينار', MESSENGER)).toBe('عدنا هودي شتوي بـ 25,000 دينار')
    const noPlace = '٣ قطع هودي شتوي أحمر. المجموع الكلي 80,000 دينار.'
    expect(fixSummaryMoney(noPlace, MESSENGER)).toBe(noPlace)
  })
})

describe('patchWorkflow — الحارس بآخر عقدة', () => {
  const GUARD = 'let text = $json.output;\ntext = text;\nreturn { json: { ...$json, output: text } };'
  const wf = () => ({
    id: CHANNELS.messenger.id,
    name: 'test',
    nodes: [
      { name: 'تحديد التاجر', parameters: {} },
      { name: 'Drop Repeated Blocks', parameters: { jsCode: GUARD } },
    ],
    connections: {},
  })

  it('ماسنجر بخصم، وواتساب بدون، وآمن للتكرار', () => {
    const m = wf()
    expect(patchWorkflow(m, CHANNELS.messenger)).toHaveLength(1)
    const code = m.nodes[1].parameters.jsCode as string
    expect(code).toContain('discountPct: orderDiscountPct(m)')
    expect(code).toContain('function fixSummaryMoney(text')
    expect(code).not.toContain('export ')
    expect(code.indexOf('n8n/order-money.js')).toBeLessThan(code.indexOf('return { json: { ...$json, output: text } };'))
    expect(patchWorkflow(m, CHANNELS.messenger)).toEqual([])
    expect(guardBlock(CHANNELS.whatsapp)).toContain('discountPct: 0 })')
  })

  it('الكود المزروع يشتغل: يصحح رد الطلب 51 داخل العقدة', () => {
    const block = guardBlock(CHANNELS.messenger)
    const node = new Function('$', 'text', `${block}\nreturn text;`)
    const $ = () => ({ first: () => ({ json: { ...MERCHANT, catalog: CATALOG, delivery_fees: FEES } }) })
    expect(node($, PLACED_51)).toContain('المجموع الكلي المطلوب كاش عند الاستلام هو 66,750 دينار')
  })
})
