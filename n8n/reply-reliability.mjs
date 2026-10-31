/**
 * موثوقية الرد (تجربة ماسنجر 2026-10-29، 4 زبائن بنفس الوقت). التفاصيل والأرقام بـ n8n/reply-reliability.js.
 *
 *   ١. النموذج الاحتياطي: Groq (حد 8 آلاف توكن بالدقيقة، والطلب ~21 ألف) ما اشتغل ولا مرة، فكل انقطاع اتصال
 *      بـ OpenAI صار «دقيقة وأرجعلك» بدل الجواب. ينشال، وبمكانه نسخة ثانية من نموذج OpenAI (نفس الحساب):
 *      فشل الاتصال الأول يتعوض باتصال جديد فوراً. والنموذجين بمهلة طلب صريحة 45 ثانية ومحاولتين.
 *   ٢. آخر حارس قبل «Parse Agent Output»: ادعاء «حجزت لك» بدون create_order يتبدل بـ «سجّلت اختيارك».
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/reply-reliability.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/reply-reliability.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/reply-reliability.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/answer-accuracy.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'reply-reliability.js'), 'utf8')

export const CHANNELS = {
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent', model: 'OpenAI Chat Model', fallback: 'OpenAI Fallback Model', guard: 'Drop Repeated Blocks', hints: 'Conversation Hints' },
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent', model: 'OpenAI Chat Model', fallback: 'OpenAI Fallback Model', guard: 'Drop Repeated Blocks', hints: 'Conversation Hints' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', agent: 'وكيل المبيعات (علاء)', model: 'نموذج OpenAI', fallback: 'نموذج OpenAI الاحتياطي', guard: 'حذف المكرر من الرد', hints: 'تلميحات المحادثة' },
}

const MARK = 'n8n/reply-reliability.js'
const MODEL_OPTIONS = { timeout: 45000, maxRetries: 2 }
const RETURN_LINE = 'return { json: { ...$json, output: text } };'
const GUARD_ADD = (code, c) => `// ---- ${MARK} (مولّد بـ n8n/reply-reliability.mjs — لا تعدّل هنا) ----
${code}
text = (() => {
  try {
    const orderCreated = (() => { try { return $('create_order').isExecuted === true; } catch (e) { return false; } })();
    const said = (() => { try { return String($(${JSON.stringify(c.hints)}).first().json.combinedMessage || ''); } catch (e) { return ''; } })();
    return courtesyReply(dropFalseBooking(text, { orderCreated }), said);
  } catch (e) { return text; }
})();
// ---- نهاية ${MARK} ----

`
const BLOCK_RE = /\/\/ ---- n8n\/reply-reliability\.js \(مولّد[\s\S]*?\/\/ ---- نهاية n8n\/reply-reliability\.js ----\r?\n\r?\n/

export const guardCode = () => MODULE.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '').replace(/^export /gm, '').trimEnd()

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.some((x) => x.name === name)
  const changes = []

  // ١. النموذجين: مهلة صريحة، ونسخة OpenAI ثانية بمكان Groq
  const model = by(c.model)
  by(c.agent)
  const opts = (model.parameters.options ??= {})
  if (opts.timeout !== MODEL_OPTIONS.timeout || opts.maxRetries !== MODEL_OPTIONS.maxRetries) {
    Object.assign(opts, MODEL_OPTIONS)
    changes.push(`${c.model}: مهلة 45 ثانية ومحاولتين`)
  }
  const groq = wf.nodes.filter((n) => n.type === '@n8n/n8n-nodes-langchain.lmChatGroq'
    && (wf.connections[n.name]?.ai_languageModel ?? []).some((o) => (o ?? []).some((l) => l.node === c.agent)))
  if (!has(c.fallback)) {
    const at = groq[0]?.position ?? [model.position[0] + 160, model.position[1]]
    const fb = JSON.parse(JSON.stringify(model))
    wf.nodes.push({ ...fb, id: crypto.randomUUID(), name: c.fallback, position: at, parameters: { ...fb.parameters, options: { ...MODEL_OPTIONS } } })
    changes.push(`${c.fallback}: نموذج احتياطي من OpenAI`)
  }
  for (const g of groq) {
    wf.nodes = wf.nodes.filter((n) => n !== g)
    delete wf.connections[g.name]
    changes.push(`${g.name}: انشال (حد Groq المجاني 8 آلاف توكن والطلب ~21 ألف)`)
  }
  const fbOut = (wf.connections[c.fallback] ??= {}).ai_languageModel ??= [[]]
  if (!fbOut[0].some((l) => l.node === c.agent && l.index === 1)) {
    fbOut[0].push({ node: c.agent, type: 'ai_languageModel', index: 1 })
    changes.push(`وصلة ${c.fallback} ← ${c.agent} (احتياطي)`)
  }
  const agent = by(c.agent)
  if (agent.parameters.needsFallback !== true) {
    agent.parameters.needsFallback = true
    changes.push(`${c.agent}: النموذج الاحتياطي مفعّل`)
  }

  // ٢. آخر حارس: ماكو «حجزت» بدون حجز
  const guard = by(c.guard)
  const code = String(guard.parameters.jsCode ?? '')
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  const block = GUARD_ADD(guardCode(), c).replace(/\r?\n/g, eol)
  if (!code.includes(MARK)) {
    for (const name of ['BOOKED_CLAIM', 'isHidden', 'dropFalseBooking', 'COURTESY_ONLY', 'COURTESY_REPLY', 'isCourtesyMessage', 'courtesyReply']) {
      if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.guard}: الاسم ${name} مستعمل من قبل`)
    }
    const n = code.split(RETURN_LINE).length - 1
    if (n !== 1) throw new Error(`${c.guard}: متوقع سطر الإرجاع مرة وحدة، لگيت ${n}`)
    guard.parameters.jsCode = code.replace(RETURN_LINE, () => block + RETURN_LINE)
    changes.push(`${c.guard}: «حجزت لك» بدون create_order ← «سجّلت اختيارك»، والمجاملة جملة وحدة`)
  } else {
    // مزيود من قبل: الكتلة تتحدث لآخر نسخة من المصدر
    if (!BLOCK_RE.test(code)) throw new Error(`${c.guard}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    const next = code.replace(BLOCK_RE, () => block)
    if (next !== code) {
      guard.parameters.jsCode = next
      changes.push(`${c.guard}: ${MARK} محدّث (المجاملة بالإنكليزي جملة وحدة)`)
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-reply-reliability.json`)
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
