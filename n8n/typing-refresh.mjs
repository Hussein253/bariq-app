/**
 * علامة «يكتب» بماسنجر ما تنطفي والزبون ينتظر الرد (ملاحظة صاحب المتجر 2026-10-26):
 *
 *   «Typing On» ينرسل بأول 6 ثواني بس (عند الوصول وبعد الـ Upsert)، وماسنجر يطفّي العلامة بعد ~20 ثانية.
 *   التنفيذ 2167: آخر علامة 8.0 ثانية والرد 51.8 ثانية («Complaint Check» خلصت مهلته 15 ثانية مرتين)،
 *   فالزبون بقى 24 ثانية بلا علامة. ونفس الشي بأبطأ ردود الوكيل (2139: الوكيل 15 ثانية، 5 ثواني بلا علامة).
 *   هسة العلامة تنعاد مرتين قبل الرد: قبل «Complaint Check» (بداية تجهيز الرد) وقبل «Iraqi Store AI Agent».
 *   كل بوابة فرع جانبي فوق المسار الرئيسي (n8n v1 ينفّذ الفرع الأعلى أول) يرجع لـ «Typing Page?»، فنفس
 *   عقد «Typing On» لكل صفحة وبنفس توكنها. البوابة بنفس شرط «Early Typing Allowed?» (لا موظف، والبوت مفعّل)
 *   على الجلسة المقروءة بعد الـ debounce، و onError يكمل: العلامة ما توقف الرد أبداً.
 *   الكلفة: نداء Graph لكل إعادة (~1.5 ثانية بالسجلات) قبل الرد.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/typing-refresh.mjs messenger
 *   DRY=1 N8N_KEY=<api key> node n8n/typing-refresh.mjs messenger     # يتحقق من المواضع وما يرسل شي
 *
 * آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

// واتساب ما بيه «Typing Page?» (علامة الكتابة بماسنجر بس)
const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj' },
}
const NODES = {
  page: 'Typing Page?',
  session: 'Re-read Customer Session',
}
// البوابة ← قبل أي عقدة تنعاد العلامة (الأب يتفرّع للبوابة وللعقدة)
export const REFRESHES = [
  { gate: 'Refresh Typing (Complaint)?', parent: 'Build Complaint Check', before: 'Complaint Check' },
  { gate: 'Refresh Typing (Agent)?', parent: 'Order Context Hint', before: 'Iraqi Store AI Agent' },
]

// نفس شرط «Early Typing Allowed?» على الجلسة بعد الـ debounce؛ مسار بلا قراءة جلسة يكتب عادي
const ALLOWED = `={{ (() => { if (!$('${NODES.session}').isExecuted) return true; const s = $('${NODES.session}').first().json; return !(s.human_takeover === true || s.human_takeover === 'true') && s.bot_active !== false && s.bot_active !== 'false'; })() }}`

const gateNode = (name, position) => ({
  id: crypto.randomUUID(),
  name,
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position,
  onError: 'continueRegularOutput', // العلامة ما توقف الرد أبداً
  parameters: {
    conditions: {
      combinator: 'and',
      conditions: [{ id: crypto.randomUUID(), leftValue: ALLOWED, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    },
    looseTypeValidation: true,
    options: {},
  },
})

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

/** @returns {string[]} التعديلات (فاضية = المسار مرتب من قبل) */
export const patchWorkflow = (wf) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.some((x) => x.name === name)
  const changes = []

  by(NODES.page); by(NODES.session)
  for (const r of REFRESHES) {
    by(r.parent)
    // البوابة فوق العقدة الي قبلها، حتى تتنفّذ أول بين فروع الأب
    if (!has(r.gate)) {
      const [x, y] = by(r.before).position
      wf.nodes.push(gateNode(r.gate, [x, y - 224]))
      changes.push(`${r.gate}: علامة «يكتب» تنعاد قبل ${r.before}`)
    }
    const out = (wf.connections[r.parent] ??= { main: [[]] }).main
    if (!(out[0] ?? []).some((l) => l.node === r.gate)) {
      ;(out[0] ??= []).unshift({ node: r.gate, type: 'main', index: 0 })
      changes.push(`وصلة ${r.parent} ← ${r.gate}`)
    }
    const gateOut = (wf.connections[r.gate] ??= { main: [[]] }).main
    if (!(gateOut[0] ?? []).some((l) => l.node === NODES.page)) {
      ;(gateOut[0] ??= []).push({ node: NODES.page, type: 'main', index: 0 })
      changes.push(`وصلة ${r.gate} ← ${NODES.page}`)
    }
  }
  return changes
}

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const wf = await api(`/workflows/${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchWorkflow(wf)
  if (!changes.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}:\n  - ${changes.join('\n  - ')}`)
  if (DRY) return
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-typing-refresh.json`)
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(before, null, 2))
  const saved = await save(wf)
  console.log(`✓ ${channel} | active: ${saved.active} | العقد: ${saved.nodes.length}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (!KEY) {
    console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
    process.exit(1)
  }
  const channels = process.argv.slice(2)
  if (!channels.length) {
    console.error('حدد القناة: messenger')
    process.exit(1)
  }
  for (const ch of channels) await run(ch)
}
