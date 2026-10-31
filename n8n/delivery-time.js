/**
 * سؤال «شوكت يوصل؟» (Delivery Time) — ينجاوب دائماً، ومن إعدادات المتجر بس
 * =========================================================================
 * ماسنجر 2026-10-29 (الزبون 2947…، متجر «الرقمي»):
 *   التنفيذ 2869 «اريد احجز شوكت يوصل» ← السعر والخصم من جديد و«شكم قطعة رايد؟»، وسؤال الوصول انتجاهل.
 *   التنفيذ 2879 «عدد 1 لون اسود / بغداد حي الجامعة / 0780… / شوكت يوصل» ← الملخص، وسؤال الوصول انتجاهل مرة ثانية.
 *   التنفيذ 2898 «شوكت يوصل» (بعد ما انحجز الطلب) ← «عادةً نوصل الطلبات بشكل سريع. وشي لون وقياس تحب؟» — وعد مألّف.
 *   التنفيذ 2627 «شكد التوصيل / اريد احجز / شكد ويوصل الطلب» ← الأجرة بس.
 *
 * السبب: مدة التوصيل الي يكتبها التاجر بلوحة برق (merchant_delivery_settings.local_days / other_days، «المدة (أيام)»)
 * ما توصل للوكيل أصلاً — عقدة «تحديد التاجر» تقرا الأجور بس، وتعليمات الوكيل تكول «ممنوع أي وعد بمدة». وتنبيهات الطلب
 * («ردك هذا عن البنود بس») تغطي على السؤال، فالوكيل يا يتجاهله يا يألّف جواب.
 *
 * الحل (n8n/delivery-time.mjs يزرعه):
 *   ١. «تحديد التاجر» يقرا المدة ويكتبها جملة جاهزة (delivery_days).
 *   ٢. تنبيه حاسم بآخر البرومت: سؤال الوصول أول جملة بالرد، من المدة المكتوبة بس.
 *   ٣. حارس الرد (آخر خطوة قبل الإرسال): جملة وعد بمدة مو مكتوبة بالإعدادات تنشال، وإذا السؤال ما انجاوب
 *      ينضاف الجواب الصحيح بأول الرد. الحارس حتمي: ما يعتمد على إن النموذج سمع التنبيه.
 *
 * هذا الملف مصدر الكود: n8n/delivery-time.mjs يزرعه بعقد n8n، وtests/delivery-time.test.ts يختبره.
 */

/** تطبيع للمطابقة: بلا تشكيل وهمزات، ة ← ه، ى ← ي، حروف صغيرة. */
const dtNorm = (s) => String(s ?? '').replace(/\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/ـ/g, '').toLowerCase()

/** كلمة وقت («شوكت»، «امته»، «كم يوم»، «شكد ياخذ») ويّاها كلمة وصول («يوصل»، «الطلب»، «التوصيل»). */
const DT_WHEN = /شوكت|شوقت|امته|امتي|يمته|يمتي|متي|اي وقت|بيا وقت|كم يوم|كم ساعه|شكد (?:وقت|مده|يوم|ساعه)|بعد شكد|خلال شكد|شكد (?:و ?)?(?:ياخذ|ياخذه|يطول|يحتاج|يوصل|توصل|يجي|تجي)/
const DT_ARRIVE = /يوصل|توصل|يوصلني|توصلني|يوصلنا|توصلون|توصلوه|توصلوها|يجي|تجي|يجيني|تجيني|توصيل|التوصيل|وصول|الوصول|يستلم|استلم|الطلب|طلبي|الطلبيه|الغرض|الهودي|ياخذ|يطول|يحتاج/
const DT_EN = /\bwhen\b[^.?!]*\b(?:arrive|deliver|delivered|get it|come|receive)\b|\bhow (?:long|many days)\b|\bdelivery time\b|\bwhat time\b[^.?!]*\b(?:arrive|deliver)/

/** الزبون يسأل شوكت يوصل الطلب؟ («شوكت يوصل»، «شكد ويوصل الطلب»، «How many days…arrive?») */
export function isDeliveryTimeQuestion(message) {
  const t = dtNorm(message)
  if (DT_EN.test(t)) return true
  return DT_WHEN.test(t) && DT_ARRIVE.test(t)
}

/** «1» ← «خلال يوم واحد». نفس صيغة SQL عقدة «تحديد التاجر» (DAYS_SQL بـ n8n/delivery-time.mjs). */
export function daysPhrase(n) {
  const d = Number(n)
  if (!Number.isInteger(d) || d < 0) return ''
  if (d === 0) return 'بنفس اليوم'
  if (d === 1) return 'خلال يوم واحد'
  if (d === 2) return 'خلال يومين'
  return 'خلال ' + d + (d <= 10 ? ' أيام' : ' يوم')
}

/** الجمل الي تحدد مدة بالإعدادات («خلال يوم واحد»، «بنفس اليوم»…) من نص delivery_days. */
const dtStated = (deliveryDays) => (String(deliveryDays ?? '').match(/بنفس اليوم|خلال (?:يوم واحد|يومين|\d+ (?:أيام|يوم))/g) ?? [])

/** جواب «شوكت يوصل» الجاهز: من الإعدادات إذا مكتوبة، وإلا بلا مدة. */
export function deliveryTimeAnswer(deliveryDays) {
  const stated = String(deliveryDays ?? '').trim()
  const phrases = dtStated(stated)
  if (phrases.length) {
    // نفس المدة لبغداد وباقي المحافظات: تنكال مرة وحدة
    const body = phrases.length === 2 && phrases[0] === phrases[1] ? phrases[0] + ' لكل المحافظات' : stated.replace(/^مدة التوصيل(?: المعلنة من المتجر)?:\s*/, '').replace(/[.。]\s*$/, '')
    return 'بخصوص وقت الوصول: الطلب يوصل ' + body + '، والمندوب يتصل بيك قبل لا يوصل.'
  }
  return 'بخصوص وقت الوصول عزيزي، المندوب يتصل بيك قبل لا يوصل.'
}

/** تنبيه البرومت: سؤال الوصول أول جملة بالرد، فوق أي تنبيه طلب. '' = ما سأل. */
export function deliveryTimeHint(message, deliveryDays) {
  if (!isDeliveryTimeQuestion(message)) return ''
  const stated = dtStated(deliveryDays).length > 0
  return '\n\n[تنبيه حاسم — سؤال وقت الوصول (فوق «ردك هذا عن البنود بس» وأي تنبيه طلب ثاني): الزبون سأل شوكت يوصل الطلب.'
    + ' أول جملة بردك لازم تجاوبه على هذا السؤال: '
    + (stated
      ? '«' + deliveryTimeAnswer(deliveryDays) + '» (من إعدادات المتجر — المدة حسب محافظة الزبون: بغداد أو باقي المحافظات).'
      : '«المندوب يتصل بيك قبل لا يوصل» — مدة التوصيل مو مكتوبة بإعدادات المتجر.')
    + ' ممنوع تذكر أي عدد ساعات أو أيام أو «نفس اليوم» أو «باچر» أو «عادةً نوصل بسرعة» غير الي مكتوب هنا.'
    + ' بعد الجواب كمّل خطوة الطلب الي وصلتلها بسؤال واحد بس؛ وإذا الطلب انحجز، لا تسأل عن لون ولا قياس ولا عدد.]'
}

/** جملة تحچي عن وقت الوصول بمدة أو وعد («خلال 24 ساعة»، «بنفس اليوم»، «باچر»، «عادةً نوصل بسرعة»). */
const DT_ABOUT = /يوصل|توصل|نوصل|يوصلك|يوصلچ|توصيل|التوصيل|الوصول|وصول|المندوب|يجيك|يجيچ|تستلم|تستلمين|استلام/
const DT_CLAIM = /\d+\s*(?:ساع|يوم|ايام|أيام)|(?:خلال|بغضون|ضمن|اقل من|أقل من)\s*(?:يوم|يومين|ساع|اسبوع|أسبوع|\d)|نفس اليوم|بنفس اليوم|باچر|باجر|بكره|بكرة|عاد[ةه]ً?\s+(?:نوصل|يوصل|توصل|التوصيل)|بشكل سريع|بسرعه|بسرعة|بأسرع وقت|باسرع وقت|سريع(?:ه|ة)?\s*(?:جداً|جدا)?\s*$|يوم\s+(?:واحد|او يومين|أو يومين)|يومين|اسبوع|أسبوع/
const DT_ANSWERED = /المندوب يتصل|قبل لا يوصل|وقت الوصول|مدة (?:التوصيل|الوصول)|يوصل(?:ك|چ)? خلال|يوصل(?:ك|چ)? بنفس اليوم/

const dtHidden = (line) => /^\s*(?:STAGE|NOTIFICATION_TYPE|IMAGES?)\s*:/i.test(line)

/**
 * حارس الرد: وعد بمدة وصول مو مكتوبة بإعدادات المتجر ينشال، وسؤال «شوكت يوصل» ما يطلع بلا جواب.
 * @param {string} text رد الوكيل (ويا الأسطر المخفية STAGE / NOTIFICATION_TYPE)
 * @param {{ said?: string, deliveryDays?: string }} p said = رسالة الزبون، deliveryDays = delivery_days من «تحديد التاجر»
 */
export function guardDeliveryTime(text, { said = '', deliveryDays = '' } = {}) {
  const src = String(text ?? '')
  const allowed = dtStated(deliveryDays)
  const lines = src.split('\n')
  let dropped = false
  const kept = lines.map((line) => {
    if (dtHidden(line)) return line
    // الجمل بالسطر: تنقسم بعد . ! ؟ مع الإبقاء على العلامة
    const parts = line.match(/[^.!؟?]+[.!؟?]*\s*/g) ?? [line]
    const out = parts.filter((s) => {
      if (!DT_ABOUT.test(s) || !DT_CLAIM.test(s)) return true
      // مسموح بس إذا كل المدة بالجملة من الإعدادات، وبلا وعد مبهم («بسرعة»، «عادةً»)
      const vague = /عاد[ةه]ً?\s|بشكل سريع|بسرع|بأسرع|باسرع|سريع|باچر|باجر|بكر[هة]|ساع/.test(s)
      const ok = !vague && allowed.some((p) => s.includes(p))
        && !/\d+\s*(?:ساع|يوم|ايام|أيام)/.test(s.replace(/خلال \d+ (?:أيام|يوم)/g, ''))
      if (!ok) dropped = true
      return ok
    })
    return out.join('').replace(/\s+$/, '')
  })
  let result = dropped ? kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '') : src
  const asked = isDeliveryTimeQuestion(said)
  const visible = result.split('\n').filter((l) => !dtHidden(l)).join('\n')
  if ((asked || dropped) && !DT_ANSWERED.test(visible) && !allowed.some((p) => visible.includes(p))) {
    const answer = deliveryTimeAnswer(deliveryDays)
    result = visible.trim() ? answer + '\n\n' + result.replace(/^\s+/, '') : answer + (result ? '\n' + result : '')
  }
  return result
}
