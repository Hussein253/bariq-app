/**
 * مبلغ الملخص = مبلغ الطلب المحفوظ (ماسنجر 2026-10-31، الطلب 51).
 *   البوت كتب للزبون «أجور التوصيل هي 5,000 دينار، والمجموع الكلي … 80,000 دينار»، والطلب انحفظ بـ 66,750:
 *   التوصيل لبغداد 3,000، وخصم أول طلب 15% على سعر القطعة (25,000 ← 21,250). الأرقام بالقاعدة حتمية:
 *     • سعر البند = round(price_iqd × (100 − discount_pct) ÷ 100) — enforce_order_item_integrity (الترحيل ٠٢٩)
 *     • أجرة التوصيل: محافظة الأساس ← local_fee_iqd، وغيرها ← other_fee_iqd — create_bot_order_shipment (الترحيل ٠٢٧)
 *     • discount_pct: نفس حقل create_order بماسنجر (first_order_discount_pct إذا ما أخذ خصم قبل، وإلا 0). واتساب بلا خصم.
 *   الحارس يحسب نفس الأرقام من الملخص (العدد والمنتج والمحافظة)، ويصحح سطري التوصيل والمجموع، ويذكر الخصم إذا ما مذكور.
 *   إذا ما يقدر يحسب بثقة (أكثر من بند، منتج بأسعار مختلفة، ماكو محافظة ولا أجرة بالرد)، يخلي الرد مثل ما هو.
 *
 * هذا الملف مصدر الكود: n8n/order-money.mjs يزرعه بعقدة «Drop Repeated Blocks»، وtests/order-money.test.ts يختبره.
 */

const moneyLatin = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
const moneyNorm = (s) => moneyLatin(s).replace(/\p{M}/gu, '').replace(/ـ/g, '').replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase()
const moneyEscape = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 66750 ← «66,750» (نفس كتابة البوت). */
export const formatIqd = (n) => String(Math.round(Number(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** «80,000» أو «٨٠٬٠٠٠» أو «80.000» ← 80000. */
const parseIqd = (s) => Number(moneyLatin(s).replace(/[,٬.\s]/g, ''))

/**
 * عمود delivery_fees بعقدة «تحديد التاجر».
 * @param {string} text «أجور التوصيل: 3,000 دينار لبغداد، و5,000 دينار لباقي المحافظات.»
 * @returns {{ base: string, local: number, other: number } | null}
 */
export function parseDeliveryFees(text) {
  const m = moneyLatin(text).match(/أجور التوصيل:\s*([\d,]+)\s*دينار\s*ل(.+?)،\s*و([\d,]+)\s*دينار\s*لباقي المحافظات/)
  return m ? { base: m[2].trim(), local: parseIqd(m[1]), other: parseIqd(m[3]) } : null
}

/**
 * محافظات العراق ومدن مراكزها المميزة ← اسم المحافظة (بعد moneyNorm وبدون «ال»).
 * ما تنضاف كلمات عامة تشبه مدينة: «عمارة» (بناية)، «رمادي» (لون)، «حلة».
 */
const GOVERNORATES = {
  بغداد: 'بغداد', بصره: 'بصره', نينوي: 'نينوي', موصل: 'نينوي', اربيل: 'اربيل', نجف: 'نجف', كربلاء: 'كربلاء',
  بابل: 'بابل', 'ذي قار': 'ذي قار', ناصريه: 'ذي قار', انبار: 'انبار', ديالي: 'ديالي', بعقوبه: 'ديالي',
  'صلاح الدين': 'صلاح الدين', تكريت: 'صلاح الدين', كركوك: 'كركوك', واسط: 'واسط', كوت: 'واسط', ميسان: 'ميسان',
  مثني: 'مثني', سماوه: 'مثني', قادسيه: 'قادسيه', ديوانيه: 'قادسيه', دهوك: 'دهوك', سليمانيه: 'سليمانيه', حلبجه: 'حلبجه',
}

/** المحافظات المذكورة بالنص، ويا حروف الجر الملصوقة: «بغداد»، «البصرة»، «بالبصرة»، «للبصرة»، «وبغداد». */
const governoratesIn = (text) => {
  const t = moneyNorm(text)
  const found = new Set()
  for (const [k, g] of Object.entries(GOVERNORATES)) {
    if (new RegExp(`(?<![\\p{L}])[وفبكل]{0,2}(?:ال|ل)?${moneyEscape(k)}(?![\\p{L}])`, 'u').test(t)) found.add(g)
  }
  return found
}

/**
 * أجرة التوصيل حسب المحافظة المذكورة بالرد: محافظة الأساس ← المحلية، وغيرها ← باقي المحافظات.
 * @returns {number | null} null إذا ماكو محافظة بالرد، أو أكثر من وحدة، أو ماكو إعدادات
 */
export function deliveryFeeFor(text, fees) {
  if (!fees) return null
  const found = governoratesIn(text)
  if (found.size !== 1) return null
  const baseKey = moneyNorm(fees.base).replace(/^ال/, '')
  const base = GOVERNORATES[baseKey] ?? baseKey
  return [...found][0] === base ? fees.local : fees.other
}

const QTY_UNIT = '(?:قطع|قطعه|قطعات|وحدات|وحده|حبات|حبه)'

/** عدد القطع بالملخص: «٣ قطع»، «قطعتين». null إذا ماكو عدد أو أكثر من عدد (أكثر من بند). */
export function summaryQuantity(text) {
  const t = moneyNorm(text)
  const nums = [...t.matchAll(new RegExp(`(?<![\\d,])(\\d{1,3})\\s*${QTY_UNIT}(?![\\p{L}])`, 'gu'))].map((m) => Number(m[1]))
  const twos = (t.match(/(?<![\p{L}])(?:قطعتين|وحدتين|حبتين)(?![\p{L}])/gu) || []).length
  const all = [...nums, ...Array(twos).fill(2)]
  return all.length === 1 && all[0] > 0 ? all[0] : null
}

/**
 * سعر القطعة من الكتالوج (price_iqd): سعر واحد لكل الكتالوج، أو للمنتج المذكور، أو للونه المذكور.
 * @param {string} text الرد
 * @param {Array<{ name?: string, color?: string, price_iqd?: number }>} catalog عمود catalog بعقدة «تحديد التاجر»
 * @returns {number | null}
 */
export function unitListPrice(text, catalog) {
  const rows = (Array.isArray(catalog) ? catalog : []).filter((r) => r && Number(r.price_iqd ?? r.price) > 0)
  const prices = (rs) => [...new Set(rs.map((r) => Number(r.price_iqd ?? r.price)))]
  const all = prices(rows)
  if (all.length === 1) return all[0]
  const t = moneyNorm(text)
  const named = rows.filter((r) => r.name && t.includes(moneyNorm(r.name)))
  if (prices(named).length === 1) return prices(named)[0]
  const colored = named.filter((r) => r.color
    && new RegExp(`(?<![\\p{L}])(?:ال)?${moneyEscape(moneyNorm(r.color).replace(/^ال/, ''))}(?![\\p{L}])`, 'u').test(t))
  return prices(colored).length === 1 ? prices(colored)[0] : null
}

/** نسبة الخصم = نفس حقل discount_pct بـ create_order (ماسنجر). */
export function orderDiscountPct(merchant) {
  const t = merchant || {}
  return Number(t.customer_discounted_orders ?? t.customer_prior_orders ?? 0) === 0 ? Number(t.first_order_discount_pct || 0) : 0
}

const TOTAL_RE = /(المجموع الكلي[^\d٠-٩\n]{0,60}?)([\d٠-٩][\d٠-٩,٬.]*)(\s*دينار)/
const FEE_RE = /(أجور التوصيل[^\d٠-٩\n]{0,30}?)([\d٠-٩][\d٠-٩,٬.]*)(\s*دينار)/
/** «سعر القطع» (مجموع البنود)، مو «سعر القطعة». */
const ITEMS_RE = /(سعر القطع(?![ةه])[^\d٠-٩\n]{0,30}?)([\d٠-٩][\d٠-٩,٬.]*)(\s*دينار)/

/**
 * يصحح سطري أجور التوصيل والمجموع الكلي بالرد حتى يطابقون الطلب الي راح ينحفظ، ويذكر الخصم إذا ما مذكور.
 * @param {string} text رد الوكيل
 * @param {{ catalog?: object[], deliveryFees?: string, discountPct?: number }} ctx
 * @returns {string}
 */
export function fixSummaryMoney(text, { catalog = [], deliveryFees = '', discountPct = 0 } = {}) {
  const src = String(text ?? '')
  const total = src.match(TOTAL_RE)
  if (!total) return src
  const qty = summaryQuantity(src)
  const list = unitListPrice(src, catalog)
  if (!qty || !list) return src
  const pct = Number(discountPct) > 0 ? Number(discountPct) : 0
  const unit = Math.round(list * (100 - pct) / 100)
  const feeMatch = src.match(FEE_RE)
  const feeOld = feeMatch ? parseIqd(feeMatch[2]) : null
  const fee = deliveryFeeFor(src, parseDeliveryFees(deliveryFees)) ?? feeOld
  if (fee == null || !Number.isFinite(fee)) return src
  const items = qty * unit
  const expected = items + fee
  let out = src
  const itemsMatch = out.match(ITEMS_RE)
  if (itemsMatch && parseIqd(itemsMatch[2]) !== items) out = out.replace(ITEMS_RE, (_, a, _n, c) => a + formatIqd(items) + c)
  if (feeMatch && fee !== feeOld) out = out.replace(FEE_RE, (_, a, _n, c) => a + formatIqd(fee) + c)
  if (parseIqd(total[2]) !== expected) out = out.replace(TOTAL_RE, (_, a, _n, c) => a + formatIqd(expected) + c)
  if (pct > 0 && !/خصم/.test(out)) {
    const note = `خصم أول طلب ${pct}%: سعر القطعة ${formatIqd(unit)} دينار بدل ${formatIqd(list)}.`
    out = out.replace(FEE_RE.test(out) ? FEE_RE : TOTAL_RE, (m) => `${note} ${m}`)
  }
  return out
}
