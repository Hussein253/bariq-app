import { describe, expect, it } from 'vitest'
import { validateIntake } from '@/lib/order-validation'

/**
 * قاعدة انعدام التخمين (CLAUDE.md بند ٢-أ) مُختبَرة صراحةً هنا.
 * النسخة السابقة من مسار البوت كانت تكتب `Number(total) || 25000`، فحقل
 * مفقود يُنتج مبلغاً مُخترعاً يُطالَب به زبون حقيقي. هذه الاختبارات تمنع
 * عودة ذلك السلوك تحت أي إعادة كتابة.
 */
function base() {
  return {
    recipientName: 'أحمد الجبوري',
    recipientPhone: '07701234567',
    governorate: 'بغداد',
    fullAddress: 'الكرادة، شارع ٦٢، قرب صيدلية النور',
    orderContent: 'حذاء رياضي أسود قياس ٤٢',
    codAmountIqd: 35000,
    deliveryFeeIqd: 5000,
  }
}

describe('validateIntake', () => {
  it('يقبل طلباً مكتملاً', () => {
    const { errors, phone, cod, fee } = validateIntake(base())
    expect(errors).toEqual([])
    expect(phone).toBe('07701234567')
    expect(cod).toBe(35000)
    expect(fee).toBe(5000)
  })

  it('يرفض غياب ثمن البضاعة بدل افتراض قيمة', () => {
    const { errors } = validateIntake({ ...base(), codAmountIqd: undefined })
    expect(errors.some((e) => e.includes('ثمن البضاعة'))).toBe(true)
  })

  it('يرفض غياب أجرة التوصيل بدل افتراض قيمة', () => {
    const { errors } = validateIntake({ ...base(), deliveryFeeIqd: null })
    expect(errors.some((e) => e.includes('أجرة التوصيل'))).toBe(true)
  })

  it('يميّز بين "صفر" وبين "غائب" — الصفر مبلغ مشروع', () => {
    const { errors } = validateIntake({ ...base(), codAmountIqd: 0 })
    expect(errors).toEqual([])
  })

  it('يرفض النص الفارغ كمبلغ — Number("") = 0 وهي فخّ صامت', () => {
    const { errors } = validateIntake({ ...base(), codAmountIqd: '' })
    expect(errors.some((e) => e.includes('ثمن البضاعة'))).toBe(true)
  })

  it('يرفض المبالغ السالبة', () => {
    expect(validateIntake({ ...base(), codAmountIqd: -1 }).errors.length).toBeGreaterThan(0)
    expect(validateIntake({ ...base(), deliveryFeeIqd: -5000 }).errors.length).toBeGreaterThan(0)
  })

  it('يرفض رقم هاتف غير صالح', () => {
    const { errors, phone } = validateIntake({ ...base(), recipientPhone: '0123' })
    expect(phone).toBeNull()
    expect(errors.some((e) => e.includes('هاتف'))).toBe(true)
  })

  it('يطلب كل حقول العنوان اللوجستية — بند ٤-٣', () => {
    const { errors } = validateIntake({
      ...base(),
      governorate: '',
      fullAddress: '',
      orderContent: '',
      recipientName: '',
    })
    expect(errors).toHaveLength(4)
  })
})
