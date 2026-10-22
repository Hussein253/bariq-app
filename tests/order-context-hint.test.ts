import { describe, expect, it } from 'vitest'
import { ASKS_FOR_HUMAN, orderContextHint } from '@/n8n/order-context-hint.js'

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
