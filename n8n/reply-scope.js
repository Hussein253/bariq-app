/**
 * الجواب على قدّ السؤال (Reply Scope) — المنتج باسمه بس، والقياسات بس إذا الزبون سأل عنها
 * =====================================================================================
 * قاعدة صاحب المتجر (2026-10-29): «أريد البوت يجاوب على قدر السؤال… يذكر فقط التيشيرت، ما يذكر القياسات وياهن
 * حتى ما يطلب الزبون القياس… بكل شيء يذكر فقط المنتج بعيداً عن التفاصيل».
 * البوت جان يعيد «- أسود: سمول، ميديم، لارج، اكس لارج» لكل لون (ماسنجر، التنفيذات 2782، 2809، 2819، 2845، 2940)،
 * لأن البرومت نفسه يأمره بهالشكل: «لما تعرض المتوفر… اكتب كل لون بسطر واحد، مثل: «- أسود: سمول، ميديم، اكس لارج»».
 *
 *   ١. البرومت (n8n/reply-scope.mjs): الأسطر الي تأمر بعرض القياسات والسعر ويا كل جواب تتبدل، وتنضاف القاعدة العامة.
 *   ٢. تنبيه كل دور: detailsHint بـ n8n/answer-accuracy.js (شنو التفاصيل الي سأل عنها بهالرسالة بالذات).
 *   ٣. هذا الحارس (آخر الحراس قبل «Parse Agent Output»): الزبون ما سأل عن القياس وماكو طلب جاري ← قوائم القياسات
 *      تنشال من الرد. gpt-4o-mini ما يلتزم بالبرومت دائماً: التنفيذ 2940 كتب القوائم ويا تنبيه «جملة أو جملتين».
 *
 * هذا الملف مصدر الكود: n8n/reply-scope.mjs يزرعه بعقد n8n، وtests/reply-scope.test.ts يختبره.
 */

/** الزبون سأل عن القياس (على نص مطبّع). نفس ASKS_DETAIL.sizes بـ n8n/answer-accuracy.js (الاختبار يتأكد). */
export const ASKS_SIZES = /قياس|مقاس|حجم|احجام|حجوم|سايز|size|طولي|وزني|سمول|ميديم|ميديوم|لارج|(?<![a-z])(?:xs|x?xl|[23]xl|small|medium|large)(?![a-z])/

const scopeNorm = (s) => String(s ?? '').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/ـ/g, '').toLowerCase()

export const asksAboutSizes = (said) => ASKS_SIZES.test(scopeNorm(said))

/** قياس واحد مثل ما يكتبه الوكيل: سمول، ميديم، لارج، اكس لارج، دبل اكس لارج، S، XL، 2XL… */
const SIZE_TOKEN = '(?:(?:دبل |تربل )?[اإ]كس (?:لارج|سمول)|سمول|ميديو?م|لارج|(?<![A-Za-z])(?:[23]?XL|XXX?L|XS|S|M|L|small|medium|large|x-?large)(?![A-Za-z]))'
const SIZE_SEP = '[ \\t]*(?:[،,/|]|-(?=[ \\t])|و)[ \\t]*(?:و[ \\t]*)?'
const SIZE_LABEL = '(?:[وب]?(?:ال)?(?:قياسات|مقاسات|[اأ]حجام)(?:[ \\t]+(?:ال)?(?:متوفر[ةه]|متاح[ةه]|موجود[ةه]))?(?:[ \\t]+(?:هي|هن))?[ \\t]*[:：]?[ \\t]*)'
/** قياسين أو أكثر ويا عنوانهن والنقطتين قبلهن: «- أسود: سمول، ميديم، لارج» ← «- أسود». */
const SIZE_LIST = new RegExp(`[ \\t]*[:：—–]?[ \\t]*${SIZE_LABEL}?\\(?${SIZE_TOKEN}(?:${SIZE_SEP}${SIZE_TOKEN})+\\)?`, 'giu')
/** جملة بقت عنوان قياسات بلا قائمة: «القياسات المتاحة للهودي الأسود هي». */
const SIZE_LEFTOVER = /(?:قياسات|مقاسات|[اأ]حجام)[^.!؟?\n]*(?:هي|هن|[:：])\s*[.!؟?]?\s*$/u

const scopeHidden = (line) => /^\s*(?:STAGE|NOTIFICATION_TYPE|IMAGES?)\s*:/i.test(line)

/**
 * @param {string} text رد الوكيل (ويا الأسطر المخفية STAGE / NOTIFICATION_TYPE)
 * @param {{ said?: string, ordering?: boolean }} p said = رسالة الزبون، ordering = طلب جاري أو نية شراء (القياس جزء من الطلب)
 * @returns {string} الرد بلا قوائم قياسات ما سألها الزبون
 */
export function dropUnaskedSizes(text, { said = '', ordering = false } = {}) {
  const src = String(text ?? '')
  if (ordering || asksAboutSizes(said)) return src
  let changed = false
  const lines = []
  for (const line of src.split('\n')) {
    if (scopeHidden(line)) { lines.push(line); continue }
    const out = line.replace(SIZE_LIST, () => { changed = true; return '' })
    if (out === line) { lines.push(line); continue }
    const kept = (out.match(/[^.!؟?]+[.!؟?]*\s*/g) ?? [out]).filter((s) => !SIZE_LEFTOVER.test(s)).join('')
      .replace(/[ \t]+([.,،!؟?])/g, '$1').replace(/[ \t]{2,}/g, ' ').replace(/\s+$/, '')
    // سطر كان قائمة قياسات بس («- سمول، ميديم») ما يبقى منه شي
    if (!/^\s*[-•*]?\s*$/.test(kept)) lines.push(kept)
  }
  return changed ? lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() : src
}

/** كلمات الشراء، لمسار ما بيه «Order Context Hint» (إنستغرام). */
const BUY_WORDS = /(?<!\p{L})(?:احجز|ثبت|اطلب|اشتري|رايد|اريد|ابي(?!ض)|ابغي|اخذ)|وحده|قطعه|قطعتين/u

/**
 * @param {object | null} orderContext مخرج «Order Context Hint».orderContext
 * @param {string} said رسالة الزبون
 * @returns {boolean} طلب جاري أو نية شراء: القياسات تبقى
 */
export function isOrderingTurn(orderContext, said = '') {
  const oc = orderContext
  if (oc && typeof oc === 'object') {
    return Boolean(oc.explicitIntent || oc.askedToOrder || oc.needsItems || oc.itemsKnown || oc.bookingAllowed
      || oc.itemsFromBot || oc.confirmedOnce || oc.addressGiven)
  }
  return BUY_WORDS.test(scopeNorm(said))
}
