/**
 * رد انتظار واحد للزبون بعد التحويل لموظف — من تتبع ماسنجر 2026-10-24 (الزبون 28944586871867160، conversation_log 1371 و1372):
 *
 *   بعد «تدلل، المحادثة تحوّلت لموظف الدعم» (12:48:19) الزبون كتب «شنو عدكم الوان غيرها» (12:48:48) و«موجودين» (12:52:48)،
 *   وفرع «Human Takeover?» سجّل الرسالتين وشالهن من البفر بس، فما وصل الزبون شي لحد أول رد موظف 13:00:21 (~11.5 دقيقة).
 *   (تحية الموظف 12:48:47 انحفظت باللوحة وما وصلت: إرسال اللوحة لماسنجر كان معطّل وقتها، وتصلّح بـ dashboard-reply-messenger.mjs.)
 *
 *   هسة بعد «Remove From Buffer (Human Mode)» تستنى الرسالة دقيقتين، وإذا الموظف بعده ما كتب شي من بداية التحويل وما انرسل رد
 *   انتظار بهالتحويل، يوصل الزبون مرة وحدة «وصلت رسالتك، موظف من الفريق راح يرد عليك بأقرب وقت» وينسجل باللوحة كرد بوت.
 *   الحجز ذرّي بالقاعدة (n8n/human-ack.js + الترحيل 030)، فرسائل ورا بعض تطلع رد واحد. ما في رجوع تلقائي للبوت.
 *
 * يحتاج الترحيل supabase/migrations/030_human_takeover_ack.sql قبل التشغيل (العمودان human_takeover_at و human_ack_at).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/human-ack.mjs messenger
 *   DRY=1 N8N_KEY=<api key> node n8n/human-ack.mjs messenger                 # يتحقق من المواضع وما يرسل شي
 *   DRY=1 DUMP=<مجلد> N8N_KEY=<api key> node n8n/human-ack.mjs messenger     # + يكتب الـ SQL والعقد الجديدة للفحص
 *
 * آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACK_NODES, ANCHORS, HUMAN_ACK_CLAIM_SQL, patchHumanAck } from './human-ack.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

// واتساب وإنستغرام فرعهم بأسماء وتوكنات ثانية؛ ماسنجر بس هسة
const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj' },
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

const backup = (wf, label) => {
  const file = path.join(HERE, 'backups', `${label}-${wf.id}-before-human-ack.json`)
  if (!DRY && !fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(wf, null, 2))
}

const dump = (wf, channel) => {
  const dir = process.env.DUMP
  if (!dir) return
  fs.mkdirSync(dir, { recursive: true })
  const names = new Set([ANCHORS.remove, ...Object.values(ACK_NODES).flat()])
  const nodes = wf.nodes.filter((n) => names.has(n.name))
  const connections = Object.fromEntries([...names].map((n) => [n, wf.connections[n] ?? null]))
  fs.writeFileSync(path.join(dir, `${channel}-human-ack-claim.sql`), HUMAN_ACK_CLAIM_SQL)
  fs.writeFileSync(path.join(dir, `${channel}-human-ack-nodes.json`), JSON.stringify({ nodes, connections }, null, 2))
}

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const wf = await api(`/workflows/${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchHumanAck(wf)
  if (!changes.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}:\n  - ${changes.join('\n  - ')}`)
  dump(wf, channel)
  if (DRY) return
  backup(before, channel)
  const saved = await save(wf)
  const sv = (n) => saved.nodes.find((x) => x.name === n)
  console.log(`✓ ${channel} | active: ${saved.active} | العقد: ${saved.nodes.length}`)
  console.log(`   ${ACK_NODES.wait} موجودة: ${Boolean(sv(ACK_NODES.wait))} | ${ANCHORS.remove} ← ${saved.connections[ANCHORS.remove]?.main?.[0]?.[0]?.node}`)
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
