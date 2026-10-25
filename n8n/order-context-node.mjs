/**
 * بنّاء كود عقدة «سياق الطلب» من المصدر المختبَر n8n/order-context-hint.js.
 * مشترك بين سكربتات التعديل (fix-order-context-and-presence و harden-order-flow) حتى ما ينفرز كود العقدة
 * بنسختين: سكربت يرجّع نسخة أقدم من الثاني إذا كل واحد يبنيها بطريقته.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const MODULE = fs.readFileSync(path.join(HERE, 'order-context-hint.js'), 'utf8')

// نفس التعبير المستعمل بالاختبارات، ينقرا من المصدر حتى ما ينفرز نسختين منه
export const ASKS_LINE = (MODULE.match(/^export const ASKS_FOR_HUMAN = .*$/m) ?? [])[0]?.replace(/^export /, '')
if (!ASKS_LINE) throw new Error('ما لگيت ASKS_FOR_HUMAN بـ n8n/order-context-hint.js')

/**
 * @param {{ prompt: string, recent: string, bot?: string, merchant?: string }} c أسماء العقد بمسار القناة
 *   (prompt: تجهيز رسالة الوكيل، recent: رسائل الزبون السابقة، bot: ردود البوت الأخيرة، merchant: عقدة تحديد التاجر وبيها product_names)
 */
export const nodeCode = (c) => MODULE.replace(/^export /gm, '').trimEnd() + `

// ---- n8n: المدخلات من عقد هذا المسار (مولّد من n8n/order-context-hint.js — لا تعدّل هنا) ----
const NODES = ${JSON.stringify({ prompt: c.prompt, recent: c.recent, bot: c.bot ?? null, merchant: c.merchant ?? 'تحديد التاجر' })};
const j = $json;
const productNames = (() => { try { return String($(NODES.merchant).first().json.product_names || ''); } catch (e) { return ''; } })();
// صفوف الكتالوج (عمود catalog بعقدة تحديد التاجر، من n8n/sales-guardrails.mjs): بدونها ماكو فحص لون ولا سعة
const catalog = (() => { try { return $(NODES.merchant).first().json.catalog || []; } catch (e) { return []; } })();
const base =(() => { try { return $(NODES.prompt).first().json || {}; } catch (e) { return {}; } })();
const recent = (() => {
  try { return $(NODES.recent).all().map((i) => String((i.json || {}).message_text || '')); } catch (e) { return []; }
})();
const botReplies = (() => {
  try {
    let r = $(NODES.bot).first().json.replies;
    if (typeof r === 'string') r = JSON.parse(r);
    return Array.isArray(r) ? r.map((x) => String(x || '')) : [];
  } catch (e) { return []; }
})();
try {
  const res = orderContextHint({
    combinedMessage: base.combinedMessage,
    sessionData: base.sessionData,
    recentMessages: recent,
    orderingNow: (j.complaintCheck || {}).ordering_now === true,
    botReplies,
    productNames,
    catalog,
  });
  return [{ json: { ...j, userPrompt: String(j.userPrompt || '') + res.hint, orderContext: res.orderContext }, pairedItem: { item: 0 } }];
} catch (e) {
  // التنبيه ما يوقف الرد أبداً: أي خطأ هنا يمرّر البرومت مثل ما هو ويُسجَّل السبب
  return [{ json: { ...j, orderContext: { error: String((e && e.message) || e) } }, pairedItem: { item: 0 } }];
}
`
