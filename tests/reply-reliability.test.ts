import { describe, expect, it } from 'vitest'
import { courtesyReply, dropFalseBooking, isCourtesyMessage } from '@/n8n/reply-reliability.js'
import { isCourtesyOnly } from '@/n8n/answer-accuracy.js'

describe('dropFalseBooking — ماكو «حجزت» بدون حجز', () => {
  it('الإخفاق الحقيقي (التنفيذ 2724): السلة فاضية وما انستدعت create_order', () => {
    expect(dropFalseBooking('تدلل عزيزي، حجزت لك هودي شتوي واحد أسود وواحد أحمر.\nSTAGE: 1', { orderCreated: false }))
      .toBe('تدلل عزيزي، سجّلت اختيارك: هودي شتوي واحد أسود وواحد أحمر.\nSTAGE: 1')
  })

  it.each([
    ['حجزتلك وحدة حمرة سمول', 'سجّلت اختيارك: وحدة حمرة سمول'],
    ['تم حجز طلبك ✅', 'سجّلت اختيارك ✅'],
    ['تمام، انحجز.', 'تمام، سجّلت اختيارك ✅'],
    ['ثبتنالك الطلب', 'سجّلت اختيارك: الطلب'],
  ])('«%s»', (input, out) => {
    expect(dropFalseBooking(input, { orderCreated: false })).toBe(out)
  })

  it('بعد create_order الحجز صحيح وما ينلمس', () => {
    const text = 'تم تثبيت طلبك ✅ رقم الطلب 51'
    expect(dropFalseBooking(text, { orderCreated: true })).toBe(text)
  })

  it('سؤال الحجز وكلام ما بيه ادعاء يبقى مثل ما هو', () => {
    for (const text of ['تحب أحجزلك وحدة؟', 'أثبّتلك الطلب؟', 'عدنا هودي شتوي بـ 25,000 دينار', 'الحجز يحتاج اسمك وعنوانك']) {
      expect(dropFalseBooking(text, { orderCreated: false })).toBe(text)
    }
  })

  it('الأسطر المخفية ما تنلمس', () => {
    expect(dropFalseBooking('IMAGES: 6\nNOTIFICATION_TYPE: order_completed', { orderCreated: false }))
      .toBe('IMAGES: 6\nNOTIFICATION_TYPE: order_completed')
  })
})

describe('courtesyReply — المجاملة جملة وحدة (ماسنجر 2026-10-29 14:37)', () => {
  it('«You\'re welcome! ❤» ← جملة مجاملة بدل «عدنا هودي شتوي باللون الأسود…»', () => {
    expect(courtesyReply('عدنا هودي شتوي باللون الأسود، هودي شتوي باللون الأبيض.\nSTAGE: 1', "You're welcome! ❤"))
      .toBe('تسلم عزيزي 🌷 بالخدمة بأي وقت.\nSTAGE: 1')
  })

  it('رد التحويل لموظف ما ينلمس، ورسالة فيها سؤال ما تنحسب مجاملة', () => {
    const handoff = 'راح يتابع وياك موظف\nNOTIFICATION_TYPE: complaint'
    expect(courtesyReply(handoff, 'thanks')).toBe(handoff)
    expect(courtesyReply('السعر 25,000', 'thanks, how much?')).toBe('السعر 25,000')
    expect(courtesyReply('تم', 'اوك')).toBe('تم')
  })

  it('نفس تعريف المجاملة بـ n8n/answer-accuracy.js', () => {
    for (const m of ["You're welcome! ❤", 'Thank you so much', 'شكراً حبيبي', 'تسلم', 'تمام', 'ok', 'اي'])
      expect(isCourtesyMessage(m)).toBe(isCourtesyOnly(m))
  })
})
