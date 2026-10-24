// الزبون يستفسر بس (n8n/order-context-hint.js → isBrowsing): الرد جواب وبس. إذا النموذج لزّق بآخره كلام طلب
// («تمام هيج؟»، «ما عندك شي ثاني تحب تضيفه بعد؟»، «ونعتمد عنوانك السابق بـ … لو تغير؟»)، يتشال هنا قبل ما يوصل الزبون،
// وSTAGE يرجع لـ 1 (استفسار) حتى ما تتحرك مرحلة الجلسة لطلب ما صار.
// ما ينلمس: أي جملة ثانية بالرد، والأسطر المخفية (STAGE / NOTIFICATION_TYPE). إذا ما بقى بالرد غير كلام الطلب يرجع
// الرد مثل ما هو (أحسن من رد فاضي). الكود هذا يتحقن بعقدة الحارس بسكربت n8n/premium-replies.mjs.

const PUSH_CONFIRM_Q = /[ \t]*تمام\s+(?:هيج|هيچ)\s*[؟?]/g
const PUSH_ADD_MORE_Q = /[ \t]*ما\s+عندك\s+شي\s+(?:ثاني\s+)?تحب\s+(?:ت?ضيفه|تضيف)(?:\s+بعد)?[^؟?\n]*[؟?]/g
const PUSH_ADD_MORE_Q_F = /[ \t]*ما\s+عندچ\s+شي\s+(?:ثاني\s+)?تحبين\s+(?:ت?ضيفين|تضيفيه)(?:\s+بعد)?[^؟?\n]*[؟?]/g
// «شكم قطعة رايد؟» أو «تدلل عزيزي، شكد وحدة رايد؟»: دفع للطلب على رد استفسار (ماسنجر 2026-10-24، التنفيذ 1638:
// «ما عندك بس غسالة؟» ← «عدنا غسالة… شكم قطعة رايد؟»)
const PUSH_QTY_Q = /[ \t]*(?:تدلل(?:ين)?\s+(?:عزيزي|عزيزتي)[،,]?\s*)?(?:شكم|شكد)\s+(?:قطعة|قطع|وحدة)[^؟?\n]*[؟?]/g
// من بداية الجملة لآخر السطر: العنوان ممكن يحتوي نقطة أو فاصلة فما نقطعه بنص الجملة
// يشمل صيغة «وإذا تحب، ممكن نعتمد عنوانك السابق…» (التنفيذ 1638)
const PUSH_PREV_ADDRESS = /(?:^|(?<=[.!؟?]\s))\s*(?:و?إذا\s+تحب[،,]?\s*)?(?:ممكن\s+)?و?نعتمد\s+عنوان[كچ]\s+السابق[^\n]*$/

const PUSH_HIDDEN_LINE = /^(?:STAGE|NOTIFICATION_TYPE)\s*:/i

/** @param {string} text رد الوكيل (مع أسطر STAGE / NOTIFICATION_TYPE المخفية بآخره) */
export function stripOrderPushing(text) {
  const src = String(text ?? '')
  const lines = src.split('\n').map((line) => {
    if (PUSH_HIDDEN_LINE.test(line.trim())) {
      return line.replace(/^(\s*STAGE\s*:\s*)(\d+)/i, (m, pre, n) => (Number(n) > 1 ? pre + '1' : m))
    }
    return line
      .replace(PUSH_PREV_ADDRESS, '')
      .replace(PUSH_ADD_MORE_Q, '')
      .replace(PUSH_ADD_MORE_Q_F, '')
      .replace(PUSH_CONFIRM_Q, '')
      .replace(PUSH_QTY_Q, '')
      .replace(/[ \t]+$/, '')
  })
  // سطر صار فاضي بعد الحذف يروح، والأسطر الفاضية الأصلية تبقى بين الفقرات
  const kept = lines.filter((line, i) => line.trim() !== '' || src.split('\n')[i].trim() === '')
  const out = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n{2,}(?=(?:STAGE|NOTIFICATION_TYPE)\s*:)/gi, '\n')
    .replace(/^\s+/, '')
  const visible = out.replace(/^\s*(?:STAGE|NOTIFICATION_TYPE)\s*:.*$/gim, '').trim()
  return visible ? out : src
}
