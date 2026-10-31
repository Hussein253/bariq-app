/**
 * الجواب على قدّ السؤال (قاعدة صاحب المتجر 2026-10-29): المنتج باسمه بس، والتفاصيل بس إذا الزبون سألها.
 * التفاصيل والأمثلة بـ n8n/reply-scope.js.
 *
 *   ١. برومت الوكيل: الأسطر الي تأمر بعرض كل لون بقياساته وبسعر القطعة ويا كل جواب تتبدل (PROMPT_FIXES)،
 *      وتنضاف القاعدة العامة (SCOPE_RULE) تحت سطر «سؤال عن المنتجات».
 *   ٢. تنبيه الاستفسار بعقدة «Order Context Hint» / «سياق الطلب»: «إي عدنا [المنتج] بـ [سعره]» ← «إي عدنا [المنتج]».
 *   ٣. آخر حارس قبل «Parse Agent Output»: قوائم القياسات تنشال إذا الزبون ما سأل عن القياس وماكو طلب جاري.
 *   (تنبيه كل دور بالتفاصيل الي سأل عنها: n8n/answer-accuracy.mjs.)
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/reply-scope.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/reply-scope.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/reply-scope.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/reply-reliability.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'reply-scope.js'), 'utf8')

export const CHANNELS = {
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent', context: 'Order Context Hint', guard: 'Drop Repeated Blocks', hints: 'Conversation Hints' },
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent', context: 'Order Context Hint', guard: 'Drop Repeated Blocks', hints: 'Conversation Hints' },
  // «سياق الطلب» بإنستغرام قديمة بلا orderContext: الحارس يعتمد كلمات الشراء بالرسالة
  instagram: { id: 'CTuJ0eGVthUjREVJ', agent: 'وكيل المبيعات (علاء)', context: 'سياق الطلب', guard: 'حذف المكرر من الرد', hints: 'تلميحات المحادثة', noOrderContext: true },
}

/** [النص القديم بالبرومت، الجديد]: نفس النص بالثلاث مسارات. */
export const PROMPT_FIXES = [
  [
    '- لما تعرض المتوفر: إذا المنتج بيه ألوان وقياسات اكتب كل لون بسطر واحد، مثل: «- أسود: سمول، ميديم، اكس لارج»، وبالآخر سطر سعر القطعة من الأداة. وإذا المتجر بيه أكثر من منتج، اكتب كل منتج بسطر ويا سعره. ممنوع القوائم المتداخلة والتكرار.',
    '- لما تعرض المتوفر: اذكر المنتج باسمه بس، والتفاصيل بس الي سأل عنها الزبون بالذات. سأل عن القياسات: كل لون بسطر واحد بقياساته، مثل «- أسود: سمول، ميديم، اكس لارج». سأل عن الألوان: أسماء الألوان بجملة وحدة. سأل عن السعر: سعر القطعة. وإذا المتجر بيه أكثر من منتج: أسماءهم بس. ممنوع القوائم المتداخلة والتكرار.',
  ],
  [
    '- الزبون: "شعدكم تيشيرتات وشكد أسعارهن؟" ← عدّد الألوان والقياسات من الأداة وسعر القطعة، وبس. بدون «شكم قطعة رايد؟».',
    '- الزبون: "شعدكم تيشيرتات وشكد أسعارهن؟" ← اسم المنتج وسعر القطعة بس (سأل عن المنتجات والسعر)، بدون ألوان ولا قياسات، وبدون «شكم قطعة رايد؟».',
  ],
  [
    'جاوب بجملة أو جملتين (المتوفر وسعره من get_available_products)،',
    'جاوب بجملة أو جملتين (اسم المنتج المتوفر من get_available_products، وسعره بس إذا سأل عن السعر)،',
  ],
  ['← «إي عدنا [المنتج] بـ [سعره] دينار».', '← «إي عدنا [المنتج]» (والسعر بس إذا سأل عنه).'],
  ['، عدنا بس [اسم المنتج الي عدنا] بـ [سعره] دينار.»', '، عدنا بس [اسم المنتج الي عدنا].»'],
  [
    '1. استفسار: اعرض المتوفر باختصار، بدون سؤال',
    '1. استفسار: اذكر المنتج باسمه بس والتفصيلة الي سأل عنها، بدون سؤال',
  ],
]

/** القاعدة العامة تنزرع تحت هذا السطر. */
export const RULE_ANCHOR = '- سؤال عن المنتجات («شنو عدكم؟»، «شنو المتوفر؟»): اذكر أسماء المتوفر بس، بدون سعر ولا مواصفات ولا خصم ولا توصيل، إلا إذا الزبون سأل عن السعر بنفس رسالته. سؤال عن السعر: سعر القطعة بس. وخلي الزبون يكمّل هو.'
export const SCOPE_RULE = '- قاعدة عامة من صاحب المتجر (فوق الأمثلة): بكل رد اذكر المنتج باسمه بس، بعيد عن التفاصيل. القياسات ما تذكرها أبداً إلا إذا الزبون سأل عن القياس بنفسه، والألوان والسعر بس إذا سألهن. ممنوع تعيد قائمة المنتج بألوانه وقياساته بكل رد. الاستثناء: تأكيد الطلب وملخصه (تفاصيل الي اختاره الزبون).'

/** تنبيه الاستفسار (BROWSING_HINT) بكود عقدة السياق. */
export const HINT_FIXES = [
  [
    " إذا سأل عن منتج اذكر المتوفر وسعره من get_available_products.'",
    " إذا سأل عن منتج اذكر اسم المتوفر بس (وسعره إذا سأل عن السعر) من get_available_products.'",
  ],
  ['«إي عدنا [المنتج] بـ [سعره]»؛', '«إي عدنا [المنتج]»؛'],
]

const MARK = 'n8n/reply-scope.js'
const RETURN_LINE = 'return { json: { ...$json, output: text } };'
const GUARD_ADD = (code, c) => `// ---- ${MARK} (مولّد بـ n8n/reply-scope.mjs — لا تعدّل هنا) ----
${code}
text = (() => {
  try {
    const said = (() => { try { return String($(${JSON.stringify(c.hints)}).first().json.combinedMessage || ''); } catch (e) { return ''; } })();
    const orderContext = ${c.noOrderContext ? 'null' : `(() => { try { return $(${JSON.stringify(c.context)}).first().json.orderContext || null; } catch (e) { return null; } })()`};
    return dropUnaskedSizes(text, { said, ordering: isOrderingTurn(orderContext, said) });
  } catch (e) { return text; }
})();
// ---- نهاية ${MARK} ----

`
const BLOCK_RE = /\/\/ ---- n8n\/reply-scope\.js \(مولّد[\s\S]*?\/\/ ---- نهاية n8n\/reply-scope\.js ----\r?\n\r?\n/
const GUARD_NAMES = ['ASKS_SIZES', 'scopeNorm', 'asksAboutSizes', 'SIZE_TOKEN', 'SIZE_SEP', 'SIZE_LABEL', 'SIZE_LIST', 'SIZE_LEFTOVER',
  'scopeHidden', 'dropUnaskedSizes', 'BUY_WORDS', 'isOrderingTurn']

export const guardCode = () => MODULE.replace(/^\/\*\*[\s\S]*?\*\/\r?\n\r?\n/, '').replace(/^export /gm, '').trimEnd()

/** تبديل نص موجود مرة وحدة؛ إذا الجديد موجود من قبل ما يسوي شي. @returns {[string, boolean]} الكود، وهل تبدّل */
const swap = (code, from, to, what) => {
  if (code.includes(to)) return [code, false]
  const n = code.split(from).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع «${from.slice(0, 50)}…» مرة وحدة، لگيت ${n}`)
  return [code.replace(from, () => to), true]
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // ١. البرومت
  const opts = (by(c.agent).parameters.options ??= {})
  let sm = String(opts.systemMessage ?? '')
  let fixed = 0
  for (const [from, to] of PROMPT_FIXES) {
    let did
    ;[sm, did] = swap(sm, from, to, `${c.agent}: البرومت`)
    if (did) fixed++
  }
  if (!sm.includes(SCOPE_RULE)) {
    ;[sm] = swap(sm, RULE_ANCHOR, RULE_ANCHOR + '\n' + SCOPE_RULE, `${c.agent}: سطر «سؤال عن المنتجات»`)
    changes.push(`${c.agent}: القاعدة العامة «المنتج باسمه بس، والتفاصيل إذا سألها»`)
  }
  if (fixed) changes.push(`${c.agent}: ${fixed} سطر بالبرومت ما يأمر بعد بعرض القياسات والسعر ويا كل جواب`)
  opts.systemMessage = sm

  // ٢. تنبيه الاستفسار
  const ctx = by(c.context)
  let cc = String(ctx.parameters.jsCode ?? '')
  let hinted = 0
  for (const [from, to] of HINT_FIXES) {
    let did
    ;[cc, did] = swap(cc, from, to, `${c.context}: تنبيه الاستفسار`)
    if (did) hinted++
  }
  if (hinted) {
    ctx.parameters.jsCode = cc
    changes.push(`${c.context}: تنبيه الاستفسار بلا سعر إذا ما سأل عنه`)
  }

  // ٣. آخر حارس
  const guard = by(c.guard)
  const code = String(guard.parameters.jsCode ?? '')
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  const block = GUARD_ADD(guardCode(), c).replace(/\r?\n/g, eol)
  if (!code.includes(MARK)) {
    for (const name of GUARD_NAMES) {
      if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.guard}: الاسم ${name} مستعمل من قبل`)
    }
    const n = code.split(RETURN_LINE).length - 1
    if (n !== 1) throw new Error(`${c.guard}: متوقع سطر الإرجاع مرة وحدة، لگيت ${n}`)
    guard.parameters.jsCode = code.replace(RETURN_LINE, () => block + RETURN_LINE)
    changes.push(`${c.guard}: قوائم القياسات تنشال إذا الزبون ما سأل عن القياس`)
  } else {
    if (!BLOCK_RE.test(code)) throw new Error(`${c.guard}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    const next = code.replace(BLOCK_RE, () => block)
    if (next !== code) {
      guard.parameters.jsCode = next
      changes.push(`${c.guard}: ${MARK} محدّث`)
    }
  }
  return changes
}

const api = async (p, init) => {
  const res = await fetch(`${API}${p}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${p} → ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

const save = (wf) =>
  api(`/workflows/${wf.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      nodeGroups: wf.nodeGroups ?? [],
      settings: wf.settings ?? {},
      ...(wf.staticData ? { staticData: wf.staticData } : {}),
    }),
  })

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const local = process.env.SRC
  const wf = local ? JSON.parse(fs.readFileSync(local, 'utf8')) : await api(`/workflows/${c.id}`)
  if (wf.id !== c.id) throw new Error(`${channel}: المسار ${wf.id} مو ${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchWorkflow(wf, c)
  if (!changes.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}:\n  - ${changes.join('\n  - ')}`)
  if (DRY) return
  if (local) {
    fs.writeFileSync(process.env.OUT ?? local.replace(/\.json$/, '.patched.json'), JSON.stringify(wf, null, 2))
    return
  }
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-reply-scope.json`)
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(before, null, 2))
  const saved = await save(wf)
  console.log(`✓ ${channel} | active: ${saved.active} | العقد: ${saved.nodes.length}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (!KEY && !process.env.SRC) {
    console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
    process.exit(1)
  }
  const channels = process.argv.slice(2)
  if (!channels.length) {
    console.error(`حدد القناة: ${Object.keys(CHANNELS).join(' ')}`)
    process.exit(1)
  }
  for (const ch of channels) await run(ch)
}
