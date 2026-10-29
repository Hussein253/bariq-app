import { describe, expect, it } from 'vitest'
import { correctionText, dropPreviousAddress, fixDeliveryFee, greetingReply, guardCatalogReply, humanTouch } from '@/n8n/catalog-guard.js'
import { deliveryFor, explicitBuyIntent, isContactRequest, isPureGreeting, normalizeCatalog, orderContextHint, quantityAnswer, specMismatch, stripPreviousAddress } from '@/n8n/order-context-hint.js'

// محادثة ماسنجر 2026-10-24 (الزبون 28944586871867160): الغسالة الوحيدة بالمتجر بيضاء
const WASHER = 'غسالة أوتوماتيك أل جي 8 كيلو'
const CATALOG = [{ name: WASHER, color: 'بيضاء', size: null, price_iqd: 350000 }]
const ITEMS = normalizeCatalog(CATALOG)
const ASKED_ADDRESS = 'تم عزيزي، تم تأكيد طلبك. غسالة أوتوماتيك أل جي 8 كيلو، وحدة.\n\nوياريت تدزلي اسمك وعنوانك الكامل (المحافظة والمنطقة وأقرب نقطة دالة) ورقم التليفون علمود نأكد الحجز.'

const ctxFor = (message: string, botReplies: string[] = [], sessionData = {}) =>
  orderContextHint({ combinedMessage: message, sessionData, recentMessages: [message], botReplies, productNames: WASHER, catalog: CATALOG })

describe('explicitBuyIntent — نية شراء صريحة بس', () => {
  it.each([
    'اريد أحجز', 'احجزلي وحدة', 'ثبتلي وحدة', 'اريد وحدة', 'أريد عشر قطع', 'رايد قطعه من منتجك', 'شلون أشتري؟', 'شلون اطلب',
    'أعطيك العنوان', 'دزلي وحدة', 'اريدها', 'آخذها', 'اريد الغسالة', '[رسالة صوتية]: انا طالب منك عشر قطع', 'رقمي 07731234567',
  ])('نية شراء: %s', (m) => {
    expect(explicitBuyIntent(m, WASHER)).toBe(true)
  })

  it.each([
    'لون أسود تمام', 'زين 5 كيلو', 'لا 5 كيلو اريد', 'زين اريد الالوان الموجودة', 'اريد اعرف شكد سعرها', 'اريد موظف احجي ويا',
    'تمام', 'حلو كم امبير تسحب', 'ممكن اعرف مواصفاتها', '(no message)', '(ستيكر 👍)', 'دزلي صور',
  ])('مو نية شراء: %s', (m) => {
    expect(explicitBuyIntent(m, WASHER)).toBe(false)
  })

  it('العدد جواب على سؤال البوت «شكم قطعة رايد؟» ← كمال طلب', () => {
    expect(quantityAnswer('١٠', 'تدلل عزيزي، شكم قطعة رايد؟')).toBe(true)
    expect(quantityAnswer('١٠', 'عدنا غسالة بـ 350,000 دينار.')).toBe(false)
  })
})

describe('specMismatch — لون أو سعة مو بالكتالوج', () => {
  it('التنفيذ 1741: «اريد وحدة لون أسود» والغسالة بيضاء بس', () => {
    expect(specMismatch({ message: 'اريد وحدة لون أسود', catalog: ITEMS })).toMatchObject({
      kind: 'color', requested: 'اسود', requestedLabel: 'الأسود', available: ['الأبيض'], product: WASHER,
    })
  })

  it('التنفيذ 1691: «زين 5 كيلو» والمتوفر 8 كيلو', () => {
    expect(specMismatch({ message: 'زين 5 كيلو', catalog: ITEMS })).toMatchObject({ kind: 'capacity', requested: '5 كيلو', available: ['8 كيلو'] })
  })

  it.each(['عندكم ابيض؟', 'اريد البيضاء', 'اريد 8 كيلو', '٨ كيلو موجودة؟', 'شكد سعرها؟'])('موجود أو بلا لون/سعة ← ماكو تعارض: %s', (m) => {
    expect(specMismatch({ message: m, catalog: ITEMS })).toBeNull()
  })

  it('«آني بنية» مو لون بني', () => {
    expect(specMismatch({ message: 'آني بنية واريد وحدة', catalog: ITEMS })).toBeNull()
  })

  it('لون المنتج مو مسجل ← ما نحكم (التنبيه يمنع تأكيد أي لون)', () => {
    expect(specMismatch({ message: 'عندكم أسود؟', catalog: normalizeCatalog([{ name: 'مكواة بخار', color: null, price_iqd: 40000 }]) })).toBeNull()
  })

  it('اللون موجود بمنتج ثاني بالكتالوج ← مو تعارض حتمي', () => {
    const two = normalizeCatalog([{ name: 'تيشيرت قطن', color: 'أبيض', price_iqd: 6000 }, { name: 'تيشيرت رياضي', color: 'أسود', price_iqd: 7000 }])
    expect(specMismatch({ message: 'عندكم أسود؟', catalog: two })).toBeNull()
  })
})

describe('orderContextHint — الكتالوج ونية الشراء', () => {
  it('كتالوج المتجر يمشي ويا كل دور بالسعر واللون', () => {
    const r = ctxFor('شكد سعرها؟')
    expect(r.hint).toContain('[كتالوج المتجر هسة')
    expect(r.hint).toContain('- ' + WASHER + ' — اللون: بيضاء — السعر: 350,000 دينار')
  })

  it('التنفيذ 1741: ممنوع «تم تأكيد طلبك» والتصحيح آخر تنبيه', () => {
    const r = ctxFor('اريد وحدة لون أسود', ['تدلل عزيزي، بس غسالة أوتوماتيك أل جي 8 كيلو متوفرة. شكم وحدة رايد؟'])
    expect(r.orderContext.bookingAllowed).toBe(false)
    expect(r.orderContext.mismatch).toMatchObject({ requested: 'اسود', repeated: false })
    expect(r.hint).not.toContain('أسلوب الرد')
    expect(r.hint).not.toContain('الزبون كال «قطعة/وحدة/حبة»')
    expect(r.hint.trimEnd().endsWith(']')).toBe(true)
    expect(r.hint.slice(r.hint.lastIndexOf('\n\n['))).toContain('تنبيه حاسم')
  })

  it('التنفيذ 1747: «لون أسود تمام» بعد تصحيح سابق ← تصحيح ثاني بلا سؤال', () => {
    const r = ctxFor('لون أسود تمام', ['حياك الله عزيزي، عدنا بس اللون الأبيض، والأسود للأسف ما عدنا حالياً.'])
    expect(r.orderContext.mismatch).toMatchObject({ repeated: true })
    expect(r.hint).toContain('ردك السابق صحّحله نفس الشي')
  })

  it('التنفيذ 1929: «زين اريد الالوان الموجودة» ← استفسار بلا فتح حجز', () => {
    const r = ctxFor('زين اريد الالوان الموجودو\nالموجودة')
    expect(r.orderContext.browsing).toBe(true)
    expect(r.orderContext.bookingAllowed).toBe(false)
    expect(r.hint).not.toContain('أسلوب الرد')
  })

  it('«لون أبيض تمام» بلا نية شراء ← تنبيه «لسه ما قال إنه يريد يشتري»', () => {
    const r = ctxFor('لون أبيض تمام', ['عدنا غسالة أوتوماتيك أل جي 8 كيلو باللون الأبيض بـ 350,000 دينار.'])
    expect(r.orderContext.bookingAllowed).toBe(false)
    expect(r.hint).toContain('الزبون لسه ما قال بصراحة إنه يريد يشتري')
  })

  it('التنفيذ 1918: سؤال امبير ← جواب بالمعروف بلا استسلام', () => {
    const r = ctxFor('حلو كم امبير تسحب')
    expect(r.orderContext.specQuestion).toBe(true)
    expect(r.hint).toContain('ممنوع «أنصحك بالتواصل مع موظف الدعم»')
  })

  it('«اريد وحدة» والمنتج متوفر ← الحجز مفتوح وتنبيه الأسلوب بمكانه', () => {
    const r = ctxFor('اريد وحدة')
    expect(r.orderContext.bookingAllowed).toBe(true)
    expect(r.hint).toContain('أسلوب الرد')
  })

  it('البوت طلب العنوان بعد «اريد وحدة» والزبون يكمّل ← الطلب جاري (الحجز مفتوح)', () => {
    const m = 'حسين محمد، بغداد الكرادة قرب الجامعة'
    const r = orderContextHint({ combinedMessage: m, sessionData: {}, recentMessages: [m, 'اريد وحدة'], botReplies: [ASKED_ADDRESS], productNames: WASHER, catalog: CATALOG })
    expect(r.orderContext.bookingAllowed).toBe(true)
  })

  it('نفس العنوان بلا نية شراء قبله ← مو حجز', () => {
    expect(ctxFor('حسين محمد، بغداد الكرادة قرب الجامعة', [ASKED_ADDRESS]).orderContext.bookingAllowed).toBe(false)
  })
})

describe('guardCatalogReply — التصحيح الحتمي', () => {
  const run = (reply: string, message: string, botReplies: string[] = []) => guardCatalogReply(reply, ctxFor(message, botReplies).orderContext)

  it('رد التنفيذ 1741 بالضبط ← تصحيح لطيف بالمتوفر حصراً وSTAGE 1', () => {
    const out = run(ASKED_ADDRESS + '\nSTAGE: 3', 'اريد وحدة لون أسود')
    expect(out).toBe('بخصوص ' + WASHER + ' عزيزي، عدنا بس اللون الأبيض (لون أنيق وعملي)، والأسود للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الأبيض؟\nSTAGE: 1')
  })

  it('رد التنفيذ 1747 (أكّد اللون الأسود) بعد تصحيح سابق ← «أفهمك» بلا سؤال', () => {
    const reply = 'تم عزيزي، تم تأكيد طلبك. غسالة أوتوماتيك أل جي 8 كيلو، وحدة، لون أسود.\n\nوياريت تدزلي اسمك وعنوانك الكامل.\nSTAGE: 3'
    const out = run(reply, 'لون أسود تمام', ['حياك الله عزيزي، عدنا بس اللون الأبيض، والأسود للأسف ما عدنا حالياً.'])
    expect(out).toBe('أفهمك عزيزي، بس صدك حالياً ما عدنا الأسود، المتوفر بس الأبيض. وإذا يناسبك الأبيض أني حاضر أخدمك.\nSTAGE: 1')
  })

  it('رد التنفيذ 1691 («فيا شكم قطعة رايد؟» على 5 كيلو) ← تصحيح السعة', () => {
    const out = run('تدلل عزيزي، الغسالة أوتوماتيك أل جي 8 كيلو، فيا شكم قطعة رايد؟\nSTAGE: 0', 'زين 5 كيلو')
    expect(out).toBe('عزيزي، الي عدنا هسة ' + WASHER + ' بس، والـ 5 كيلو للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الـ 8 كيلو؟\nSTAGE: 0')
  })

  it('النموذج صحّح بنفسه ← الرد يبقى مثل ما هو', () => {
    const reply = 'الأسود ماكو حالياً عزيزي، الغسالة عدنا بس باللون الأبيض.\nSTAGE: 1'
    expect(run(reply, 'عندكم أسود؟')).toBe(reply)
  })

  it('الرد سكت عن اللون وجاوب على التوصيل ← التصحيح ينضاف بآخره', () => {
    const out = run('أجور التوصيل 3,000 دينار لبغداد.\nSTAGE: 1', 'عندكم أسود؟ وشكد التوصيل؟')
    expect(out.startsWith('أجور التوصيل 3,000 دينار لبغداد.\n\nبخصوص ' + WASHER + ' عزيزي، عدنا بس اللون الأبيض')).toBe(true)
  })

  it('التنفيذ 1929: سؤال العدد على استفسار الألوان ينشال ويا الإيموجي', () => {
    expect(run('تدلل عزيزي، الغسالة متوفرة بلون أبيض. شكم قطعة رايد؟ 🌟\nSTAGE: 1', 'زين اريد الالوان الموجودة'))
      .toBe('تدلل عزيزي، الغسالة متوفرة بلون أبيض.\nSTAGE: 1')
  })

  it('فتح حجز كامل بلا نية شراء ← جملة المتوفر من الكتالوج', () => {
    expect(run(ASKED_ADDRESS + '\nSTAGE: 3', 'لون أبيض تمام', ['عدنا غسالة أوتوماتيك أل جي 8 كيلو باللون الأبيض.']))
      .toBe('عدنا ' + WASHER + ' باللون الأبيض بـ 350,000 دينار.\nSTAGE: 1')
  })

  it('نية شراء صريحة ← رد الحجز يمشي مثل ما هو', () => {
    expect(run(ASKED_ADDRESS + '\nSTAGE: 3', 'اريد وحدة')).toBe(ASKED_ADDRESS + '\nSTAGE: 3')
  })

  it('رد التحويل لموظف ورسالة التثبيت ما تنلمس', () => {
    const handoff = 'تدلل، المحادثة تحوّلت لموظف الدعم.\nSTAGE: 5\nNOTIFICATION_TYPE: complaint'
    expect(run(handoff, 'لون أسود')).toBe(handoff)
    const placed = 'تم تثبيت طلبك رقم 48 🌷\nSTAGE: 4\nNOTIFICATION_TYPE: order_completed'
    expect(run(placed, 'لون أسود')).toBe(placed)
    expect(guardCatalogReply(ASKED_ADDRESS, { ...ctxFor('لون أسود').orderContext, placingOrder: true })).toBe(ASKED_ADDRESS)
  })

  it('بدون سياق (عقدة سياق الطلب فشلت) ← الرد مثل ما هو', () => {
    expect(guardCatalogReply(ASKED_ADDRESS, {})).toBe(ASKED_ADDRESS)
  })

  it('correctionText بأكثر من لون متوفر', () => {
    expect(correctionText({ kind: 'color', requested: 'احمر', requestedLabel: 'الأحمر', available: ['الأبيض', 'الأسود'], product: '' }))
      .toBe('عزيزي، عدنا بس اللون الأبيض والأسود، والأحمر للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الأبيض والأسود؟')
  })
})

// ماسنجر 2026-10-25 بعد أول تطبيق: البوت رجع يأكد العنوان والطلب والزبون يستفسر. السبب سياق قديم انعدّ «طلب جاري».
describe('الطلب الجاري فعلاً — سياق قديم ما يفتح الحجز', () => {
  const NOW = Date.parse('2026-10-25T12:09:00Z')
  const YESTERDAY = '2026-10-24T12:28:13Z'
  const OLD_ASK = 'عدنا غسالة أوتوماتيك أل جي 8 كيلو. تدلل عزيزي، شكم قطعة رايد؟ وإذا تحب، ممكن نعتمد عنوانك السابق بـ بغداد التاجي قرب المعسكر لو تغير؟'
  const PLACED = 'تم عزيزي، تم تأكيد طلبك.\n\nتفاصيل الطلب:\n- غسالة أوتوماتيك أل جي 8 كيلو، وحدة.\n- المجموع الكلي: 300,500 دينار كاش عند الاستلام\n\nالمندوب يتصل بيك قبل لا يوصل.'
  const PREV_HINT = '\n\n[عنوان سابق للزبون — من طلبه السابق رقم 47، مو من هالمحادثة: بغداد التاجي قرب المعسكر]\n[تنبيه: هذي معلومات طلب سابق، مو معلومات هالطلب: اسأله «نعتمد عنوانك السابق بـ بغداد التاجي قرب المعسكر لو تغير؟».]'
  const ctx = (message: string, botReplies: string[], extra: Record<string, unknown> = {}) =>
    orderContextHint({ combinedMessage: message, sessionData: {}, recentMessages: [message], botReplies, productNames: WASHER, catalog: CATALOG, now: NOW, ...extra })

  it('التنفيذ 1997: «شون أتصل عليك؟» بعد سؤال عنوان من أمس ← ماكو حجز، ورقم التواصل', () => {
    const r = ctx('[رسالة صوتية]: أگول لك، أريد أتصل، شون أتصل عليك؟', [OLD_ASK], { lastBotAt: YESTERDAY, orderingNow: true, contactPhone: '07731048129' })
    expect(r.orderContext.threadFresh).toBe(false)
    expect(r.orderContext.bookingAllowed).toBe(false)
    expect(r.orderContext.contactRequest).toBe(true)
    expect(r.hint).toContain('الزبون يريد يتصل بيكم')
    expect(r.hint).not.toContain('الزبون يرد على سؤالك «نعتمد عنوانك السابق')
    expect(r.hint).not.toContain('أسلوب الرد')
    const reply = 'أفتهمت إنك حاب تحجز غسالة أوتوماتيك أل جي 8 كيلو. شكم قطعة رايد؟\n\nوإذا تحب، نعتمد عنوانك السابق بغداد التاجي قرب المعسكر لو تغير؟\nSTAGE: 0'
    expect(guardCatalogReply(reply, r.orderContext)).toBe('تكدر تتصل بينا على 07731048129، وإذا تحب موظف من الفريق يتصل بيك ويكمل وياك.\nSTAGE: 0')
  })

  it('نفس السؤال وسؤال العنوان حديث ← بعده مو جواب على العنوان', () => {
    const r = ctx('شون أتصل عليك؟', [OLD_ASK], { lastBotAt: '2026-10-25T12:05:00Z' })
    expect(r.orderContext.bookingAllowed).toBe(false)
  })

  it('التنفيذ 1999: سلة طلب انحجز أمس + «عندك غساله سوده» ← تصحيح لون بلا حجز', () => {
    const r = orderContextHint({
      combinedMessage: 'مرحبا عندك غساله سوده', recentMessages: ['مرحبا عندك غساله سوده'], botReplies: [PLACED], productNames: WASHER, catalog: CATALOG, now: NOW,
      sessionData: { cart: [{ variant_id: '29', color: 'بيضاء', quantity: 1, unit_price_iqd: '297500' }] }, lastBotAt: YESTERDAY,
    })
    expect(r.orderContext.mismatch).toMatchObject({ requested: 'اسود' })
    expect(r.orderContext.bookingAllowed).toBe(false)
  })

  it('السلة فيها بند وطلب جاري حديث ← سؤال «شكد التوصيل؟» ما يسكّر الحجز', () => {
    const r = orderContextHint({
      combinedMessage: 'شكد التوصيل؟', recentMessages: ['شكد التوصيل؟'], productNames: WASHER, catalog: CATALOG, now: NOW,
      sessionData: { cart: [{ variant_id: '29', quantity: 1 }] }, botReplies: [ASKED_ADDRESS], lastBotAt: '2026-10-25T12:07:00Z',
    })
    expect(r.orderContext.bookingAllowed).toBe(true)
  })

  it.each(['اعتمد', 'تمام اعتمد العنوان', 'لا تغير، هسة بالغزالية', '[رسالة صوتية]: اكتب بغداد غزالية', 'حسين محمد 07731234567'])('جواب فعلي على سؤال العنوان الحديث بعد «اريد وحدة»: %s', (m) => {
    const r = ctx(m, [OLD_ASK], { lastBotAt: '2026-10-25T12:05:00Z', recentMessages: [m, 'اريد وحدة'] })
    expect(r.orderContext.bookingAllowed).toBe(true)
  })

  it('التنفيذ 2004: «اكتب بغداد غزالية» بعد ما رفض الـ 8 كيلو وطلب 15 ← ماكو حجز', () => {
    const m = '[رسالة صوتية]: أخوي أنا مو بالتاجي، أنا شليت من التاجي هسه بالغزالية آني. اكتب بغداد غزالية.'
    const r = ctx(m, [OLD_ASK], {
      lastBotAt: '2026-10-25T12:05:00Z',
      recentMessages: [m, '[رسالة صوتية]: ما عندك غير 8 كيلو؟ ما تكفي، اريد غسالة اوتوماتيكي ال جي تكفي 15 كيلو', 'اريد وحدة'],
    })
    expect(r.orderContext.bookingAllowed).toBe(false)
  })

  it('نية شراء من أمس ما تحسب (recentTimes)', () => {
    const r = ctx('بغداد الكرادة', [ASKED_ADDRESS], {
      lastBotAt: '2026-10-25T12:05:00Z', recentMessages: ['بغداد الكرادة', 'اريد وحدة'], recentTimes: ['2026-10-25T12:08:00Z', YESTERDAY],
    })
    expect(r.orderContext.bookingAllowed).toBe(false)
  })

  it('موافقة «تمام» على ملخص من أمس ← مو تأكيد (ماكو create_order على سياق قديم)', () => {
    const summary = 'هذا ملخص طلبك:\n- المجموع الكلي: 353,000 دينار كاش عند الاستلام\nأثبّتلك الطلب؟'
    const r = ctx('تمام', [summary], { lastBotAt: YESTERDAY })
    expect(r.orderContext.confirmedOnce).toBe(false)
    expect(r.hint).not.toContain('تأكيد الزبون واصل')
  })

  it('عنوان الطلب السابق ينشال من البرومت بلا نية شراء', () => {
    expect(stripPreviousAddress('رسائل الزبون:\nعندك غساله؟' + PREV_HINT + '\n\n[محادثة مستمرة]')).toBe('رسائل الزبون:\nعندك غساله؟\n\n[محادثة مستمرة]')
  })

  it('التنفيذ 2005: «نأكد العنوان السابق» ويا تصحيح السعة ← التصحيح بس', () => {
    const r = ctx('[رسالة صوتية]: ما تكفي، اريد غسالة اوتوماتيكي ال جي 15 كيلو', [OLD_ASK], { lastBotAt: '2026-10-25T12:09:00Z' })
    const reply = 'عزيزي، الي عدنا هسة غسالة أوتوماتيك أل جي 8 كيلو بس، والـ 15 كيلو للأسف ما عدنا حالياً.\n\nتحب أدزلك تفاصيل الغسالة الـ 8 كيلو؟ وإذا تحب نأكد العنوان السابق بغداد التاجي قرب المعسكر لو تغير؟\nSTAGE: 1'
    const out = guardCatalogReply(reply, r.orderContext)
    expect(out).not.toContain('العنوان السابق')
    expect(out).toContain('والـ 15 كيلو للأسف ما عدنا حالياً')
  })

  it('إعادة التشغيل للتنفيذ 2004: «طلبك هسة صار» و«والعنوان: …» تنشال بلا نية شراء', () => {
    const m = '[رسالة صوتية]: أخوي أنا مو بالتاجي، هسه بالغزالية. اكتب بغداد غزالية.'
    const r = ctx(m, [OLD_ASK], { lastBotAt: '2026-10-25T12:05:00Z', recentMessages: [m, 'ما تكفي، اريد غسالة ال جي 15 كيلو'] })
    const reply = 'تمام، أكتب بغداد الغزالية.\n\nطلبك هسة صار: ١ قطعة غسالة أوتوماتيك أل جي 8 كيلو (لونها أبيض).\n\nوالعنوان: بغداد الغزالية. تمام هيج؟ ما عندك شي ثاني تحب تضيفه بعد؟\nSTAGE: 2'
    expect(guardCatalogReply(reply, r.orderContext)).toBe('تمام، أكتب بغداد الغزالية.\nSTAGE: 1')
  })

  const FEES = 'أجور التوصيل: 3,000 دينار لبغداد، و5,000 دينار لباقي المحافظات.'
  const BOOKED_1392 = 'تم عزيزي، تم تأكيد طلبك. طلبك هسة صار: 1 غسالة أوتوماتيك أل جي 8 كيلو (لون أبيض).\n\nوالعنوان: بغداد غزالية. تمام هيج؟ ما عندك شي ثاني تحب تضيفه بعد؟ وياريت تدزلي اسمك ورقم الهاتف حتى نتأكد من الحجز.'
  const BUY_1391 = '[رسالة صوتية]: تمام ثبت على بغداد الغزالية بس أريد غسالة ثمانية كيلو يلا مو مشكلة'

  it('التنفيذ 2018: «تمااام» بعد ما البوت ذكر البند والعدد ← ماكو سؤال عدد من جديد', () => {
    const r = ctx('تمااام', [BOOKED_1392], { lastBotAt: '2026-10-25T12:25:55Z', recentMessages: ['تمااام', BUY_1391], askedToOrder: true })
    expect(r.orderContext.itemsFromBot).toBe(true)
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).toContain('ممنوع تسأل «شكم قطعة رايد؟» من جديد')
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
  })

  it('التنفيذ 2039: الزبون كال «بغداد الغزالية» ← عنوان الطلب السابق ينشال من البرومت ومن الرد', () => {
    const m = '[رسالة صوتية]: اي قطعة وحده اريد. اشكد يصير سعرها ويا التوصيل؟ زين على بغداد الغزالية ورقم تلفوني نفسه.'
    const r = ctx(m, [BOOKED_1392], { lastBotAt: '2026-10-25T12:28:05Z', recentMessages: [m, BUY_1391] })
    expect(r.orderContext.addressGiven).toBe(true)
    expect(r.hint).toContain('ممنوع تذكر أو تقترح عنوان أي طلب سابق')
    const reply = 'تم عزيزي، تم تأكيد طلبك. الغسالة الأوتوماتيك أل جي 8 كيلو، وحدة.\n\nنعتمد عنوانك السابق بـ بغداد التاجي قرب المعسكر لو تغير؟\nSTAGE: 2'
    expect(dropPreviousAddress(reply, { ...r.orderContext, previousAddress: 'بغداد التاجي قرب المعسكر' }))
      .toBe('تم عزيزي، تم تأكيد طلبك. الغسالة الأوتوماتيك أل جي 8 كيلو، وحدة.\nSTAGE: 2')
  })

  it('أجور التوصيل من إعدادات المتجر حسب محافظة الزبون', () => {
    expect(deliveryFor({ deliveryFees: FEES, message: 'زين على بغداد الغزالية' })).toEqual({ governorate: 'بغداد', fee: 3000, otherFee: 5000 })
    expect(deliveryFor({ deliveryFees: FEES, message: 'توصلون للبصرة؟' })).toEqual({ governorate: 'البصرة', fee: 5000, otherFee: 3000 })
    expect(deliveryFor({ deliveryFees: FEES, message: 'شكد سعرها؟' })).toBeNull()
    const r = ctx('زين على بغداد الغزالية', [BOOKED_1392], { deliveryFees: FEES, recentMessages: ['زين على بغداد الغزالية', BUY_1391] })
    expect(r.hint).toContain('المحافظة «بغداد» ← التوصيل 3,000 دينار بالضبط، مو 5,000')
  })

  it('التنفيذ 2062: «355,000 (350,000 + 5,000 توصيل)» لبغداد ← 353,000 و3,000', () => {
    const d = { delivery: { governorate: 'بغداد', fee: 3000, otherFee: 5000 }, catalog: [{ price: 350000 }] }
    expect(fixDeliveryFee('عند التوصيل إلى بغداد غزالية، السعر بيكون 355,000 دينار (350,000 للتسعيرة + 5,000 توصيل).\nSTAGE: 2', d))
      .toBe('عند التوصيل إلى بغداد غزالية، السعر بيكون 353,000 دينار (350,000 للتسعيرة + 3,000 توصيل).\nSTAGE: 2')
    // رسالة التثبيت (التنفيذ 2071) بيها المجموع بس: ينحسب من سعر الكتالوج
    expect(fixDeliveryFee('رقم الطلب: 48\nالسعر الكلي: 355,000 دينار كاش عند الاستلام.', d)).toBe('رقم الطلب: 48\nالسعر الكلي: 353,000 دينار كاش عند الاستلام.')
    // سطر الأجرتين والرد الصح ما ينلمسون
    expect(fixDeliveryFee('أجور التوصيل 3,000 دينار لبغداد و5,000 دينار لباقي المحافظات.', d)).toBe('أجور التوصيل 3,000 دينار لبغداد و5,000 دينار لباقي المحافظات.')
    expect(fixDeliveryFee('المجموع الكلي: 353,000 دينار (350,000 + 3,000 توصيل).', d)).toBe('المجموع الكلي: 353,000 دينار (350,000 + 3,000 توصيل).')
    expect(fixDeliveryFee('المجموع الكلي: 355,000 دينار', {})).toBe('المجموع الكلي: 355,000 دينار')
  })

  it('التنفيذ 2126: «مرحبا» بعد ساعتين ونص من «عندك غساله سوده» ← تحية بس، بلا سجل قديم', () => {
    const lastBot = 'الغسالة الـ 8 كيلو الموجودة عدنا لونها أبيض فقط، وسعرها 350,000 دينار.\n\nشنو رايد تسوي، رايد تفاصيل أكثر؟'
    const r = ctx('مرحبا', [lastBot], { lastBotAt: '2026-10-25T12:10:57Z', recentMessages: ['مرحبا', 'مرحبا عندك غساله سوده'], now: Date.parse('2026-10-25T14:36:10Z') })
    expect(r.orderContext.pureGreeting).toBe(true)
    expect(r.hint).toContain('رسالة الزبون هسة تحية بس')
    expect(r.hint).not.toContain('مرحبا عندك غساله سوده')
    const reply = 'إي، الغسالة أوتوماتيك أل جي 8 كيلو لونها بيضاء وسعرها 350,000 دينار.\nSTAGE: 1'
    expect(greetingReply(reply, r.orderContext)).toBe('هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟\nSTAGE: 0')
    // رد تحية صح (حتى بالتعريف باسم الموظف) يبقى
    expect(greetingReply('هلا بيك نورتنا، أني محمد من فريق الرقمي 🌷 شلون أكدر أخدمك اليوم؟\nSTAGE: 0', r.orderContext))
      .toBe('هلا بيك نورتنا، أني محمد من فريق الرقمي 🌷 شلون أكدر أخدمك اليوم؟\nSTAGE: 0')
  })

  it('«مرحبا» بلا سلام ← رد الوكيل «وعليكم السلام، هلا بيك…» يتشال منه رد السلام', () => {
    const r = ctx('مرحبا', ['عدنا غسالة.'], { recentMessages: ['مرحبا', 'عندك غسالة؟'] })
    expect(greetingReply('وعليكم السلام، هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟\nSTAGE: 0', r.orderContext))
      .toBe('هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟\nSTAGE: 0')
  })

  it('«السلام عليكم ورحمة الله» ← «وعليكم السلام» أول الرد', () => {
    const r = ctx('السلام عليكم ورحمة الله', [], {})
    expect(r.orderContext.pureGreeting).toBe(true)
    expect(greetingReply('شلون أكدر أساعدك اليوم؟\nSTAGE: 0', r.orderContext)).toBe('وعليكم السلام، هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟\nSTAGE: 0')
  })

  it.each(['مرحبا عندك غساله سوده', 'هلا شكد السعر؟', 'الو موجود؟ اريد احجز', 'تمام'])('مو تحية بس: %s', (m) => {
    expect(isPureGreeting(m)).toBe(false)
  })

  it('تحية بنص طلب جاري حديث ← مو استبدال (الوكيل يكمّل الطلب)', () => {
    const r = ctx('هلا', [ASKED_ADDRESS], { lastBotAt: '2026-10-25T12:05:00Z', recentMessages: ['هلا', 'اريد وحدة'] })
    expect(r.orderContext.pureGreeting).toBe(false)
  })

  it.each(['[رسالة صوتية]: السلام عليكم كيف الحال موجودين؟', 'موجودين؟', 'السلام عليكم ورحمة الله وبركاته شلونكم'])('تحية بس: %s', (m) => {
    expect(isPureGreeting(m)).toBe(true)
  })

  it('التنفيذ 2135: بصمة «السلام عليكم كيف الحال موجودين؟» وسلة طلب أمس باقية ← تحية بس، بلا «اطلب الناقص»', () => {
    const msg = '[رسالة صوتية]: السلام عليكم كيف الحال موجودين؟'
    const r = ctx(msg, ['إي، الغسالة أوتوماتيك أل جي 8 كيلو لونها بيضاء وسعرها 350,000 دينار.'], {
      lastBotAt: YESTERDAY, sessionData: { cart: [{ variant_id: '29', quantity: 1 }] }, recentMessages: [msg, 'مرحبا', 'مرحبا عندك غساله سوده'],
    })
    expect(r.orderContext.pureGreeting).toBe(true)
    expect(r.hint).toContain('رسالة الزبون هسة تحية بس')
    expect(r.hint).not.toContain('ممنوع create_order بهذا الرد')
    const reply = 'وعليكم السلام. إي موجود عيني، شلون أكدر أساعدك؟\n\nالغسالة أوتوماتيك أل جي 8 كيلو لونها أبيض وسعرها 350,000 دينار.\n\nإذا تحب نسجّل طلبك، وديلي اسمك وعنوانك الكامل ورقم الهاتف.\nSTAGE: 3'
    expect(greetingReply(reply, r.orderContext)).not.toContain('350,000')
  })

  it('التنفيذ 2155: «دزلي الموقع مالكم» وفاحص الشكاوى يكول ordering_now بعد تصحيح لون ← جواب بس، بلا «شكم وحدة»', () => {
    const correction = 'حالياً ماكو مجال لحجز اللون الأسود، المتوفر بس اللون الأبيض من غسالة أوتوماتيك أل جي 8 كيلو. إذا يناسبك الأبيض، أنا حاضر أخدمك بتفاصيله.'
    const r = ctx('دزلي الموقع مالكم', [correction], {
      lastBotAt: '2026-10-25T12:08:00Z', orderingNow: true, recentMessages: ['دزلي الموقع مالكم', 'بيها مجال تحجزلي لون اسود', 'اريد غساله لون اسود'],
    })
    expect(r.orderContext.browsing).toBe(true)
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
    expect(r.hint).not.toContain('المتجر عنده منتج واحد بس')
    expect(r.hint).not.toContain('ممنوع create_order بهذا الرد')
  })

  it('التنفيذ 2147: «دزلي موقع مالكم… و اريد لون اسود» بعد تصحيح ← تصحيح يجاوب الموقع أول، بلا تكرار العرض', () => {
    const first = 'بخصوص غسالة أوتوماتيك أل جي 8 كيلو عزيزي، المتوفر بس اللون الأبيض (لون أنيق وعملي)، والأسود للأسف ما عدنا حالياً.\n\nتحب أدزلك تفاصيل الأبيض؟'
    const msg = 'دزلي موقع مالكم علمود اشوف هاي الغسالة و اريد لون اسود'
    const r = ctx(msg, [first], { lastBotAt: '2026-10-25T12:08:00Z', orderingNow: true, recentMessages: [msg, 'اريد غساله لون اسود'] })
    expect(r.orderContext.mismatch?.repeated).toBe(true)
    expect(r.hint).toContain('جاوبه عليه أول')
    expect(r.hint).not.toContain('وإذا يناسبه إنت حاضر تخدمه')
    expect(r.hint).not.toContain('ممنوع create_order بهذا الرد')
  })

  it('«ما أعرف أقرا» طلب تواصل', () => {
    expect(isContactRequest('[رسالة صوتية]: عجبلك تكتبلي، ما أعرف أقرا، بصمة بصمة')).toBe(true)
    expect(isContactRequest('شكد سعرها؟')).toBe(false)
  })
})

describe('humanTouch — ردود بشرية', () => {
  it('التنفيذ 1666: «أكدر أساعدك بشي ثاني؟» تنشال', () => {
    expect(humanTouch('أجور التوصيل 3,000 دينار لبغداد و5,000 دينار لباقي المحافظات.\n\nأكدر أساعدك بشي ثاني؟\nSTAGE: 1'))
      .toBe('أجور التوصيل 3,000 دينار لبغداد و5,000 دينار لباقي المحافظات.\nSTAGE: 1')
  })

  it('التنفيذ 1684: «إذا تحتاج شي ثاني أو عندك أي استفسار، كلي.» تنشال', () => {
    expect(humanTouch('ماعدنا غسالة هيتاشي، لكن عدنا غسالة أوتوماتيك أل جي 8 كيلو. إذا تحتاج شي ثاني أو عندك أي استفسار، كلي.\nSTAGE: 1'))
      .toBe('ماعدنا غسالة هيتاشي، لكن عدنا غسالة أوتوماتيك أل جي 8 كيلو.\nSTAGE: 1')
  })

  it('التنفيذ 1678: تلميح سعر الجملة ينقطع', () => {
    const reply = 'سعرها 350,000 دينار.\n\nما أكدر أقدم خصم، لكن إذا رايد 10 قطع يمكن نكدر نساعدك بتسعير أو شيء من هالقبيل. تخبرني بخصوص هالموضوع؟\nSTAGE: 1'
    expect(humanTouch(reply)).toBe('سعرها 350,000 دينار.\n\nما أكدر أقدم خصم.\nSTAGE: 1')
  })

  it('التنفيذ 1918: «أنصحك بالتواصل مع موظف الدعم» تصير عرض لطيف', () => {
    expect(humanTouch('استهلاكها بالأمبير ما مسجل عندي. أنصحك بالتواصل مع موظف الدعم للحصول على تفاصيل أكثر دقة.'))
      .toBe('استهلاكها بالأمبير ما مسجل عندي. وإذا تحب، أحوّل سؤالك لموظف من الفريق يأكدلك هالتفصيلة بالضبط.')
  })

  it('التنفيذ 1921: الزبون سلّم والرد ما رد السلام', () => {
    expect(humanTouch('عدنا غسالة أوتوماتيك أل جي 8 كيلو.\nSTAGE: 1', { message: '(ستيكر 👍)\nالسلام عليكم' }))
      .toBe('وعليكم السلام، عدنا غسالة أوتوماتيك أل جي 8 كيلو.\nSTAGE: 1')
    const ok = 'وعليكم السلام، هلا بيك نورتنا 🌷 شلون أكدر أساعدك اليوم؟\nSTAGE: 0'
    expect(humanTouch(ok, { message: 'السلام عليكم' })).toBe(ok)
  })

  it.each(['شنو رايد تطلب؟', 'شنو تحب تسوي بعد؟', 'شنو رايد تسأل أكثر؟'])('خاتمة دافعة بآخر جواب استفسار: %s', (closer) => {
    expect(humanTouch('عدنا غسالة أوتوماتيك أل جي 8 كيلو باللون الأبيض. ' + closer + '\nSTAGE: 1'))
      .toBe('عدنا غسالة أوتوماتيك أل جي 8 كيلو باللون الأبيض.\nSTAGE: 1')
  })

  it('الرد كله خاتمة ← يبقى مثل ما هو (أحسن من رد فاضي)', () => {
    expect(humanTouch('أكدر أساعدك بشي ثاني؟\nSTAGE: 1')).toBe('أكدر أساعدك بشي ثاني؟\nSTAGE: 1')
  })
})
