import { describe, expect, it } from 'vitest'
import {
  PHOTO_STOP_WORDS,
  isSizeFitQuestion,
  questionTopics,
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

describe('PHOTO_STOP_WORDS — «صورة» مو اسم منطقة', () => {
  it('مطبّعة مثل قائمة STOP (ة ← ه، بلا همزات)', () => {
    expect(PHOTO_STOP_WORDS).toContain('صوره')
    for (const w of PHOTO_STOP_WORDS) expect(w).not.toMatch(/[ةأإآى]/)
  })
})
