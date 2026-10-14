/**
 * يبني كود عقدة «Stock Guard» لمسار n8n من n8n/stock-guard.js (المصدر المختبَر بـ tests/stock-guard.test.ts).
 * الاستعمال:  node n8n/build-stock-guard-node.mjs <whatsapp|messenger|instagram>
 * يطبع jsCode جاهز للصق في العقدة. أسماء العقد تختلف بين المسارات، فتنمرّر هنا.
 */
import { readFileSync } from 'node:fs'

const NODE_NAMES = {
  whatsapp: { reply: 'Drop Repeated Blocks', prompt: 'Build User Prompt', hints: 'Conversation Hints', createOrder: 'create_order' },
  messenger: { reply: 'Drop Repeated Blocks', prompt: 'Build User Prompt', hints: 'Conversation Hints', createOrder: 'create_order' },
  instagram: { reply: 'حذف المكرر من الرد', prompt: 'بناء رسالة المستخدم', hints: 'تلميحات المحادثة', createOrder: 'إنشاء طلب' },
}

const target = process.argv[2] || 'whatsapp'
const names = NODE_NAMES[target]
if (!names) throw new Error(`unknown target ${target}`)

const source = readFileSync(new URL('./stock-guard.js', import.meta.url), 'utf8')
  .replace(/^export function stockGuard/m, 'function stockGuard')

const wrapper = `
// ---- n8n: المدخلات من عقد هذا المسار (مولّد من n8n/stock-guard.js — لا تعدّل هنا) ----
const NODES = ${JSON.stringify(names)};
const prev = $(NODES.reply).first().json;
const ran = (n) => { try { return $(n).isExecuted === true; } catch (e) { return false; } };
try {
  const hints = (() => { try { return $(NODES.hints).first().json || {}; } catch (e) { return {}; } })();
  const products = $input.all().map((i) => i.json).filter((r) => r && r.color && r.size);
  const res = stockGuard({
    reply: String(prev.output ?? ''),
    customerText: String($(NODES.prompt).first().json.combinedMessage || ''),
    products,
    isNew: hints.isNewConversation === true,
    orderCreated: ran(NODES.createOrder),
  });
  return [{ json: { ...prev, output: res.text, stockGuard: { action: res.action, reason: res.reason } }, pairedItem: { item: 0 } }];
} catch (e) {
  // الحارس ما يوقف الرد أبداً: أي خطأ هنا يمرّر الرد كما هو ويُسجَّل السبب
  return [{ json: { ...prev, stockGuard: { action: 'error', reason: String(e && e.message || e) } }, pairedItem: { item: 0 } }];
}
`

process.stdout.write(source.trimEnd() + '\n' + wrapper)
