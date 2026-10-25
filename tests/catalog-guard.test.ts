import { describe, expect, it } from 'vitest'
import { correctionText, guardCatalogReply, humanTouch } from '@/n8n/catalog-guard.js'
import { explicitBuyIntent, normalizeCatalog, orderContextHint, quantityAnswer, specMismatch } from '@/n8n/order-context-hint.js'

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

  it('البوت طلب العنوان والزبون يكمّل ← الطلب جاري (الحجز مفتوح)', () => {
    const r = ctxFor('حسين محمد، بغداد الكرادة قرب الجامعة', [ASKED_ADDRESS])
    expect(r.orderContext.bookingAllowed).toBe(true)
  })
})

describe('guardCatalogReply — التصحيح الحتمي', () => {
  const run = (reply: string, message: string, botReplies: string[] = []) => guardCatalogReply(reply, ctxFor(message, botReplies).orderContext)

  it('رد التنفيذ 1741 بالضبط ← تصحيح لطيف بالمتوفر حصراً وSTAGE 1', () => {
    const out = run(ASKED_ADDRESS + '\nSTAGE: 3', 'اريد وحدة لون أسود')
    expect(out).toBe('حياك الله عزيزي، بخصوص ' + WASHER + '، عدنا بس اللون الأبيض (لون أنيق وعملي)، والأسود للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الأبيض؟\nSTAGE: 1')
  })

  it('رد التنفيذ 1747 (أكّد اللون الأسود) بعد تصحيح سابق ← «أفهمك» بلا سؤال', () => {
    const reply = 'تم عزيزي، تم تأكيد طلبك. غسالة أوتوماتيك أل جي 8 كيلو، وحدة، لون أسود.\n\nوياريت تدزلي اسمك وعنوانك الكامل.\nSTAGE: 3'
    const out = run(reply, 'لون أسود تمام', ['حياك الله عزيزي، عدنا بس اللون الأبيض، والأسود للأسف ما عدنا حالياً.'])
    expect(out).toBe('أفهمك عزيزي، بس صدك حالياً ما عدنا الأسود، المتوفر بس الأبيض. وإذا يناسبك الأبيض أني حاضر أخدمك.\nSTAGE: 1')
  })

  it('رد التنفيذ 1691 («فيا شكم قطعة رايد؟» على 5 كيلو) ← تصحيح السعة', () => {
    const out = run('تدلل عزيزي، الغسالة أوتوماتيك أل جي 8 كيلو، فيا شكم قطعة رايد؟\nSTAGE: 0', 'زين 5 كيلو')
    expect(out).toBe('حياك الله عزيزي، الي عدنا هسة ' + WASHER + ' بس، والـ 5 كيلو للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الـ 8 كيلو؟\nSTAGE: 0')
  })

  it('النموذج صحّح بنفسه ← الرد يبقى مثل ما هو', () => {
    const reply = 'الأسود ماكو حالياً عزيزي، الغسالة عدنا بس باللون الأبيض.\nSTAGE: 1'
    expect(run(reply, 'عندكم أسود؟')).toBe(reply)
  })

  it('الرد سكت عن اللون وجاوب على التوصيل ← التصحيح ينضاف بآخره', () => {
    const out = run('أجور التوصيل 3,000 دينار لبغداد.\nSTAGE: 1', 'عندكم أسود؟ وشكد التوصيل؟')
    expect(out.startsWith('أجور التوصيل 3,000 دينار لبغداد.\n\nحياك الله عزيزي')).toBe(true)
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
      .toBe('حياك الله عزيزي، عدنا بس اللون الأبيض والأسود، والأحمر للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الأبيض والأسود؟')
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
