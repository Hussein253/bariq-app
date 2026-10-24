// البوت ما يردد طلب الزبون بلسانه كأنه هو الي يطلب (ماسنجر 2026-10-24، التنفيذ 1577: الزبون «رايد قطعه من منتجك» ← «تدلل، رايد وحدة من
// غسالة…!»، وبالتنفيذ 1573 «رايد قطعة من غسالة…، شكم وحدة تريد؟»): النموذج رجّع كلمة الزبون بصيغة المتكلم، فطلع الرد حوار مع النفس قدام الزبون.
// التنبيه ببرومت الوكيل (n8n/order-context-hint.js → ownVoiceNote) هو الطبقة الأولى؛ هذا الحارس الحتمي لو النموذج ما التزم.
// «رايد» تبقى مسموحة بسؤال للزبون («شكم قطعة رايد؟»، «شنو رايد؟»، «رايد وحدة من الأسود؟»): الحارس يلمس بس الجملة الخبرية الي بيها
// فعل الرغبة ويا عدد، وتنتهي بفاصلة أو نقطة أو تعجب أو نهاية السطر (مو علامة استفهام). الأسطر المخفية (STAGE / NOTIFICATION_TYPE)
// ما تنلمس. الكود هذا يتحقن بعقدة الحارس بسكربت n8n/premium-replies.mjs.

const OV_WANT = '(?:رايد|رايدة|اريد|أريد|ابي|أبي|ابغى|أبغى|ابغي|أبغي)'
const OV_QTY = '(?:وحده|وحدة|قطعه|قطعة|حبه|حبة|وحدتين|قطعتين|حبتين|[0-9٠-٩]+(?:\\s*(?:قطع|قطعة|وحدات|وحدة|حبات|حبة))?)'
const OV_CLAUSE = new RegExp(
  '(?<=^|[\\s،,.!:])' + OV_WANT + '\\s+(' + OV_QTY + ')(?:\\s+من\\s+([^،,.!؟?\\n]+?))?(?=[ \\t]*(?:[،,.!]|$))',
  'u',
)
// بعد ما نصير نذكر العدد بالجملة، سؤال «شكم وحدة تريد؟» بنفس السطر يناقضها
const OV_QTY_ASK = /[ \t]*[،,]?[ \t]*(?:و)?شكم\s+(?:وحدة|قطعة)[^؟?\n]*[؟?]/
const OV_HIDDEN = /^(?:STAGE|NOTIFICATION_TYPE)\s*:/i

const ovQty = (q) => {
  const t = String(q).replace(/ة/g, 'ه').trim()
  if (/^(?:وحده|قطعه|حبه)$/.test(t)) return 'وحدة'
  if (/^(?:وحدتين|قطعتين|حبتين)$/.test(t)) return 'وحدتين'
  return String(q).trim()
}

/**
 * @param {string} text     رد الوكيل (مع أسطر STAGE / NOTIFICATION_TYPE المخفية بآخره)
 * @param {string} [product] اسم المنتج الوحيد بالمتجر (إذا الجملة «رايد وحدة» بدون «من <منتج>»)
 */
export function fixEchoedRequest(text, product = '') {
  const src = String(text ?? '')
  const name = String(product ?? '').trim()
  let changed = false

  const lines = src.split('\n').map((line) => {
    if (OV_HIDDEN.test(line.trim())) return line
    const m = line.match(OV_CLAUSE)
    if (!m) return line
    const item = (m[2] ?? '').trim() || name
    if (!item) return line // ما نعرف شنو المنتج: أحسن نترك الرد مثل ما هو من نخمّن
    changed = true
    let out = line.replace(OV_CLAUSE, item + '، ' + ovQty(m[1])).replace(OV_QTY_ASK, '')
    out = out.replace(/[ \t]*[،,][ \t]*$/, '')
    return /[.!؟?]$/.test(out.trim()) || !out.trim() ? out : out + '.'
  })

  return changed ? lines.join('\n') : src
}
