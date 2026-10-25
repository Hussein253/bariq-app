/**
 * رسالة الزبون ما تضيع بين تنفيذين، والبوت ما يرد على «(no message)» — من تتبع ماسنجر 2026-10-24:
 *
 *   ١. «Clear Message Buffer» كان يمسح كل بفر الزبون بآخر التنفيذ، حتى الرسائل الي وصلت بعد ما التنفيذ جلب البفر. الزبون كتب «؟؟»
 *      (التنفيذ 1756) والتنفيذ 1747 بعده يشتغل، فانمسحت «؟؟» قبل ما يقراها أحد، و1756 لگه البفر فاضي. هسة المسح لحد آخر رسالة
 *      انجلبت (created_at ≤ أحدث صف بـ «Get Buffered Messages»)، ونفس الشي بفرعي الخطأ والحارس.
 *
 *   ٢. البفر الفاضي كان يمشي للوكيل بنص «(no message)»: ينلوگ رسالة زبون باللوحة (الي شافها صاحب المتجر بالصور)، والوكيل يألف رد
 *      يكمّل حجز («لون أسود، وحدة… وياريت تدزلي اسمك وعنوانك»، التنفيذات 1667 و1670 و1756). هسة بوابة «Buffer Has Messages?» بعد
 *      «Combine Buffered Messages»: البفر الفاضي يفك القفل بس، بلا لوگ وبلا رد.
 *
 *   ٣. الرسالة الي توصل والتنفيذ الثاني بنص شغله كانت تنتهي عند «Human Takeover?» (الفرع الثاني بلا وصلة) وتبقى بالبفر لحد ما يكتب
 *      الزبون رسالة ثانية (التنفيذ 1687 نجى لأن الزبون كتب «بس» بعدها). بعد الإصلاح ١ الرسالة ما تنمسح، فهسة تستنى دور:
 *      «Busy Retry?» ← «Busy Wait» (4 ثواني، نفس الـ debounce) ← «Re-read Customer Session»، لحد 30 مرة (~دقيقتين، عمر القفل العالق).
 *      إذا وصلت رسالة أحدث من الزبون، التوكن يتغيّر والتنفيذ الأحدث هو الي يرد.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/buffer-race.mjs messenger
 *   DRY=1 N8N_KEY=<api key> node n8n/buffer-race.mjs messenger whatsapp   # يتحقق من المواضع وما يرسل شي
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

// نفس أسماء العقد بماسنجر وواتساب
const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm' },
}
const NODES = {
  fetch: 'Get Buffered Messages',
  combine: 'Combine Buffered Messages',
  clears: ['Clear Message Buffer', 'Clear Buffer (Error)', 'Clear Buffer (Blocked)'],
  releaseTemplate: 'Release Lock (Blocked)',
  human: 'Human Takeover?',
  reread: 'Re-read Customer Session',
  debounce: 'Debounce Wait 8s',
}
const EMPTY_GATE = 'Buffer Has Messages?'
const EMPTY_RELEASE = 'Release Lock (Empty Buffer)'
const BUSY_GATE = 'Busy Retry?'
const BUSY_WAIT = 'Busy Wait'
const BUSY_MAX_RUNS = 30

// أحدث created_at بين الصفوف الي انجلبت؛ بفر فاضي ← تاريخ قديم ما يمسح شي
const FETCHED_MAX = "={{ $('Get Buffered Messages').all().map((i) => (i.json || {}).created_at).filter(Boolean).sort().pop() || '1970-01-01T00:00:00+00:00' }}"
const HAS_MESSAGES = "={{ String($json.combinedMessage || '').trim() !== '(no message)' || (Array.isArray($json.combinedMedia) && $json.combinedMedia.length > 0) }}"
// تنفيذ ثاني ماسك القفل والرسالة هذي هي الأحدث: تستنى دورها (مو وضع موظف، والتوكن مالها)
const BUSY = '={{ $json.isProcessing === true && $json.humanTakeover !== true && (!$json.sessionDebounceToken || $json.sessionDebounceToken === $json.debounceToken) && $runIndex < ' + BUSY_MAX_RUNS + ' }}'

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
  const file = path.join(HERE, 'backups', `${label}-${wf.id}-before-buffer-race.json`)
  if (!DRY && !fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(wf, null, 2))
}

const ifNode = (template, name, position, expr, id) => ({
  id: crypto.randomUUID(),
  name,
  type: template.type,
  typeVersion: template.typeVersion,
  position,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{ id, leftValue: expr, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
      combinator: 'and',
    },
    looseTypeValidation: true,
    options: {},
  },
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

  // ١. المسح لحد آخر رسالة انجلبت
  by(NODES.fetch)
  for (const name of NODES.clears) {
    if (!has(name)) continue
    const conds = by(name).parameters.filters.conditions
    if (conds.some((c) => c.keyName === 'created_at')) continue
    conds.push({ keyName: 'created_at', condition: 'lte', keyValue: FETCHED_MAX })
    changes.push(`${name}: يمسح لحد آخر رسالة انجلبت`)
  }

  // ٢. بوابة البفر الفاضي بين «Combine Buffered Messages» وتوابعها
  const combine = by(NODES.combine)
  if (!has(EMPTY_GATE)) {
    const tpl = by(NODES.human)
    const [x, y] = combine.position
    const gate = ifNode(tpl, EMPTY_GATE, [x + 160, y + 260], HAS_MESSAGES, 'buffer-has-messages')
    const release = JSON.parse(JSON.stringify(by(NODES.releaseTemplate)))
    Object.assign(release, { id: crypto.randomUUID(), name: EMPTY_RELEASE, position: [x + 420, y + 400] })
    wf.nodes.push(gate, release)
    const next = wf.connections[NODES.combine]?.main?.[0] ?? []
    if (!next.length) throw new Error(`${NODES.combine} بلا وصلات`)
    wf.connections[NODES.combine] = { main: [[{ node: EMPTY_GATE, type: 'main', index: 0 }]] }
    wf.connections[EMPTY_GATE] = { main: [next, [{ node: EMPTY_RELEASE, type: 'main', index: 0 }]] }
    changes.push(`${EMPTY_GATE}: البفر الفاضي يفك القفل بس (كان يروح لـ ${next.map((l) => l.node).join(' و')})`)
  }

  // ٣. الرسالة تستنى دورها إذا تنفيذ ثاني ماسك القفل
  if (!has(BUSY_GATE)) {
    const human = by(NODES.human)
    const waitTpl = by(NODES.debounce)
    by(NODES.reread)
    if ((wf.connections[NODES.human]?.main?.[1] ?? []).length) throw new Error(`${NODES.human}: الفرع الثاني موصول بشي، راجع يدوياً`)
    const [x, y] = human.position
    const gate = ifNode(human, BUSY_GATE, [x + 260, y + 220], BUSY, 'busy-retry')
    const wait = {
      ...JSON.parse(JSON.stringify(waitTpl)),
      id: crypto.randomUUID(),
      name: BUSY_WAIT,
      webhookId: crypto.randomUUID(),
      position: [x + 520, y + 220],
    }
    wf.nodes.push(gate, wait)
    const main = (wf.connections[NODES.human] ??= { main: [[]] }).main
    main[1] = [{ node: BUSY_GATE, type: 'main', index: 0 }]
    wf.connections[BUSY_GATE] = { main: [[{ node: BUSY_WAIT, type: 'main', index: 0 }], []] }
    wf.connections[BUSY_WAIT] = { main: [[{ node: NODES.reread, type: 'main', index: 0 }]] }
    changes.push(`${BUSY_GATE} ← ${BUSY_WAIT} ← ${NODES.reread}: الرسالة تستنى القفل لحد ${BUSY_MAX_RUNS} مرة`)
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
  backup(before, channel)
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
    console.error('حدد القناة: messenger و/أو whatsapp')
    process.exit(1)
  }
  for (const ch of channels) await run(ch)
}
