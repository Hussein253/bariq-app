/**
 * صور المنتجات (Product Images) — البوت يدز صور المنتج إذا الزبون طلبها
 * =====================================================================
 * التاجر يرفع الصور من لوحة برق (صفحة المنتجات، الترحيل ٠٣٢)، والصورة تخص «المنتج + اللون».
 * المسار بكل قناة (واتساب، ماسنجر، إنستغرام):
 *
 *   ١. «تحديد التاجر» يجيب product_images = public.bot_product_images_section(merchant): سطر لكل منتج/لون
 *      عنده صور ومتوفر بالمخزون، ويا «رمز الصور». البرومت يضيف قسم «صور المنتجات» (PROMPT_SECTION) بس
 *      إذا القائمة مو فاضية — تاجر بلا صور يبقى البوت عنده مثل ما جان.
 *   ٢. الوكيل، إذا الزبون طلب يشوف صورة، يكتب جملة قصيرة وبآخر الرد سطر مخفي: IMAGES: <رمز>.
 *   ٣. عقدة «Product Images Marker» بعد الوكيل مباشرة (قبل كل الحراس): تشيل سطر IMAGES من الرد وتحفظ الرموز.
 *      الحراس كلها تعرف الأسطر المخفية STAGE / NOTIFICATION_TYPE بس؛ سطر ثالث يوصلها جان ينحسب كلام
 *      للزبون. وسطر IMAGES ينقبل بس إذا الزبون طالب صورة بهالرسالة أو رد البوت السابق عرض عليه صور
 *      (wantsPhotos): gpt-4o-mini ينسخ رده السابق من الذاكرة، فبدون هالشرط الصور تنعاد ويا كل رد.
 *      والعقدة تصحح الوكيل من القائمة نفسها (photosFix): ماسنجر 2026-10-29 (التنفيذات 2915–2992) الزبون طلب
 *      «صور لكل الألوان» والوكيل كتب رموز الأبيض والأحمر بس، وبعدها خمس ردود «ما عدنا صورة للهودي الأسود»
 *      وصورته بالقائمة (رمز 6) بكل دور — ينسخ إنكاره من الذاكرة. هسة اللون أو المنتج الي يسميه الزبون، أو
 *      «كل الألوان»، أو الي ينكره الوكيل وهو بالقائمة، صوره تنرسل والرد يصير سطر وحد يطابقها.
 *   ٤. بعد ما ينرسل الرد النصي: «Product Images?» ← «Load Product Images» (public.bot_product_images: رموز
 *      هذا التاجر وحده، ٦ صور كحد أعلى) ← إرسال كل صورة كرسالة برابطها العام ← فشل الإرسال ينسجل بـ failed_events.
 *
 * هذا الملف مصدر الكود: n8n/product-images.mjs يحوّله لعقد n8n، وtests/product-images.test.ts يختبره.
 */

/** سطر الرموز المخفي: «IMAGES: 12» أو «IMAGES: 12, 15» (أرقام عربية أو هندية، فارزة عربية أو إنكليزية). */
export const IMAGES_LINE = /^[ \t]*IMAGES?[ \t]*[:：][ \t]*([^\n]*)(?:\n|$)/gim

/** الوكيل يكدر يطلب صور ٣ منتجات كحد أعلى بالرد الواحد (نفس حد public.bot_product_images). */
export const MAX_CODES = 3

const toLatinDigits = (s) => String(s).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))

/**
 * يشيل أسطر IMAGES من رد الوكيل ويرجّع الرموز.
 * @param {string} output رد الوكيل الخام
 * @returns {{ text: string, codes: number[] }} الرد بدون السطر، والرموز (بلا تكرار، ٣ كحد أعلى)
 */
export function extractImagesMarker(output) {
  const codes = []
  const text = String(output ?? '').replace(IMAGES_LINE, (line, list) => {
    for (const part of toLatinDigits(list).split(/[,،\s]+/)) {
      const n = Number(part.replace(/^#/, ''))
      if (Number.isSafeInteger(n) && n > 0 && !codes.includes(n)) codes.push(n)
    }
    return ''
  })
  return {
    // السطر المشال ما يخلي فراغ: أسطر فارغة متتالية ترجع وحدة، والنهاية بلا فراغ
    text: text.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, ''),
    codes: codes.slice(0, MAX_CODES),
  }
}

const norm = (s) => String(s ?? '').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/ـ/g, '').toLowerCase()

/**
 * كلمات طلب الصورة بعد التطبيع: صورة/صور/تصوير، شكله، أشوف/نشوف، وريني/راويني، فوتو، وێنە (كردي)، pic/photo/image.
 * الشرط متساهل عمداً: هو بوابة تمنع إعادة الصور بالردود الي بعدها، والوكيل هو الي يقرر يدز لو لا.
 */
export const ASKS_FOR_PHOTO = /صور|شكل|(?<!\p{L})[اني]?شوف|(?<!\p{L})(?:وري|راوي)|فوتو|وێنە|وينه|(?<![a-z])(?:pic|photo|image|img)/u

/** رد البوت السابق عرض صور ويسأل («تحب أدزلك صورته؟»): جواب الزبون «اي» يكفي. */
const OFFERED_PHOTOS = /صور[^\n؟?]*[؟?]/

/**
 * @param {{ customerMessage?: string, lastBotReply?: string }} p
 * @returns {boolean} الزبون طالب صورة هسة، أو جاي يجاوب على عرض صور
 */
export function wantsPhotos({ customerMessage = '', lastBotReply = '' } = {}) {
  return ASKS_FOR_PHOTO.test(norm(customerMessage)) || OFFERED_PHOTOS.test(norm(lastBotReply))
}

/** سطر من قائمة «صور المنتجات» (public.bot_product_images_section): «- هودي شتوي — اسود ← رمز الصور: 6». */
const LIST_LINE = /^[ \t]*-[ \t]*(.+?)(?:[ \t]+—[ \t]+(.+?))?[ \t]+←[ \t]+رمز الصور:[ \t]*([0-9٠-٩]+)[ \t]*$/

/**
 * @param {string} list عمود product_images من «تحديد التاجر»
 * @returns {{ product: string, color: string, code: number }[]} color = '' لصورة منتج بلا لون
 */
export function parseImagesList(list) {
  const entries = []
  for (const line of String(list ?? '').split('\n')) {
    const m = line.match(LIST_LINE)
    if (m) entries.push({ product: m[1].trim(), color: (m[2] ?? '').trim(), code: Number(toLatinDigits(m[3])) })
  }
  return entries
}

/** أسماء الألوان بالإنكليزي («دزلي صورة الأسود و Red»)، مفاتيحها مطبّعة مثل ألوان الكتالوج. */
const EN_COLORS = {
  اسود: ['black'], ابيض: ['white'], احمر: ['red'], ازرق: ['blue'], اخضر: ['green'], اصفر: ['yellow'],
  وردي: ['pink'], رصاصي: ['grey', 'gray'], رمادي: ['grey', 'gray'], جوزي: ['brown'], بني: ['brown'],
  بيجي: ['beige'], بيج: ['beige'], كحلي: ['navy'], بنفسجي: ['purple'], برتقالي: ['orange'],
}

/** كلمات اللون: «اسود» ← اسود، سودا، سوداء، black (أفعل ← فعلاء للمؤنث). */
function colorWords(color) {
  const c = norm(color).trim()
  if (!c) return []
  const feminine = c.match(/^ا(\p{L}{3})$/u)
  return [c, ...(feminine ? [feminine[1] + 'ا', feminine[1] + 'اء'] : []), ...(EN_COLORS[c] ?? [])]
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** موضع أول ذكر للكلمة بالنص المطبّع، كلمة كاملة ويا سوابق العربي (ال، بال، لل، و) ولاحقة الجمع. -1 = ما مذكورة. */
function mentionAt(text, word) {
  const re = /^[a-z]/.test(word)
    ? new RegExp(`(?<![a-z])${escapeRe(word)}s?(?![a-z])`)
    : new RegExp(`(?<!\\p{L})(?:[وبفك]?ال|[وبفك]?لل|[وبفلك])?${escapeRe(word)}(?:ات|ه)?(?!\\p{L})`, 'u')
  const m = re.exec(text)
  return m ? m.index : -1
}

const stem = (w) => w.replace(/^(?:[وبفك]?ال|[وبفك]?لل|و)/, '').replace(/(?:ات|ه)$/, '')
const loose = (w) => w.replace(/[يو]/g, '')

/** الزبون سمّى المنتج بأول كلمة من اسمه: «الهودي»، «هوديات» = «هودي شتوي»؛ «تشيرت» = «تيشيرت» (كلمة ٥ حروف أو أكثر). */
function namesProduct(text, product) {
  const h = stem(norm(product).trim().split(/\s+/)[0] ?? '')
  if (h.length < 2) return false
  return text.split(/[^\p{L}a-z]+/u).some((w) => {
    const s = stem(w)
    return s === h || (h.length >= 5 && loose(s) === loose(h))
  })
}

/**
 * صور القائمة الي يسميها النص: اللون المذكور (بترتيب ذكره)، وإلا كل ألوان المنتج المذكور، وإلا كل القائمة إذا طلب «كل الألوان».
 * المنتج: المذكور، وإلا الوحيد بالقائمة، وإلا الي اختاره الوكيل.
 */
function namedEntries(text, entries, { all = false, agentProducts = [] } = {}) {
  const products = [...new Set(entries.map((e) => e.product))]
  const named = products.filter((p) => namesProduct(text, p))
  const scope = named.length ? named : products.length === 1 ? products : agentProducts
  const pool = scope.length ? entries.filter((e) => scope.includes(e.product)) : entries
  const colored = pool
    .map((e) => ({ e, at: Math.min(...colorWords(e.color).map((w) => mentionAt(text, w)).filter((i) => i >= 0)) }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.e)
  if (colored.length) return colored
  return named.length || (all && scope.length) ? pool : []
}

/** «كل الألوان»، «لكلل»، «كلهن»، «جميع»، «all». */
const ALL_PHOTOS = /(?<!\p{L})[ولب]?(?:كل+|جميع)(?:هن|ها|هم)?(?!\p{L})|الوان|(?<![a-z])all(?![a-z])/u
/** رد البوت السابق كان عن الصور، والزبون يكمّل عليه: «وين الأسود؟»، «ليش مدزهن كلهن»، «من اطلبها متدزها». */
const PHOTO_TALK = /صور|👇/u
const FOLLOW_UP = /(?<!\p{L})وين|دز|ارسل|بعث/u
const HAVE = '(?:(?<!\\p{L})ما ?(?:عد|عند|اكو|موجود|متوفر|موفر|متاح)|ماكو|مااكو|مو (?:موجود|متوفر|موفر|متاح)|غير (?:موجود|متوفر))'
/** الوكيل ينكر صورة: «ما عدنا صورة للهودي الأسود»، «الصورة الخاصة بالأسود ما موفرة عندي». */
const DENIES_PHOTO = new RegExp(`${HAVE}[^.!؟?\\n]{0,40}صور|صور[^.!؟?\\n]{0,40}${HAVE}`, 'u')
const HIDDEN_LINE = /^\s*(?:STAGE|NOTIFICATION_TYPE)\s*:/i

const sentencesOf = (line) => line.match(/[^.!؟?]+[.!؟?]*\s*/g) ?? [line]

/** سطر الرد للصور المرسلة: «تدلل، هاي صور هودي شتوي اسود واحمر 👇». */
export function photosLine(sent) {
  const groups = []
  for (const e of sent) {
    let g = groups.find((x) => x.product === e.product)
    if (!g) groups.push((g = { product: e.product, colors: [] }))
    if (e.color && !g.colors.includes(e.color)) g.colors.push(e.color)
  }
  return 'تدلل، هاي صور ' + groups.map((g) => [g.product, g.colors.join(' و')].filter(Boolean).join(' ')).join(' و') + ' 👇'
}

/** كلام الوكيل عن الصور (إنكار، قائمة «- هودي شتوي أبيض 👇»، «دزيتلك الصور») يتبدل بسطر الصور؛ باقي الرد يبقى وراه. */
function rewritePhotoText(text, sent, entries) {
  const products = [...new Set(entries.map((e) => e.product))]
  const kept = []
  for (const line of text.split('\n')) {
    if (HIDDEN_LINE.test(line)) { kept.push(line); continue }
    const n = norm(line).trim()
    if (/^[-•*]/.test(n) && products.some((p) => namesProduct(n, p))) continue
    const rest = sentencesOf(line).filter((s) => !PHOTO_TALK.test(norm(s))).join('').trim()
    if (rest) kept.push(rest)
  }
  const rest = kept.join('\n').trim()
  return photosLine(sent) + (rest ? '\n\n' + rest : '')
}

/**
 * تصحيح الوكيل من قائمة الصور نفسها. null = ماكو شي يتصحح (تمشي قاعدة wantsPhotos العادية).
 * @param {{ text: string, codes: number[], customerMessage: string, lastBotReply: string, entries: ReturnType<typeof parseImagesList> }} p
 * @returns {{ text: string, codes: number[] } | null}
 */
function photosFix({ text, codes, customerMessage, lastBotReply, entries }) {
  const msg = norm(customerMessage)
  const asked = ASKS_FOR_PHOTO.test(msg) || (PHOTO_TALK.test(norm(lastBotReply)) && FOLLOW_UP.test(msg))
  const agentProducts = [...new Set(entries.filter((e) => codes.includes(e.code)).map((e) => e.product))]
  const denials = text.split('\n').flatMap(sentencesOf).map(norm).filter((s) => DENIES_PHOTO.test(s))
  let target = asked ? namedEntries(msg, entries, { all: ALL_PHOTOS.test(msg), agentProducts }) : []
  // الوكيل كال «ماكو صورة» لشي بالقائمة: الكلام غلط والصورة موجودة
  if (!target.length) target = denials.flatMap((s) => namedEntries(s, entries))
  if (!target.length) return null
  const final = [...new Set(target.map((e) => e.code))].slice(0, MAX_CODES)
  const same = final.length === codes.length && final.every((c) => codes.includes(c))
  // كلام الوكيل يبقى إذا رموزه هي نفسها وما ينكر، وكتب سطر 👇 واحد بالكثير (مو قائمة صور لون لون)
  if (same && !denials.length && (text.match(/👇/gu) ?? []).length <= 1) return { text, codes: final }
  const sent = final.map((c) => entries.find((e) => e.code === c))
  return { text: rewritePhotoText(text, sent, entries), codes: final }
}

/**
 * عقدة «Product Images Marker»: الرد بلا سطر IMAGES، والرموز المقبولة.
 * @param {{ output: string, customerMessage?: string, lastBotReply?: string, list?: string }} p list = قائمة صور التاجر (product_images)
 * @returns {{ output: string, codes: number[], dropped: number[] }} dropped = رموز كتبها الوكيل وما تنرسل
 */
export function productImagesMarker({ output, customerMessage = '', lastBotReply = '', list = '' }) {
  const { text, codes } = extractImagesMarker(output)
  const entries = parseImagesList(list)
  const fix = entries.length ? photosFix({ text, codes, customerMessage, lastBotReply, entries }) : null
  if (fix) return { output: fix.text, codes: fix.codes, dropped: codes.filter((c) => !fix.codes.includes(c)) }
  if (!codes.length) return { output: text, codes: [], dropped: [] }
  return wantsPhotos({ customerMessage, lastBotReply })
    ? { output: text, codes, dropped: [] }
    : { output: text, codes: [], dropped: codes }
}

/** قسم البرومت — يتحقن قبل تعليمات المتجر، وبس إذا التاجر عنده صور لمنتجات متوفرة. */
export const PROMPT_SECTION = [
  '',
  '',
  '# صور المنتجات',
  'عدك صور حقيقية لهاي المنتجات، والنظام يدزها للزبون كرسائل صور بعد ردك مباشرة:',
].join('\n')

export const PROMPT_RULES = [
  '',
  '- إذا الزبون طلب يشوف صورة أو شكل منتج من هاي القائمة («دزلي صورته»، «أريد أشوف شكله»، «عندك صور؟»): رد بجملة وحدة قصيرة مثل «تدلل، هاي صور التشيرت الأبيض 👇»، وبآخر الرد اكتب سطر لحاله: IMAGES: <رمز الصور>. أكثر من رمز: كلها بنفس السطر الواحد وبينها فارزة (IMAGES: 12, 15, 18)، وثلاث رموز كحد أعلى.',
  '- إذا طلب صور منتج وما حدد لون («دزلي صورهن»، «صور الهودي»، «كل الألوان»): دز صور كل ألوانه الموجودة بهاي القائمة، كل لون برمزه بنفس سطر IMAGES. لا تختار لون واحد منها.',
  '- إذا ما حدد أي منتج وبالقائمة أكثر من منتج (أسماء مختلفة): اسأله أي منتج يريد يشوف صوره، بدون سطر IMAGES. وإذا بالقائمة منتج واحد بس (حتى لو بأكثر من لون): دز صور كل ألوانه.',
  '- سطر IMAGES بس بالرد الي يطلب بيه الزبون الصورة، وبس برموز من هاي القائمة. ممنوع تكتب رمز الصور بكلامك للزبون، وممنوع تكرر IMAGES بالردود الي بعدها.',
  '- إذا طلب صورة منتج أو لون مو بهاي القائمة: گله ماكو صورة إله هسة، ووصفه بالكلام من معلومات المنتج. ممنوع توعده بصورة.',
  '- هاي القائمة هي الحقيقة هسة: كل منتج ولون مكتوب بيها صورته موجودة. إذا رد سابق إلك بالمحادثة گال «ماكو صورة» لشي بهاي القائمة، فذاك الرد غلط: لا تعيده، ودز رمزه.',
].join('\n')

/** نص القسم الكامل لقائمة معينة ('' = ماكو صور). مستعمل بتعبير البرومت وبالاختبارات. */
export function imagesPromptSection(list) {
  const l = String(list ?? '').trim()
  return l ? PROMPT_SECTION + '\n' + l + PROMPT_RULES : ''
}
