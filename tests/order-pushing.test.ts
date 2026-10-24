import { describe, expect, it } from 'vitest'
import { stripOrderPushing } from '@/n8n/order-pushing.js'
import { BROWSING_HINT, isBrowsing, orderContextHint } from '@/n8n/order-context-hint.js'

// رد البوت الفعلي على بصمة «عندك منتجات غسالة؟» (ماسنجر 2026-10-24، التنفيذ 864)
const EXEC_864_REPLY = [
  'عدنا غسالة أوتوماتيك أل جي 8 كيلو. تمام هيج؟',
  '',
  'ونعتمد عنوانك السابق بـ بغداد، العامرية، شارع العمل الشعبي قرب اسواق أثير - العامرية لو تغير؟',
  'STAGE: 2',
].join('\n')

describe('stripOrderPushing — الاستفسار جواب وبس', () => {
  it('رد التنفيذ 864: يشيل «تمام هيج؟» وعنوان الطلب السابق ويرجع STAGE لـ 1', () => {
    expect(stripOrderPushing(EXEC_864_REPLY)).toBe('عدنا غسالة أوتوماتيك أل جي 8 كيلو.\nSTAGE: 1')
  })

  it('يشيل «ما عندك شي ثاني تحب تضيفه بعد؟» ويبقي الجواب', () => {
    expect(stripOrderPushing('عدنا تيشيرتات سوداء. تمام هيج؟ ما عندك شي ثاني تحب تضيفه بعد؟\nSTAGE: 2')).toBe('عدنا تيشيرتات سوداء.\nSTAGE: 1')
  })

  it('صيغة المؤنث', () => {
    expect(stripOrderPushing('عدنا تيشيرتات سوداء. ما عندچ شي ثاني تحبين تضيفيه بعد؟')).toBe('عدنا تيشيرتات سوداء.')
  })

  it('عنوان فيه نقطة ما يخلّي بقايا', () => {
    const reply = 'السعر 350,000 دينار. ونعتمد عنوانك السابق بـ بغداد، ش. الجمهورية، قرب السوق لو تغير؟\nSTAGE: 2'
    expect(stripOrderPushing(reply)).toBe('السعر 350,000 دينار.\nSTAGE: 1')
  })

  it('STAGE 0 و1 ما يتغيّر، وNOTIFICATION_TYPE يبقى', () => {
    const reply = 'أهلاً بيك.\nSTAGE: 0\nNOTIFICATION_TYPE: complaint'
    expect(stripOrderPushing(reply)).toBe(reply)
  })

  it('إذا ما بقى غير كلام الطلب يرجع الرد مثل ما هو', () => {
    const reply = 'تمام هيج؟\nSTAGE: 2'
    expect(stripOrderPushing(reply)).toBe(reply)
  })

  it.each([
    'عدنا غسالة أوتوماتيك أل جي 8 كيلو.\nSTAGE: 1',
    'دوامنا من السبت للخميس من 10 ص لحد 11 م.\n\nإذا تحتاج أي شي ثاني أنا حاضر.\nSTAGE: 1',
    '',
  ])('رد ما بيه كلام طلب يبقى مثل ما هو: %s', (reply) => {
    expect(stripOrderPushing(reply)).toBe(reply)
  })
})

describe('isBrowsing — متى الزبون يستفسر بس', () => {
  it.each([
    '[رسالة صوتية]: إذا موجود العفو عندك منتجات غسالة أو كذا صحيح هذا الكلام',
    'عندكم غسالة؟',
    'شكد سعر الغسالة',
    'شنو أيام الدوام؟',
    'توصلون للعامرية؟',
    '[رسالة صوتية]: شنو عندك من المنتجات وشنو ايام الدوام عندك ديسكاونت للمنتجات',
  ])('استفسار: %s', (message) => {
    expect(isBrowsing({ message })).toBe(true)
  })

  it.each([
    'اريد غسالة اوتوماتيك',
    'اريد اعرف شكد سعرها',
    'ثبتلي الطلب',
    'خذلي 3 تيشيرت',
    'احجزلي وحدة',
    'هلا',
    'سلام عليكم',
    'بغداد الكرادة قرب الجامعة',
  ])('مو استفسار: %s', (message) => {
    expect(isBrowsing({ message })).toBe(false)
  })

  it('بنود بالسلة أو طلب جاري أو موافقة ← مو استفسار حتى لو الرسالة سؤال', () => {
    expect(isBrowsing({ message: 'شكد المجموع؟', cartLength: 1 })).toBe(false)
    expect(isBrowsing({ message: 'وين توصلون؟', orderingNow: true })).toBe(false)
    expect(isBrowsing({ message: 'شكد يصير؟', askedToOrder: true })).toBe(false)
    expect(isBrowsing({ message: 'اكو توصيل؟', confirmed: true })).toBe(false)
  })

  it('رد البوت الأخير عرض المبلغ أو طلب معلومات توصيل ← مو استفسار', () => {
    expect(isBrowsing({ message: 'وين توصلون؟', lastBotReply: 'المجموع الكلي 350,000 دينار. أثبّتلك الطلب؟' })).toBe(false)
    expect(isBrowsing({ message: 'اكو توصيل؟', lastBotReply: 'دزلي اسمك وعنوانك ورقم الهاتف' })).toBe(false)
    expect(isBrowsing({ message: 'اكو توصيل؟', lastBotReply: 'وعليكم السلام، هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟' })).toBe(true)
  })

  // التنفيذ 1156: الرد المعطوب القديم («تمام هيج؟ ونعتمد عنوانك السابق…») بقى بالسجل فصنّف سؤال السعر اللاحق «طلب جاري»
  it('رد قديم معطوب بالسجل («تمام هيج؟»، «عنوانك السابق») والسلة فاضية ← يبقى استفسار', () => {
    const bad = 'عدنا غسالة أوتوماتيك أل جي 8 كيلو. تمام هيج؟\n\nونعتمد عنوانك السابق بـ بغداد، العامرية لو تغير؟'
    expect(isBrowsing({ message: '[رسالة صوتية]: شكد سعر الغسالة؟', lastBotReply: bad })).toBe(true)
    // لكن لو السلة فيها بنود فهذا طلب حقيقي
    expect(isBrowsing({ message: 'شكد سعر الغسالة؟', lastBotReply: bad, cartLength: 1 })).toBe(false)
  })
})

describe('orderContextHint — تنبيه الاستفسار', () => {
  it('بصمة «عندك غسالة؟» والسلة فاضية ← browsing وتنبيه الاستفسار', () => {
    const r = orderContextHint({
      combinedMessage: '[رسالة صوتية]: إذا موجود العفو عندك منتجات غسالة أو كذا صحيح هذا الكلام',
      sessionData: {},
      recentMessages: ['سلام عليكم'],
      botReplies: ['وعليكم السلام، هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟'],
    })
    expect(r.orderContext.browsing).toBe(true)
    expect(r.hint).toContain(BROWSING_HINT.trim())
  })

  it('طلب مباشر بدون كلمة «ثبت» ← مو browsing ولا تنبيه', () => {
    const r = orderContextHint({ combinedMessage: 'اريد 3 تيشيرت اسود لارج', sessionData: {}, recentMessages: [] })
    expect(r.orderContext.browsing).toBe(false)
    expect(r.hint).not.toContain('يستفسر بس')
  })

  it('تحية بس ← بلا تنبيه', () => {
    const r = orderContextHint({ combinedMessage: 'هلا', sessionData: {}, recentMessages: [] })
    expect(r.orderContext.browsing).toBe(false)
    expect(r.hint).toBe('')
  })
})
