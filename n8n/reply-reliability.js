/**
 * موثوقية الرد (Reply Reliability) — البوت يرد حتى لو انقطع الاتصال، وما يكول «حجزت» بدون حجز
 * =========================================================================================
 * تجربة ماسنجر 2026-10-29 (4 زبائن بنفس الوقت، 14:13–14:27):
 *
 *   ١. ثلاث رسائل انجاوبت بـ «تدلل عزيزي، دقيقة وأرجعلك بالجواب 🌷» بدل الجواب (التنفيذات 2660، 2698، 2728):
 *      «OpenAI Chat Model: Request timed out» بعد ~10.5 ثانية. هذا مهلة الاتصال الافتراضية بـ undici (10 ثواني):
 *      جهاز n8n أحياناً ما يكدر يفتح اتصال (IPv6 ما يشتغل عليه أصلاً). والنموذج الاحتياطي Groq فشل بكل مرة:
 *      «Request too large … TPM: Limit 8000, Requested 21569» — الطلب ~21 ألف توكن والحساب المجاني 8 آلاف بالدقيقة،
 *      فالاحتياطي ما اشتغل ولا مرة. البديل: نموذج OpenAI ثاني (نفس الحساب) يفتح اتصال جديد (n8n/reply-reliability.mjs).
 *   ٢. «تدلل عزيزي، حجزت لك هودي شتوي واحد أسود وواحد أحمر.» (التنفيذ 2724) والسلة فاضية وما انستدعت create_order:
 *      الوكيل كتب «حجزت لك… شكم وحدة وأي قياس؟»، وحارس الأسئلة شال السؤال وبقى الادعاء لوحده.
 *      dropFalseBooking تبدّل ادعاء الحجز بـ «سجّلت اختيارك» إذا ما صار حجز فعلاً بهالدور.
 *
 * هذا الملف مصدر الكود: n8n/reply-reliability.mjs يزرعه بعقد n8n، وtests/reply-reliability.test.ts يختبره.
 */

/** ادعاء إن الطلب انحجز أو تثبت: «حجزت لك»، «حجزتلك»، «حجزنا»، «تم حجز طلبك»، «انحجز»، «ثبتت لك»، «تم تثبيت طلبك». */
export const BOOKED_CLAIM = /(?:حجزت|حجزنا|ثبتت|ثبتنا|انحجز)(?:\s*ل[كچ]|ل[كچ])?(?![\p{L}])|تم\s+(?:حجز|تثبيت)(?:\s+(?:طلب[كچ]|الطلب|طلبيت[كچ]|حجز[كچ]))?/gu

/**
 * مجاملة بلا سؤال («You're welcome! ❤»، «thank you so much»، «شكراً حبيبي»): الرد جملة مجاملة وبس.
 * ماسنجر 2026-10-29 14:37: «You're welcome! ❤» ← «عدنا هودي شتوي باللون الأسود…». حارس «Drop Repeated Blocks» القديم
 * (THANKS_ONLY) يعرف الشكر العربي و«thanks» بس. نفس تعبير COURTESY_ONLY بـ n8n/answer-accuracy.js (الاختبار يتأكد).
 * «تمام» و«اوك» و«👍» مو منها: ممكن تكون موافقة على «أثبّتلك الطلب؟».
 */
export const COURTESY_ONLY = /^(?:(?:you ?re|you are|ur) welcome|welcome|thanks?(?: a lot| so much)?|thank you(?: so much| very much)?|thx|ty|شكرا(?: جزيلا)?|مشكور(?:ين)?|تسلم(?:ين|ون)?|ممنون|العفو|عفوا|الله يسلمك|الله يخليك|حبيبي|عزيزي)(?: (?:حبيبي|عزيزي|اخي|اختي|كلش|هوايه|dear|bro))*$/

export const COURTESY_REPLY = 'تسلم عزيزي 🌷 بالخدمة بأي وقت.'

export function isCourtesyMessage(said) {
  const t = String(said ?? '').replace(/[٠-٩]/g, '').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .toLowerCase().replace(/[’'`]/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  return Boolean(t) && COURTESY_ONLY.test(t)
}

/** رد المجاملة: جملة وحدة ثابتة بدل أي عرض منتجات. رد التحويل لموظف يبقى مثل ما هو. */
export function courtesyReply(text, said) {
  const src = String(text ?? '')
  if (!isCourtesyMessage(said) || /NOTIFICATION_TYPE\s*:\s*complaint/i.test(src)) return src
  return [COURTESY_REPLY, ...src.split('\n').filter((l) => isHidden(l))].join('\n')
}

const isHidden = (line) => /^\s*(?:STAGE|NOTIFICATION_TYPE|IMAGES?)\s*:/i.test(line)

/**
 * @param {string} text رد الوكيل (ويا الأسطر المخفية STAGE / NOTIFICATION_TYPE)
 * @param {{ orderCreated: boolean }} p orderCreated = create_order انستدعت بهالدور
 * @returns {string} الرد بلا ادعاء حجز ما صار
 */
export function dropFalseBooking(text, { orderCreated }) {
  const src = String(text ?? '')
  if (orderCreated) return src
  return src.split('\n').map((line) => (isHidden(line) ? line : line
    .replace(BOOKED_CLAIM, 'سجّلت اختيارك')
    // بآخر السطر: «سجّلت اختيارك ✅»؛ وقبل تفاصيل: «سجّلت اختيارك: هودي…»
    .replace(/سجّلت اختيارك[\s.!؟?✅:،,]*$/, 'سجّلت اختيارك ✅')
    .replace(/سجّلت اختيارك[ \t]*[:،,]?[ \t]*(?=[^\s✅.!؟?:،,])/g, 'سجّلت اختيارك: ')
  )).join('\n')
}
