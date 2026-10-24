import { describe, expect, it } from 'vitest'
import { fixEchoedRequest } from '@/n8n/own-voice.js'
import { orderContextHint, ownVoiceNote } from '@/n8n/order-context-hint.js'

const WASHER = 'غسالة أوتوماتيك أل جي 8 كيلو'
const PREV = 'نعتمد عنوانك السابق بـ بغداد، العامرية، شارع العمل الشعبي لو تغير؟'

describe('fixEchoedRequest — البوت ما يردد طلب الزبون بلسانه', () => {
  it('رد التنفيذ 1577 بالضبط: «رايد وحدة من…» تصير جملة اسمية', () => {
    const reply = `تدلل، رايد وحدة من ${WASHER}! \n\n${PREV}\nSTAGE: 2`
    expect(fixEchoedRequest(reply)).toBe(`تدلل، ${WASHER}، وحدة! \n\n${PREV}\nSTAGE: 2`)
  })

  it('رد التنفيذ 1573: الإعادة بلسانه ثم سؤال العدد المتناقض يتشال', () => {
    const reply = `تدلل، شلون أقدر أساعدك. رايد قطعة من ${WASHER}، شكم وحدة تريد؟\nSTAGE: 2`
    expect(fixEchoedRequest(reply)).toBe(`تدلل، شلون أقدر أساعدك. ${WASHER}، وحدة.\nSTAGE: 2`)
  })

  it.each([
    ['أريد وحدتين من الأسود،', 'الأسود، وحدتين.'], // فاصلة آخر السطر تنقلب نقطة
    ['ابي ٣ قطع من الأبيض.', 'الأبيض، ٣ قطع.'],
    ['تمام، اريد حبة من الأسود.', 'تمام، الأسود، وحدة.'],
  ])('صيغ الرغبة والعدد: %s', (input, expected) => {
    expect(fixEchoedRequest(input)).toBe(expected)
  })

  it('«رايد وحدة» بدون منتج ← يأخذ اسم المنتج الوحيد إذا معروف', () => {
    expect(fixEchoedRequest('تدلل، رايد وحدة!', WASHER)).toBe(`تدلل، ${WASHER}، وحدة!`)
  })

  it('بدون «من <منتج>» وبدون منتج وحيد ← يبقى الرد مثل ما هو (ما نخمّن)', () => {
    expect(fixEchoedRequest('تدلل، رايد وحدة!')).toBe('تدلل، رايد وحدة!')
  })

  it.each([
    'شكم قطعة رايد؟',
    'شنو رايد؟',
    'تدلل، شكم وحدة رايد من الأسود؟',
    'رايد وحدة من الأسود؟', // سؤال للزبون: علامة الاستفهام تمنع اللمس
    `عدنا ${WASHER} بسعر 350,000 دينار.`,
    'تدلل، شكم وحدة تريد؟',
    'شلون أكدر أساعدك اليوم؟',
    'رايد تغيّر العنوان لو نفسه؟',
    '',
  ])('رد سليم يبقى مثل ما هو: %s', (reply) => {
    expect(fixEchoedRequest(reply, WASHER)).toBe(reply)
  })

  it('الأسطر المخفية ما تنلمس', () => {
    const reply = 'تدلل، رايد وحدة من الأسود!\nSTAGE: 2\nNOTIFICATION_TYPE: order_completed'
    const out = fixEchoedRequest(reply)
    expect(out.endsWith('\nSTAGE: 2\nNOTIFICATION_TYPE: order_completed')).toBe(true)
    expect(out).not.toContain('رايد')
  })
})

describe('ownVoiceNote — تنبيه الأسلوب لما الزبون يريد يطلب', () => {
  it('«رايد قطعه من منتجك» بمتجر منتج واحد ← «تم عزيزي، تم تأكيد طلبك» ويا البند وسؤال العنوان والعنوان السابق', () => {
    const note = ownVoiceNote({ message: 'رايد قطعه من منتجك', productNames: WASHER })
    expect(note).toContain('«تم عزيزي، تم تأكيد طلبك»')
    expect(note).toContain('«تم عزيزتي، تم تأكيد طلبك»')
    expect(note).toContain(`«${WASHER}، وحدة.»`)
    expect(note).toContain('ممنوع تردد طلبه بصيغة المتكلم')
    expect(note).toContain('نعتمد عنوانك السابق بـ [العنوان] لو تغير؟')
    expect(note).toContain('اطلب اسمه وعنوانه الكامل')
    expect(note).toContain('ممنوع «تم تثبيت طلبك» ولا رقم طلب')
    expect(note).toContain('الطلب ما ينحجز (create_order) إلا بموافقة الزبون الصريحة')
    expect(note).not.toContain('حجز طلبك')
  })

  it('ماكو «حبيبي/حبيبتي» بأي تنبيه (التوجيه: عزيزي/عزيزتي)', () => {
    for (const [message, productNames] of [['رايد قطعه من منتجك', WASHER], ['اريد غسالة', `${WASHER}، تيشيرت`]] as const) {
      expect(ownVoiceNote({ message, productNames })).not.toMatch(/حبيب/)
    }
  })

  it('البنود لسه ناقصة ← «تدلل عزيزي» واسأل عن الناقص، و«تم تأكيد طلبك» بس إذا اكتملت', () => {
    const note = ownVoiceNote({ message: 'اريد غسالة', productNames: `${WASHER}، تيشيرت` })
    expect(note).toContain('«تدلل عزيزي،»')
    expect(note).toContain('«تدللين عزيزتي،»')
    expect(note).toContain('إذا اكتملت البنود')
  })

  it('طلب جاري بدون كلمة رغبة ← التنبيه يطلع إذا ماكو بنود', () => {
    expect(ownVoiceNote({ message: 'تمام', needsItems: true })).not.toBe('')
  })

  it.each(['شكد سعر الغسالة؟', 'هلا', 'شنو أيام الدوام؟', ''])('بلا نية طلب ← ماكو تنبيه: %s', (message) => {
    expect(ownVoiceNote({ message, productNames: WASHER })).toBe('')
  })
})

describe('orderContextHint — تنبيه الأسلوب بمكانه', () => {
  it('الإخفاق الحقيقي (التنفيذ 1577) ← التنبيه موجود بعد تنبيه المنتج الوحيد', () => {
    const r = orderContextHint({
      combinedMessage: 'رايد قطعه من منتجك',
      sessionData: {},
      recentMessages: ['رايد قطعه من منتجك', 'تمام احجزلي الطلب'],
      productNames: WASHER,
    })
    expect(r.hint).toContain('أسلوب الرد — موظف مبيعات عراقي خبير')
    expect(r.hint.indexOf('أسلوب الرد')).toBeGreaterThan(r.hint.indexOf('المتجر عنده منتج واحد'))
  })

  it('«رايد قطعه من منتجك» بمتجر منتج واحد ← البند معروف: ماكو تنبيه «ماكو ولا بند» ولا منع للعنوان', () => {
    const r = orderContextHint({
      combinedMessage: 'رايد قطعه من منتجك',
      sessionData: {},
      recentMessages: ['رايد قطعه من منتجك', 'تمام احجزلي الطلب'], // «احجزلي» بالسجل كان يشغّل needsItems بالتنفيذ 1577
      productNames: WASHER,
    })
    expect(r.orderContext.needsItems).toBe(false)
    expect(r.hint).not.toContain('ماكو ولا بند محفوظ')
    expect(r.hint).not.toContain('ممنوع بهذا الرد تطلب الاسم أو العنوان')
    expect(r.hint).toContain('تم عزيزي، تم تأكيد طلبك')
  })

  it('«تمام احجزلي الطلب» بلا عدد ← البنود ناقصة مثل قبل (needsItems)', () => {
    const r = orderContextHint({ combinedMessage: 'تمام احجزلي الطلب', sessionData: {}, recentMessages: [], productNames: WASHER })
    expect(r.orderContext.needsItems).toBe(true)
    expect(r.hint).toContain('ممنوع بهذا الرد تطلب الاسم أو العنوان')
  })

  it('استفسار ← جواب وبس، ماكو تنبيه أسلوب الطلب', () => {
    const r = orderContextHint({ combinedMessage: 'شكد سعر الغسالة؟', sessionData: {}, recentMessages: [], productNames: WASHER })
    expect(r.hint).not.toContain('أسلوب الرد')
  })

  it('تأكيد «ثبت» بعد المبلغ الكلي ← تنبيه التثبيت بس', () => {
    const r = orderContextHint({
      combinedMessage: 'ثبت',
      sessionData: {},
      recentMessages: ['ثبت'],
      botReplies: ['المجموع الكلي: 300,500 دينار كاش عند الاستلام\nأثبّتلك الطلب؟'],
      productNames: WASHER,
    })
    expect(r.orderContext.confirmedOnce).toBe(true)
    expect(r.hint).not.toContain('أسلوب الرد')
  })

  it('بلا نية طلب ← نفس السلوك القديم (فاضي)', () => {
    expect(orderContextHint({ combinedMessage: 'هلا', sessionData: {}, recentMessages: [] }).hint).toBe('')
  })
})
