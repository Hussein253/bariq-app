import { describe, expect, it } from 'vitest'
import {
  extractImagesMarker,
  imagesPromptSection,
  productImagesMarker,
  wantsPhotos,
} from '@/n8n/product-images.js'
import { imageGroupKey, imageGroupOf, sniffImageType } from '@/lib/product-images'

describe('extractImagesMarker — سطر IMAGES ينشال من الرد', () => {
  it('رمز واحد بآخر الرد ويا الأسطر المخفية الثانية', () => {
    const r = extractImagesMarker('تدلل، هاي صور التشيرت الأبيض 👇\nIMAGES: 12\nSTAGE: 1')
    expect(r.codes).toEqual([12])
    expect(r.text).toBe('تدلل، هاي صور التشيرت الأبيض 👇\nSTAGE: 1')
  })

  it('أكثر من رمز: فارزة إنكليزية أو عربية أو مسافة، وأرقام هندية', () => {
    expect(extractImagesMarker('هاي الصور\nIMAGES: 12, 15').codes).toEqual([12, 15])
    expect(extractImagesMarker('هاي الصور\nIMAGES: ١٢، ١٥').codes).toEqual([12, 15])
    expect(extractImagesMarker('هاي الصور\nimage: 3 4').codes).toEqual([3, 4])
  })

  it('بلا تكرار وثلاث رموز كحد أعلى', () => {
    expect(extractImagesMarker('IMAGES: 1, 1, 2, 3, 4, 5').codes).toEqual([1, 2, 3])
  })

  it('رموز مو أرقام تنهمل، والسطر ينشال حتى لو ماكو رمز صالح', () => {
    const r = extractImagesMarker('تدلل\nIMAGES: <رمز الصور>')
    expect(r.codes).toEqual([])
    expect(r.text).toBe('تدلل')
  })

  it('رد بلا سطر IMAGES يرجع مثل ما هو', () => {
    const text = 'عدنا تشيرت قطن بثلاث ألوان\nSTAGE: 1'
    expect(extractImagesMarker(text)).toEqual({ text, codes: [] })
  })

  it('السطر بنص الرد ما يخلي فراغ زايد', () => {
    expect(extractImagesMarker('أهلاً\n\nIMAGES: 7\n\nتحب تطلب؟').text).toBe('أهلاً\n\nتحب تطلب؟')
  })
})

describe('wantsPhotos — الصور بس إذا الزبون طلبها', () => {
  it.each([
    'دزلي صورة التشيرت',
    'عندك صور؟',
    'اريد اشوف شكله',
    'وريني الابيض',
    'ممكن نشوفه',
    'send photo pls',
    'وێنەی بنێرە',
  ])('«%s» طلب صورة', (customerMessage) => {
    expect(wantsPhotos({ customerMessage })).toBe(true)
  })

  it.each(['شكد سعره؟', 'ضروري يوصل اليوم', 'ثبتلي الطلب', 'اي'])('«%s» مو طلب صورة', (customerMessage) => {
    expect(wantsPhotos({ customerMessage })).toBe(false)
  })

  it('جواب «اي» على عرض صور بالرد السابق', () => {
    expect(wantsPhotos({ customerMessage: 'اي', lastBotReply: 'تحب أدزلك صوره؟' })).toBe(true)
  })

  it('رد سابق دز بيه صور (بلا سؤال) ما يفتح الباب لصور جديدة', () => {
    expect(wantsPhotos({ customerMessage: 'تمام', lastBotReply: 'تدلل، هاي صور التشيرت الأبيض 👇' })).toBe(false)
  })
})

describe('productImagesMarker — عقدة العلامة', () => {
  it('الزبون طلب صورة: الرموز تمشي والسطر ينشال', () => {
    const r = productImagesMarker({ output: 'تدلل 👇\nIMAGES: 4', customerMessage: 'دزلي صورته' })
    expect(r).toEqual({ output: 'تدلل 👇', codes: [4], dropped: [] })
  })

  it('الوكيل نسخ IMAGES من رده السابق والزبون ما طلب: السطر ينشال وماكو صور', () => {
    const r = productImagesMarker({
      output: 'السعر 15,000 دينار\nIMAGES: 4',
      customerMessage: 'شكد سعره؟',
      lastBotReply: 'تدلل، هاي صور التشيرت الأبيض 👇',
    })
    expect(r).toEqual({ output: 'السعر 15,000 دينار', codes: [], dropped: [4] })
  })
})

describe('imagesPromptSection — قسم البرومت', () => {
  it('تاجر بلا صور: ولا حرف بالبرومت', () => {
    expect(imagesPromptSection('')).toBe('')
    expect(imagesPromptSection('  \n')).toBe('')
  })

  it('القائمة والقواعد', () => {
    const s = imagesPromptSection('- تشيرت — ابيض ← رمز الصور: 1')
    expect(s).toContain('# صور المنتجات')
    expect(s).toContain('- تشيرت — ابيض ← رمز الصور: 1')
    expect(s).toContain('IMAGES: <رمز الصور>')
    expect(s).not.toContain('}}')
  })
})

describe('lib/product-images', () => {
  it('الصيغة من البايتات لا من الاسم', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg')
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
    expect(sniffImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode('RIFF....WEBP'))).toBeNull()
    expect(sniffImageType(new Uint8Array([]))).toBeNull()
  })

  it('المجموعة = الاسم واللون مطبّعين، والقياس ما يدخل', () => {
    const black = imageGroupOf({ name: ' تشيرت ', color: 'اسود ' })
    expect(black).toEqual({ product_name: 'تشيرت', color: 'اسود' })
    expect(imageGroupOf({ name: 'غسالة', color: '  ' })).toEqual({ product_name: 'غسالة', color: null })
    expect(imageGroupOf({ name: ' ', color: 'اسود' })).toBeNull()
    expect(imageGroupKey(black!)).toBe(imageGroupKey({ product_name: 'تشيرت', color: 'اسود' }))
    expect(imageGroupKey(black!)).not.toBe(imageGroupKey({ product_name: 'تشيرت', color: null }))
  })
})
