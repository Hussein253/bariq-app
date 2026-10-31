/**
 * الموافقة على آخر ملخص (ماسنجر 2026-10-31، التنفيذ 3134). التفاصيل والدوال بـ n8n/order-summary.js.
 *
 *   ١. «Load Recent Bot Replies»: عمود pending_summary — آخر رد بـ 6 ساعات فيه المجموع الكلي، وما بعده رد يثبّت الطلب.
 *      (الاستعلام يرجع آخر 4 ردود بس، والملخص ممكن يطلع منها لما البوت يسأل أسئلة بعده.)
 *   ٢. «Order Context Hint»: ردود البوت ينضاف لها الملخص المعلّق بالآخر، وconfirmedOnce يقيس الموافقة على آخر ملخص
 *      مو على آخر رد بس. فـ«تمام» بعد «ونعتمد اللون الأحمر، تمام؟» تنحسب تأكيد للطلب إذا الملخص قبلها.
 *   ٣. تنبيه CONFIRM_ONCE_HINT: «موافقة على آخر ملخص عرضته» بدل «على ردك السابق».
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/order-summary.mjs messenger whatsapp
 *   DRY=1 N8N_KEY=<api key> node n8n/order-summary.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/order-summary.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/ack-guard.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'order-summary.js'), 'utf8')

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', context: 'Order Context Hint', replies: 'Load Recent Bot Replies' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', context: 'Order Context Hint', replies: 'Load Recent Bot Replies' },
}

const MARK = 'n8n/order-summary.js'
const PLACED_LINE = 'const ALREADY_PLACED = /رقم الطلب|تم تثبيت|تثبت بنجاح|طلبك تثبت|طلبك انحجز|المندوب يتصل/;'
const LAST_OLD = "  const last = norm(Array.isArray(botReplies) ? botReplies[0] : '');"
const LAST_NEW = '  const last = norm(pendingSummary(botReplies, { norm, showedTotal: SHOWED_TOTAL, placed: ALREADY_PLACED }));'
const BUILDER_OLD = "    return Array.isArray(r) ? r.map((x) => String(x || '')) : [];"
const BUILDER_NEW = '    return withPendingSummary(r, $(NODES.bot).first().json.pending_summary);'
const HINT_OLD = 'موافقة صريحة على ردك السابق (البنود والمبلغ الكلي)'
const HINT_NEW = 'موافقة صريحة على آخر ملخص عرضته (البنود والمبلغ الكلي)، حتى لو سألت بعده سؤال ثاني'
const SQL_ANCHOR = 'max(created_at) AS last_reply_at'
const SQL_MARK = 'AS pending_summary'
const SQL_ADD = `max(created_at) AS last_reply_at,
       (SELECT s.message_text FROM conversation_log s
         WHERE s.phone_number = $1 AND s.direction = 'outgoing' AND s.created_at > now() - interval '6 hours'
           AND (s.message_text LIKE '%المجموع الكلي%' OR s.message_text LIKE '%كاش عند الاستلام%')
           AND NOT EXISTS (SELECT 1 FROM conversation_log p
                            WHERE p.phone_number = $1 AND p.direction = 'outgoing' AND p.created_at > s.created_at
                              AND (p.message_text LIKE '%رقم الطلب%' OR p.message_text LIKE '%تم تثبيت%' OR p.message_text LIKE '%تثبت بنجاح%'
                                   OR p.message_text LIKE '%طلبك تثبت%' OR p.message_text LIKE '%طلبك انحجز%' OR p.message_text LIKE '%المندوب يتصل%'))
         ORDER BY s.created_at DESC LIMIT 1) AS pending_summary`
const BLOCK_RE = /\/\/ ---- n8n\/order-summary\.js \(مولّد[\s\S]*?\/\/ ---- نهاية n8n\/order-summary\.js ----\r?\n/
const NAMES = ['pendingSummary', 'withPendingSummary']

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}

const moduleBlock = (eol) => (`// ---- ${MARK} (مولّد بـ n8n/order-summary.mjs — لا تعدّل هنا) ----\n`
  + MODULE.replace(/^\/\*\*[\s\S]*?\*\/\r?\n\r?\n/, '').replace(/^export /gm, '').trimEnd()
  + `\n// ---- نهاية ${MARK} ----\n`).replace(/\r?\n/g, eol)

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // ١. الاستعلام: الملخص المعلّق
  const rep = by(c.replies)
  const q = String(rep.parameters.query ?? '')
  if (!q.includes(SQL_MARK)) {
    once(q, SQL_ANCHOR, `${c.replies}: last_reply_at`)
    rep.parameters.query = q.replace(SQL_ANCHOR, () => SQL_ADD)
    changes.push(`${c.replies}: عمود pending_summary (آخر ملخص بـ 6 ساعات وما بعده تثبيت)`)
  }

  // ٢ و٣. سياق الطلب
  const ctx = by(c.context)
  let code = String(ctx.parameters.jsCode ?? '')
  const before = code
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  if (!code.includes(MARK)) {
    for (const name of NAMES) {
      if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.context}: الاسم ${name} مستعمل من قبل`)
    }
    once(code, PLACED_LINE, `${c.context}: ALREADY_PLACED`)
    code = code.replace(PLACED_LINE, () => PLACED_LINE + eol + moduleBlock(eol))
  } else {
    if (!BLOCK_RE.test(code)) throw new Error(`${c.context}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    code = code.replace(BLOCK_RE, () => moduleBlock(eol))
  }
  if (!code.includes(LAST_NEW)) {
    once(code, LAST_OLD, `${c.context}: confirmedOnce`)
    code = code.replace(LAST_OLD, () => LAST_NEW)
  }
  if (!code.includes(BUILDER_NEW)) {
    once(code, BUILDER_OLD, `${c.context}: botReplies`)
    code = code.replace(BUILDER_OLD, () => BUILDER_NEW)
  }
  if (!code.includes(HINT_NEW)) {
    once(code, HINT_OLD, `${c.context}: CONFIRM_ONCE_HINT`)
    code = code.replace(HINT_OLD, () => HINT_NEW)
  }
  if (code !== before) {
    ctx.parameters.jsCode = code
    changes.push(`${c.context}: الموافقة تنقاس على آخر ملخص، مو على آخر رد بس`)
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-order-summary.json`)
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
