/**
 * دقة الجواب (تجربة ماسنجر 2026-10-29، التنفيذ 2592): البوت يجاوب على كل سؤال، وبالقياسات كاملة.
 * المنطق والتفاصيل بـ n8n/answer-accuracy.js (مختبَر).
 *
 *   ١. «Order Context Hint» (واتساب وماسنجر): كتالوج الوكيل يكتب القياسات بالعربي وكاملة (sizeLabels)،
 *      وتنبيه للقياس المناسب (طول/وزن) وتنبيه للرسالة الي بيها أكثر من سؤال.
 *   ٢. «Conversation Hints» / «تلميحات المحادثة» (الثلاث): كلمات الصورة والقياس بقائمة STOP،
 *      حتى «صورة» ما تنصحح لـ «الصويرة».
 *
 * ⚠️ تعديل موضعي على كود العقد الحي، مو إعادة بناء من n8n/order-context-hint.js: الكود الحي فيه تعديلات
 *    ما رجعت للمستودع (2026-10-28)، وإعادة البناء من الملف ترجّعها.
 *    إنستغرام بعقدة «سياق الطلب» قديمة بلا كتالوج، فياخذ قائمة STOP بس.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/answer-accuracy.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/answer-accuracy.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/answer-accuracy.mjs messenger
 *
 * آمن للتكرار. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHOTO_STOP_WORDS } from './answer-accuracy.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'answer-accuracy.js'), 'utf8')

export const CHANNELS = {
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', context: 'Order Context Hint', hints: 'Conversation Hints' },
  messenger: { id: 'GP0rtSxxEHWT3kLj', context: 'Order Context Hint', hints: 'Conversation Hints' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', context: null, hints: 'تلميحات المحادثة' },
}

const MARK = 'n8n/answer-accuracy.js'
const NAMES = ['qNorm', 'SIZE_LABEL', 'sizeLabels', 'SIZE_FIT_Q', 'isSizeFitQuestion', 'SIZE_FIT_HINT', 'Q_TOPICS', 'questionTopics', 'MULTI_Q_HINT', 'PHOTO_STOP_WORDS']

const CATALOG_ANCHOR = '/** @param {ReturnType<typeof normalizeCatalog>} [catalog] */\nfunction catalogFactsHint('
const SIZE_OLD = "(p.size ? ' — القياس: ' + p.size : '')"
const SIZE_NEW = "(p.size ? ' — القياسات: ' + sizeLabels(p.size) : '')"
const HINT_ANCHOR = '  if (specQuestion) hint += SPEC_HINT;\n'
const HINT_ADD = `  // دقة الجواب (${MARK}): سؤال القياس المناسب ما ينتجاهل، ورسالة بيها أكثر من سؤال تنجاوب كلها
  if (!mismatch && items.some((p) => p.size) && isSizeFitQuestion(combinedMessage)) hint += SIZE_FIT_HINT;
  if (questionTopics(combinedMessage) >= 2) hint += MULTI_Q_HINT;
`
const STOP_ANCHOR = 'const STOP = new Set(['

/** كود الوحدة كما ينحقن: بلا export، ومعلَّم بمصدره. */
export const injected = () => `// ---- ${MARK} (مولّد بـ n8n/answer-accuracy.mjs — لا تعدّل هنا) ----\n`
  + MODULE.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '').replace(/^export /gm, '').trimEnd() + '\n// ---- نهاية ' + MARK + ' ----\n\n'

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // بعض العقد محفوظة بنهايات أسطر ويندوز (CRLF): المراسي والكود المضاف بنفس نهاية أسطر العقدة
  const eolOf = (code) => (code.includes('\r\n') ? '\r\n' : '\n')
  const withEol = (s, eol) => s.replace(/\r?\n/g, eol)

  if (c.context) {
    const node = by(c.context)
    let code = String(node.parameters.jsCode ?? '')
    if (!code.includes(MARK)) {
      const eol = eolOf(code)
      const catalogAnchor = withEol(CATALOG_ANCHOR, eol)
      const hintAnchor = withEol(HINT_ANCHOR, eol)
      for (const name of NAMES) {
        if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.context}: الاسم ${name} مستعمل من قبل`)
      }
      once(code, catalogAnchor, `${c.context}: catalogFactsHint`)
      once(code, SIZE_OLD, `${c.context}: سطر القياس`)
      once(code, hintAnchor, `${c.context}: SPEC_HINT`)
      code = code.replace(catalogAnchor, () => withEol(injected(), eol) + catalogAnchor)
        .replace(SIZE_OLD, () => SIZE_NEW)
        .replace(hintAnchor, () => hintAnchor + withEol(HINT_ADD, eol))
      node.parameters.jsCode = code
      changes.push(`${c.context}: القياسات بالعربي وكاملة، وتنبيه القياس المناسب وتنبيه الأسئلة المتعددة`)
    }
  }

  const hints = by(c.hints)
  const hcode = String(hints.parameters.jsCode ?? '')
  const missing = PHOTO_STOP_WORDS.filter((w) => !hcode.includes(`'${w}'`))
  if (missing.length) {
    once(hcode, STOP_ANCHOR, `${c.hints}: STOP`)
    const add = `${STOP_ANCHOR}${missing.map((w) => `'${w}'`).join(', ')}, // كلمات الصورة والقياس (${MARK}): «صوره» ≠ «الصويرة»${eolOf(hcode)}  `
    hints.parameters.jsCode = hcode.replace(STOP_ANCHOR, () => add)
    changes.push(`${c.hints}: ${missing.length} كلمة صورة/قياس بقائمة STOP`)
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-answer-accuracy.json`)
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
