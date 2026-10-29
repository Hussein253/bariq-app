import { describe, expect, it } from 'vitest'
import {
  PROMPT_RULES,
  extractImagesMarker,
  imagesPromptSection,
  productImagesMarker,
  wantsPhotos,
} from '@/n8n/product-images.js'
import { CHANNELS, PROMPT_EXPR, patchWorkflow } from '@/n8n/product-images.mjs'
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

// مسار ماسنجر مصغّر بالعقد الي يعتمد عليها السكربت بس (الأسماء مثل الحي)
type Node = { name: string, executeOnce?: boolean, parameters: Record<string, unknown> } & Record<string, unknown>
const node = (name: string, extra: Record<string, unknown> = {}): Node =>
  ({ id: name, name, type: 'n8n-nodes-base.set', typeVersion: 1, position: [0, 0], parameters: {}, ...extra })
const reply = (name: string) => node(name, {
  type: 'n8n-nodes-base.httpRequest', executeOnce: true, // رد النص ينرسل مرة وحدة
  parameters: { method: 'POST', url: 'https://graph.facebook.com/v23.0/me/messages', jsonBody: '={{ {} }}' },
})
const messenger = () => ({
  id: CHANNELS.messenger.id,
  nodes: [
    node('تحديد التاجر', { type: 'n8n-nodes-base.postgres', credentials: { postgres: { id: 'x' } }, parameters: { query: 'SELECT sa.merchant_id,\n       1\n  FROM x' } }),
    node('Iraqi Store AI Agent', { parameters: { options: { systemMessage: "=القواعد\n{{ $('تحديد التاجر').first().json.merchant_section }}" } } }),
    node('Complaint Guard'), node('Build User Prompt'), node('Load Last Bot Message'), node('Parse Agent Output'),
    reply('Send Messenger Reply'), reply('Send Messenger Reply (المميز)'), node('Send Voice Reply (style)'), node('Send Voice Reply (premium)'),
    node('Log Shipment Error', { credentials: { supabaseApi: { id: 'x' } } }),
    node('Save Voice Note', { parameters: { url: 'https://abc.supabase.co/storage/v1/object/conversation-media/x' } }),
    node('اختيار توكن الصفحة', { type: 'n8n-nodes-base.switch', parameters: { rules: { values: [{ outputKey: 'ستايل بغداد' }, { outputKey: 'المميز' }] } } }),
  ],
  connections: {
    'Iraqi Store AI Agent': { main: [[{ node: 'Complaint Guard', type: 'main', index: 0 }]] },
  } as Record<string, { main: { node: string, type: string, index: number }[][] }>,
})
const by = (wf: { nodes: Node[] }, name: string) => wf.nodes.find((n) => n.name === name)!
const systemMessage = (wf: { nodes: Node[] }) => (by(wf, 'Iraqi Store AI Agent').parameters.options as { systemMessage: string })
const SEND = ['Send Product Image', 'Send Product Image (المميز)']

describe('product-images.mjs — زرع المسار', () => {
  it('عقد إرسال الصور ما ترث Execute Once من قالب الرد: كل صورة تنرسل', () => {
    const wf = messenger()
    patchWorkflow(wf, CHANNELS.messenger)
    for (const name of SEND) expect(by(wf, name).executeOnce).toBe(false)
    expect(by(wf, 'Send Messenger Reply').executeOnce).toBe(true)
    expect(systemMessage(wf).systemMessage).toContain(PROMPT_EXPR)
  })

  it('مسار مزيود قبل الإصلاح: Execute Once ينطفي والقواعد تتحدّث، والمرة الثانية ما تغيّر شي', () => {
    const wf = messenger()
    patchWorkflow(wf, CHANNELS.messenger)
    for (const name of SEND) by(wf, name).executeOnce = true
    const opts = systemMessage(wf)
    opts.systemMessage = opts.systemMessage.replace(JSON.stringify(PROMPT_RULES), JSON.stringify('\n- قاعدة قديمة'))

    const changes = patchWorkflow(wf, CHANNELS.messenger)
    expect(changes).toHaveLength(3)
    expect(changes).toContain('Iraqi Store AI Agent: قواعد «صور المنتجات» محدّثة')
    for (const name of SEND) expect(by(wf, name).executeOnce).toBe(false)
    expect(opts.systemMessage).toContain(PROMPT_EXPR)
    expect(opts.systemMessage).not.toContain('قاعدة قديمة')
    expect(opts.systemMessage.match(/json\.product_images/g)).toHaveLength(1)
    expect(patchWorkflow(wf, CHANNELS.messenger)).toEqual([])
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
