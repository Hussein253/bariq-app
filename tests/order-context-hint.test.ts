import { describe, expect, it } from 'vitest'
import { ASKS_FOR_HUMAN, confirmedOnce, orderContextHint } from '@/n8n/order-context-hint.js'

// محادثة ماسنجر 2026-10-22 (الزبون 28960616086881740) — رسائل الزبون، الأحدث أول مثل ما ترجّعها
// عقدة Load Recent Customer Messages من conversation_log
const CHAT = [
  'سلطان\nبغداد التاجي قرب المعسكر\n07823454035',
  'اريد تثبيت الطلب',
  '[رسالة صوتية]: ألو هل أنتم موجود أريد تثبيت الطلب',
  '[رسالة صوتية]: السلام عليكم أخي قم بتثبيت الطلب غسالة أوتوماتيك LG 8 كيلو قم بتثبيت الطلب شكد يصير ويا التوصيل',
  '[رسالة صوتية]: حبيبي مرتضى',
  '[رسالة صوتية]: حبيبي شنو المنتجات اللي عندك وأسعارهن؟ وعندك توصيل لبغداد التاجي؟',
]

describe('orderContextHint — الطلب ما يضيع بين الرسائل', () => {
  it('الإخفاق الحقيقي: الزبون دز معلومات التوصيل والسلة فاضية ← تنبيه البنود', () => {
    const r = orderContextHint({
      combinedMessage: 'سلطان\nبغداد التاجي قرب المعسكر\n07823454035',
      sessionData: {},
      recentMessages: CHAT,
    })
    expect(r.orderContext.needsItems).toBe(true)
    expect(r.orderContext.askedToOrder).toBe(true)
    expect(r.hint).toContain('ماكو ولا بند محفوظ')
    expect(r.hint).toContain('ممنوع بهذا الرد تطلب الاسم أو العنوان أو رقم الهاتف')
  })

  it('سجل المحادثة يوصل الوكيل بيه الغسالة الي طلبها الزبون والبوت موقوف', () => {
    const r = orderContextHint({
      combinedMessage: 'اريد تثبيت الطلب',
      sessionData: {},
      recentMessages: CHAT,
    })
    expect(r.hint).toContain('غسالة أوتوماتيك LG 8 كيلو')
    expect(r.hint).toContain('مو رسائل جديدة')
    expect(r.orderContext.history).toBeGreaterThan(0)
  })

  it('الرسالة الي ينجاوب عليها هسة ما تنعاد بالسجل', () => {
    const r = orderContextHint({
      combinedMessage: 'اريد تثبيت الطلب',
      sessionData: {},
      recentMessages: CHAT,
    })
    const history = r.hint.slice(r.hint.indexOf('[سجل المحادثة'))
    expect(history.split('- اريد تثبيت الطلب').length - 1).toBe(0)
  })

  it('السلة بيها بند ← ماكو تنبيه بنود', () => {
    const r = orderContextHint({
      combinedMessage: 'اريد تثبيت الطلب',
      sessionData: { cart: [{ variant_id: 'v1', quantity: 1 }] },
      recentMessages: CHAT,
    })
    expect(r.orderContext.itemsKnown).toBe(true)
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
  })

  it('زبون يسأل عن الأسعار بس ← ماكو تنبيه بنود', () => {
    const r = orderContextHint({
      combinedMessage: 'شنو المنتجات اللي عندك وأسعارهن؟',
      sessionData: {},
      recentMessages: ['شنو المنتجات اللي عندك وأسعارهن؟', 'السلام عليكم'],
    })
    expect(r.orderContext.askedToOrder).toBe(false)
    expect(r.orderContext.needsItems).toBe(false)
  })

  it('رد البوت الأخير كان يأخذ تفاصيل الطلب والسلة فاضية ← تنبيه بنود حتى بلا كلمة «ثبت»', () => {
    const r = orderContextHint({
      combinedMessage: 'بغداد الكرادة قرب الجامعة',
      sessionData: {},
      recentMessages: ['بغداد الكرادة قرب الجامعة'],
      orderingNow: true,
    })
    expect(r.orderContext.needsItems).toBe(true)
  })

  it('بلا سجل وبلا طلب ← بلا أي تنبيه', () => {
    const r = orderContextHint({ combinedMessage: 'هلا', sessionData: {}, recentMessages: [] })
    expect(r.hint).toBe('')
  })
})

describe('ASKS_FOR_HUMAN — «موجود؟» مو طلب موظف', () => {
  const bare = (s: string) => s.replace(/[ً-ٰٟـ]/g, '')

  it.each([
    'ألو هل أنتم موجود أريد تثبيت الطلب',
    'حبيبي مرتضى',
    'موجود؟',
    'اكو أحد؟',
    'ما ترد عليّ؟',
    'سلطان\nبغداد التاجي قرب المعسكر\n07823454035',
  ])('ما يحوّل: %s', (msg) => {
    expect(ASKS_FOR_HUMAN.test(bare(msg))).toBe(false)
  })

  it.each([
    'أريد أحچي ويا موظف',
    'حولني على الإدارة',
    'ما أريد روبوت',
    'اريد اتكلم ويا انسان',
    'وين صاحب المحل؟',
    'خلي مديركم يرد عليّ',
  ])('يحوّل: %s', (msg) => {
    expect(ASKS_FOR_HUMAN.test(bare(msg))).toBe(true)
  })
})

// ماسنجر 2026-10-22 12:08–12:11 (الزبون 28960616086881740): ردود البوت الأخيرة، الأحدث أول
const QUOTE_WITH_TOTAL = [
  'الغسالة الأوتوماتيكية LG 8 كيلو سعرها 350,000 دينار.\n\nوبما إنه أول طلب إلك، يصير سعرها 297,500 دينار بعد خصم 15%.\n\nأجور التوصيل لبغداد راح تكون 3,000 دينار.\n\nالمجموع الكلي يصير 300,500 دينار كاش عند الاستلام.\n\nتمام هيج؟ ما عندك شي ثاني تحب تضيفه بعد؟',
  'إي موجود عزيزي، لكن أحتاج منك بعد شوية تفاصيل للتثبيت.',
]
const ASKED_TO_CONFIRM = [
  'أحتاج فقط تأكيد على التفاصيل قبل التثبيت:\n\n- المجموع الكلي: 300,500 دينار كاش عند الاستلام\n\nإذا كل شي تمام، آخد الإذن وأثبت الطلب!',
]
const ITEMS_ONLY = ['طلبك هسة صار: ١ غسالة أوتوماتيك أل جي 8 كيلو. تمام هيج؟ ما عندك شي ثاني تحب تضيفه بعد؟ وياريت تدزلي اسمك وعنوانك.']
const PLACED = ['طلبك تثبّت بنجاح، رقم الطلب هو 43.\n- المجموع الكلي: 300,500 دينار كاش عند الاستلام\nالمندوب يتصل بيك قبل لا يوصل.']

describe('confirmedOnce — التأكيد مرة وحدة بس', () => {
  it.each([
    ['اوك ثبت طلب', QUOTE_WITH_TOTAL],
    ['ثبت', ASKED_TO_CONFIRM],
    ['ثبّت', QUOTE_WITH_TOTAL],
    ['إي', QUOTE_WITH_TOTAL],
    ['تمام', QUOTE_WITH_TOTAL],
    ['أكيد ثبتلي الطلب', QUOTE_WITH_TOTAL],
    ['ماكو شي ثاني', QUOTE_WITH_TOTAL],
    ['اريد تثبيت الطلب', QUOTE_WITH_TOTAL],
  ])('موافقة صريحة: %s', (msg, bot) => {
    expect(confirmedOnce({ combinedMessage: msg, botReplies: bot })).toBe(true)
  })

  it.each([
    ['لا', QUOTE_WITH_TOTAL],
    ['ثبت بس غير العنوان', QUOTE_WITH_TOTAL],
    ['شكد يصير مع التوصيل؟', QUOTE_WITH_TOTAL],
    ['ثبت؟', QUOTE_WITH_TOTAL],
    ['مو هذا اريد ثاني', QUOTE_WITH_TOTAL],
    ['سلطان\nبغداد التاجي قرب المعسكر\n07823454035', QUOTE_WITH_TOTAL],
    ['(ستيكر 👍)', QUOTE_WITH_TOTAL],
    ['[رسالة صوتية]: حجي، تمام', QUOTE_WITH_TOTAL],
  ])('مو موافقة: %s', (msg, bot) => {
    expect(confirmedOnce({ combinedMessage: msg, botReplies: bot })).toBe(false)
  })

  it('رد البوت الأخير ما بيه مبلغ كلي ← مو تأكيد (الزبون ما شاف المبلغ)', () => {
    expect(confirmedOnce({ combinedMessage: 'تمام', botReplies: ITEMS_ONLY })).toBe(false)
  })

  it('الطلب تثبّت أصلاً ← «تمام شكراً» مو تأكيد جديد (ماكو طلب مكرر)', () => {
    expect(confirmedOnce({ combinedMessage: 'تمام شكراً', botReplies: PLACED })).toBe(false)
  })

  it('بلا ردود سابقة للبوت ← مو تأكيد', () => {
    expect(confirmedOnce({ combinedMessage: 'ثبت', botReplies: [] })).toBe(false)
    expect(confirmedOnce({ combinedMessage: 'ثبت' })).toBe(false)
  })
})

describe('orderContextHint — التأكيد مرة وحدة', () => {
  it('الإخفاق الحقيقي: «اوك ثبت طلب» بعد المبلغ الكلي والسلة فاضية ← تثبيت مباشر مو سؤال بنود', () => {
    const r = orderContextHint({
      combinedMessage: 'اوك ثبت طلب',
      sessionData: {},
      recentMessages: ['اوك ثبت طلب', 'فقط وحدة\nمع التوصيل شكد ؟', 'سلطان\nبغداد التاجي قرب المعسكر\n07823454035', 'اريد تثبيت الطلب'],
      botReplies: QUOTE_WITH_TOTAL,
    })
    expect(r.orderContext.confirmedOnce).toBe(true)
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
    expect(r.hint).toContain('ممنوع تطلب تأكيد ثاني')
    expect(r.hint).toContain('create_order مرة وحدة بس')
    expect(r.hint).toContain('variant_id حرفياً')
  })

  it('بلا موافقة ← ماكو تنبيه تثبيت', () => {
    const r = orderContextHint({
      combinedMessage: 'شكد يصير مع التوصيل؟',
      sessionData: { cart: [{ variant_id: '29', quantity: 1 }] },
      recentMessages: ['شكد يصير مع التوصيل؟'],
      botReplies: QUOTE_WITH_TOTAL,
    })
    expect(r.orderContext.confirmedOnce).toBe(false)
    expect(r.hint).not.toContain('تأكيد الزبون واصل')
  })
})
