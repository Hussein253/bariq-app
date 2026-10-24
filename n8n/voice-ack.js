// رد البوت على البصمة يبدي بالجواب نفسه، مثل لو الزبون كتب كلامه. جملة الاستلام («وصلتني البصمة، تسأل عن …»،
// «سمعت بصمتك») تنشال من الرد قبل ما يوصل الزبون، حتى لو النموذج كتبها.
//
// ما ينلمس: جملة التوضيح الي تنقل كلام الزبون بين «» («وصلتني «هاي ضرغام». شنو تقصد؟»)، والأسطر المخفية
// (STAGE / NOTIFICATION_TYPE)، وأي جملة ثانية بالرد. إذا ما بقى بالرد غير جملة الاستلام يرجع الرد مثل ما هو
// (أحسن من رد فاضي). الكود هذا يتحقن بعقدة «Voice Confirm Guard» بسكربت n8n/direct-voice-reply.mjs.

const VOICE_REF = '(?:صوت[كچ]|بصمت[كچ]|(?:ال)?رسال[ةه]\\s+(?:ال)?صوتي[ةه]|(?:ال)?مقطع\\s+(?:ال)?صوتي|(?:ال)?بصم[ةه]|(?:ال)?فويس|(?:ال)?صوتي[ةه]|(?:ال)?صوت)'

// «وصلتني البصمة،» / «تمام، وصلتني الرسالة الصوتية:» / «سمعت بصمتك» — بداية الجملة بس
const ACK_LEAD = new RegExp(
  '^(?:(?:تمام|حاضر|تدلل)(?:\\s+(?:عيني|غالي|غالية|حبيبي))?[،,]?\\s+)?'
  + '(?:وصل(?:تني|ني|تلي|نا)|استلمت(?:ها)?|استلمنا|سمعت(?:ها)?|سمعنا)\\s+'
  + VOICE_REF
  + '(?:\\s+(?:بالكامل|زين|تمام))?\\s*[،,:]?\\s*',
)

// الي بعد جملة الاستلام وهو إعادة لسؤال الزبون عليه («تسأل عن المنتجات…»، «تريد غسالة…»): تنشال الجملة كلها
const ECHO_AFTER_ACK = /^و?(?:ت(?:سأل|ستفسر|ريد|طلب|قول|كول|حجي|حچي|قصد|تكلم|حتاج|رغب|ذكر)[^\s،,.!؟?]{0,5}|عن|بخصوص|حول|بشأن)(?=[\s،,.!؟?]|$)/

// سطر استلام كامل بدون سؤال: «وصلني الاسم والعنوان بالصوت.»
const ACK_LINE = /^(?:تمام[،,]?\s*)?وصل(?:ني|تني|نا)\s+[^«»؟?\n]{0,60}?\s+بالصوت\s*[.!،,]?$/

const HIDDEN_LINE = /^(?:STAGE|NOTIFICATION_TYPE)\s*:/i

/** @param {string} text رد الوكيل (مع أسطر STAGE / NOTIFICATION_TYPE المخفية بآخره) */
export function stripVoiceAck(text) {
  const src = String(text ?? '')
  const parts = src.split(/(?<=[.!؟?\n])/)
  const kept = parts.map((part) => {
    const pad = part.match(/^\s*/)[0]
    const s = part.slice(pad.length)
    if (!s || HIDDEN_LINE.test(s) || /[«»]/.test(s)) return part
    const m = s.match(ACK_LEAD)
    if (m) {
      const rest = s.slice(m[0].length)
      // ما بقى حرف ولا رقم (نقطة أو سطر جديد بس) يعني الجملة كلها استلام
      if (!/[\p{L}\p{N}]/u.test(rest) || ECHO_AFTER_ACK.test(rest)) return ''
      return pad + rest
    }
    return ACK_LINE.test(s.trim()) ? '' : part
  })
  const out = kept
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+/, '')
  const visible = out.replace(/^\s*(?:STAGE|NOTIFICATION_TYPE)\s*:.*$/gim, '').trim()
  return visible ? out : src
}
