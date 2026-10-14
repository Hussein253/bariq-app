/**
 * فحوص ردود البوت — قواعد ثابتة بلا نموذج حَكَم (لا تكلفة OpenAI إضافية)
 * =====================================================================
 * كل فحص يرجع { pass, score, reason }. الفشل نوعان يظهران في السبب:
 *   [هلوسة]  ادعاء شي مو صحيح: توفر منتج خالص، تثبيت طلب ما انخلق، سعر أو أجور أو موعد أو خصم مخترع.
 *   [سلوك]   خطوة ناقصة أو غلط بالإجراء: ما طلب الاسم، كتب الملخص والمعلومات ناقصة، كلمات داخلية.
 * القواعد مأخوذة من موجّه النظام نفسه (قسم «قواعد حمراء» و«فحص قبل الإرسال»).
 */
import { readFileSync } from 'node:fs'

const CASES = JSON.parse(readFileSync(new URL('./cases.json', import.meta.url), 'utf8')).cases

// توحيد الكتابة: بلا تشكيل، أ/إ/آ ← ا، ى ← ي، ة ← ه، أرقام عربية ← لاتينية
export function norm(s) {
  return String(s ?? '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٬/g, ',')
    .toLowerCase()
}

const sentences = (t) => norm(t).split(/[.!؟?\n]+/).map((s) => s.trim()).filter(Boolean)
const segments = (t) => norm(t).split(/[.!؟?\n،,؛]+/).map((s) => s.trim()).filter(Boolean)

const NEG = /(ماكو|ما اكو|ما عدنا|ما عندنا|مو متوفر|غير متوفر|ما متوفر|مو موجود|ما موجود|غير موجود|خلص|خالص|نفذ|نافذ|ما نبيع|ما نوفر|ما يتوفر|ما عندي|حاليا ماكو|بس عدنا|فقط عدنا|ما اكدر|ما نكدر|ما نوعد|ما اعرف|مو مسموح)/
const AFFIRM = /(عدنا|متوفر|موجود|(^|\s)اكو(\s|$)|ضفت|سجلت|طلبك هسه صار|تفاصيل طلبك|✅)/

const result = (pass, reason) => ({ pass, score: pass ? 1 : 0, reason })

// ---------- المنتجات غير المتوفرة وقت الاختبار ----------
// الأصفر كله مخزونه 0، الأسود لارج مخزونه 0، البيجي والأحذية والـ XXL مو بالكتالوج
const UNAVAILABLE = [
  { label: 'أصفر', test: (s) => /(^|[^ا-ي])(اصفر|صفرا|صفره)/.test(s) },
  { label: 'أسود لارج', test: (s) => /(اسود|سودا|سوده)/.test(s) && /(^|[^ا-ي])لارج/.test(s.replace(/اكس\s*لارج|x-?large|xl/g, ' ')) },
  { label: 'بيجي', test: (s) => /بيج/.test(s) },
  { label: 'أحذية', test: (s) => /(احذي|حذاء)/.test(s) },
  { label: 'XXL', test: (s) => /(xxl|2xl|دبل اكس|اكسين|اكس اكس)/.test(s) },
]

// سطر قائمة («- أسود: سمول، ميديم، لارج») يعدّد المتوفر، فهو ادعاء توفر حتى بلا كلمة «عدنا» بنفس السطر
const LIST_LINE = /^\s*([-•▪●*]|\d+\s*[.)-])/
function unavailableClaims(text) {
  const hits = []
  const lines = norm(text).split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines) {
    const units = LIST_LINE.test(line) ? [line] : line.split(/[.!؟?]+/).map((s) => s.trim()).filter(Boolean)
    for (const s of units) {
      for (const u of UNAVAILABLE) {
        if (u.test(s) && (AFFIRM.test(s) || LIST_LINE.test(s)) && !NEG.test(s)) hits.push(`${u.label}: «${s.slice(0, 80)}»`)
      }
    }
  }
  return hits
}

// ---------- فحوص عامة على كل رد بكل دور ----------
const CLAIM = /(ثبتت|ثبتنا|تم تثبيت|تم الطلب|انحجز|طلبك (?:تثبت|مثبت)|طلبيتك (?:تثبت|مثبت)|رقم طلبك)/
const INTERNAL = /(السله|للسله|بالسله|ضيفلي|ضفتلك|session|cart|variant|get_available_products|create_order|update_session_data|find_delivery_area|صحيح هالشي|صح هالمعلومات|بيانات داخليه|stage\s*:|notification_type|phone_number)/
const TIME_PROMISE = /(خلال\s*(\d+|يوم|ساعه|ساعات|يومين|اسبوع)|\d+\s*(ساعه|ساعات|يوم|ايام)(?!\s*عمل)|يوصل(?:ك|چ)?\s*(باجر|بكره|اليوم|الليله|بنفس اليوم)|باجر\s*(يوصل|راح يوصل|يكون عندك|يجيك)|نفس اليوم)/
const DISCOUNT_GRANT = /((سويتلك|سويت لك|راح اسويلك|اعطيك|انطيك|نطيك)\s*(خصم|تخفيض)|خصم\s*(ب|بـ)?\s*\d+|\d+\s*[%٪])/

export function globalChecks(output) {
  const rec = output || {}
  const replies = rec.replies || []
  const problems = []

  if (rec.error) problems.push(`[بنية] رد الطوارئ أو خطأ تنفيذ: ${rec.error}`)
  if ((rec.ordersCreated ?? 0) > 0) problems.push(`[هلوسة] انخلق ${rec.ordersCreated} طلب بقاعدة البيانات بدون تأكيد صريح`)

  replies.forEach((r, i) => {
    const t = norm(r)
    const turn = `الدور ${i + 1}`
    if (CLAIM.test(t)) problems.push(`[هلوسة] ${turn}: ادّعى إن الطلب تثبّت وما انخلق أي طلب`)
    const un = unavailableClaims(r)
    if (un.length) problems.push(`[هلوسة] ${turn}: ادّعى توفر شي مو متوفر — ${un.join(' | ')}`)
    for (const s of sentences(r)) {
      if (TIME_PROMISE.test(s) && !NEG.test(s)) problems.push(`[هلوسة] ${turn}: وعد بوقت وصول «${s.slice(0, 70)}»`)
      if (DISCOUNT_GRANT.test(s) && !NEG.test(s) && !/ثابت/.test(s)) problems.push(`[هلوسة] ${turn}: عرض خصم «${s.slice(0, 70)}»`)
    }
    if (INTERNAL.test(t)) problems.push(`[سلوك] ${turn}: كلمة داخلية «${t.match(INTERNAL)[0]}»`)
    if (/770999\d{4}/.test(t.replace(/[\s-]/g, ''))) problems.push(`[سلوك] ${turn}: كتب رقم واتساب الزبون`)
  })

  return problems.length ? result(false, problems.join('\n')) : result(true, 'الفحوص العامة سليمة')
}

// ---------- فحوص خاصة بكل حالة ----------
const COLOR = { ابيض: /(ابيض|بيض)/, اسود: /(اسود|سود)/ }
const SIZE = {
  سمول: /(سمول|small)/,
  ميديم: /(ميديم|medium)/,
  'اكس لارج': /(اكس\s*لارج|x-?large|xl)/,
  لارج: /(^|[^ا-ي])لارج/,
}
const QTY = {
  1: /((^|[^\d,])1(?![\d,])|واحد|وحده|قطعه وحده)/,
  2: /((^|[^\d,])2(?![\d,])|ثنين|اثنين|قطعتين)/,
  3: /((^|[^\d,])3(?![\d,])|ثلاث|تلاث)/,
}

const CHECKS = {
  saysUnavailable: (last) =>
    NEG.test(norm(last)) ? result(true, 'وضّح إن المطلوب مو متوفر') : result(false, '[هلوسة] ما قال إن المطلوب مو متوفر'),

  offersAlternative: (last) =>
    /(سمول|ميديم|اكس لارج|ابيض)/.test(norm(last)) ? result(true, 'اقترح بديل موجود') : result(false, '[سلوك] ما اقترح بديل'),

  noOrderReadbackOf: (last, { color }) => {
    const bad = sentences(last).filter((s) => COLOR[color]?.test(s) || new RegExp(color).test(s))
      .filter((s) => /(طلبك|تفاصيل|×|قطع)/.test(s) && !NEG.test(s) && !/(بدل|بدال|عوض|مكان|بدلناه|غيرناه)/.test(s))
    return bad.length ? result(false, `[هلوسة] حط «${color}» بتفاصيل الطلب: «${bad[0].slice(0, 80)}»`) : result(true, `ما حط ${color} بالطلب`)
  },

  noInventedPrice: (last, { item }) => {
    const re = new RegExp(item)
    const bad = sentences(last).filter((s) => re.test(s) && /\d[\d,]*\s*(الف|دينار)/.test(s))
    return bad.length ? result(false, `[هلوسة] سعر مخترع لمنتج مو موجود: «${bad[0].slice(0, 80)}»`) : result(true, 'ما اخترع سعر')
  },

  asksForDeliveryInfo: (last) =>
    /(عنوان|اسم|المحافظه|المنطقه|نقطه داله)/.test(norm(last)) ? result(true, 'طلب معلومات التوصيل') : result(false, '[سلوك] ما طلب الاسم أو العنوان'),

  noSummaryQuestion: (last) =>
    /(اثبت\S*\s*(لك|لچ)?\s*(الطلب|طلبك)\s*[؟?]|هذا ملخص طلبك)/.test(norm(last))
      ? result(false, '[سلوك] كتب الملخص وطلب التثبيت والمعلومات ناقصة')
      : result(true, 'ما قفز للملخص'),

  asksForName: (last) => (/اسم/.test(norm(last)) ? result(true, 'طلب الاسم') : result(false, '[سلوك] ما طلب الاسم')),

  flagsBadPhone: (last) => {
    const t = norm(last)
    // تنبيه صريح («الرقم ناقص») أو طلب رقم صحيح بدله («دزلي رقم موبايل صحيح أو تكتفي برقم الواتساب»)
    const ok = /(رقم|الرقم)[^\n]{0,60}(ناقص|مو كامل|غلط|مو صحيح|غير صحيح|11|مو مكتمل|ما مكتمل)/.test(t)
      || /(ناقص|مو كامل|غلط|غير صحيح)[^\n]{0,40}رقم/.test(t)
      || /رقم (موبايل |تلفون |تليفون |هاتف )?صحيح/.test(t)
    return ok ? result(true, 'نبّه إن الرقم ناقص') : result(false, '[سلوك] ما نبّه إن رقم التواصل ناقص')
  },

  asksWhatTheyWant: (last) => {
    const t = norm(last)
    return /(شنو|شكم|لون|قياس|رايد)/.test(t) && /[؟?]/.test(last) ? result(true, 'سأل شنو يريد') : result(false, '[سلوك] ما سأل الزبون شنو يريد')
  },

  lastMentionsItem: (last, { qty, color, size }) => {
    const sizeRe = SIZE[size]
    const hit = segments(last).concat(sentences(last)).find((s) => {
      const s2 = size === 'لارج' ? s.replace(/اكس\s*لارج/g, ' ') : s
      return COLOR[color].test(s2) && sizeRe.test(s2) && QTY[qty].test(s2)
    })
    return hit ? result(true, `الطلب بيه ${qty} ${color} ${size}`) : result(false, `[سلوك] الرد الأخير ما بيه ${qty} ${color} ${size} بعد التعديل`)
  },

  asksGovernorate: (last) => {
    const t = norm(last)
    return /(محافظه|بغداد|الانبار|يا وحده|بيا)/.test(t) && /[؟?]/.test(last) ? result(true, 'سأل عن المحافظة') : result(false, '[سلوك] ما سأل عن المحافظة')
  },

  noAreaNotFound: (last) => {
    const m = norm(last).match(/(ما حصلت|ما لكيت|ما لقيت|ما نوصل|ما نكدر نوصل|مو موجوده|غير موجوده|ما موجوده|ما عثرت|ما عدنا توصيل)/)
    return m ? result(false, `[هلوسة] قال إن المنطقة مو موجودة أو ما نوصلها: «${m[0]}»`) : result(true, 'ما نفى وجود المنطقة')
  },

  feeIsNot: (last, { wrong, onlyIf }) => {
    const t = norm(last)
    if (onlyIf && !new RegExp(onlyIf).test(t)) return result(true, 'ما حدد المحافظة بعد')
    const pat = wrong === 3000 ? /(3,000|3000|3 ?الاف|ثلاث ?الاف|ثلاثه ?الاف)/ : /(5,000|5000|5 ?الاف|خمس ?الاف|خمسه ?الاف)/
    const bad = sentences(last).filter((s) => pat.test(s) && /(توصيل|اجور|الاجور)/.test(s) && !/(بغداد|باقي|بقيه|المحافظات|خارج)/.test(s))
    return bad.length ? result(false, `[هلوسة] أجور توصيل غلط: «${bad[0].slice(0, 80)}»`) : result(true, 'الأجور صحيحة أو ما انذكرت')
  },

  mentionsFee: (last, { fee }) => {
    const t = norm(last)
    const ok = fee === 3000 ? /(3,000|3000|3 ?الاف|ثلاث ?الاف)/.test(t) : /(5,000|5000|5 ?الاف|خمس ?الاف)/.test(t)
    return ok ? result(true, `ذكر الأجور الصحيحة ${fee}`) : result(false, `[هلوسة] ما ذكر الأجور الصحيحة ${fee}`)
  },

  noTimePromise: (last) => {
    const bad = sentences(last).filter((s) => TIME_PROMISE.test(s) && !NEG.test(s))
    return bad.length ? result(false, `[هلوسة] وعد بوقت وصول: «${bad[0].slice(0, 80)}»`) : result(true, 'ما وعد بوقت')
  },

  refusesDiscount: (last) => {
    const t = norm(last)
    const granted = sentences(last).some((s) => DISCOUNT_GRANT.test(s) && !NEG.test(s) && !/ثابت/.test(s))
    if (granted) return result(false, '[هلوسة] وافق على خصم')
    return /(ما اكدر|ما نكدر|ثابت|لوحه|صلاحيه|ما عندي)/.test(t) ? result(true, 'رفض الخصم بأدب') : result(false, '[سلوك] ما وضّح إن السعر ثابت')
  },

  noExchangePromise: (last) => {
    const bad = sentences(last).filter((s) => /(نبدل|نبدله|نبدلها|نرجع|نرجعه|نسترجع|تبديل مجاني|ترجعه|تبدله|يتبدل|نعوض|استرجاع)/.test(s) && !NEG.test(s) && !/موظف/.test(s))
    return bad.length ? result(false, `[هلوسة] وعد بتبديل أو إرجاع: «${bad[0].slice(0, 80)}»`) : result(true, 'ما وعد بتبديل')
  },

  offersHandover: (last) => {
    const t = norm(last)
    return /(موظف|الفريق)/.test(t) && /(احولك|تحب)/.test(t) ? result(true, 'عرض التحويل لموظف') : result(false, '[سلوك] ما عرض التحويل لموظف')
  },
}

/** فحوص الحالة نفسها، حسب cases.json */
export function caseChecks(output, context) {
  const id = context?.vars?.id
  const c = CASES.find((x) => x.id === id)
  if (!c) return result(false, `حالة غير معروفة: ${id}`)
  const last = (output?.replies || []).at(-1) ?? ''
  if (!last) return result(false, '[بنية] ماكو رد من البوت')
  const parts = c.checks.map((ch) => {
    const fn = CHECKS[ch.fn]
    return fn ? fn(last, ch.args || {}) : result(false, `فحص غير معروف ${ch.fn}`)
  })
  const failed = parts.filter((p) => !p.pass)
  return failed.length
    ? result(false, failed.map((p) => p.reason).join('\n'))
    : result(true, parts.map((p) => p.reason).join('، '))
}

export { CHECKS, CASES }
