import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { stockGuard } from '@/n8n/stock-guard.js'

// المخزون وقت اختبار 2026-10-04: الأسود لارج والأصفر كله صفر
const PRODUCTS = [
  { color: 'ابيض', size: 'Small', stock: 10, price_iqd: '6000' },
  { color: 'ابيض', size: 'Medium', stock: 10, price_iqd: '6000' },
  { color: 'ابيض', size: 'Large', stock: 10, price_iqd: '6000' },
  { color: 'ابيض', size: 'X-Large', stock: 10, price_iqd: '6000' },
  { color: 'اسود', size: 'Small', stock: 10, price_iqd: '6000' },
  { color: 'اسود', size: 'Medium', stock: 10, price_iqd: '6000' },
  { color: 'اسود', size: 'Large', stock: 0, price_iqd: '6000' },
  { color: 'اسود', size: 'X-Large', stock: 10, price_iqd: '6000' },
  { color: 'اصفر', size: 'Small', stock: 0, price_iqd: '6000' },
  { color: 'اصفر', size: 'Medium', stock: 0, price_iqd: '6000' },
  { color: 'اصفر', size: 'Large', stock: 0, price_iqd: '6000' },
  { color: 'اصفر', size: 'X-Large', stock: 0, price_iqd: '6000' },
]

const guard = (reply: string, customerText = '', extra: { isNew?: boolean; orderCreated?: boolean } = {}) =>
  stockGuard({ reply, customerText, products: PRODUCTS, ...extra })

describe('stockGuard — إخفاقات اختبار الهلوسة الحقيقية', () => {
  it('A6: يعيد بناء سطر قائمة عرض الأسود لارج كمتوفر', () => {
    const r = guard(
      'هلا وغلا، بالنسبة للأسود ماكو قياس XXL حالياً، عدنا: 🌷\n\n- أسود: سمول، ميديم، لارج، اكس لارج\n\nشكم قطعة تحب من الألوان والقياسات المتوفرة؟',
      'اريد ٢ أسود قياس XXL',
    )
    expect(r.action).toBe('list_fixed')
    expect(r.text).toContain('- أسود: سمول، ميديم، اكس لارج')
    expect(r.text).not.toMatch(/ميديم، لارج/)
  })

  it('C4: يمنع رداً يحط أسود لارج بالطلب', () => {
    const r = guard(
      'طلبك هسة صار: ٤ قطع تيشيرت أسود (قياس لارج). تمام هيج؟ ما عندك شي ثاني تحب تضيفه بعد؟\nSTAGE: 2',
      'غير اللون الى اسود',
    )
    expect(r.action).toBe('override')
    expect(r.text).toContain('الأسود لارج ماكو حالياً')
    expect(r.text).toContain('وقياس لارج متوفر بالأبيض.')
    expect(r.text).not.toContain('طلبك هسة صار')
    expect(r.text).toMatch(/STAGE: 1$/)
  })

  it('A4: الزبون طلب بيجي والرد بدّله بأسود بلا ما يسأل', () => {
    const r = guard(
      'هلا بيك نورتنا، التيشيرتات قياس ميديم متوفرة بلونين: 🌷\n\n- أسود: ميديم\n- أبيض: ميديم\n\nطلبك هسة صار: تيشيرت أسود (قياس ميديم) ✅ تمام هيج؟',
      'اريد تيشيرت بيجي قياس ميديم',
      { isNew: true },
    )
    expect(r.action).toBe('override')
    expect(r.text.split('\n')[0]).toBe('هلا وغلا 🌷')
    expect(r.text).toContain('اللون بيجي ماكو حالياً')
    expect(r.text).toContain('- أسود: سمول، ميديم، اكس لارج')
    expect(r.text).toContain('سعر القطعة 6,000 دينار.')
  })
})

describe('stockGuard — ما يغيّر الردود الصحيحة', () => {
  // الردود الحقيقية الـ 29 الباقية من نفس التشغيل
  const outputs = JSON.parse(readFileSync(new URL('./bot-eval/results/outputs.json', import.meta.url), 'utf8'))
  const { cases } = JSON.parse(readFileSync(new URL('./bot-eval/cases.json', import.meta.url), 'utf8'))
  const KNOWN_BAD = new Set(['A4-1', 'A6-1', 'C4-2'])
  for (const c of cases as { id: string; turns: string[] }[]) {
    ;(outputs[c.id].replies as string[]).forEach((reply, i) => {
      const key = `${c.id}-${i + 1}`
      if (KNOWN_BAD.has(key)) return
      it(`${key} يبقى كما هو`, () => {
        expect(guard(reply, c.turns[i]).action).toBe('none')
      })
    })
  }

  it('طلب بندين متوفرين بنفس السطر', () => {
    const r = guard('طلبك هسة صار: ١ قطعة تيشيرت أبيض (قياس سمول) و٢ قطعة تيشيرت أسود (قياس اكس لارج).')
    expect(r.action).toBe('none')
  })

  it('ملخص طلب بأسطر قائمة متوفرة', () => {
    const r = guard('هذا ملخص طلبك:\n- تيشيرت أسود سمول × 10 (6,000 دينار للقطعة) = 60,000 دينار\n- التوصيل: 3,000 دينار\nأثبّتلك الطلب؟')
    expect(r.action).toBe('none')
  })
})

describe('stockGuard — أسماء مناطق وأشخاص تشبه الألوان', () => {
  it('عنوان «حي الخضراء» و«الرمادي» مو ألوان', () => {
    expect(guard('والعنوان: بغداد حي الخضراء قرب الجامع. تمام هيج؟', 'العنوان بغداد حي الخضراء').action).toBe('none')
    expect(guard('التوصيل للرمادي 5,000 دينار.', 'اريد ٢ أبيض ميديم والتوصيل للرمادي').action).toBe('none')
  })

  it('اسم الزبون ما ينفحص كلون', () => {
    expect(guard('- الاسم: علي الأحمر\n- المحافظة: بغداد', 'اسمي علي الأحمر').action).toBe('none')
  })

  it('رفض صريح ما يتغيّر', () => {
    expect(guard('الأصفر ميديم ماكو حالياً، بس عدنا الأبيض والأسود.', 'عدكم أصفر ميديم؟').action).toBe('none')
  })
})

describe('stockGuard — طلب انخلق بقطعة نافدة', () => {
  it('ينبّه الزبون ويحوّل لموظف بدل ما ينكر الطلب', () => {
    const r = guard('تم تثبيت طلبك رقم 41: ٢ قطعة تيشيرت أسود (قياس لارج). المندوب يتصل بيك قبل لا يوصل 🌷\nSTAGE: 4\nNOTIFICATION_TYPE: order_completed', 'إي ثبت', { orderCreated: true })
    expect(r.action).toBe('flag_order')
    expect(r.text).toContain('تم تثبيت طلبك رقم 41')
    expect(r.text).toContain('موظف من فريقنا')
    expect(r.text).toMatch(/NOTIFICATION_TYPE: complaint$/)
    expect(r.text).not.toContain('order_completed')
  })
})
