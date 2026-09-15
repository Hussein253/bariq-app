import { describe, expect, it } from 'vitest'
import { normalizeIraqiPhone } from '@/lib/phone'

describe('normalizeIraqiPhone', () => {
  it('يقبل الصيغة المعيارية كما هي', () => {
    expect(normalizeIraqiPhone('07701234567')).toBe('07701234567')
  })

  it('يحوّل الصيغة الدولية 964 إلى الصيغة المحلية', () => {
    expect(normalizeIraqiPhone('9647701234567')).toBe('07701234567')
    expect(normalizeIraqiPhone('+964 770 123 4567')).toBe('07701234567')
  })

  it('يضيف الصفر المفقود في البداية', () => {
    expect(normalizeIraqiPhone('7701234567')).toBe('07701234567')
  })

  it('يتجاهل الفواصل والمسافات والشرطات', () => {
    expect(normalizeIraqiPhone('0770-123-4567')).toBe('07701234567')
  })

  it('يرفض ما ليس رقماً عراقياً صالحاً بدل تمريره', () => {
    // تمرير رقم غير صالح يُنتج شحنة لا تصل أحداً، فالرفض هو السلوك الصحيح
    expect(normalizeIraqiPhone('0123456789')).toBeNull()
    expect(normalizeIraqiPhone('077012345')).toBeNull()
    expect(normalizeIraqiPhone('077012345678')).toBeNull()
    expect(normalizeIraqiPhone('')).toBeNull()
    expect(normalizeIraqiPhone(null)).toBeNull()
    expect(normalizeIraqiPhone(undefined)).toBeNull()
  })
})
