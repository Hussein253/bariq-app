import { afterEach, describe, expect, it } from 'vitest'
import { isPlatformOwnerEmail } from '@/lib/platform-owner'

/**
 * من يصير أدمِن ومن يصير مشتركاً — الفرق سطر واحد، وكسره صامت
 * ==============================================================
 * خطأ هنا لا يُظهر رسالة: إما يدخل المالك مشتركاً فيفقد /admin بلا تفسير،
 * وإما يُمنح بريد غريب دور المالك فيرى أرصدة كل التجار.
 */

const ORIGINAL = process.env.PLATFORM_OWNER_EMAILS

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PLATFORM_OWNER_EMAILS
  else process.env.PLATFORM_OWNER_EMAILS = ORIGINAL
})

describe('تمييز بريد مالك المنصة', () => {
  it('بريد المالك الافتراضي يُعرف حين لا يُضبط المتغيّر', () => {
    delete process.env.PLATFORM_OWNER_EMAILS
    expect(isPlatformOwnerEmail('hus4561990@gmail.com')).toBe(true)
  })

  it('حالة الأحرف والفراغات لا تُسقط الصلاحية', () => {
    delete process.env.PLATFORM_OWNER_EMAILS
    expect(isPlatformOwnerEmail('  HUS4561990@Gmail.com ')).toBe(true)
  })

  it('أي بريد آخر ليس مالكاً — يدخل مشتركاً', () => {
    delete process.env.PLATFORM_OWNER_EMAILS
    expect(isPlatformOwnerEmail('merchant@example.com')).toBe(false)
    // تشابه جزئي لا يكفي: بريد يبدأ أو ينتهي بنص بريد المالك ليس هو
    expect(isPlatformOwnerEmail('hus4561990@gmail.com.attacker.net')).toBe(false)
    expect(isPlatformOwnerEmail('xhus4561990@gmail.com')).toBe(false)
  })

  it('غياب البريد ليس مالكاً', () => {
    delete process.env.PLATFORM_OWNER_EMAILS
    expect(isPlatformOwnerEmail(null)).toBe(false)
    expect(isPlatformOwnerEmail(undefined)).toBe(false)
    expect(isPlatformOwnerEmail('   ')).toBe(false)
  })

  it('المتغيّر يقبل عدة مُلّاك بفاصلة ويحلّ محلّ الافتراضي', () => {
    process.env.PLATFORM_OWNER_EMAILS = 'a@x.com , B@Y.com'
    expect(isPlatformOwnerEmail('a@x.com')).toBe(true)
    expect(isPlatformOwnerEmail('b@y.com')).toBe(true)
    expect(isPlatformOwnerEmail('hus4561990@gmail.com')).toBe(false)
  })

  it('متغيّر فارغ لا يترك النشر بلا مالك', () => {
    // ضبطه بقيمة فارغة خطأ شائع في لوحات النشر — لو فُهم على أنه "لا مالك"
    // لصار أول دخول للمالك دخولَ مشترك، والدور يُمنح مرة واحدة.
    process.env.PLATFORM_OWNER_EMAILS = '  ,  '
    expect(isPlatformOwnerEmail('hus4561990@gmail.com')).toBe(true)
  })
})
