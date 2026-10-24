import { describe, expect, it } from 'vitest'
import { fixSingleProductAsk } from '@/n8n/single-product.js'
import { orderContextHint, singleProductNote, singleProductOf } from '@/n8n/order-context-hint.js'

const WASHER = 'غسالة أوتوماتيك أل جي 8 كيلو'

describe('fixSingleProductAsk — منتج واحد ما يتسأل عنه', () => {
  it('رد التنفيذ 1565 بالضبط', () => {
    const reply = `تدلل، شنو المنتج الي رايد تحجزه وشكم وحدة؟ عدنا ${WASHER}.\nSTAGE: 1`
    expect(fixSingleProductAsk(reply, WASHER)).toBe(`تدلل، ${WASHER}. شكم وحدة تريد؟\nSTAGE: 1`)
  })

  it.each([
    ['يا منتج تريد وشكم وحدة؟', `تدلل، ${WASHER}. شكم وحدة تريد؟`],
    ['أي منتج تحب تطلب؟', `تدلل، ${WASHER}. شكم وحدة تريد؟`],
    ['شنو المنتج؟', `تدلل، ${WASHER}. شكم وحدة تريد؟`],
    ['شنو هو المنتج الي تريده؟', `تدلل، ${WASHER}. شكم وحدة تريد؟`],
  ])('يستبدل سؤال المنتج: %s', (ask, expected) => {
    expect(fixSingleProductAsk(ask, WASHER)).toBe(expected)
  })

  it('جملة «شكم وحدة؟» المنفصلة ما تتكرر', () => {
    const reply = `شنو المنتج الي تريده؟\nوشكم وحدة؟\nSTAGE: 1`
    expect(fixSingleProductAsk(reply, WASHER)).toBe(`تدلل، ${WASHER}. شكم وحدة تريد؟\nSTAGE: 1`)
  })

  it('جملة «عدنا <المنتج>.» القصيرة بعد الاستبدال تتشال', () => {
    expect(fixSingleProductAsk(`أي منتج تريد؟ عدنا ${WASHER}.`, WASHER)).toBe(`تدلل، ${WASHER}. شكم وحدة تريد؟`)
  })

  it('جمل ثانية مفيدة بالرد تبقى (السعر، التوصيل)', () => {
    const reply = `سعرها 350,000 دينار.\nشنو المنتج الي رايد تحجزه؟\nالتوصيل لبغداد 5,000.\nSTAGE: 1`
    const out = fixSingleProductAsk(reply, WASHER)
    expect(out).toContain('سعرها 350,000 دينار.')
    expect(out).toContain('التوصيل لبغداد 5,000.')
    expect(out).toContain(`تدلل، ${WASHER}. شكم وحدة تريد؟`)
    expect(out).not.toContain('شنو المنتج')
    expect(out.endsWith('STAGE: 1')).toBe(true)
  })

  it.each([
    `عدنا ${WASHER} بسعر 350,000 دينار.\nSTAGE: 1`,
    'شنو المنتجات الي عدنا؟ عدنا غسالة وبس.', // «المنتجات» جمع: وصف مو سؤال اختيار
    'تدلل، شكم وحدة تريد؟',
    'شنو لونها؟',
    '',
  ])('رد ما يسأل عن المنتج يبقى مثل ما هو: %s', (reply) => {
    expect(fixSingleProductAsk(reply, WASHER)).toBe(reply)
  })

  it('بدون اسم منتج ما يغيّر شي', () => {
    expect(fixSingleProductAsk('شنو المنتج؟', '')).toBe('شنو المنتج؟')
  })
})

describe('singleProductOf / singleProductNote', () => {
  it('منتج واحد فقط', () => {
    expect(singleProductOf(WASHER)).toBe(WASHER)
    expect(singleProductOf(`${WASHER}، تيشيرت أسود`)).toBe('')
    expect(singleProductOf('')).toBe('')
    expect(singleProductOf(undefined)).toBe('')
  })

  it('يطلع التنبيه لما الزبون يريد يطلب، وبس بمتجر منتج واحد', () => {
    const buy = { productNames: WASHER, message: 'تمام احجزلي الطلب' }
    expect(singleProductNote(buy)).toContain(`«${WASHER}»`)
    expect(singleProductNote(buy)).toContain('ممنوع «عدنا منتجات»')
    expect(singleProductNote({ ...buy, productNames: `${WASHER}، تيشيرت` })).toBe('')
    expect(singleProductNote({ productNames: WASHER, message: 'شكد السعر؟' })).toBe('')
    expect(singleProductNote({ productNames: WASHER, message: 'هلا', needsItems: true })).not.toBe('')
  })
})

describe('«قطعة / وحدة / حبة» = العدد 1 (التنفيذ 1573)', () => {
  it.each(['رايد قطعه من منتجكم', 'اريد وحدة', 'اريد حبة من الغسالة؟', 'ابي قطعة.'])('يطلع تنبيه العدد = 1: %s', (message) => {
    const note = singleProductNote({ productNames: WASHER, message })
    expect(note).toContain('العدد = 1')
    expect(note).toContain('ممنوع تسأله شكم وحدة')
  })

  it.each(['اريد 3 قطع', 'اريد قطعتين', 'اريد غسالة', 'رايد اطلب'])('بدون «قطعة» لحالها ← يسأل العدد مثل قبل: %s', (message) => {
    const note = singleProductNote({ productNames: WASHER, message })
    expect(note).not.toContain('العدد = 1')
    expect(note).toContain('اسأله عن العدد بس')
  })

  it('متجر بأكثر من منتج ← ما يتأثر', () => {
    expect(singleProductNote({ productNames: `${WASHER}، تيشيرت`, message: 'رايد قطعه من منتجكم' })).toBe('')
  })
})

describe('orderContextHint — منتج واحد', () => {
  it('«تمام احجزلي الطلب» ويا منتج واحد ← تنبيه المنتج الوحيد يلغي سؤال «يا منتج»', () => {
    const r = orderContextHint({
      combinedMessage: 'تمام احجزلي الطلب',
      sessionData: {},
      recentMessages: ['تمام احجزلي الطلب', 'شكد نسبه الخصم و شكد يصير السعر', 'شكد سعر الغسالة؟'],
      productNames: WASHER,
    })
    expect(r.orderContext.needsItems).toBe(true)
    expect(r.orderContext.singleProduct).toBe(WASHER)
    expect(r.hint).toContain('يلغي أي تعليمة ثانية')
    expect(r.hint.lastIndexOf('المتجر عنده منتج واحد')).toBeGreaterThan(r.hint.indexOf('يا منتج يريد'))
  })

  it('متجر بأكثر من منتج ← ما يتغيّر شي', () => {
    const r = orderContextHint({ combinedMessage: 'ثبتلي الطلب', sessionData: {}, recentMessages: [], productNames: `${WASHER}، تيشيرت` })
    expect(r.orderContext.singleProduct).toBe('')
    expect(r.hint).not.toContain('المتجر عنده منتج واحد')
  })

  it('بدون productNames ← نفس السلوك القديم', () => {
    const r = orderContextHint({ combinedMessage: 'هلا', sessionData: {}, recentMessages: [] })
    expect(r.hint).toBe('')
  })
})
