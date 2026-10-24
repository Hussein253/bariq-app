// المتجر عنده منتج واحد بس: أي سؤال «شنو المنتج الي تريده؟» / «يا منتج تريد؟» ينبدّل هنا بالمنتج نفسه وسؤال العدد، قبل ما يوصل الزبون
// (ماسنجر 2026-10-24، التنفيذ 1565: «تمام احجزلي الطلب» ← «شنو المنتج الي تريد تحجزه وشكم وحدة؟ عدنا غسالة…»). التنبيه ببرومت
// الوكيل (n8n/order-context-hint.js → singleProductNote) هو الطبقة الأولى؛ هذا الحارس الحتمي لو النموذج ما التزم.
// ما ينلمس: أي جملة ما تسأل عن المنتج، والأسطر المخفية (STAGE / NOTIFICATION_TYPE). الكود هذا يتحقن بعقدة الحارس بسكربت
// n8n/premium-replies.mjs ويشتغل بس إذا product_names (عقدة تحديد التاجر) فيها منتج واحد.

// «شنو المنتج»، «شنو هو المنتج»، «يا منتج»، «أي منتج». «المنتجات» (جمع) ما تنطبق: «شنو المنتجات الي عدنا» جملة وصف مو سؤال اختيار.
const SP_WHICH = /(?:شنو|شو|ايش|إيش)\s+(?:هو\s+)?(?:ال)?منتج(?!ات)|(?:يا|أي|اي)\s+منتج(?!ات)/
const SP_QTY = /^\s*(?:و)?شكم\s+وحدة[^؟?]*[؟?]/
const SP_HIDDEN = /^(?:STAGE|NOTIFICATION_TYPE)\s*:/i

/**
 * @param {string} text     رد الوكيل (مع أسطر STAGE / NOTIFICATION_TYPE المخفية بآخره)
 * @param {string} product  اسم المنتج الوحيد
 */
export function fixSingleProductAsk(text, product) {
  const src = String(text ?? '')
  const name = String(product ?? '').trim()
  if (!name || !SP_WHICH.test(src)) return src

  let replaced = false
  const parts = src.split(/(?<=[.!؟?\n])/).map((part) => {
    const s = part.trim()
    if (!s || SP_HIDDEN.test(s)) return part
    if (SP_WHICH.test(s)) {
      replaced = true
      return 'تدلل، ' + name + '. شكم وحدة تريد؟' + (part.endsWith('\n') ? '\n' : '')
    }
    return part
  })
  if (!replaced) return src

  // بعد الاستبدال: جملة «عدنا <المنتج>.» القصيرة تتكرر، وسؤال «شكم وحدة؟» الثاني يتشال
  let first = true
  const kept = parts.filter((part) => {
    const s = part.trim()
    if (!s || SP_HIDDEN.test(s)) return true
    if (first && s.startsWith('تدلل، ' + name)) { first = false; return true }
    if (first) return true
    if (SP_QTY.test(s)) return false
    return !(s.includes(name) && s.length <= name.length + 16 && !/[؟?]/.test(s))
  })
  return kept
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n{2,}(?=(?:STAGE|NOTIFICATION_TYPE)\s*:)/gi, '\n')
    .replace(/^\s+/, '')
}
