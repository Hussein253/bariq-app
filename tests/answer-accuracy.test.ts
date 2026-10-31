import { describe, expect, it } from 'vitest'
import {
  ASKS_DETAIL,
  PHOTO_STOP_WORDS,
  arabizeEnglish,
  askedDetails,
  detailsHint,
  isSizeFitQuestion,
  englishHint,
  forOrderChecks,
  isCourtesyOnly,
  isWholesaleQuestion,
  normalizePhones,
  questionTopics,
  scopeHints,
  sizeLabels,
} from '@/n8n/answer-accuracy.js'

// التنفيذ 2592 (ماسنجر 2026-10-29): القياسات بصف واحد، والوكيل طيّح «m»
const HOODIE_SIZES = 'small/large/x-large/m'
const HOODIE_QUESTION = 'شنو أحجام الي عندك و إني طولي ١٧٠ و وزني ١٠٠ كيلو و عندك صورة للهودي'

describe('sizeLabels — القياسات بالعربي وكاملة', () => {
  it('الإخفاق الحقيقي: «m» تصير ميديم، والترتيب من الأصغر', () => {
    expect(sizeLabels(HOODIE_SIZES)).toBe('سمول، ميديم، لارج، اكس لارج')
  })

  it('فواصل مختلفة وحروف كبيرة وتكرار', () => {
    expect(sizeLabels('S, M ، L | XL')).toBe('سمول، ميديم، لارج، اكس لارج')
    expect(sizeLabels('Large/large/L')).toBe('لارج')
    expect(sizeLabels('XXL + 3XL')).toBe('دبل اكس لارج، تربل اكس لارج')
  })

  it('قياس واحد، أو قياس عربي، أو رقم: ينكتب مثل ما هو', () => {
    expect(sizeLabels('Medium')).toBe('ميديم')
    expect(sizeLabels('سمول و لارج')).toBe('سمول، لارج')
    expect(sizeLabels('42/44')).toBe('42، 44')
    expect(sizeLabels('')).toBe('')
  })
})

describe('isSizeFitQuestion — طوله ووزنه أو أي قياس يناسبه', () => {
  it.each([
    HOODIE_QUESTION,
    'اني 90 كيلو',
    'طولي 180',
    'اي قياس يناسبني؟',
    'شنو قياسي اذا وزني ٨٠',
    'القياس الي يجيني شنو',
    'طول ١٧٥ سم',
    'اني طولي ١٧٠ و وزني ١٠٠ شنو القياس مناسب الي', // ماسنجر 2026-10-31
    'شنو المقاس المناسب لابني عمره 15',
    'عمري 20 شنو يجيني',
  ])('«%s»', (m) => {
    expect(isSizeFitQuestion(m)).toBe(true)
  })

  it.each([
    'عندك غسالة 8 كيلو؟',
    'متى يجيني الطلب',
    'شكد سعر الهودي',
    'عندك قياس لارج؟',
  ])('مو سؤال قياس مناسب: «%s»', (m) => {
    expect(isSizeFitQuestion(m)).toBe(false)
  })
})

describe('questionTopics — رسالة بيها أكثر من سؤال', () => {
  it('سؤال الهودي: القياسات والقياس المناسب والصورة', () => {
    expect(questionTopics(HOODIE_QUESTION)).toBe(3)
  })

  it('البصمة: المنتجات والأسعار والموقع', () => {
    expect(questionTopics('[رسالة صوتية]: شنو عدكم المنتجات؟ شكد أسعارهن؟ وين موقعكم بالضبط؟')).toBe(3)
  })

  it.each(['شكد سعر الهودي', 'مرحبا', 'ثبتلي الطلب', 'اسمي علي'])('سؤال واحد أو ولا سؤال: «%s»', (m) => {
    expect(questionTopics(m)).toBeLessThan(2)
  })
})

describe('isWholesaleQuestion — البيع بالجملة', () => {
  it.each(['تبيع جمله\nاخذهن شلعه وحده', 'عندكم بيع جملة؟', 'اريد كمية كبيرة بالكرتونة', 'سعر الجملة شكد'])('«%s»', (m) => {
    expect(isWholesaleQuestion(m)).toBe(true)
  })

  it.each(['شكد سعر الهودي', 'اريد وحدة سمول', 'جميلة', 'حي جميلة قرب الجامع'])('مو سؤال جملة: «%s»', (m) => {
    expect(isWholesaleQuestion(m)).toBe(false)
  })
})

describe('PHOTO_STOP_WORDS — «صورة» و«جملة» مو أسماء مناطق', () => {
  it('مطبّعة مثل قائمة STOP (ة ← ه، بلا همزات)', () => {
    expect(PHOTO_STOP_WORDS).toContain('صوره')
    expect(PHOTO_STOP_WORDS).toContain('جمله')
    for (const w of PHOTO_STOP_WORDS) expect(w).not.toMatch(/[ةأإآى]/)
  })
})

describe('scopeHints — الجواب على قدّ السؤال، والإنكليزي مفهوم (ماسنجر 2026-10-29 14:27–14:41)', () => {
  it('«Is everything okay now?»: معناه «كلشي تمام؟» مو سؤال منتجات', () => {
    const h = scopeHints('Is everything okay now?')
    expect(h).toContain('كلشي تمام؟')
    expect(h).toContain('جاوب على قدّ سؤاله')
  })

  it('«You\'re welcome! ❤»: مجاملة، جملة وحدة بلا منتجات', () => {
    expect(isCourtesyOnly("You're welcome! ❤")).toBe(true)
    const h = scopeHints("You're welcome! ❤")
    expect(h).toContain('العفو')
    expect(h).toContain('رد بجملة وحدة قصيرة')
    expect(h).not.toContain('جاوب على قدّ سؤاله')
  })

  it('ألوان وقياسات بالإنكليزي تنترجم', () => {
    const h = englishHint('اوك ثبتلي\nRed\nSmall-(s)')
    expect(h).toContain('أحمر')
    expect(h).toContain('سمول')
    expect(englishHint('عندك منتجات Skincare؟ او Haircare؟')).toContain('عناية بالبشرة')
    expect(englishHint('شكد السعر')).toBe('')
  })

  it('«لون وردي وصخ اكو»: سؤال عن لون واحد ← تنبيه على قدّ السؤال', () => {
    expect(scopeHints('لون وردي وصخ اكو')).toContain('أسماء المتوفر بس')
  })

  it('«ماجاوبتني»: يجاوب السؤال الضايع، مو الكتالوج', () => {
    expect(scopeHints('ماجاوبتني')).toContain('آخر سؤال إله ما انجاوب')
  })

  it('سؤال عن كل المنتجات: بلا تنبيه «سؤال واحد»، بس المنتج باسمه وبلا قياسات (قاعدة صاحب المتجر 2026-10-29)', () => {
    const h = scopeHints('شنو عدكم منتجات')
    expect(h).not.toContain('جاوب على قدّ سؤاله')
    expect(h).toBe(detailsHint('شنو عدكم منتجات'))
    expect(h).toContain('«عدنا [اسم المنتج]» بس')
    expect(h).toContain('ممنوع تعدّد القياسات ولا الألوان ولا السعر')
  })

  it.each(['تمام', 'اوك', 'ok', '👍', 'اي ثبت'])('«%s» مو مجاملة (ممكن موافقة على الطلب)', (m) => {
    expect(isCourtesyOnly(m)).toBe(false)
  })
})

describe('detailsHint — المنتج باسمه بس، والتفاصيل الي سألها (قاعدة صاحب المتجر 2026-10-29)', () => {
  it.each([
    ['شنو عدكم منتجات', []],
    ['عندك هودي؟', []],
    ['شنو القياسات الموجودة', ['sizes']],
    ['اني طولي ١٧٠ شنو يجيني', ['sizes']],
    ['عندك XL؟', ['sizes']],
    ['عندك لون أسود؟', ['colors']],
    ['Red', ['colors']],
    ['شكد سعره', ['price']],
    ['شنو الألوان وشكد سعرها', ['colors', 'price']],
  ])('«%s» ← %j', (m, asked) => {
    expect(askedDetails(m)).toEqual(asked)
  })

  it('سأل عن السعر بس: يجاوبه، والقياسات والألوان ممنوعة', () => {
    const h = detailsHint('شكد سعره')
    expect(h).toContain('سأل بهالرسالة عن السعر')
    expect(h).toContain('ممنوع تعدّد القياسات ولا الألوان بهالرد')
  })

  it('سأل عن الكل: ماكو ممنوع', () => {
    expect(detailsHint('شنو الألوان والقياسات وشكد السعر')).not.toContain('ممنوع تعدّد')
  })

  it('«ماجاوبتني» والمجاملة: المجاملة بلا تنبيه تفاصيل', () => {
    expect(scopeHints('ماجاوبتني')).toContain('قاعدة عامة من صاحب المتجر')
    expect(scopeHints('شكراً حبيبي')).not.toContain('قاعدة عامة من صاحب المتجر')
  })

  it('نفس تعبير القياس بالحارس الأخير (n8n/reply-scope.js)', async () => {
    const { ASKS_SIZES } = await import('@/n8n/reply-scope.js')
    expect(ASKS_SIZES.source).toBe(ASKS_DETAIL.sizes.source)
  })
})

describe('arabizeEnglish — «Red Small» تنقرا مثل الكتالوج (التنفيذ 2782)', () => {
  it('الإخفاق الحقيقي: التثبيت بالإنكليزي', () => {
    expect(arabizeEnglish('اوك ثبتلي\nRed\nSmall-(s)')).toBe('اوك ثبتلي\nاحمر\nسمول-(s)')
  })

  it('XL وXXL قبل Large، وباقي الإنكليزي يبقى', () => {
    expect(arabizeEnglish('black XXL and white XL, large')).toBe('اسود دبل اكس لارج and ابيض اكس لارج, لارج')
    expect(arabizeEnglish('Is everything okay now?')).toBe('Is everything okay now?')
    expect(arabizeEnglish('اريد احمر')).toBe('اريد احمر')
  })
})

describe('normalizePhones — الرقم بأي صيغة يصير 07 (التنفيذ 2782)', () => {
  it.each([
    ['+964 784 754 4021', '07847544021'],
    ['00964-784-754-4021', '07847544021'],
    ['0784 754 4021', '07847544021'],
    ['٠٧٨٤٧٥٤٤٠٢١', '07847544021'],
    ['+964 (784) 7544021', '07847544021'],
    ['07847544021', '07847544021'],
  ])('«%s»', (raw, out) => {
    expect(normalizePhones(raw)).toBe(out)
  })

  it('الرسالة الحقيقية، وأرقام مو موبايل ما تنلمس', () => {
    expect(forOrderChecks('+964 784 754 4021\nIs everything okay now?')).toBe('07847544021\nIs everything okay now?')
    expect(normalizePhones('السعر 25,000 دينار و 3 قطع')).toBe('السعر 25,000 دينار و 3 قطع')
    expect(normalizePhones('رقم الطلب 51')).toBe('رقم الطلب 51')
  })
})
