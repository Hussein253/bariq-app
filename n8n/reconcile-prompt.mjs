/**
 * تعديل برومت عقدة «Prepare Reconcile» (دمج ثلاث تفريغات للبصمة بنموذج نصي) من عيّنات حقيقية بماسنجر:
 *   - التنفيذ 611: محرك كتب «كم توصيل للعامرية» والثاني «العامرية» والثالث اخترع «السلام عليكم ورحمة الله» ← انكتب «العامرية»
 *     بس، وضاع سؤال الزبون عن التوصيل.
 *   - التنفيذ 864: «إذا موجود العفو» (محرك واحد) انكتب مع إن محركين كتبوا «أنت موجود».
 *   - التنفيذ 783: «حجي / حجز / حاجز» (ثلاث قراءات مختلفة) انكتبت بدون أي كلمة غير واضحة.
 *
 * شنو جرّبته بعيّنات حقيقية (12 تنفيذ) قبل ما أعتمده:
 *   - تصويت بالأغلبية وحده يضر: بالتنفيذ 702 محركان كتبا «يعمل الدوام» غلط والصح «أيام الدوام» عند الثالث. فالقاعدة: المعنى
 *     أول، وبين قراءتين معقولتين الأكثر أصواتاً.
 *   - حقل disagreements قبل text ما زاد دقة وزاد وقت الدمج، وreasoning_effort متوسط يوصل 7–31 ثانية. فالتعديل برومت بس
 *     وبنفس reasoning_effort: low.
 *   - 864 يبقى غلط أحياناً (النموذج يشوف «إذا موجود» معقولة)، والتحية الي يخترعها Whisper ويضيّع بيها كلام الزبون (611) انحلت.
 *
 * النص داخل الكود حرف حرف (فيه \n مكتوبة)، فالاستبدالات نصية مضبوطة مرة وحدة، وبدون علامة اقتباس مزدوجة داخل النصوص الجديدة.
 */

const swapOnce = (text, from, to, label) => {
  const parts = text.split(from)
  if (parts.length !== 2) throw new Error(`[${label}] لازم يتطابق مرة وحدة، تطابق ${parts.length - 1}`)
  return parts.join(to)
}

const RULES_FROM = '- Use only words supported by at least one transcript; when they disagree, choose the reading that fits the shop conversation. When two transcripts sound alike at the same spot, that sound is more likely right than the third transcript, even if the third looks cleaner. Never add information that no transcript has.'
const RULES_TO = [
  '- Use only words supported by at least one transcript. Never add information that no transcript has.',
  '- Resolve every spot where the transcripts differ on a word by meaning first, then by votes: a reading that makes sense in an Iraqi shop chat beats one that does not, even when two engines share the odd reading (the engines often make the same mistake); between readings that both make sense, the one more transcripts have wins (two engines giving the same word or the same sound is strong evidence, even spelled differently or with a filler such as «هل», and even when the third transcript looks like cleaner Standard Arabic). A reading only one transcript has wins only when it is the only sensible one.',
  '- If one transcript has the same words as another plus more, the engine that wrote less probably cut the speech short: keep the fuller content. Speech engines sometimes invent a stock phrase on short or noisy audio (a greeting such as «السلام عليكم ورحمة الله وبركاته», or «شكرا»); leave such a phrase out unless another transcript has it too.',
  '- Questions: when at least two transcripts read as a question (a question word such as «هل», «شنو», «شكد», «وين», «اكو», «عندك», or a «؟»), keep it a question.',
  '- Exception to the rule above: a word that sounds like one of the listed delivery areas is written exactly as the list spells it (for example «تاجي» becomes «التاجي»).',
  '- Never drop a clause because it looks garbled: when one transcript has a whole extra clause or question at the end (or middle) that another transcript lacks, the shorter engine most likely stopped early. Keep that clause, writing its words exactly as the longer transcript has them, and put the garbled words in unclear_words.',
].join('\\n')

const UNCLEAR_FROM = '- unclear_words: words of your text (names, places, numbers) that the transcripts disagree on and you are not sure about, copied exactly as in your text; empty when they agree.'
const UNCLEAR_TO = '- unclear_words: words of your text (names, places, numbers, products, sizes, colours) that the transcripts disagree on and you are not sure about, copied exactly as in your text; empty when they agree. A name or a place that the three transcripts read three different ways, or that only one transcript has, always goes in, even when your reading looks sensible. Fillers and spelling differences never go in.'

// كلمات استفسار شائعة لازم ما تتحول لمنطقة بالتلميحات («السعر» ≈ «الثغر» طلعت تلميح كاذب بالتنفيذ 1156)
const SKIP_FROM = "'عدي']);"
const SKIP_TO = "'عدي', 'سعر', 'السعر', 'اسعار', 'الاسعار', 'اسعارهن', 'غساله', 'الغساله', 'منتجات', 'المنتجات', 'عندك', 'عندكم', 'عدكم', 'دوام', 'الدوام', 'ايام', 'ديسكاونت', 'خصم', 'تخفيض']);"
const SKIP_MARKER = "'ديسكاونت', 'خصم'"

export const RECONCILE_MARKER = 'Resolve every spot where the transcripts differ'

// تحية Whisper المخترعة على صوت قصير (التنفيذ 611): إذا تفريغ محرك كله جملة جاهزة والمحركين الثانيين ما بيهم هالكلمة، يتفرّغ.
// حتمي، بدون نموذج، فما يتأثر بتذبذب الدمج.
const STOCK_ANCHOR = 'const ctx = $('
export const STOCK_MARKER = 'const STOCK = '
const STOCK_FILTER = `const STOCK = /^(?:ال?سلام عليكم(?: ورحمه الله(?: وبركاته)?)?|شكرا(?: لكم| لك| جزيلا)?|شكرا على المشاهده|اشتركوا في القناه)$/;
const STOCK_PART = /تمن[يى] ان تكونوا|على المشاهده|لا تنسوا الاشتراك|اشتركوا في|ترجمه نانسي/;
const normStock = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^ء-ي ]/g, ' ').replace(/\\s+/g, ' ').trim();
for (const t of [a, b, c]) {
  const n = normStock(t.text);
  if (!n) continue;
  const others = [a, b, c].filter((o) => o !== t).map((o) => normStock(o.text));
  const greeting = STOCK.test(n) && !others.some((o) => o.includes(n.startsWith('شكرا') ? 'شكرا' : 'سلام'));
  const boiler = STOCK_PART.test(n) && !others.some((o) => STOCK_PART.test(o));
  if (greeting || boiler) t.text = '';
}
`

/** @param {string} code كود عقدة Prepare Reconcile */
export const patchPrepareReconcile = (code) => {
  let out = code
  if (!out.includes(RECONCILE_MARKER)) {
    out = swapOnce(out, RULES_FROM, RULES_TO, 'reconcile/rules')
    out = swapOnce(out, UNCLEAR_FROM, UNCLEAR_TO, 'reconcile/unclear')
  }
  if (!out.includes(SKIP_MARKER)) out = swapOnce(out, SKIP_FROM, SKIP_TO, 'reconcile/skip')
  if (!out.includes(STOCK_MARKER)) out = swapOnce(out, STOCK_ANCHOR, STOCK_FILTER + STOCK_ANCHOR, 'reconcile/stock')
  return out
}
