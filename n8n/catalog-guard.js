// حارس الكتالوج ونية الشراء: آخر طبقة قبل ما يوصل الرد للزبون. التنبيه ببرومت الوكيل (n8n/order-context-hint.js → specMismatch و
// bookingAllowed بـ orderContext) هو الطبقة الأولى؛ هذا الحارس الحتمي لو النموذج ما التزم.
//
//   ١. لون أو سعة مو موجودة (ماسنجر 2026-10-24، التنفيذات 1741 و1747 و1691): إذا الرد وافق الزبون أو فتح الحجز أو سأل عن العدد،
//      الرد كله ينبدّل بتصحيح لطيف يعرض المتوفر حصراً. الرد الي صحّح بنفسه («الأسود ماكو حالياً») يبقى مثل ما هو.
//   ٢. الحجز بلا نية شراء صريحة: «تم تأكيد طلبك» و«طلبك هسة صار» وطلب الاسم والعنوان والرقم و«نعتمد عنوانك السابق» وسؤال العدد تنشال،
//      وSTAGE يرجع لـ 1. إذا ما بقى شي، الرد يصير جملة المتوفر من الكتالوج.
//   ٣. لمسة بشرية (humanTouch): رد السلام إذا الزبون سلّم، وشيل الخواتيم الآلية («أكدر أساعدك بشي ثاني؟») وتلميح سعر الجملة
//      (التنفيذ 1678) وجملة «أنصحك بالتواصل مع موظف الدعم» (التنفيذ 1918).
//
// ما ينلمس: رد التحويل لموظف (NOTIFICATION_TYPE: complaint)، ورسالة التثبيت بعد create_order، والأسطر المخفية (STAGE / NOTIFICATION_TYPE).
// الكود هذا يتحقن بعقدة الحارس بسكربت n8n/sales-guardrails.mjs.

const CG_HIDDEN = /^(?:STAGE|NOTIFICATION_TYPE)\s*:/i
const cgNorm = (s) => String(s ?? '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).toLowerCase()

// جمل فتح الحجز (بعد cgNorm)
const CG_BOOKED = /تم\s+تاكيد\s+طلب|طلب[كچ]\s+هسه\s+صار|تفاصيل\s+طلب[كچ]\s+الكامل/
const CG_INFO_WORD = /اسم[كچ]|عنوان[كچ]|العنوان\s+الكامل|رقم\s+(?:التليفون|التلفون|الهاتف|الموبايل|تليفون[كچ]|موبايل[كچ])|معلومات[كچ]|المحافظه\s+والمنطقه/
const CG_INFO_ASK = /ياريت|يا\s+ريت|تدزلي|تدزيلي|دزلي|دزيلي|اكتبلي|تكتبلي|ممكن|نحتاج|احتاج|ارسل|انطيني|علمود\s+ناكد|حتى\s+نكمل/
const CG_PREV_ADDR = /نعتمد\s+عنوان/
const CG_QTY_ASK = /(?:شكم|شكد)\s+(?:قطعه|قطع|وحده|حبه)[^.!؟?\n]*[؟?]|تحب\s+تطلب|نضغط\s+على\s+طلب/
const CG_CONFIRM_Q = /تمام\s+(?:هيج|هيچ)\s*[؟?]|ما\s+عند[كچ]\s+شي\s+(?:ثاني\s+)?تحب/
// «غسالة أوتوماتيك…، وحدة.» لحالها: إعادة بند طلب ما صار
const CG_ITEM_ECHO = /^[^،,.!؟?\n]{3,80}[،,]\s*(?:لون\s+[^،,.!؟?\n]+[،,]\s*)?(?:وحده|وحدتين|[0-9]+\s+قطع)(?:[،,]\s*لون\s+[^،,.!؟?\n]+)?\s*[.!]?$/
const CG_UNAVAILABLE = /ماكو|ما\s*(?:متوفر|عدنا|موجود)|مو\s+(?:متوفر|موجود)|غير\s+(?:متوفر|موجود)|للاسف|نفذ|نفد/

const CG_COLOR_FORMS = {
  اسود: ['اسود', 'سودا', 'سوداء', 'black'], ابيض: ['ابيض', 'بيضا', 'بيضاء', 'white'], احمر: ['احمر', 'حمرا', 'حمراء', 'red'],
  ازرق: ['ازرق', 'زرقا', 'زرقاء', 'blue'], اخضر: ['اخضر', 'خضرا', 'خضراء', 'green'], اصفر: ['اصفر', 'صفرا', 'صفراء', 'yellow'],
  رمادي: ['رمادي', 'رماديه', 'رصاصي', 'رصاصيه', 'gray', 'grey'], فضي: ['فضي', 'فضيه', 'سلفر', 'سيلفر', 'silver'],
  ذهبي: ['ذهبي', 'ذهبيه', 'جولد', 'كولد', 'gold'], بني: ['بني', 'قهوائي', 'قهوائيه', 'brown'], وردي: ['وردي', 'ورديه', 'بمبي', 'بينك', 'pink'],
  بنفسجي: ['بنفسجي', 'بنفسجيه', 'موف', 'purple'], برتقالي: ['برتقالي', 'برتقاليه', 'orange'], كحلي: ['كحلي', 'كحليه', 'navy'],
  بيج: ['بيج', 'beige'], ستيل: ['ستيل', 'ستانلس', 'steel'],
}

// الجملة تذكر الشي الي طلبه الزبون وهو مو موجود؟ (لون بأي صيغة، أو الرقم ويا الوحدة)
const cgMentions = (sentence, m) => {
  const s = cgNorm(sentence)
  if (m.kind === 'color') {
    const forms = CG_COLOR_FORMS[m.requested] ?? [m.requested]
    return s.split(/[^\p{L}\p{N}]+/u).some((t) => forms.some((f) => t === f || t.replace(/^(?:و|ب|ف|ل)?ال/, '') === f || t.replace(/^(?:و|ب)/, '') === f))
  }
  const [n, unit] = String(m.requested).split(' ')
  return new RegExp('(?:^|[^0-9.])' + n.replace('.', '\\.') + '\\s*(?:' + unit + '|كغم|kg)').test(s)
}

const cgSplit = (text) => {
  const lines = String(text ?? '').split('\n')
  const hidden = []
  while (lines.length && (CG_HIDDEN.test(lines[lines.length - 1].trim()) || !lines[lines.length - 1].trim())) {
    const l = lines.pop()
    if (l.trim()) hidden.unshift(l)
  }
  return { visible: lines.join('\n'), hidden }
}
const cgJoin = (visible, hidden) => visible.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + (hidden.length ? '\n' + hidden.join('\n') : '')
const cgStage1 = (hidden) => hidden.map((l) => l.replace(/^(\s*STAGE\s*:\s*)(\d+)/i, (x, pre, n) => (Number(n) > 1 ? pre + '1' : x)))
const cgSentences = (visible) => visible.split(/(?<=[.!؟?\n])/)

const cgOpensBooking = (s) => {
  const t = cgNorm(s)
  return CG_BOOKED.test(t) || CG_PREV_ADDR.test(t) || (CG_INFO_WORD.test(t) && CG_INFO_ASK.test(t))
}
const cgPushes = (s) => CG_QTY_ASK.test(cgNorm(s)) || CG_CONFIRM_Q.test(cgNorm(s))

const cgJoinAr = (list) => (list.length <= 1 ? list.join('') : list.slice(0, -1).join('، ') + ' و' + list[list.length - 1])

/** جملة التصحيح: المتوفر حصراً، بلطف، وسؤال واحد خفيف (وبدون سؤال إذا الزبون رجع أصرّ) */
export function correctionText(m) {
  const avail = cgJoinAr(m.available ?? [])
  if (m.kind === 'color') {
    if (m.repeated) return 'أفهمك عزيزي، بس صدك حالياً ما عدنا ' + m.requestedLabel + '، المتوفر بس ' + avail + '. وإذا يناسبك ' + avail + ' أني حاضر أخدمك.'
    return 'حياك الله عزيزي، ' + (m.product ? 'بخصوص ' + m.product + '، ' : '') + 'عدنا بس اللون ' + avail
      + (m.available?.length === 1 ? ' (لون أنيق وعملي)' : '') + '، و' + m.requestedLabel + ' للأسف ما عدنا حالياً. تحب أدزلك تفاصيل ' + avail + '؟'
  }
  if (m.repeated) return 'أفهمك عزيزي، بس حالياً ما عدنا الـ ' + m.requestedLabel + '، المتوفر بس الـ ' + avail + '. وإذا يناسبك أني حاضر أخدمك.'
  return 'حياك الله عزيزي، الي عدنا هسة ' + (m.product ? m.product + ' بس' : 'بس الـ ' + avail) + '، والـ ' + m.requestedLabel
    + ' للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الـ ' + avail + '؟'
}

// جملة المتوفر من الكتالوج: بديل الرد إذا كله كان فتح حجز بلا نية شراء
const cgFacts = (catalog = []) => {
  const list = catalog.slice(0, 5).map((p) => p.name
    + (p.colors?.length ? ' باللون ' + cgJoinAr(p.colors) : '')
    + (p.price ? ' بـ ' + Math.round(p.price).toLocaleString('en-US') + ' دينار' : ''))
  return list.length ? 'عدنا ' + cgJoinAr(list) + '.' : ''
}

/**
 * @param {string} text رد الوكيل (مع أسطر STAGE / NOTIFICATION_TYPE المخفية بآخره)
 * @param {object} [ctx] orderContext من عقدة «سياق الطلب» (mismatch، bookingAllowed، catalog) و placingOrder (create_order اشتغلت)
 */
export function guardCatalogReply(text, ctx = {}) {
  const src = String(text ?? '')
  if (!ctx || ctx.placingOrder || /NOTIFICATION_TYPE:\s*(?:complaint|order_completed)/i.test(src)) return src
  const { visible, hidden } = cgSplit(src)
  if (!visible.trim()) return src

  // ١. لون أو سعة مو موجودة
  const m = ctx.mismatch
  if (m && m.requested && Array.isArray(m.available) && m.available.length) {
    const parts = cgSentences(visible)
    const accepts = parts.some((p) => cgOpensBooking(p) || cgPushes(p) || (cgMentions(p, m) && !CG_UNAVAILABLE.test(cgNorm(p))))
    const corrects = parts.some((p) => cgMentions(p, m) && CG_UNAVAILABLE.test(cgNorm(p)))
    if (accepts) return cgJoin(correctionText(m), cgStage1(hidden))
    // الرد جاوب على شي ثاني وسكت عن اللون أو السعة: التصحيح ينضاف بآخره
    if (!corrects) return cgJoin(visible.trimEnd() + '\n\n' + correctionText(m), cgStage1(hidden))
    return src
  }

  // ٢. الحجز بلا نية شراء صريحة
  if (ctx.bookingAllowed !== false) return src
  const parts = cgSentences(visible)
  if (!parts.some((p) => cgOpensBooking(p) || cgPushes(p))) return src
  const kept = parts.filter((p) => {
    const s = p.trim()
    if (!s) return true
    if (cgOpensBooking(s) || cgPushes(s)) return false
    return !CG_ITEM_ECHO.test(cgNorm(s).replace(/^(?:تدلل|تم)\s+(?:عزيزي|عزيزتي)[،,]\s*/, ''))
  })
  // إيموجي بقى لحاله بعد الجملة المشالة («شكم قطعة رايد؟ 🌟») يروح وياها
  let out = kept.filter((p) => !p.trim() || /[\p{L}\p{N}]/u.test(p)).join('').replace(/^\s*(?:تدلل|تم)\s+(?:عزيزي|عزيزتي)[،,.]?\s*$/m, '')
  if (!/[\p{L}\p{N}]/u.test(out)) out = cgFacts(ctx.catalog)
  if (!out.trim()) return src
  return cgJoin(out, cgStage1(hidden))
}

// ————— لمسة بشرية —————

const HT_SALAM = /(?:^|\s)(?:ال)?سلام\s+عليكم/
const HT_SALAM_BACK = /عليكم\s+(?:ال)?سلام/
// خواتيم آلية: جملة كاملة تنشال
const HT_CLOSERS = [
  /^(?:هل\s+)?ا(?:ك|ق)در\s+اساعد(?:ك|چ)\s+ب(?:شي|اي\s+شي|شيء)\s+ثاني\s*[؟?]?$/,
  /^(?:و)?اذا\s+(?:تحتاج|عند[كچ]|احتجت)\s+(?:اي\s+)?(?:شي\s+ثاني|استفسار|معلومات\s+ثانيه)[^.!؟?]*[.!؟?]?$/,
  /^(?:ت)?خبرني\s+بخصوص\s+هالموضوع\s*[؟?]?$/,
  /^شنو\s+رايد\s+تسال\s+اكثر\s*[؟?]?$/,
  /^شنو\s+(?:رايد|تحب)\s+(?:تطلب|تسوي)(?:\s+بعد)?\s*[؟?]?$/,
]
// تلميح سعر خاص للكمية (التنفيذ 1678): «لكن إذا رايد 10 قطع يمكن نكدر نساعدك بتسعير أو شيء من هالقبيل»
const HT_BULK = /(?:ن|ا)?(?:ك|ق)در\s+(?:ن|ا)ساعد(?:ك|چ)\s+ب?(?:ال)?تسعير|سعر\s+(?:خاص|جمله)|اسعار\s+جمله/
const HT_BULK_CUT = /[،,]?\s*(?:لكن|بس)\s+(?:اذا|إذا)?/
// الاستسلام السريع (التنفيذ 1918): التحويل يبقى عرض لطيف بعد الجواب، مو نصيحة تطرد الزبون
const HT_REFER = /^ا?نصح(?:ك|چ)\s+بالتواصل\s+(?:ويا|مع)\s+موظف/
const HT_REFER_TEXT = 'وإذا تحب، أحوّل سؤالك لموظف من الفريق يأكدلك هالتفصيلة بالضبط.'

/**
 * @param {string} text رد الوكيل
 * @param {{ message?: string }} [ctx] message: رسائل الزبون بهذا الدور
 */
export function humanTouch(text, { message = '' } = {}) {
  const src = String(text ?? '')
  if (/NOTIFICATION_TYPE:\s*(?:complaint|order_completed)/i.test(src)) return src
  const { visible, hidden } = cgSplit(src)
  if (!visible.trim()) return src

  const parts = cgSentences(visible).map((p) => {
    const pad = p.match(/^\s*/)[0]
    const s = p.slice(pad.length)
    const t = cgNorm(s).trim()
    if (!t) return p
    if (HT_CLOSERS.some((re) => re.test(t))) return ''
    if (HT_REFER.test(t)) return pad + HT_REFER_TEXT + (p.endsWith('\n') ? '\n' : '')
    if (HT_BULK.test(t)) {
      const cut = s.search(HT_BULK_CUT)
      const head = cut > 0 ? s.slice(0, cut).trim() : ''
      return head && /[\p{L}]/u.test(head) ? pad + head.replace(/[،,]\s*$/, '') + '.' + (p.endsWith('\n') ? '\n' : ' ') : ''
    }
    return p
  })
  let out = parts.join('')
  if (!/[\p{L}\p{N}]/u.test(out)) out = visible

  // الزبون سلّم والرد ما رد السلام: «وعليكم السلام» أول الرد
  if (HT_SALAM.test(cgNorm(message)) && !HT_SALAM_BACK.test(cgNorm(out))) out = 'وعليكم السلام، ' + out.replace(/^\s+/, '')

  const joined = cgJoin(out, hidden)
  return joined === cgJoin(visible, hidden) ? src : joined
}
