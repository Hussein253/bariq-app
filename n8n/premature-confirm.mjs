/**
 * «تم تأكيد طلبك» قبل ما ينحفظ الطلب (ماسنجر وواتساب وإنستغرام). التفاصيل والحارس بـ n8n/premature-confirm.js.
 *
 *   آخر حارس بكل قناة («Drop Repeated Blocks» بماسنجر وواتساب، «حذف المكرر من الرد» بإنستغرام):
 *   إذا ما استدعى البوت create_order بهالدور، كلمة التأكيد تصير «هذا ملخص طلبك».
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/premature-confirm.mjs messenger whatsapp instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/premature-confirm.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/premature-confirm.mjs messenger
 *
 * آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups. ما ينشر إلا بعد موافقة صاحب المتجر.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'premature-confirm.js'), 'utf8')

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', guard: 'Drop Repeated Blocks', create: 'create_order' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', guard: 'Drop Repeated Blocks', create: 'create_order' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', guard: 'حذف المكرر من الرد', create: 'create_order' },
}

const MARK = 'n8n/premature-confirm.js'
const RETURN_LINE = 'return { json: { ...$json, output: text } };'
const BLOCK_RE = /\/\/ ---- n8n\/premature-confirm\.js \(مولّد[\s\S]*?\/\/ ---- نهاية n8n\/premature-confirm\.js ----\r?\n\r?\n/
const NAMES = ['FALSE_CONFIRM', 'prematureConfirmFix']

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}

export const guardBlock = (c, eol = '\n') => {
  const body = MODULE.replace(/^\/\*\*[\s\S]*?\*\/\r?\n\r?\n/, '').replace(/^export /gm, '').trimEnd()
  const block = `// ---- ${MARK} (مولّد بـ n8n/premature-confirm.mjs — لا تعدّل هنا) ----
${body}
text = (() => {
  try {
    const orderCreated = (() => { try { return $(${JSON.stringify(c.create)}).isExecuted === true; } catch (e) { return false; } })();
    return prematureConfirmFix(text, orderCreated);
  } catch (e) { return text; }
})();
// ---- نهاية ${MARK} ----

`
  return block.replace(/\r?\n/g, eol)
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const guard = wf.nodes.find((x) => x.name === c.guard)
  if (!guard) throw new Error(`ماكو عقدة باسم ${c.guard}`)
  const code = String(guard.parameters.jsCode ?? '')
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  if (code.includes(MARK)) {
    if (!BLOCK_RE.test(code)) throw new Error(`${c.guard}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    const next = code.replace(BLOCK_RE, () => guardBlock(c, eol))
    if (next === code) return []
    guard.parameters.jsCode = next
    return [`${c.guard}: ${MARK} محدّث`]
  }
  for (const name of NAMES) {
    if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.guard}: الاسم ${name} مستعمل من قبل`)
  }
  once(code, RETURN_LINE, `${c.guard}: سطر الإرجاع`)
  guard.parameters.jsCode = code.replace(RETURN_LINE, () => guardBlock(c, eol) + RETURN_LINE)
  return [`${c.guard}: «تم تأكيد طلبك» قبل الحفظ تصير «هذا ملخص طلبك»`]
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-premature-confirm.json`)
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
