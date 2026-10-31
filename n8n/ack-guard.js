/**
 * الموافقة ما تنعاد عليها نفس السؤال (ماسنجر 2026-10-31، التنفيذات 3111 و3119):
 *   البوت: «وتأكدلي بعد إذا اللون الأحمر مضبوط.» ← الزبون: ستيكر 👍 ← البوت: «وتأكدلي بعد إذا اللون الأحمر مضبوط.»
 *   البوت: «وتأكدلي إذا تبقى اللون الأحمر.» ← الزبون: «تمام» ← البوت يعيد نفس السؤال.
 * الموافقة (تمام، أوكي، إعجاب، 👍، ستيكر، تم، أكيد) جواب كامل على سؤال التأكيد، فالحارس يشيل الجملة المكررة من الرد.
 * إذا ما بقى شي بالرد، يرد «تمام عزيزي 🌷» بدل ما يعيد السؤال.
 *
 * هذا الملف مصدر الكود: n8n/ack-guard.mjs يزرعه بعقدة «Drop Repeated Blocks»، وtests/ack-guard.test.ts يختبره.
 */

/** كلمات الموافقة القصيرة (بعد norm: بدون همزات وتشكيل، ويا الحرف الممطوط منشال). */
const ACK_WORDS = new Set([
  'تمام', 'تمامه', 'تم', 'اوك', 'اوكي', 'اوكيه', 'ok', 'okay', 'اكيد', 'اكيده', 'ايه', 'اي', 'ايوه', 'ايوا', 'نعم',
  'زين', 'ماشي', 'موافق', 'حاضر', 'مضبوط', 'صح', 'صحيح', 'يلا', 'خلص', 'كمل', 'نكمل',
  'اعجاب', 'لايك', 'ستيكر', 'عفوا', 'تسلم', 'مشكور', 'شكرا', 'شكراً', 'يسلمو',
])
/** إيموجي الموافقة والإعجاب والشكر. */
const ACK_EMOJI = /[👍👌✅💯🙏❤🥰😊🌷👏🫡💪]/u

const latinize = (s) => String(s ?? '').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/(\p{L})\1+/gu, '$1').toLowerCase()

/**
 * رسالة الزبون كلها موافقة أو إعجاب بلا سؤال ولا تعديل: «تمام»، «اوكي 👍»، «(ستيكر 👍)»، «تم».
 * @param {string} said رسالة الزبون (ويا الستيكر بصيغة «(ستيكر 👍)»)
 * @returns {boolean}
 */
export function isAckMessage(said) {
  const raw = String(said ?? '')
  if (!raw.trim() || /[?؟]/.test(raw)) return false
  const tokens = latinize(raw).split(/[\s,.،؛!:\-_/\\()\[\]]+/).filter(Boolean)
  const words = tokens.filter((t) => !ACK_EMOJI.test(t))
  if (tokens.length === 0 || tokens.length > 6) return false
  const hasAck = ACK_EMOJI.test(raw) || tokens.some((t) => ACK_WORDS.has(t))
  return hasAck && words.every((t) => ACK_WORDS.has(t))
}

/** سؤال تأكيد على تفصيلة (اللون، القياس، الكمية): «وتأكدلي بعد إذا اللون الأحمر مضبوط»، «إذا تبقى اللون». */
const DETAIL_CONFIRM_Q = /تأكدلي|تأكدني|تاكدلي|تاكدني|مضبوط|اذا تبقى|إذا تبقى|تبقى (?:اللون|القياس|الكمية|العدد)/

const hiddenLine = (line) => /^\s*(?:STAGE|NOTIFICATION_TYPE|IMAGES?)\s*:/i.test(line)

/**
 * يشيل من الرد جمل سؤال التأكيد اللي البوت سأله قبل، إذا الزبون وافق الحين.
 * @param {string} text رد الوكيل (ويا الأسطر المخفية)
 * @param {{ said?: string, lastBot?: string }} p said = رسالة الزبون، lastBot = آخر رد للبوت
 * @returns {string}
 */
export function dropRepeatedConfirm(text, { said = '', lastBot = '' } = {}) {
  const src = String(text ?? '')
  if (!isAckMessage(said) || !DETAIL_CONFIRM_Q.test(latinize(lastBot).replace(/ـ/g, ''))) return src
  let changed = false
  const out = []
  for (const line of src.split('\n')) {
    if (hiddenLine(line) || !DETAIL_CONFIRM_Q.test(line)) { out.push(line); continue }
    const kept = (line.match(/[^.!؟?]+[.!؟?]*\s*/g) ?? [line]).filter((s) => !DETAIL_CONFIRM_Q.test(s)).join('')
      .replace(/\s+$/, '')
    changed = true
    if (kept.trim()) out.push(kept)
  }
  if (!changed) return src
  const body = out.filter((l) => !hiddenLine(l))
  const hidden = out.filter((l) => hiddenLine(l))
  const content = body.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return [content || 'تمام عزيزي 🌷', ...hidden].join('\n')
}
