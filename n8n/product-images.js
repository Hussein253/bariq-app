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

/**
 * عقدة «Product Images Marker»: الرد بلا سطر IMAGES، والرموز المقبولة.
 * @param {{ output: string, customerMessage?: string, lastBotReply?: string }} p
 * @returns {{ output: string, codes: number[], dropped: number[] }} dropped = رموز كتبها الوكيل والزبون ما طلب صورة
 */
export function productImagesMarker({ output, customerMessage = '', lastBotReply = '' }) {
  const { text, codes } = extractImagesMarker(output)
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
].join('\n')

/** نص القسم الكامل لقائمة معينة ('' = ماكو صور). مستعمل بتعبير البرومت وبالاختبارات. */
export function imagesPromptSection(list) {
  const l = String(list ?? '').trim()
  return l ? PROMPT_SECTION + '\n' + l + PROMPT_RULES : ''
}
