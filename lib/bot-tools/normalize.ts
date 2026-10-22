/**
 * تطبيع النص العربي لأدوات البوت
 * ==============================
 * نسخة JavaScript من public.ar_normalize (الترحيل ٠٢٢) — الدالة التي تُحسب بها
 * الأعمدة المخزَّنة delivery_areas.area_name_norm و product_groups.name_norm.
 * البحث يطبّق على نص الزبون التحويل نفسه، فيتطابق «القاهره» مع «القاهرة».
 *
 * ⚠️ أي تعديل على ar_normalize في SQL يُعدَّل هنا معه، وإلا انقطعت المطابقة
 * بصمت. يطابقها كذلك تعبير أداة find_delivery_area في n8n (مسار واتساب).
 *
 * بلا استيرادات: تُختبر وتُقارن بدالة SQL مباشرةً خارج التطبيق.
 */

/** التشكيل (064B–065F، 0670)، التطويل (0640)، علامات الاتجاه الخفية (200B–200F، 061C). */
const IGNORABLE = /[ً-ٰٟـ​-‏؜]/g

/** مطابق لـ translate(...) في ٠٢٢. ء بلا مقابل هناك فتُحذف. */
const LETTER_MAP: Readonly<Record<string, string>> = {
  أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا',
  ى: 'ي', ی: 'ي', ئ: 'ي',
  ۀ: 'ه', ة: 'ه', ۃ: 'ه', ە: 'ه', ھ: 'ه',
  ؤ: 'و', ک: 'ك', گ: 'ق', ڤ: 'ف', پ: 'ب', چ: 'ج',
  ء: '',
}

/** public.ar_normalize(text) — يعيد '' لمدخل null/undefined كما تفعل الدالة (coalesce). */
export function arNormalize(text: string | null | undefined): string {
  const stripped = (text ?? '').replace(IGNORABLE, '')
  let mapped = ''
  for (const ch of stripped) mapped += LETTER_MAP[ch] ?? ch
  return mapped.replace(/\s+/g, ' ').trim()
}

/** ما عدا الحروف العربية/اللاتينية والأرقام والفراغ — نفس صنف تعبير n8n. */
const NON_WORD = /[^ء-ي٠-٩ٮ-ۿA-Za-z0-9\s]/g

/**
 * نص بحث آمن: مطبَّع، بحروف صغيرة، بلا علامات ترقيم. شرط الأمان: ما يمرّ منه يُدمج
 * في فلتر PostgREST (`or=(...)` و `ilike`) فلا يجوز أن يحمل `,` `(` `)` `%` `*` `_` `\`.
 */
export function sanitizeForSearch(text: string | null | undefined): string {
  return arNormalize(text).replace(NON_WORD, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** «الـ» وحروف الجر الملصقة بها (بال، وال، فال، كال، لل). تُترك إن لم يبقَ حرفان. */
const ARTICLE_PREFIX = /^(?:[وبفك]ال|لل|ال)(?=\S{2,})/

const MIN_TOKEN_LENGTH = 2
const MAX_TOKENS = 6

/**
 * كلمات البحث من نص حرّ: مطبَّعة، بلا «ال»، فريدة، حتى ٦ كلمات.
 * «بالتيشيرت الأسود» ← ['تيشيرت', 'اسود'].
 */
export function toSearchTokens(query: string | null | undefined): string[] {
  const seen = new Set<string>()
  for (const word of sanitizeForSearch(query).split(' ')) {
    const token = word.replace(ARTICLE_PREFIX, '')
    if (token.length >= MIN_TOKEN_LENGTH) seen.add(token)
    if (seen.size >= MAX_TOKENS) break
  }
  return [...seen]
}

/** نمط ilike لفلتر الفئة: الكلمات بالترتيب، أو null إن لم يبقَ شيء. */
export function categoryPattern(category: string | null | undefined): string | null {
  const tokens = toSearchTokens(category)
  return tokens.length > 0 ? `%${tokens.join('%')}%` : null
}

/**
 * نمط ilike لاسم منطقة التوصيل — منقول حرفياً من تعبير find_delivery_area في n8n
 * (مسار واتساب، نسخة 2026-10-20) كي يتصرّف الأداتان بالطريقة نفسها:
 * يُسقط «حي/منطقة/محلة/ناحية/قضاء» و«ال» من البداية، ويرجع للاسم الكامل إن قصر الناتج.
 * يعيد null إن لم يبقَ من الاسم ما يُبحث به.
 */
export function areaSearchPattern(area: string | null | undefined): string | null {
  const full = sanitizeForSearch(area)
  if (full.replace(/\s/g, '').length < 2) return null

  let q = full
    .replace(/^لل(?=\S)/, 'ال')
    .replace(/^[وبفل]{1,2}(?=حي(?:\s|$)|ال)/, '')
  const mid = q
  q = q.replace(/^(?:حي|منطقه|محله|ناحيه|قضا)\s+/, '').replace(/^ال(?=\S)/, '')
  if (q.replace(/\s/g, '').length < 3) {
    q = mid.replace(/\s/g, '').length >= 4 ? mid : full
  }
  return `%${q.split(' ').join('%')}%`
}

// ---------------------------------------------------------------------------
// الألوان والقياسات
// ---------------------------------------------------------------------------

/**
 * صيغ الألوان بعد التطبيع — منقولة من COLOR_FORMS في n8n/stock-guard.js.
 * صيغ المؤنث لألوان خارج الكتالوج متروكة عمداً هناك (أسماء مناطق: الخضراء، الحمراء).
 */
const COLOR_FORMS: Readonly<Record<string, readonly string[]>> = {
  ابيض: ['ابيض', 'بيضا', 'بيضه'],
  اسود: ['اسود', 'سودا', 'سوده'],
  اصفر: ['اصفر', 'صفرا', 'صفره'],
  احمر: ['احمر'],
  ازرق: ['ازرق'],
  اخضر: ['اخضر'],
  بيجي: ['بيجي', 'بيج'],
  رصاصي: ['رصاصي'],
  وردي: ['وردي', 'زهري'],
  كحلي: ['كحلي'],
  نيلي: ['نيلي'],
  جوزي: ['جوزي'],
  سماوي: ['سماوي'],
  برتقالي: ['برتقالي'],
  بنفسجي: ['بنفسجي'],
  فضي: ['فضي'],
  ذهبي: ['ذهبي'],
  عنابي: ['عنابي'],
  زيتي: ['زيتي'],
  خاكي: ['خاكي'],
  ماروني: ['ماروني'],
}

const COLOR_BY_FORM: ReadonlyMap<string, string> = new Map(
  Object.entries(COLOR_FORMS).flatMap(([key, forms]) => forms.map((f) => [f, key] as const))
)

/** مفتاح لون للمقارنة: «الأسود» و«سودا» و«اسود» ← 'اسود'. نص غير معروف يبقى مطبَّعاً كما هو. */
export function canonicalColor(text: string | null | undefined): string {
  const n = arNormalize(text).toLowerCase().replace(/^ال(?=\S{2,})/, '')
  return COLOR_BY_FORM.get(n) ?? n
}

/**
 * قياسات الحروف: المفتاح بعد التطبيع وطيّ الفراغات والشرطات. المفردات من
 * SIZE_PATTERNS في n8n/stock-guard.js (سمول/ميديم/لارج/اكس لارج/XXL)، وتُضاف
 * S/M/L اللاتينية. قياس رقمي أو غير معروف (٣٢، ٤٢، «٣ سنوات») يُقارَن كنص.
 */
const SIZE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  small: ['small', 's', 'سمول', 'سمال'],
  medium: ['medium', 'm', 'ميديم', 'ميدم', 'مديم'],
  large: ['large', 'l', 'لارج'],
  xlarge: ['xlarge', 'xl', 'اكسلارج'],
  xxlarge: ['xxlarge', 'xxl', '2xl', 'دبلاكس', 'دبلاكسلارج', 'اكسينلارج', 'اكساكسلارج'],
}

const SIZE_BY_ALIAS: ReadonlyMap<string, string> = new Map(
  Object.entries(SIZE_ALIASES).flatMap(([key, aliases]) => aliases.map((a) => [a, key] as const))
)

/** مفتاح قياس للمقارنة: «لارج» و«Large» و«L» ← 'large'؛ «اكس لارج» و«XL» ← 'xlarge'. */
export function canonicalSize(text: string | null | undefined): string {
  const compact = arNormalize(text).toLowerCase().replace(/[\s\-_]+/g, '')
  return SIZE_BY_ALIAS.get(compact) ?? compact
}

// ---------------------------------------------------------------------------
// معرّفات
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
