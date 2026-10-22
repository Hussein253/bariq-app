import { describe, expect, it } from 'vitest'
import { canonicalGovernorate, sameGovernorate } from '@/lib/bot-tools/governorate'
import {
  areaSearchPattern,
  arNormalize,
  canonicalColor,
  canonicalSize,
  categoryPattern,
  isUuid,
  sanitizeForSearch,
  toSearchTokens,
} from '@/lib/bot-tools/normalize'

/**
 * القيم المتوقعة لـ arNormalize مطابقة لـ public.ar_normalize في Postgres: قُورنت
 * النسختان على ٤٠٢٢ سلسلة (تشكيل، حروف فارسية، فراغات) بلا أي اختلاف.
 */
describe('arNormalize — توحيد الإملاء كما في ar_normalize (٠٢٢)', () => {
  it.each([
    ['القاهرة', 'القاهره'],
    ['ديالى', 'ديالي'],
    ['الأعظمية', 'الاعظميه'],
    ['حَيّ  العامرية', 'حي العامريه'],
    ['گرکوک', 'قركوك'],
    ['ڤيديو', 'فيديو'],
    ['بيضاء', 'بيضا'],
    ['مـــرحبا', 'مرحبا'],
    ['ثلاثة   أيام\t\nشحن', 'ثلاثه ايام شحن'],
  ])('%s ← %s', (input, expected) => {
    expect(arNormalize(input)).toBe(expected)
  })

  it('null وundefined وفارغ ← نص فارغ (coalesce كما في SQL)', () => {
    expect(arNormalize(null)).toBe('')
    expect(arNormalize(undefined)).toBe('')
    expect(arNormalize('   ')).toBe('')
  })
})

describe('toSearchTokens — كلمات البحث', () => {
  it('يسقط «ال» وحروف الجر الملصقة بها ويطبّع الإملاء', () => {
    expect(toSearchTokens('بالتيشيرت الأسود')).toEqual(['تيشيرت', 'اسود'])
    expect(toSearchTokens('للقبعة')).toEqual(['قبعه'])
  })

  it('يزيل التكرار ويقصّ عند ٦ كلمات', () => {
    expect(toSearchTokens('تيشيرت التيشيرت')).toEqual(['تيشيرت'])
    expect(toSearchTokens('اب جد هو زح طي كل مم نن').length).toBe(6)
  })

  it('يتجاهل الحرف الواحد والفارغ', () => {
    expect(toSearchTokens('')).toEqual([])
    expect(toSearchTokens(null)).toEqual([])
    expect(toSearchTokens('و ا ب')).toEqual([])
  })

  it('لا يمرّر محارف تكسر فلتر PostgREST: , ( ) % * _ \\', () => {
    const tokens = toSearchTokens('تيشيرت,(اسود) 50%_x* a\\b ),name_norm.ilike.%')
    expect(tokens.length).toBeGreaterThan(0)
    for (const t of tokens) expect(t).toMatch(/^[^,()%*_\\\s]+$/)
    expect(sanitizeForSearch('a,(b)%*_\\')).toBe('a b')
  })
})

describe('categoryPattern', () => {
  it('كلمات الفئة بالترتيب', () => {
    expect(categoryPattern('الملابس الرجالية')).toBe('%ملابس%رجاليه%')
  })
  it('null حين لا يبقى شيء', () => {
    expect(categoryPattern(undefined)).toBeNull()
    expect(categoryPattern('!!')).toBeNull()
  })
})

describe('areaSearchPattern — مطابق لتعبير find_delivery_area في n8n', () => {
  it.each([
    ['العامرية', '%عامريه%'],
    ['حي العامرية', '%عامريه%'],
    ['بحي الكرادة', '%كراده%'],
    ['للكرخ', '%كرخ%'],
    ['حي أور', '%اور%'],
    ['الاعظمية', '%اعظميه%'],
    ['مدينة الصدر', '%مدينه%الصدر%'],
    ['حي ور', '%حي%ور%'],
  ])('%s ← %s', (input, expected) => {
    expect(areaSearchPattern(input)).toBe(expected)
  })

  it('null حين لا يبقى ما يُبحث به', () => {
    expect(areaSearchPattern('')).toBeNull()
    expect(areaSearchPattern('؟')).toBeNull()
    expect(areaSearchPattern('ا')).toBeNull()
    expect(areaSearchPattern(null)).toBeNull()
  })

  it('لا ينتج محارف wildcard من نص الزبون', () => {
    const p = areaSearchPattern('الكرخ%_*,()')
    expect(p).toBe('%كرخ%')
  })
})

describe('canonicalColor', () => {
  it('صيغ اللون الواحد تتطابق', () => {
    expect(canonicalColor('الأسود')).toBe(canonicalColor('أسود'))
    expect(canonicalColor('سوداء')).toBe(canonicalColor('أسود'))
    expect(canonicalColor('بيضاء')).toBe(canonicalColor('أبيض'))
    expect(canonicalColor('زهري')).toBe(canonicalColor('وردي'))
  })
  it('اللاتيني بلا اعتبار لحالة الحرف، وغير المعروف يبقى كما هو مطبَّعاً', () => {
    expect(canonicalColor('Black')).toBe('black')
    expect(canonicalColor('تركوازي')).toBe('تركوازي')
  })
  it('ألوان مختلفة لا تتطابق', () => {
    expect(canonicalColor('أسود')).not.toBe(canonicalColor('أبيض'))
  })
})

describe('canonicalSize', () => {
  it.each([
    ['لارج', 'large'],
    ['Large', 'large'],
    ['L', 'large'],
    ['اكس لارج', 'xlarge'],
    ['XL', 'xlarge'],
    ['x-large', 'xlarge'],
    ['XXL', 'xxlarge'],
    ['دبل اكس لارج', 'xxlarge'],
    ['سمول', 'small'],
    ['ميديم', 'medium'],
    ['42', '42'],
    ['٣ سنوات', '٣سنوات'],
  ])('%s ← %s', (input, expected) => {
    expect(canonicalSize(input)).toBe(expected)
  })

  it('large لا يطابق xlarge', () => {
    expect(canonicalSize('لارج')).not.toBe(canonicalSize('اكس لارج'))
  })
})

describe('canonicalGovernorate / sameGovernorate', () => {
  it('يعيد الصيغة المعتمدة من IRAQI_GOVERNORATES', () => {
    expect(canonicalGovernorate('الانبار')).toBe('الأنبار')
    expect(canonicalGovernorate('محافظة البصره')).toBe('البصرة')
    expect(canonicalGovernorate('ذي قار')).toBe('ذي قار')
  })
  it('غير المعتمد ← null (حي، مدينة، أو صف شاذ في الدليل)', () => {
    expect(canonicalGovernorate('الكرخ')).toBeNull()
    expect(canonicalGovernorate('الديوانية')).toBeNull()
    expect(canonicalGovernorate('')).toBeNull()
    expect(canonicalGovernorate(null)).toBeNull()
  })
  it('sameGovernorate يطبّع الطرفين ولا يطابق الفارغ بالفارغ', () => {
    expect(sameGovernorate('الأنبار', 'الانبار')).toBe(true)
    expect(sameGovernorate('بغداد', 'البصرة')).toBe(false)
    expect(sameGovernorate('', '')).toBe(false)
    expect(sameGovernorate(null, 'بغداد')).toBe(false)
  })
})

describe('isUuid', () => {
  it('يقبل UUID ويرفض غيره', () => {
    expect(isUuid('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})
