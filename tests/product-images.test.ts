import { describe, expect, it } from 'vitest'
import {
  PROMPT_RULES,
  extractImagesMarker,
  imagesPromptSection,
  parseImagesList,
  photosLine,
  productImagesMarker,
  wantsPhotos,
} from '@/n8n/product-images.js'
import { CHANNELS, PROMPT_EXPR, markerCode, patchWorkflow } from '@/n8n/product-images.mjs'
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

// قائمة «تحديد التاجر».product_images بتجربة ماسنجر 2026-10-29 (الزبون 28386991107651965) — نفسها بكل دور
const HOODIES = '- هودي شتوي — ابيض ← رمز الصور: 7\n- هودي شتوي — احمر ← رمز الصور: 8\n- هودي شتوي — اسود ← رمز الصور: 6'
const SIGN_OFF = 'إذا تحتاج أي شي ثاني، أني حاضر!' // ينشال بحارس بعدين

describe('parseImagesList / photosLine', () => {
  it('القائمة كما تطلع من bot_product_images_section، ومنتج بلا لون', () => {
    expect(parseImagesList(HOODIES + '\n- غسالة ← رمز الصور: ١٢\nسطر ثاني')).toEqual([
      { product: 'هودي شتوي', color: 'ابيض', code: 7 },
      { product: 'هودي شتوي', color: 'احمر', code: 8 },
      { product: 'هودي شتوي', color: 'اسود', code: 6 },
      { product: 'غسالة', color: '', code: 12 },
    ])
    expect(parseImagesList('')).toEqual([])
  })

  it('سطر الصور يجمع ألوان المنتج الواحد', () => {
    const [w, , b] = parseImagesList(HOODIES)
    expect(photosLine([b])).toBe('تدلل، هاي صور هودي شتوي اسود 👇')
    expect(photosLine([b, w, { product: 'غسالة', color: '', code: 1 }])).toBe('تدلل، هاي صور هودي شتوي اسود وابيض وغسالة 👇')
  })
})

describe('productImagesMarker — القائمة تصحح الوكيل (ماسنجر 2026-10-29، التنفيذات 2915–2992)', () => {
  const run = (customerMessage: string, output: string, lastBotReply = '') =>
    productImagesMarker({ output, customerMessage, lastBotReply, list: HOODIES })

  it('2915 «عندك صور لكلل الألوان»: الوكيل نسى الأسود ← الثلاث ألوان، والرد سطر وحد', () => {
    const r = run('عندك صور لكلل الألوان', 'إي، عندي صور لكل الألوان. هاي صور الهودي الشتوي الأسود واللونيين الآخرين:\n\n'
      + '- هودي شتوي أبيض 👇  \nIMAGES: 7\n\n- هودي شتوي أحمر 👇  \nIMAGES: 8\n\nإذا تحتاج أي تفاصيل إضافية، أني حاضر!')
    expect(r.codes).toEqual([7, 8, 6])
    expect(r.output).toBe('تدلل، هاي صور هودي شتوي ابيض واحمر واسود 👇\n\nإذا تحتاج أي تفاصيل إضافية، أني حاضر!')
  })

  it('2933 «وين الأسود؟ ليش مدزهن كلهن» بعد رد صور: الإنكار ينشال والأسود ينرسل', () => {
    const r = run('وين الأسود؟\nليش مدزهن كلهن',
      'لا، ما عدنا صورة للهودي الأسود هسة. عندي فقط صور للهويهات بالألوان التالية:\n\n- هودي شتوي أبيض\n- هودي شتوي أحمر\n\n'
      + 'إذا تحب تشوف صورهم، دزيت لك الصور سابقاً. ' + SIGN_OFF,
      'إي، عندي صور لكل الألوان. هاي صور الهودي الشتوي الأسود واللونيين الآخرين: - هودي شتوي أبيض 👇 - هودي شتوي أحمر')
    expect(r).toEqual({ output: 'تدلل، هاي صور هودي شتوي اسود 👇\n\n' + SIGN_OFF, codes: [6], dropped: [] })
  })

  it('2950 «اريد صورة هودي اسود»: ولا «تدريجياً» ولا إنكار', () => {
    const r = run('اريد صورة هودي اسود', 'لا، ما عدنا صورة للهودي الأسود هسة. تدريجياً، عندي صور للهويهات بالألوان التالية:\n\n'
      + '- هودي شتوي أبيض\n- هودي شتوي أحمر\n\nإذا تحب تشوف صورهم، دزيت لك الصور سابقاً. ' + SIGN_OFF)
    expect(r.codes).toEqual([6])
    expect(r.output).not.toMatch(/ما عدنا|تدريجيا/)
  })

  it('2958 الوكيل دز صح: كلامه يبقى مثل ما هو', () => {
    const r = run('انت بداية المحادثة دزيتلي صورة هودي اسود لا تهلوس و دز الصورة', 'إي، هسه دزيت لك صورة الهودي الأسود 👇\nIMAGES: 6')
    expect(r).toEqual({ output: 'إي، هسه دزيت لك صورة الهودي الأسود 👇', codes: [6], dropped: [] })
  })

  it('2969 «من اطلبها منك متدزها» وبعده 2977 «دوختني»: الوكيل ينكر صورة موجودة ← تنرسل', () => {
    const a = run('لعد ليش من اطلبها منك متدزها الي..', 'صحيح، دزيت لك صورة الهودي الأسود سابقاً. لكن، هسة ما عدني أي صورة للهودي الأسود.',
      'إي، هسه دزيت لك صورة الهودي الأسود 👇')
    expect(a).toEqual({ output: 'تدلل، هاي صور هودي شتوي اسود 👇', codes: [6], dropped: [] })
    const b = run('شني هاي يمعود دوختني وياك', 'أعتذر إذا دوختك، عزيزي. الصورة الخاصة بالهودي الأسود ما موفرة عندي حالياً.')
    expect(b).toEqual({ output: 'تدلل، هاي صور هودي شتوي اسود 👇\n\nأعتذر إذا دوختك، عزيزي.', codes: [6], dropped: [] })
  })

  it('2985 «صورة الأسود و Red»: بترتيب كلامه، وسطر وحد بدل سطرين 👇', () => {
    const r = run('لا تهلوس و دزيلي صورة الأسود و Red',
      'تدلل، هاي صورة الهودي الأسود 👇\nIMAGES: 6\n\nوهنا صورة الهودي الأحمر 👇\nIMAGES: 8')
    expect(r).toEqual({ output: 'تدلل، هاي صور هودي شتوي اسود واحمر 👇', codes: [6, 8], dropped: [] })
  })

  it('لون حدده الزبون يغلب اختيار الوكيل: الزائد ينشال', () => {
    expect(run('دزلي صورة الابيض بس', 'تدلل 👇\nIMAGES: 7, 8')).toEqual({ output: 'تدلل، هاي صور هودي شتوي ابيض 👇', codes: [7], dropped: [8] })
  })

  it('سؤال ثاني ويا الصورة يبقى جوابه', () => {
    const r = run('شكد سعره ودزلي صورة الابيض', 'سعره 25,000 دينار. تدلل هاي صورته 👇\nIMAGES: 7')
    expect(r).toEqual({ output: 'سعره 25,000 دينار. تدلل هاي صورته 👇', codes: [7], dropped: [] })
  })

  it.each([
    ['شكد سعره؟', 'سعره 25,000 دينار', 'تدلل، هاي صور هودي شتوي اسود 👇'],
    ['اريد الاسود قياس لارج', 'تمام، هودي شتوي أسود لارج. شكم قطعة رايد؟', 'تدلل، هاي صور هودي شتوي اسود 👇'],
    ['عندك صورة للوردي؟', 'لا، ماكو صورة للوردي هسة.', ''],
    ['عندك هدية ويا الطلب؟ دزلي صورة', 'ماكو هدية عزيزي.', ''],
  ])('ما يتصحح شي: «%s»', (customerMessage, output, lastBotReply) => {
    expect(run(customerMessage, output, lastBotReply)).toEqual({ output, codes: [], dropped: [] })
  })

  it('منتجين وما حدد: الوكيل يسأل، وما تنرسل صور', () => {
    const list = HOODIES + '\n- تيشيرت — ابيض ← رمز الصور: 9'
    const output = 'تحب تشوف صور الهودي لو التيشيرت؟'
    expect(productImagesMarker({ output, customerMessage: 'عندك صور؟', list })).toEqual({ output, codes: [], dropped: [] })
    // سمّى المنتج بكتابة ثانية («تشيرت» = «تيشيرت»)
    expect(productImagesMarker({ output, customerMessage: 'دزلي صورة التشيرت', list }).codes).toEqual([9])
  })
})

describe('markerCode — مدخلات العقدة', () => {
  it('آخر رد للبوت من «Load Recent Bot Replies» إذا عقدة الصوت ما اشتغلت، والقائمة من «تحديد التاجر»', () => {
    const code = markerCode(CHANNELS.messenger)
    expect(code).toContain('"recentBot":"Load Recent Bot Replies"')
    expect(code).toContain('json.product_images')
    expect(code).toContain('productImagesMarker({ output: j.output ?? j.text ?? \'\', customerMessage, lastBotReply, list })')
    expect(code).not.toMatch(/^export /m)
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
