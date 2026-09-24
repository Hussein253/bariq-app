import { describe, it, expect } from 'vitest'
import { normalizeLocale, isLocale, LOCALES, HTML_LANG, LOCALE_DIR } from '@/lib/i18n/config'
import { fill, getDictionary } from '@/lib/i18n'
import { ar } from '@/lib/i18n/locales/ar'
import { ku } from '@/lib/i18n/locales/ku'
import { en } from '@/lib/i18n/locales/en'
import { localizeDigits, formatNumberFor, formatDateTimeFor } from '@/lib/formatters'

/**
 * ⚠️ تطابق مفاتيح القواميس يحرسه المترجم (النوع Dictionary = typeof ar)،
 * لكنه **لا يحرس أطوال المصفوفات**: مترجم يحذف بطاقة من الإمكانات الثمانية
 * يمرّ من TypeScript بلا اعتراض، فتعرض الصفحة سبع بطاقات في لغة وثماني في
 * أخرى بلا أن يشتكي أحد. هذا ما يمسكه الاختبار أدناه.
 */
function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return { __len: value.length, items: value.map(shapeOf) }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = shapeOf((value as Record<string, unknown>)[key])
    }
    return out
  }
  return typeof value
}

describe('normalizeLocale', () => {
  it('يقبل الرموز المدعومة كما هي', () => {
    expect(normalizeLocale('ar')).toBe('ar')
    expect(normalizeLocale('ku')).toBe('ku')
    expect(normalizeLocale('en')).toBe('en')
  })

  it('يجرّد الرمز الإقليمي', () => {
    expect(normalizeLocale('ar-IQ')).toBe('ar')
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('EN_GB')).toBe('en')
  })

  it('يطبّع رموز الكردية إلى ku', () => {
    expect(normalizeLocale('ckb')).toBe('ku')
    expect(normalizeLocale('ckb-IQ')).toBe('ku')
    expect(normalizeLocale('kur')).toBe('ku')
  })

  it('يرجع إلى العربية عند أي قيمة غير مفهومة', () => {
    expect(normalizeLocale(null)).toBe('ar')
    expect(normalizeLocale('')).toBe('ar')
    expect(normalizeLocale('zz')).toBe('ar')
    expect(normalizeLocale('<script>')).toBe('ar')
  })

  it('isLocale لا يقبل إلا المدعوم', () => {
    expect(isLocale('ar')).toBe(true)
    expect(isLocale('ckb')).toBe(false)
    expect(isLocale(7)).toBe(false)
  })
})

describe('قواميس اللغات', () => {
  it('لكل لغة مدعومة قاموس واتجاه ورمز lang', () => {
    for (const locale of LOCALES) {
      expect(getDictionary(locale)).toBeTruthy()
      expect(HTML_LANG[locale]).toBeTruthy()
      expect(['rtl', 'ltr']).toContain(LOCALE_DIR[locale])
    }
  })

  it('الكردية والإنجليزية تطابقان العربية مفتاحاً وطولَ مصفوفة', () => {
    const reference = shapeOf(ar)
    expect(shapeOf(ku)).toEqual(reference)
    expect(shapeOf(en)).toEqual(reference)
  })

  it('لا نصّ فارغ في أي قاموس', () => {
    const emptyPaths: string[] = []
    const walk = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        if (value.trim() === '') emptyPaths.push(path)
        return
      }
      if (Array.isArray(value)) {
        value.forEach((item, idx) => walk(item, `${path}[${idx}]`))
        return
      }
      if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) walk(inner, `${path}.${key}`)
      }
    }
    for (const [name, dict] of Object.entries({ ar, ku, en })) walk(dict, name)
    expect(emptyPaths).toEqual([])
  })

  it('العناصر النائبة نفسها موجودة في الترجمات', () => {
    // نصّ يفقد {n} في لغة يعرض جملة ناقصة المعنى: «الإعداد خلال دقائق».
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort().join(',')
    const compare = (a: unknown, b: unknown, path: string, misses: string[]) => {
      if (typeof a === 'string' && typeof b === 'string') {
        if (placeholders(a) !== placeholders(b)) misses.push(path)
        return
      }
      if (Array.isArray(a) && Array.isArray(b)) {
        a.forEach((item, idx) => compare(item, b[idx], `${path}[${idx}]`, misses))
        return
      }
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const key of Object.keys(a)) {
          compare(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key],
            `${path}.${key}`,
            misses
          )
        }
      }
    }

    const kuMisses: string[] = []
    const enMisses: string[] = []
    compare(ar, ku, 'ku', kuMisses)
    compare(ar, en, 'en', enMisses)
    expect(kuMisses).toEqual([])
    expect(enMisses).toEqual([])
  })

  it('معرّفات بنود المستندين القانونيين واحدة في اللغات الثلاث', () => {
    // المعرّف رابط يُشارَك (/privacy#deletion يُسجَّل عند Meta) — ترجمته تكسر
    // الرابط عند من يقرأ بلغة أخرى، واختبار الشكل أعلاه لا يرى ذلك لأنه يقارن
    // الأنواع لا القيم. وتكراره داخل المستند، أو تسميته contact وهو معرّف
    // البند الأخير في LegalPage، يجعل رابطين يقفزان إلى مكان واحد.
    for (const doc of ['terms', 'privacy'] as const) {
      const ids = (dict: typeof ar) => dict[doc].sections.map((section) => section.id)
      expect(ids(ku)).toEqual(ids(ar))
      expect(ids(en)).toEqual(ids(ar))
      expect(new Set(ids(ar)).size).toBe(ids(ar).length)
      expect(ids(ar)).not.toContain('contact')
    }
  })
})

describe('fill', () => {
  it('يستبدل ما يعرفه ويترك ما لا يعرفه كما هو', () => {
    expect(fill('الإعداد خلال {n} دقائق', { n: '١٠' })).toBe('الإعداد خلال ١٠ دقائق')
    expect(fill('{a} و {b}', { a: 'واحد' })).toBe('واحد و {b}')
    expect(fill('بلا عناصر', { n: '١' })).toBe('بلا عناصر')
  })

  it('لا يعيد استبدال ما أُدخل من القيم', () => {
    // قيمة تحمل شكل عنصر نائب لا تُفسَّر عنصراً نائباً في جولة ثانية
    expect(fill('{a}', { a: '{b}' })).toBe('{b}')
  })
})

describe('أرقام اللغة المعروضة', () => {
  it('العربية والكردية بالأرقام العربية الهندية', () => {
    expect(localizeDigits(2026, 'ar')).toBe('٢٠٢٦')
    expect(localizeDigits(2026, 'ku')).toBe('٢٠٢٦')
  })

  it('الإنجليزية بالأرقام الغربية', () => {
    expect(localizeDigits(2026, 'en')).toBe('2026')
  })

  it('الفواصل تُكتب بأرقام اللغة أيضاً', () => {
    expect(formatNumberFor('ar', 1250000)).toBe('١,٢٥٠,٠٠٠')
    expect(formatNumberFor('en', 1250000)).toBe('1,250,000')
  })

  it('القيم الغائبة تُعرض صفراً لا فراغاً', () => {
    expect(formatNumberFor('ar', null)).toBe('٠')
    expect(formatNumberFor('en', undefined)).toBe('0')
  })

  it('الوقت بتوقيت بغداد لا بتوقيت الخادم', () => {
    // صفحات الخادم تُرسم على Vercel بتوقيت UTC: الساعة ٠٩:٠٠ هناك هي ١٢:٠٠ في بغداد
    expect(formatDateTimeFor('en', '2026-09-24T09:00:00Z')).toContain('12:00')
    expect(formatDateTimeFor('ar', '2026-09-24T09:00:00Z')).toContain('١٢:٠٠')
  })

  it('التاريخ الغائب أو غير الصالح يُعرض شَرطة', () => {
    expect(formatDateTimeFor('ar', null)).toBe('—')
    expect(formatDateTimeFor('en', 'not-a-date')).toBe('—')
  })
})
