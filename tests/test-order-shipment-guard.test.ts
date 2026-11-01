import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { DISPATCH_COLUMNS, testOrderDispatchError, testShipmentLockedError } from '@/lib/test-orders'

/**
 * قفل شحنة الطلب التجريبي مكتوب مرتين: في مُحفّز قاعدة البيانات (الترحيل ٠٣٣،
 * يسري على n8n ومحرّر SQL وكل مسار) وفي lib/test-orders.ts (مسارات التطبيق).
 * افتراق قائمتَي الأعمدة يعني أن التطبيق يقبل تعديلاً ترفضه القاعدة بخطأ خام —
 * أو أسوأ، أن مساراً خارج التطبيق يحرّك شحنة تجريبية لا يراقبها المُحفّز.
 * هذا الاختبار يقرأ المُحفّز من ملف الترحيل نفسه ويقارنه بالنسخة البرمجية،
 * كما يفعل اختبار آلة الحالات مع الترحيل ٠٠٢.
 */
describe('قفل شحنة الطلب التجريبي في قاعدة البيانات', () => {
  const migration = readFileSync('supabase/migrations/033_test_order_shipment_guard.sql', 'utf8')

  it('يراقب أعمدة DISPATCH_COLUMNS نفسها، ومعها order_id', () => {
    const compared = [...migration.matchAll(/new\.(\w+)\s+is not distinct from old\.(\w+)/g)]
    expect(compared.length, 'تعذّر العثور على مقارنات الأعمدة في ملف الترحيل').toBeGreaterThan(0)
    for (const [, fromNew, fromOld] of compared) expect(fromNew).toBe(fromOld)

    const columns = compared.map(([, column]) => column)
    // order_id: نقل شحنة قائمة إلى طلب تجريبي يُعامَل كإنشائها له
    expect(columns).toContain('order_id')
    expect(columns.filter((column) => column !== 'order_id').sort()).toEqual([...DISPATCH_COLUMNS].sort())
  })

  it('الملاحظات خارج القفل', () => {
    expect(migration).not.toMatch(/\bnew\.notes\b/)
  })

  it('يعمل لكل صف عند الإدراج والتعديل، وقبل آلة الحالات', () => {
    const trigger = migration.match(
      /create trigger (\w+)\s+before insert or update on public\.shipments\s+for each row execute function public\.block_test_order_shipment\(\)/
    )
    expect(trigger, 'تعذّر العثور على المُحفّز في ملف الترحيل').toBeTruthy()
    // مُحفّزات الحدث الواحد تعمل بترتيب أسمائها: «الطلب تجريبي» يسبق خطأ الانتقال
    expect(trigger![1] < 'shipments_enforce_status_transition').toBe(true)
  })

  it('يرفض بـ BQ012 وبنص رسائل التطبيق نفسه', () => {
    expect(migration).toContain(`'BQ_ORDER_NOT_SHIPPABLE|${testOrderDispatchError('%')}'`)
    expect(migration).toContain(`'BQ_ORDER_NOT_SHIPPABLE|${testShipmentLockedError('%')}'`)

    const raises = [...migration.matchAll(/raise exception '[^']*'[^;]*?using errcode = '(\w+)'/g)]
    expect(raises).toHaveLength(2)
    for (const [, code] of raises) expect(code).toBe('BQ012')
  })

  it('يقرأ الطلب بصلاحية مالكه، ولا يُنادى من الـ API', () => {
    // بلا SECURITY DEFINER، كاتب تحجب عنه RLS الطلب لا يراه تجريبياً فيعبر
    expect(migration).toMatch(/security definer\s+set search_path to 'public', 'pg_temp'/)
    // Supabase تمنح التنفيذ لـ anon و authenticated مباشرة، فالسحب يسمّيهما (الترحيل ٠١٣)
    expect(migration).toContain(
      'revoke execute on function public.block_test_order_shipment() from anon, authenticated, public;'
    )
  })
})
