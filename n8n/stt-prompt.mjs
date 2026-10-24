/**
 * تعديل عقدة «Voice Context» (برومت محركات التفريغ). من بصمة ماسنجر 2026-10-24 (التنفيذ 1156، «شكد سعر الغسالة؟ وأكو ديسكاونت
 * على السعر؟» 8.6 ثانية):
 *   - محرك gpt-4o-transcribe رجّع «شكد سعر الغسالة؟» بس (ضيّع ذيل الجملة) بـ 4 مرات من 4 مع البرومت القديم؛ بعد التعديل 3 من 4.
 *   - البرومت القديم يحمل سطر «الزبون يرد على سؤال المتجر عن: المنطقة والعنوان، تأكيد الطلب» لأن رد البوت السابق (المعطوب) كان فيه
 *     «تمام هيج؟» و«عنوانك السابق»: المحرك يتهيّأ لعنوان وهو سؤال سعر. فنستثني هالعبارتين من فحص المواضيع.
 *   - نضيف مفردات الاستفسار (السعر، الخصم/ديسكاونت، التوفر، التوصيل، الدوام) بأول البرومت.
 * القياس: n8n مؤقت يعيد تفريغ ملف الصوت الأصلي (4 مرات لكل صيغة، نموذجين).
 */

const swapOnce = (text, from, to, label) => {
  const parts = text.split(from)
  if (parts.length !== 2) throw new Error(`[${label}] لازم يتطابق مرة وحدة، تطابق ${parts.length - 1}`)
  return parts.join(to)
}

export const STT_MARKER = 'const lastAsk = '

const TOPICS_ANCHOR = 'const topics = ['
const TOPICS_NEW = "const lastAsk = last.replace(/(?:و)?نعتمد عنوانك السابق[^؟?]*[؟?]/g, '').replace(/تمام هيج\\s*[؟?]/g, '');\nconst topics = ["

const CONFIRM_FROM = "['تأكيد الطلب', /[أا]ثب|تمام هيج/]"
const CONFIRM_TO = "['تأكيد الطلب', /[أا]ثبّ?تلك/]"

const FILTER_FROM = '.filter((t) => t[1].test(last))'
const FILTER_TO = '.filter((t) => t[1].test(lastAsk))'

const PROMPT_FROM = "const sttPrompt = 'رسالة صوتية من زبون عراقي"
const PROMPT_TO = "const sttPrompt = 'قد يسأل الزبون عن السعر أو الخصم (ديسكاونت، تخفيض) أو توفر المنتج أو التوصيل أو الدوام. ' + 'رسالة صوتية من زبون عراقي"

/** @param {string} code كود عقدة Voice Context (أو «سياق الصوت» بإنستغرام) */
export const patchVoiceContext = (code) => {
  if (code.includes(STT_MARKER)) return code
  let out = swapOnce(code, TOPICS_ANCHOR, TOPICS_NEW, 'stt/topics')
  out = swapOnce(out, CONFIRM_FROM, CONFIRM_TO, 'stt/confirm')
  out = swapOnce(out, FILTER_FROM, FILTER_TO, 'stt/filter')
  out = swapOnce(out, PROMPT_FROM, PROMPT_TO, 'stt/prompt')
  return out
}
