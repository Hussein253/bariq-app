/**
 * رسالة الزبون تطلع باللوحة أول ما توصل، مو بعد رد البوت (ماسنجر 2026-10-25، ملاحظة صاحب المتجر):
 *
 *   اللوحة تقرا messages بالـ Realtime، ومحفّز sync_live_n8n_messages يعكسها من conversation_log. رسالة الزبون كانت تنكتب بـ conversation_log
 *   بعقدة «Log Incoming Message» بعد الـ debounce والقفل وجلب البفر (التنفيذ 2126: وصلت 14:36:10 وانكتبت 14:36:24، والرد 14:36:31)،
 *   وبوضع الموظف بعقدة «Log Customer Msg (Human Mode)» بعد الـ debounce. هسة كل رسالة تنكتب لحالها بعقدة «Log Incoming On Arrival»
 *   بعد «Upsert Customer Session» مباشرة (فرع فوق «Keep Phone After Upsert» حتى يتنفّذ قبل الانتظار)، و intent «human_takeover» إذا الجلسة
 *   بوضع موظف. العقدتين القديمتين تنفصلن وتتعطلن حتى ما تنكتب الرسالة مرتين، و«Tag Customer Msg (Error/Blocked)» يعلّمن رسائل الدفعة
 *   بوقتها (created_at ≥ أقدم صف انجلب من البفر) بدل رقم صف «Log Incoming Message» الي ما بقى.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/log-on-arrival.mjs messenger
 *   DRY=1 N8N_KEY=<api key> node n8n/log-on-arrival.mjs messenger     # يتحقق من المواضع وما يرسل شي
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

// واتساب يكتب رسالة الزبون بمكان ثاني (Combine ما بيه «Log Incoming Message»)، فماسنجر بس
const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', platform: 'messenger' },
}
const NODES = {
  upsert: 'Upsert Customer Session',
  mainNext: 'Keep Phone After Upsert',
  buffer: 'Insert into Buffer',
  messageData: 'Message Data',
  fetch: 'Get Buffered Messages',
  oldLog: 'Log Incoming Message',
  oldLogGate: 'Buffer Has Messages?', // من buffer-race.mjs؛ بدونه «Combine Buffered Messages»
  combine: 'Combine Buffered Messages',
  humanGate: 'Human Takeover?',
  humanLog: 'Log Customer Msg (Human Mode)',
  humanRemove: 'Remove From Buffer (Human Mode)',
  tags: ['Tag Customer Msg (Error)', 'Tag Customer Msg (Blocked)'],
}
const ARRIVAL = 'Log Incoming On Arrival'

const FETCHED_MIN = "={{ $('Get Buffered Messages').all().map((i) => (i.json || {}).created_at).filter(Boolean).sort()[0] || '9999-01-01T00:00:00+00:00' }}"
const fields = (platform) => [
  { fieldId: 'phone_number', fieldValue: `={{ $('${NODES.buffer}').first().json.phone_number }}` },
  { fieldId: 'message_text', fieldValue: `={{ $('${NODES.buffer}').first().json.message_text }}` },
  { fieldId: 'sender', fieldValue: 'customer' },
  { fieldId: 'direction', fieldValue: 'incoming' },
  // صف الجلسة من الـ Upsert (نفس شرط بوابة «Typing Allowed?»)
  { fieldId: 'intent', fieldValue: "={{ ($json.human_takeover === true || $json.human_takeover === 'true') ? 'human_takeover' : '' }}" },
  { fieldId: 'platform', fieldValue: platform },
  { fieldId: 'account_external_id', fieldValue: `={{ $('${NODES.messageData}').first().json.phoneNumberId }}` },
  { fieldId: 'media', fieldValue: `={{ Array.isArray($('${NODES.buffer}').first().json.media) ? $('${NODES.buffer}').first().json.media : [] }}` },
]

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
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.some((x) => x.name === name)
  const links = (from, i = 0) => wf.connections[from]?.main?.[i] ?? []
  const changes = []

  // ١. «Log Incoming On Arrival» بعد الـ Upsert، فوق المسار الرئيسي بالواجهة (n8n v1 ينفّذ الفرع الأعلى أول)
  by(NODES.buffer); by(NODES.messageData); by(NODES.fetch)
  if (!has(ARRIVAL)) {
    const tpl = by(NODES.oldLog)
    const [x, y] = by(NODES.mainNext).position
    wf.nodes.push({
      id: crypto.randomUUID(),
      name: ARRIVAL,
      type: tpl.type,
      typeVersion: tpl.typeVersion,
      position: [x, y - 560],
      credentials: JSON.parse(JSON.stringify(tpl.credentials)),
      onError: 'continueRegularOutput', // الكتابة باللوحة ما توقف الرد أبداً
      parameters: { tableId: 'conversation_log', fieldsUi: { fieldValues: fields(c.platform) } },
    })
    changes.push(`${ARRIVAL}: رسالة الزبون تنكتب أول ما توصل`)
  }
  const up = (wf.connections[NODES.upsert] ??= { main: [[]] }).main
  if (!(up[0] ?? []).some((l) => l.node === ARRIVAL)) {
    ;(up[0] ??= []).unshift({ node: ARRIVAL, type: 'main', index: 0 })
    changes.push(`وصلة ${NODES.upsert} ← ${ARRIVAL}`)
  }

  // ٢. الكتابة القديمة بعد البفر تنفصل وتتعطل (وإلا الرسالة تنكتب مرتين)
  const gate = has(NODES.oldLogGate) ? NODES.oldLogGate : NODES.combine
  const gateLinks = links(gate, 0)
  if (gateLinks.some((l) => l.node === NODES.oldLog)) {
    wf.connections[gate].main[0] = gateLinks.filter((l) => l.node !== NODES.oldLog)
    changes.push(`شيل ${NODES.oldLog} من ${gate}`)
  }
  const oldLog = by(NODES.oldLog)
  if (!oldLog.disabled) { oldLog.disabled = true; changes.push(`تعطيل ${NODES.oldLog}`) }

  // ٣. وضع الموظف: «Human Takeover?» ← «Remove From Buffer (Human Mode)» مباشرة (سلسلة رد الانتظار تبقى وراها)
  by(NODES.humanRemove)
  const hg = wf.connections[NODES.humanGate]?.main
  if (!hg) throw new Error(`${NODES.humanGate} بلا وصلات`)
  if ((hg[0] ?? []).some((l) => l.node === NODES.humanLog)) {
    hg[0] = [...hg[0].filter((l) => l.node !== NODES.humanLog), { node: NODES.humanRemove, type: 'main', index: 0 }]
    delete wf.connections[NODES.humanLog]
    changes.push(`${NODES.humanGate} ← ${NODES.humanRemove} مباشرة`)
  }
  const humanLog = by(NODES.humanLog)
  if (!humanLog.disabled) { humanLog.disabled = true; changes.push(`تعطيل ${NODES.humanLog}`) }

  // ٤. علامات الخطأ والحارس: رسائل الدفعة بوقتها بدل رقم صف «Log Incoming Message»
  for (const name of NODES.tags) {
    const conds = by(name).parameters.filters.conditions
    const i = conds.findIndex((x) => x.keyName === 'id')
    if (i < 0) continue
    conds.splice(i, 1, { keyName: 'created_at', condition: 'gte', keyValue: FETCHED_MIN })
    changes.push(`${name}: يعلّم رسائل الدفعة بوقتها`)
  }
  return changes
}

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const wf = await api(`/workflows/${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchWorkflow(wf, c)
  if (!changes.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}:\n  - ${changes.join('\n  - ')}`)
  if (DRY) return
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-log-on-arrival.json`)
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
