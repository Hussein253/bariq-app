/**
 * الموافقة على آخر ملخص (ماسنجر 2026-10-31، التنفيذ 3134): البوت عرض الملخص («المجموع الكلي… أثبّتلك الطلب؟»)، وبعده
 * سأل «ونعتمد اللون الأحمر، تمام؟». الزبون رد «تمام»، بس الموافقة ما انحسبت لأن confirmedOnce كان يشوف آخر رد بس،
 * فالبوت حسبها ختام ورد «شنو رايد بعد؟». قاعدة صاحب المتجر: تمام، اوكي، إعجاب، تم، أكيد بعد الملخص = تأكيد الطلب.
 *
 *   pendingSummary: أحدث رد للبوت فيه المجموع الكلي، إذا ما تثبّت الطلب بعده.
 *   الردود تجي من «Load Recent Bot Replies» (آخر 4 بس)، فعمود pending_summary (آخر ملخص بـ 6 ساعات وما بعده تثبيت)
 *   ينضاف بالآخر إذا طلع من الأربعة (withPendingSummary).
 *
 * هذا الملف مصدر الكود: n8n/order-summary.mjs يزرعه بعقدة «Order Context Hint»، وtests/order-summary.test.ts يختبره.
 */

/**
 * @param {string[]} botReplies ردود البوت الأخيرة، الأحدث أول (وبالآخر الملخص المعلّق إذا موجود)
 * @param {{ norm: (s: string) => string, showedTotal: RegExp, placed: RegExp, limit?: number }} p
 *   norm وshowedTotal (SHOWED_TOTAL) وplaced (ALREADY_PLACED) من نفس العقدة
 * @returns {string} الملخص المعلّق، أو '' إذا ماكو ملخص أو الطلب تثبّت بعده
 */
export function pendingSummary(botReplies, { norm, showedTotal, placed, limit = 8 }) {
  for (const r of (Array.isArray(botReplies) ? botReplies : []).slice(0, limit)) {
    const n = norm(r)
    if (placed.test(n)) return ''
    if (showedTotal.test(n)) return String(r ?? '')
  }
  return ''
}

/**
 * ردود البوت ويا الملخص المعلّق بالآخر، إذا مو موجود بينها.
 * @param {unknown} replies آخر 4 ردود من «Load Recent Bot Replies»، الأحدث أول
 * @param {unknown} pending عمود pending_summary من نفس العقدة
 * @returns {string[]}
 */
export function withPendingSummary(replies, pending) {
  const list = Array.isArray(replies) ? replies.map((x) => String(x || '')) : []
  const p = String(pending || '')
  return p && !list.includes(p) ? [...list, p] : list
}
