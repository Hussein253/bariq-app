import { describe, expect, it } from 'vitest'
import {
  daysPhrase,
  deliveryTimeAnswer,
  deliveryTimeHint,
  guardDeliveryTime,
  isDeliveryTimeQuestion,
} from '@/n8n/delivery-time.js'

// نفس نص عقدة «تحديد التاجر» لمتجر «الرقمي» (local_days = 1، other_days = 1)
const RAQAMI = 'مدة التوصيل المعلنة من المتجر: خلال يوم واحد لبغداد، وخلال يوم واحد لباقي المحافظات.'
// «ستايل بغداد» (local_days = 1، other_days = 2)
const STYLE = 'مدة التوصيل المعلنة من المتجر: خلال يوم واحد لبغداد، وخلال يومين لباقي المحافظات.'

describe('isDeliveryTimeQuestion — «شوكت يوصل؟»', () => {
  it.each([
    'اريد احجز شوكت يوصل', // التنفيذ 2869
    'عدد 1 لون اسود \nبغداد حي الجامعة \n07808121083\nشوكت يوصل', // التنفيذ 2879
    'شكد التوصيل\nاريد احجز منكم بلا زحمة\nشكد ويوصل الطلب', // التنفيذ 2627
    'How many days will it take for my order to arrive?', // التنفيذ 2826
    'امته توصلون الطلب؟',
    'كم يوم ياخذ التوصيل للبصرة',
    'متى يوصلني الهودي',
  ])('«%s»', (m) => {
    expect(isDeliveryTimeQuestion(m)).toBe(true)
  })

  it.each(['شكد التوصيل', 'شوكت تفتحون؟', 'متى الدوام', 'اريد احجز', 'شكد سعر الهودي', 'عدكم توصيل للناصرية'])('مو سؤال وصول: «%s»', (m) => {
    expect(isDeliveryTimeQuestion(m)).toBe(false)
  })
})

describe('daysPhrase — نفس صيغة SQL', () => {
  it.each([[0, 'بنفس اليوم'], [1, 'خلال يوم واحد'], [2, 'خلال يومين'], [3, 'خلال 3 أيام'], [14, 'خلال 14 يوم']])('%s', (n, p) => {
    expect(daysPhrase(n)).toBe(p)
  })

  it('قيمة مو صحيحة ما تتخمّن', () => {
    expect(daysPhrase(-1)).toBe('')
    expect(daysPhrase('x')).toBe('')
  })
})

describe('deliveryTimeHint / deliveryTimeAnswer', () => {
  it('المدة مكتوبة بالإعدادات ← الجواب منها', () => {
    expect(deliveryTimeAnswer(RAQAMI)).toBe('بخصوص وقت الوصول: الطلب يوصل خلال يوم واحد لكل المحافظات، والمندوب يتصل بيك قبل لا يوصل.')
    expect(deliveryTimeAnswer(STYLE)).toBe('بخصوص وقت الوصول: الطلب يوصل خلال يوم واحد لبغداد، وخلال يومين لباقي المحافظات، والمندوب يتصل بيك قبل لا يوصل.')
    expect(deliveryTimeHint('اريد احجز شوكت يوصل', RAQAMI)).toContain('أول جملة بردك لازم تجاوبه')
    expect(deliveryTimeHint('اريد احجز شوكت يوصل', RAQAMI)).toContain('خلال يوم واحد لكل المحافظات')
  })

  it('بلا إعدادات ← بلا مدة', () => {
    expect(deliveryTimeAnswer('')).toBe('بخصوص وقت الوصول عزيزي، المندوب يتصل بيك قبل لا يوصل.')
    expect(deliveryTimeHint('شوكت يوصل', '')).toContain('مدة التوصيل مو مكتوبة')
  })

  it('ما سأل ← ماكو تنبيه', () => {
    expect(deliveryTimeHint('اريد احجز', RAQAMI)).toBe('')
  })
})

describe('guardDeliveryTime — حارس الرد', () => {
  it('التنفيذ 2869: السؤال انتجاهل ← الجواب ينضاف بأول الرد والباقي يبقى', () => {
    const reply = 'تدلل عزيزي، إذا تحب تحجز هودي شتوي، سعره بعد الخصم 21,250 دينار مع أجور توصيل 3,000 دينار لبغداد. المجموع الكلي بيصير 24,250 دينار. شكم قطعة رايد؟ ولون وقياس شنو يناسبك؟\nSTAGE: 1'
    const out = guardDeliveryTime(reply, { said: 'اريد احجز شوكت يوصل', deliveryDays: RAQAMI })
    expect(out.startsWith('بخصوص وقت الوصول: الطلب يوصل خلال يوم واحد')).toBe(true)
    expect(out).toContain('24,250 دينار')
    expect(out).toContain('STAGE: 1')
  })

  it('التنفيذ 2898: «عادةً نوصل بشكل سريع» مألّفة ← تنشال، والجواب من الإعدادات', () => {
    const reply = 'عزيزي، التوصيل يعتمد على وقت الطلب والمندوب، لكن عادةً نوصل الطلبات بشكل سريع. وشي لون وقياس تحب؟'
    const out = guardDeliveryTime(reply, { said: 'شوكت يوصل', deliveryDays: RAQAMI })
    expect(out).not.toContain('بشكل سريع')
    expect(out).toContain('خلال يوم واحد')
  })

  it('وعد «خلال 24 ساعة» بلا إعدادات ← ينشال', () => {
    const out = guardDeliveryTime('تم عزيزي 🌷 يوصل طلبك خلال 24 ساعة من رفع الطلب. المندوب يتصل بيك قبل لا يوصل.', { said: 'شكرا', deliveryDays: '' })
    expect(out).not.toContain('24 ساعة')
    expect(out).toContain('المندوب يتصل بيك قبل لا يوصل')
  })

  it('مدة غير الي بالإعدادات ← تنشال', () => {
    const out = guardDeliveryTime('الطلب يوصل خلال 3 أيام إن شاء الله.', { said: 'شوكت يوصل', deliveryDays: RAQAMI })
    expect(out).not.toContain('3 أيام')
    expect(out).toContain('خلال يوم واحد')
  })

  it('جواب صحيح من الإعدادات يبقى مثل ما هو', () => {
    const reply = 'الطلب يوصلك خلال يوم واحد لبغداد، والمندوب يتصل بيك قبل لا يوصل 🌷'
    expect(guardDeliveryTime(reply, { said: 'شوكت يوصل', deliveryDays: RAQAMI })).toBe(reply)
  })

  it('رد بلا سؤال وصول وبلا وعد ما ينلمس (الأجرة والأرقام مو مدة)', () => {
    for (const reply of ['أجور التوصيل 3,000 دينار لبغداد و5,000 لباقي المحافظات.', 'عدنا هودي شتوي بـ 25,000 دينار', 'إي نوصل للناصرية ✅. أجور التوصيل 5,000 دينار.']) {
      expect(guardDeliveryTime(reply, { said: 'شكد التوصيل', deliveryDays: RAQAMI })).toBe(reply)
    }
  })
})
