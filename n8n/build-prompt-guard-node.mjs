/**
 * يبني كود عقدة «Prompt Guard» لمسارات البوت الثلاثة من lib/security/promptGuard.ts (المصدر المختبَر
 * بـ lib/security/promptGuard.test.ts و tests/prompt-guard-node.test.ts).
 * الاستعمال:  node n8n/build-prompt-guard-node.mjs
 * يطبع jsCode جاهز للصق في العقدة. الكود نفسه للمسارات الثلاثة: كلها تسمّي نص الزبون المجمّع combinedMessage.
 * مكان العقدة وفرع الرفض في docs/n8n-prompt-guard.md.
 *
 * الناتج ASCII فقط: الحروف العربية وأحرف العرض الصفري التي يحذفها الحارس تُكتب \uXXXX، فلا يضيع منها
 * حرف بالنسخ أو عبر الـ API، ويُقارَن الكود المنشور بالمبني بايتاً ببايت.
 */
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

const wrapper = `
// ---- n8n: generated from lib/security/promptGuard.ts by n8n/build-prompt-guard-node.mjs. Do not edit here. ----
// Runs after the prompt is built and before anything reaches a model. The IF node after this one sends
// promptGuard.reply to the customer when isSafe is false, and the agent never runs.
return $input.all().map((item, i) => {
  const text = item.json.combinedMessage;
  const length = typeof text === 'string' ? text.length : 0;
  let promptGuard;
  try {
    const r = detectPromptInjection(text);
    promptGuard = { isSafe: r.isSafe, riskScore: r.riskScore, categories: r.categories, length, reply: r.isSafe ? null : r.message };
  } catch (e) {
    // Fails open like the stock guard: a bug here must not silence the bot. Prices still come from the DB.
    promptGuard = { isSafe: true, riskScore: 0, categories: [], length, reply: null, error: String((e && e.message) || e) };
  }
  return { json: { ...item.json, promptGuard }, pairedItem: { item: i } };
});
`

export function buildPromptGuardNode() {
  const ts = require('typescript')
  const source = readFileSync(new URL('../lib/security/promptGuard.ts', import.meta.url), 'utf8')
  const js = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        removeComments: true,
      },
    })
    .outputText.replace(/^export \{\};?\s*$/m, '')
    .replace(/^export /gm, '')

  // عقدة الكود ليست وحدة ES: أي import/export متبقٍّ يكسرها وقت التشغيل
  if (/^\s*(import|export)\b/m.test(js)) throw new Error('promptGuard.ts: import/export left after transpile')
  // \ قبل حرف غير ASCII يصير \\uXXXX بعد الترميز ويتغيّر معناه
  if (/\\[^\x00-\x7f]/.test(js)) throw new Error('promptGuard.ts: backslash before a non-ASCII character')

  return (js.trimEnd() + '\n' + wrapper).replace(
    /[^\x00-\x7f]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildPromptGuardNode())
}
