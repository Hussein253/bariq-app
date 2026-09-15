import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { STATUS_TRANSITIONS, SHIPMENT_STATUSES, type ShipmentStatus } from '@/lib/shipments'

/**
 * آلة حالات الشحنة مكتوبة مرتين: في مُحفّز قاعدة البيانات (المرجع الملزم)
 * وفي lib/shipments.ts (لتوجيه الواجهة). افتراقهما يعني أن الواجهة تعرض
 * انتقالاً تقبله ثم ترفضه القاعدة — أو أسوأ، تخفي انتقالاً مشروعاً.
 * هذا الاختبار يقرأ خريطة المُحفّز من ملف الترحيل نفسه ويقارنها بالنسخة
 * البرمجية، فيكشف الافتراق لحظة حدوثه.
 */
describe('آلة حالات الشحنة', () => {
  const migration = readFileSync('supabase/migrations/002_create_shipments_schema.sql', 'utf8')

  it('نسخة الكود مطابقة تماماً لخريطة المُحفّز في قاعدة البيانات', () => {
    const match = migration.match(/allowed_next jsonb := '(\{[\s\S]*?\})'::jsonb/)
    expect(match, 'تعذّر العثور على خريطة allowed_next في ملف الترحيل').toBeTruthy()

    const fromDb = JSON.parse(match![1]) as Record<string, string[]>
    expect(fromDb).toEqual(STATUS_TRANSITIONS)
  })

  it('كل حالة معلنة لها مدخل في خريطة الانتقالات', () => {
    for (const status of SHIPMENT_STATUSES) {
      expect(STATUS_TRANSITIONS[status], `الحالة ${status} بلا مدخل`).toBeDefined()
    }
  })

  it('لا انتقال يقود إلى حالة غير معلنة', () => {
    const known = new Set<string>(SHIPMENT_STATUSES)
    for (const [from, targets] of Object.entries(STATUS_TRANSITIONS)) {
      for (const to of targets) {
        expect(known.has(to), `${from} -> ${to}: حالة غير معروفة`).toBe(true)
      }
    }
  })

  it('الحالة النهائية لا تخرج منها انتقالات', () => {
    expect(STATUS_TRANSITIONS.SETTLED_FINANCIALLY).toEqual([])
  })

  it('يمنع القفز من استلام الطلب مباشرة إلى التسليم', () => {
    // القفز يعني شحنة "سُلِّمت" بلا أن يستلمها مندوب — ومطالبة التاجر بمبلغ لم يُحصَّل
    const from: ShipmentStatus = 'ORDER_RECEIVED'
    expect(STATUS_TRANSITIONS[from]).not.toContain('DELIVERED')
  })
})
