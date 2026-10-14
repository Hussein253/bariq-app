/**
 * حارس المخزون (Stock Guard) — عقدة كود في مسارات البوت بعد الوكيل
 * ====================================================================
 * الرد ما يعدّد ولا يعرض ولا يحط بالطلب لون أو قياس مخزونه صفر أو مو موجود بالكتالوج.
 * المخزون يُقرأ من جدول products مباشرة بكل رد (عقدة Load Stock For Guard)، مو من ذاكرة الوكيل،
 * لأن الوكيل نفسه أخطأ رغم استدعاء get_available_products (اختبار 2026-10-04: A4، A6، C4).
 *
 * ثلاث درجات:
 *   list_fixed  سطر قائمة («- أسود: سمول، ميديم، لارج») يُعاد بناؤه من المخزون الفعلي.
 *   override    الرد يحط بالطلب أو يعرض قطعة نافدة، أو الزبون طلب قطعة نافدة والرد ما قال «ماكو»:
 *               يُستبدل الرد كله برسالة ثابتة «… ماكو حالياً» + المتوفر الفعلي.
 *   flag_order  create_order اشتغل بنفس الدور والطلب بيه قطعة نافدة: الرد يبقى، وينضاف تنبيه للزبون،
 *               ويتحوّل لموظف (NOTIFICATION_TYPE: complaint).
 *
 * حدود معروفة: يفترض منتج واحد بالكتالوج (تيشيرت)؛ إذا صار أكثر من منتج يحتاج مطابقة الاسم أيضاً.
 * أسطر العنوان والاسم ما تنفحص، لأن أسماء مناطق وألقاب تشبه الألوان (حي الخضراء، الرمادي، علي الأحمر).
 *
 * هذا الملف مصدر الكود: n8n/build-stock-guard-node.mjs يحوّله لعقدة n8n، وtests/stock-guard.test.ts يختبره.
 */

const AR = (s) => String(s ?? '')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  .toLowerCase();

const PRE = '(?:^|[^ء-ي])(?:و|ب|بال|ال|وال|لل)?';
const END = '(?![ء-ي])';

// القياسات بالترتيب: XXL قبل XL قبل لارج، وكل قياس يُشال من النص بعد ما ينلگى حتى ما ينحسب مرتين
const SIZE_PATTERNS = [
  ['xxlarge', /(xxl|2xl|xx\s*-?\s*large|دبل\s*اكس(\s*لارج)?|اكسين(\s*لارج)?|اكس\s*اكس(\s*لارج)?)/g],
  ['xlarge', /(اكس\s*-?\s*لارج|اكسلارج|x\s*-?\s*large|xlarge|(?<![a-z])xl(?![a-z]))/g],
  ['large', new RegExp(`(${PRE}لارج${END}|(?<![a-z])large(?![a-z]))`, 'g')],
  ['medium', new RegExp(`(${PRE}(ميديم|ميدم|مديم)${END}|(?<![a-z])medium(?![a-z]))`, 'g')],
  ['small', new RegExp(`(${PRE}(سمول|سمال)${END}|(?<![a-z])small(?![a-z]))`, 'g')],
];
const CATALOG_SIZES = ['small', 'medium', 'large', 'xlarge'];
const SIZE_AR = { small: 'سمول', medium: 'ميديم', large: 'لارج', xlarge: 'اكس لارج', xxlarge: 'XXL' };

// صيغ الألوان. الألوان الي مو بالكتالوج بصيغة المذكر بس، لأن صيغ المؤنث أسماء مناطق (الخضراء، الحمراء)
const COLOR_FORMS = {
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
};
const COLOR_DISPLAY = { ابيض: 'أبيض', اسود: 'أسود', اصفر: 'أصفر', احمر: 'أحمر', ازرق: 'أزرق', اخضر: 'أخضر' };

const NEG = new RegExp(`(ماكو|ما اكو|مو متوفر|غير متوفر|ما متوفر|ما يتوفر|مو موجود|ما موجود|غير موجود|ما عدنا|ما عندنا|ماعدنا|${PRE}(خلص|خالص|نفذ|نفذت|نفدت|نافذ)${END})`);
const ORDER = /(طلبك|×|=|قطع|حبه|حبات|المجموع|ملخص|سجلت|ضفت)/;
// أسطر ومقاطع العنوان والاسم ما تنفحص (حي الخضراء، الرمادي، الاسم: علي الأحمر)
const PLACE = new RegExp(`${PRE}(حي|منطقه|شارع|محله|زقاق|قرب|جنب|مقابل|توصيل|عنوان|محافظه|نقطه داله|اقرب|اسم|اسمي|اسمك|ساكن|قضاء|ناحيه)${END}`);
const LIST_LINE = /^\s*(?:[-•▪●]|\d+\s*[.)-]|[٠-٩]+\s*[.)-])\s*/;
const LABEL_LINE = /^\s*\*?\s*([^:：\n]{1,25})\*?\s*[:：]/;
const META = /^\s*(?:STAGE|NOTIFICATION_TYPE)\s*:/i;
// مقاطع بكلام الزبون الي بيها نفي أو تبديل ما تنحسب طلب («بدل الأسود بأبيض»، «الأصفر ما يعجبني»)
const CUSTOMER_SKIP = /(^|\s)(ما|مو|لا|بدل|بدال|غير|بلا)(\s|$)/;
const SEG_SPLIT = /[،,؛]|\sو(?=\s*\d)/;

const sizesIn = (s) => {
  let t = ` ${s} `;
  const found = [];
  for (const [key, re] of SIZE_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(t)) {
      found.push(key);
      re.lastIndex = 0;
      t = t.replace(re, ' ');
    }
  }
  return found;
};

/**
 * @param {{
 *   reply: string,
 *   customerText?: string,
 *   products?: Array<{ color?: string, size?: string, stock?: number | string | null, price_iqd?: number | string | null }>,
 *   isNew?: boolean,
 *   orderCreated?: boolean,
 * }} input
 * @returns {{
 *   text: string,
 *   action: 'none' | 'list_fixed' | 'override' | 'flag_order' | 'skipped',
 *   reason: string,
 *   violations: Array<{ c: string | null, k: string | null, where: string }>,
 * }}
 */
export function stockGuard({ reply, customerText = '', products = [], isNew = false, orderCreated = false }) {
  const text = String(reply ?? '');
  const sizeKey = (s) => {
    const k = String(s || '').toLowerCase().replace(/[^a-z]/g, '');
    if (k === 'xxl' || k === '2xl') return 'xxlarge';
    return k === 'xl' ? 'xlarge' : k;
  };

  // ---- المخزون الفعلي ----
  const stock = {}; // لون -> قياس -> عدد
  const order = [];
  const prices = new Set();
  for (const p of products) {
    const c = AR(p.color).replace(/[^ء-ي]/g, '');
    const k = sizeKey(p.size);
    if (!c || !k) continue;
    if (!stock[c]) { stock[c] = {}; order.push(c); }
    const n = Number(p.stock) > 0 ? Number(p.stock) : 0;
    stock[c][k] = (stock[c][k] || 0) + n;
    if (n > 0 && p.price_iqd != null && p.price_iqd !== '') prices.add(Number(p.price_iqd));
  }
  if (!order.length) return { text, action: 'skipped', reason: 'ما انقرا المخزون', violations: [] };

  const colorRes = {};
  for (const c of new Set([...order, ...Object.keys(COLOR_FORMS)])) {
    const forms = COLOR_FORMS[c] || [c];
    colorRes[c] = new RegExp(`${PRE}(${forms.join('|')})(ه|ات)?${END}`);
  }
  const colorsIn = (s) => Object.keys(colorRes).filter((c) => colorRes[c].test(` ${s} `));
  const available = (c, k) => Boolean(stock[c] && k && stock[c][k] > 0);
  const colorHasStock = (c) => Boolean(stock[c] && Object.values(stock[c]).some((n) => n > 0));
  const sizeInCatalog = (k) => order.some((c) => stock[c][k] !== undefined);
  const sizeHasStock = (k) => order.some((c) => available(c, k));
  const disp = (c) => COLOR_DISPLAY[c] || c;
  const def = (c) => 'ال' + disp(c);

  // زوج (لون، قياس) — أي طرف ناقص يعني «أي لون» أو «أي قياس»
  const unavailable = ({ c, k }) => {
    if (c && !stock[c]) return true;
    if (k && !sizeInCatalog(k)) return true;
    if (c && k) return !available(c, k);
    if (c) return !colorHasStock(c);
    if (k) return !sizeHasStock(k);
    return false;
  };
  const pairsIn = (seg) => {
    const cs = colorsIn(seg);
    const ks = sizesIn(seg);
    if (!cs.length && !ks.length) return [];
    if (!cs.length) return ks.map((k) => ({ c: null, k }));
    if (!ks.length) return cs.map((c) => ({ c, k: null }));
    return cs.flatMap((c) => ks.map((k) => ({ c, k })));
  };
  // الجملة كوحدة إذا بيها لون واحد وماكو نفي (حتى «الأسود، قياس لارج، متوفر» تنمسك)، وإلا مقطع مقطع
  const unitsOf = (sentence) => {
    const segs = sentence.split(SEG_SPLIT).map((s) => s.trim()).filter((s) => s && !PLACE.test(s));
    if (!segs.length) return [];
    const joined = segs.join(' ، ');
    if (!NEG.test(joined) && colorsIn(joined).length <= 1) return [joined];
    return segs.filter((s) => !NEG.test(s));
  };
  const subjectOf = ({ c, k }) => {
    if (c && (!stock[c] || !k)) return `اللون ${disp(c)}`;
    if (c && k) return `${def(c)} ${SIZE_AR[k] || k}`;
    return `قياس ${SIZE_AR[k] || k}`;
  };

  // ---- فحص الرد سطر سطر ----
  const violations = [];
  let listFixed = false;
  const out = text.split('\n').map((line) => {
    if (!line.trim() || META.test(line)) return line;
    const n = AR(line);
    if (PLACE.test(n) && (LIST_LINE.test(line) || LABEL_LINE.test(line))) return line;
    const isList = !ORDER.test(n) && (LIST_LINE.test(line) || LABEL_LINE.test(line));
    if (isList && !NEG.test(n)) {
      const cs = colorsIn(n);
      if (cs.length === 1) {
        const c = cs[0];
        const ks = sizesIn(n);
        if (!stock[c]) { violations.push({ c, k: ks[0] || null, where: line.trim() }); return line; }
        const bad = ks.filter((k) => !available(c, k));
        if (!bad.length && (ks.length || colorHasStock(c))) return line;
        const keep = CATALOG_SIZES.filter((k) => available(c, k));
        listFixed = true;
        if (!keep.length) return null; // اللون كله نافد: السطر ينشال
        const prefix = (line.match(LIST_LINE) || [''])[0];
        const bold = /\*/.test(line.split(/[:：]/)[0]) ? '*' : '';
        return `${prefix}${bold}${disp(c)}${bold}: ${keep.map((k) => SIZE_AR[k]).join('، ')}`;
      }
      if (cs.length > 1) {
        for (const p of pairsIn(n)) if (unavailable(p)) violations.push({ ...p, where: line.trim() });
      }
      return line;
    }
    for (const sentence of n.split(/[.!؟?]+/)) {
      for (const unit of unitsOf(sentence)) {
        for (const p of pairsIn(unit)) if (unavailable(p)) violations.push({ ...p, where: unit });
      }
    }
    return line;
  });

  // ---- الزبون طلب قطعة نافدة والرد ما قال «ماكو» ----
  let requested = null;
  if (!violations.length && !NEG.test(AR(text))) {
    outer: for (const sentence of AR(customerText).split(/[.!؟?\n]+/)) {
      const clean = sentence.split(SEG_SPLIT).filter((s) => !CUSTOMER_SKIP.test(` ${s.trim()} `)).join(' ، ');
      for (const unit of unitsOf(clean)) {
        const hit = pairsIn(unit).find(unavailable);
        if (hit) { requested = hit; break outer; }
      }
    }
  }

  const fem = /چ/.test(text);
  const subj = violations[0] || requested;
  const subject = subj ? subjectOf(subj) : null;

  if (subject && orderCreated) {
    const note = `ملاحظة: ${subject} ماكو حالياً بالمخزن، وموظف من فريقنا راح يتواصل ${fem ? 'ويّاچ' : 'وياك'} حتى نعدّل الطلب 🙏`;
    const kept = out.filter((l) => l !== null && !/^\s*NOTIFICATION_TYPE\s*:/i.test(l));
    const metaAt = kept.findIndex((l) => META.test(l));
    if (metaAt >= 0) kept.splice(metaAt, 0, note); else kept.push(note);
    kept.push('NOTIFICATION_TYPE: complaint');
    return { text: kept.join('\n'), action: 'flag_order', reason: `طلب انخلق وبيه ${subject} (نافد)`, violations };
  }

  if (subject) {
    const lines = [];
    if (isNew) lines.push('هلا وغلا 🌷');
    lines.push(`${subject} ماكو حالياً 🙏`);
    lines.push('المتوفر هسة:');
    for (const c of order) {
      const keep = CATALOG_SIZES.filter((k) => available(c, k));
      if (keep.length) lines.push(`- ${disp(c)}: ${keep.map((k) => SIZE_AR[k]).join('، ')}`);
    }
    if (subj.c && subj.k && stock[subj.c]) {
      const others = order.filter((c) => c !== subj.c && available(c, subj.k));
      if (others.length) lines.push(`وقياس ${SIZE_AR[subj.k]} متوفر ${others.map((c) => 'ب' + def(c)).join(' و')}.`);
    }
    if (prices.size === 1) lines.push(`سعر القطعة ${[...prices][0].toLocaleString('en-US')} دينار.`);
    lines.push(fem ? 'شنو يناسبچ؟' : 'شنو يناسبك؟');
    lines.push('STAGE: 1');
    return {
      text: lines.join('\n'),
      action: 'override',
      reason: violations[0]
        ? `الرد عرض أو حط بالطلب ${subject} وهو نافد: «${violations[0].where.slice(0, 80)}»`
        : `الزبون طلب ${subject} (نافد) والرد ما وضّح`,
      violations,
    };
  }

  if (listFixed) {
    return { text: out.filter((l) => l !== null).join('\n'), action: 'list_fixed', reason: 'قائمة المتوفر انعادت من المخزون الفعلي', violations };
  }
  return { text, action: 'none', reason: '', violations };
}
