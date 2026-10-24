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

// ماسنجر 2026-10-24: ردّ البوت «تم عزيزي، تم تأكيد طلبك… ونعتمد عنوانك السابق بـ … لو تغير؟» والزبون جاوب على سؤال العنوان
const ACK_AND_ADDRESS = [
  'تم عزيزي، تم تأكيد طلبك.\n\nغسالة أوتوماتيك أل جي 8 كيلو، وحدة.\n\nونعتمد عنوانك السابق بـ بغداد، العامرية، شارع العمل الشعبي قرب اسواق أثير - العامرية، لو تغير؟',
]
const CART_ONE = { cart: [{ variant_id: '29', quantity: 1, unit_price_iqd: '297500' }] }

describe('orderContextHint — الحجز بموافقة الزبون على المبلغ بس', () => {
  it('التنفيذ 1591: «اعتمد» جواب على سؤال العنوان ← ممنوع create_order والمطلوب ملخص بالمبلغ الكلي', () => {
    const r = orderContextHint({
      combinedMessage: 'اعتمد',
      sessionData: CART_ONE,
      recentMessages: ['اعتمد', 'تمام اعتمد العنوان', 'رايد قطعه من منتجك'],
      botReplies: ACK_AND_ADDRESS,
      productNames: 'غسالة أوتوماتيك أل جي 8 كيلو',
    })
    expect(r.orderContext.confirmedOnce).toBe(false)
    expect(r.hint).toContain('ممنوع create_order بهذا الرد')
    expect(r.hint).toContain('أثبّتلك الطلب؟')
    expect(r.hint).toContain('موافقته على العنوان مو موافقة على الطلب')
    expect(r.hint).not.toContain('create_order مرة وحدة بس') // تنبيه التثبيت يخص الموافقة على المبلغ الكلي
  })

  it('التنفيذ 1588: «تمام اعتمد العنوان» والسلة فاضية ← ما يرجع يفتتح بـ «تم تأكيد طلبك» ولا يسأل البنود ولا العنوان من جديد', () => {
    const r = orderContextHint({
      combinedMessage: 'تمام اعتمد العنوان',
      sessionData: {},
      recentMessages: ['تمام اعتمد العنوان', 'رايد قطعه من منتجك', 'تمام احجزلي الطلب'],
      botReplies: ACK_AND_ADDRESS,
      productNames: 'غسالة أوتوماتيك أل جي 8 كيلو',
    })
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).toContain('ممنوع تعيد «تم تأكيد طلبك» أو سؤال العنوان من جديد')
    expect(r.hint).not.toContain('أسلوب الرد')
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
  })

  it('طلب جاري وردك السابق ما عرض المبلغ الكلي ← ممنوع create_order', () => {
    const r = orderContextHint({
      combinedMessage: 'حسين محمد\nبغداد العامرية قرب اسواق أثير\n07731048129',
      sessionData: CART_ONE,
      recentMessages: ['حسين محمد\nبغداد العامرية قرب اسواق أثير\n07731048129'],
      botReplies: ['تم عزيزي، تم تأكيد طلبك.\n\nوياريت تدزلي اسمك وعنوانك الكامل ورقم التليفون.'],
    })
    expect(r.hint).toContain('ممنوع create_order بهذا الرد')
    expect(r.hint).toContain('ردك السابق ما عرض المبلغ الكلي')
  })

  it('الزبون وافق على المبلغ الكلي ← التثبيت يمشي وماكو منع', () => {
    const r = orderContextHint({
      combinedMessage: 'اوك ثبت طلب',
      sessionData: CART_ONE,
      recentMessages: ['اوك ثبت طلب'],
      botReplies: QUOTE_WITH_TOTAL,
    })
    expect(r.orderContext.confirmedOnce).toBe(true)
    expect(r.hint).toContain('create_order مرة وحدة بس')
    expect(r.hint).not.toContain('ممنوع create_order بهذا الرد')
  })

  it('رد البوت الأخير عرض المبلغ والزبون يسأل ← ماكو منع زايد', () => {
    const r = orderContextHint({
      combinedMessage: 'شكد التوصيل؟',
      sessionData: CART_ONE,
      recentMessages: ['شكد التوصيل؟'],
      botReplies: QUOTE_WITH_TOTAL,
    })
    expect(r.hint).not.toContain('ممنوع create_order بهذا الرد')
  })

  it('الطلب تثبّت أصلاً ← ماكو منع ولا سؤال عنوان', () => {
    const r = orderContextHint({ combinedMessage: 'شكراً', sessionData: {}, recentMessages: ['ثبتلي الطلب', 'شكراً'], botReplies: PLACED })
    expect(r.hint).not.toContain('ممنوع create_order بهذا الرد')
  })

  it('استفسار بلا طلب ← ماكو منع', () => {
    const r = orderContextHint({ combinedMessage: 'ممكن استفسر عن المنتجات المتوفرة', sessionData: {}, recentMessages: [], botReplies: [] })
    expect(r.hint).not.toContain('create_order') // تنبيه الاستفسار بس (جواب وبس)
    expect(r.orderContext.browsing).toBe(true)
  })
})

// ماسنجر 2026-10-24، التنفيذ 1638: سجل اليوم بيه «احجزلي» وبعده استفسار «ما عندك بس غسالة؟» — الحكم على رسالة الزبون الحالية مو على السجل
describe('orderContextHint — الاستفسار بعد طلب سابق يبقى استفسار', () => {
  const HISTORY = ['العفو يعني ما عندك بس غسالة؟', 'تمام احجزلي الطلب', 'شكد سعر الغسالة؟']
  const WASHER = 'غسالة أوتوماتيك أل جي 8 كيلو'

  it.each(['العفو يعني ما عندك بس غسالة؟', 'شنو عندك شاشة سمارت؟', 'عندكم منتجات ثانية؟'])('«%s» ← استفسار: ماكو سؤال بنود ولا عنوان سابق', (message) => {
    const r = orderContextHint({
      combinedMessage: message,
      sessionData: {},
      recentMessages: [message, ...HISTORY],
      botReplies: ['تدلل، شنو المنتج الي رايد تحجزه وشكم وحدة؟ عدنا ' + WASHER + '.'],
      productNames: WASHER,
    })
    expect(r.orderContext.browsing).toBe(true)
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).toContain('الزبون هسة يستفسر بس')
    expect(r.hint).toContain('لا عزيزي، ما عدنا [المنتج الي سأل عنه]')
    expect(r.hint).toContain('إي عدنا [المنتج]') // الحالة الموجودة مذكورة أول حتى ما يعمّم النفي على كل سؤال
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
    expect(r.hint).not.toContain('أسلوب الرد')
    expect(r.hint).not.toContain('create_order بهذا الرد')
  })

  it('البوت سأل بنود الطلب بردّه الأخير ← الزبون بنص الطلب (ماكو تغيير)', () => {
    const r = orderContextHint({
      combinedMessage: 'شكد سعرها؟',
      sessionData: {},
      recentMessages: ['شكد سعرها؟', 'تمام احجزلي الطلب'],
      orderingNow: true,
      productNames: WASHER,
    })
    expect(r.orderContext.browsing).toBe(false)
    expect(r.orderContext.needsItems).toBe(true)
  })

  it('السلة فيها بند ← مو استفسار حتى لو الصيغة سؤال', () => {
    const r = orderContextHint({
      combinedMessage: 'عندكم توصيل لبغداد؟',
      sessionData: CART_ONE,
      recentMessages: ['عندكم توصيل لبغداد؟'],
      productNames: WASHER,
    })
    expect(r.orderContext.browsing).toBe(false)
  })

  it('رسالة الزبون نفسها بيها «احجزلي» ← طلب مو استفسار', () => {
    const r = orderContextHint({ combinedMessage: 'عندك غسالة؟ احجزلي وحدة', sessionData: {}, recentMessages: ['عندك غسالة؟ احجزلي وحدة'], productNames: WASHER })
    expect(r.orderContext.browsing).toBe(false)
  })
})

describe('orderContextHint — تأجيل الزبون («بعدين اشوف») التنفيذ 1652', () => {
  it.each(['ما ادري بعدين اشوف', 'خليني اشوف وارجعلك', 'لاحقاً إن شاء الله'])('«%s» والبوت كان يسأل عن العدد ← رد لطيف بلا دفع', (message) => {
    const r = orderContextHint({
      combinedMessage: message,
      sessionData: {},
      recentMessages: [message, 'رايد قطعه من منتجك'],
      botReplies: ['تدلل عزيزي، شكم وحدة من غسالة أوتوماتيك أل جي 8 كيلو تريد؟'],
      orderingNow: true, // فاحص الشكاوى يعتبر سؤال العدد «طلب جاري»
      productNames: 'غسالة أوتوماتيك أل جي 8 كيلو',
    })
    expect(r.orderContext.browsing).toBe(true)
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).toContain('خذ راحتك عزيزي')
    expect(r.hint).not.toContain('أسلوب الرد')
  })

  it('السلة فيها بند ← التأجيل ما يلغي سياق الطلب', () => {
    const r = orderContextHint({ combinedMessage: 'بعدين اشوف', sessionData: CART_ONE, recentMessages: ['بعدين اشوف'], botReplies: [] })
    expect(r.orderContext.browsing).toBe(false)
  })

  it('تأجيل ويا طلب بنفس الرسالة («اريد وحدة بعدين») ← مو استفسار', () => {
    const r = orderContextHint({ combinedMessage: 'اريد وحدة بعدين', sessionData: {}, recentMessages: ['اريد وحدة بعدين'] })
    expect(r.orderContext.browsing).toBe(false)
  })
})
