/**
 * رسائل الزبائن تضيع لما Meta تجمعها بطلب واحد (ضغط رسائل بنفس اللحظة) — فحص 2026-11-02:
 *
 *   Meta تدز أحداث ماسنجر بدفعات: body.entry مصفوفة، ولما تكثر الرسائل بنفس اللحظة تجمع أكثر من حدث (وأحياناً أكثر من زبون)
 *   بطلب POST واحد. «Extract Message Details» يقرا entry[0].messaging[0] بس، فكل حدث بعده بنفس الدفعة ينهمل بصمت: لا بفر ولا
 *   لوگ ولا رد. الزبون يشوف البوت يجاوب على نص كلامه أو ما يرد أبد — وهذا الي يبين «هلوسة» تحت الضغط.
 *   آخر ٢٥٠ تنفيذ (2026-10-29 → 11-02) كلها حدث واحد لأن الحركة قليلة؛ صفحة حقيقية بحركة عالية تنضرب بيها.
 *
 * الإصلاح (بعد «Ack Meta Event» — Meta أخذت ٢٠٠ للدفعة كلها):
 *
 *   Ack Meta Event ← «Split Batched Events» (عنصر لكل حدث، كل واحد بشكل طلب Meta بحدث واحد)
 *                  ← «First Batched Event?»
 *                       ├─ الأول  ← «Meta Event» ← Extract Message Details (نفس المسار القديم بالضبط)
 *                       └─ الباقي ← «Dispatch Batched Event» (نفس المسار، تنفيذ مستقل لكل حدث، بلا انتظار)
 *   «Batched Event Trigger» (استدعاء داخلي) ← «Meta Event»
 *
 *   كل حدث ياخذ تنفيذ مستقل لأن المسار كله مبني على عنصر واحد (.first() و Execute Once والقفل والبفر لكل زبون)، فما ينخلط زبون
 *   بزبون. الحدث الوحيد (أغلب الحالات) يمشي بنفس التنفيذ بلا أي فرق. والتنفيذ الداخلي ما يمر بفحص التوقيع لأن الدفعة كلها انفحصت.
 *   «Build Location Entry» و«Build Other Media Entry» كانوا يقرون $('Webhook') مباشرة — هسة يقرون «Meta Event» (الحدث نفسه)،
 *   لأن بالتنفيذ الداخلي ماكو Webhook.
 *
 * الاستعمال:
 *   DRY=1 N8N_KEY=<api key> node n8n/batched-events.mjs messenger   # يتحقق من المواضع وما يرسل شي
 *   N8N_KEY=<api key> node n8n/batched-events.mjs messenger
 *
 * آمن للتكرار: إذا العقد موجودة ما يسوي شي. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', ack: 'Ack Meta Event', extract: 'Extract Message Details' },
}

export const SPLIT = 'Split Batched Events'
export const FIRST_GATE = 'First Batched Event?'
export const EVENT = 'Meta Event'
export const DISPATCH = 'Dispatch Batched Event'
export const TRIGGER = 'Batched Event Trigger'
/** العقد الي كانت تقرا الطلب الخام من $('Webhook') */
export const WEBHOOK_READERS = ['Build Location Entry', 'Build Other Media Entry']

/**
 * كود «Split Batched Events» (مختبَر بتشغيله بـ tests/batched-events.test.ts).
 * طلب بلا أحداث (نادر) يطلع عنصر واحد بالطلب نفسه، فالمسار القديم يقرره مثل ما جان (Valid Message? يرفضه).
 */
export const SPLIT_CODE = `// دفعة Meta ← عنصر لكل حدث بشكل طلب Meta بحدث واحد (n8n/batched-events.mjs)
const req = $input.first().json;
const body = (req && req.body) || req || {};
const entries = Array.isArray(body.entry) ? body.entry : [];
const events = [];
for (const entry of entries) {
  const messaging = Array.isArray(entry && entry.messaging) ? entry.messaging : [];
  for (const m of messaging) {
    events.push({ object: body.object, entry: [{ ...entry, messaging: [m] }] });
  }
}
if (!events.length) return [{ json: { body, batchIndex: 0, batchSize: 1 } }];
return events.map((ev, i) => ({ json: { body: ev, batchIndex: i, batchSize: events.length } }));`

const FIRST_EXPR = '={{ Number($json.batchIndex || 0) === 0 }}'

/** @returns {string[]} التعديلات (فاضية = المسار مرتب من قبل) */
export const patchWorkflow = (wf, channel = 'messenger') => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel}`)
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.some((x) => x.name === name)
  const changes = []

  const ack = by(c.ack)
  by(c.extract)
  const ackNext = wf.connections[c.ack]?.main?.[0] ?? []

  if (!has(SPLIT)) {
    if (ackNext.length !== 1 || ackNext[0].node !== c.extract) {
      throw new Error(`${c.ack} لازم يوصل لـ ${c.extract} بس — راجع يدوياً (${ackNext.map((l) => l.node).join('، ')})`)
    }
    const [x, y] = ack.position
    wf.nodes.push(
      {
        id: crypto.randomUUID(),
        name: SPLIT,
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [x + 40, y + 220],
        parameters: { jsCode: SPLIT_CODE },
      },
      {
        id: crypto.randomUUID(),
        name: FIRST_GATE,
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [x + 260, y + 220],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
            conditions: [{ id: 'first-batched-event', leftValue: FIRST_EXPR, operator: { type: 'boolean', operation: 'true', singleValue: true } }],
            combinator: 'and',
          },
          looseTypeValidation: true,
          options: {},
        },
      },
      {
        id: crypto.randomUUID(),
        name: EVENT,
        type: 'n8n-nodes-base.noOp',
        typeVersion: 1,
        position: [x + 480, y + 120],
        parameters: {},
      },
      {
        id: crypto.randomUUID(),
        name: DISPATCH,
        type: 'n8n-nodes-base.executeWorkflow',
        typeVersion: 1.2,
        onError: 'continueRegularOutput',
        position: [x + 480, y + 340],
        parameters: {
          source: 'database',
          workflowId: { __rl: true, value: wf.id, mode: 'id' },
          workflowInputs: {
            mappingMode: 'defineBelow',
            value: { body: '={{ $json.body }}' },
            matchingColumns: [],
            schema: [{ id: 'body', displayName: 'body', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object', removed: false }],
            attemptToConvertTypes: false,
            convertFieldsToString: false,
          },
          mode: 'each',
          options: { waitForSubWorkflow: false },
        },
      },
      {
        id: crypto.randomUUID(),
        name: TRIGGER,
        type: 'n8n-nodes-base.executeWorkflowTrigger',
        typeVersion: 1.1,
        position: [x + 260, y - 120],
        parameters: { inputSource: 'workflowInputs', workflowInputs: { values: [{ name: 'body', type: 'object' }] } },
      },
    )
    wf.connections[c.ack] = { main: [[{ node: SPLIT, type: 'main', index: 0 }]] }
    wf.connections[SPLIT] = { main: [[{ node: FIRST_GATE, type: 'main', index: 0 }]] }
    wf.connections[FIRST_GATE] = {
      main: [[{ node: EVENT, type: 'main', index: 0 }], [{ node: DISPATCH, type: 'main', index: 0 }]],
    }
    wf.connections[TRIGGER] = { main: [[{ node: EVENT, type: 'main', index: 0 }]] }
    wf.connections[EVENT] = { main: [[{ node: c.extract, type: 'main', index: 0 }]] }
    changes.push(`${c.ack} ← ${SPLIT} ← ${FIRST_GATE}: كل حدث بالدفعة ياخذ تنفيذ مستقل (الأول بنفس التنفيذ)`)
  }

  for (const name of WEBHOOK_READERS) {
    if (!has(name)) continue
    const node = by(name)
    const code = node.parameters.jsCode ?? ''
    if (!code.includes("$('Webhook')")) continue
    node.parameters.jsCode = code.split("$('Webhook')").join(`$('${EVENT}')`)
    changes.push(`${name}: يقرا الحدث من «${EVENT}» بدل الطلب الخام`)
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

const backup = (wf, label) => {
  const file = path.join(HERE, 'backups', `${label}-${wf.id}-before-batched-events.json`)
  if (!DRY && !fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(wf, null, 2))
}

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const wf = await api(`/workflows/${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchWorkflow(wf, channel)
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
    console.error('حدد القناة: messenger')
    process.exit(1)
  }
  for (const ch of channels) await run(ch)
}
