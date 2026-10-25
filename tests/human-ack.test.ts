import { describe, expect, it } from 'vitest'
import {
  ACK_NODES,
  ANCHORS,
  HUMAN_ACK_CLAIM_SQL,
  HUMAN_ACK_TEXT,
  SEND_BODY,
  patchHumanAck,
} from '@/n8n/human-ack.js'

type Link = { node: string; type: string; index: number }
type Condition = { id: string; leftValue: string; operator: { operation: string; [k: string]: unknown }; [k: string]: unknown }
type Field = { fieldId: string; fieldValue: string }
type Node = {
  name: string
  type?: string
  alwaysOutputData?: boolean
  webhookId?: string
  credentials?: Record<string, { id: string; name: string }>
  parameters: {
    query?: string
    jsonBody?: string
    tableId?: string
    options?: { queryReplacement?: string; [k: string]: unknown }
    conditions?: { conditions: Condition[]; [k: string]: unknown }
    fieldsUi?: { fieldValues: Field[] }
    [k: string]: unknown
  }
  [k: string]: unknown
}
type Workflow = { nodes: Node[]; connections: Record<string, { main: Link[][] }> }

const link = (node: string): Link[] => [{ node, type: 'main', index: 0 }]
const pageRule = (pageId: string, outputKey: string) => ({
  conditions: {
    combinator: 'and',
    conditions: [
      {
        leftValue: "={{ $('Message Data').first().json.phoneNumberId }}",
        rightValue: pageId,
        operator: { operation: 'equals', type: 'string' },
      },
    ],
  },
  renameOutput: true,
  outputKey,
})
const send = (name: string, credName: string) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.3,
  retryOnFail: true,
  onError: 'continueErrorOutput',
  position: [-1552, 1712],
  parameters: {
    method: 'POST',
    url: 'https://graph.facebook.com/v23.0/me/messages',
    jsonBody: "={{ JSON.stringify({ recipient: { id: $json.phone }, messaging_type: 'RESPONSE', message: { text: $json.fallbackReply } }) }}",
  },
  credentials: { facebookGraphApi: { id: credName, name: credName } },
})

// فرع «Human Takeover?» بمسار ماسنجر الحي (2026-10-25)، بالحقول الي يقراها الباتش بس
const fixture = (): Workflow => ({
  nodes: [
    { name: ANCHORS.human, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-3968, 1760], parameters: {} },
    { name: 'Log Customer Msg (Human Mode)', type: 'n8n-nodes-base.supabase', typeVersion: 1, position: [-3744, 1760], parameters: {} },
    {
      name: ANCHORS.remove,
      type: 'n8n-nodes-base.supabase',
      typeVersion: 1,
      retryOnFail: true,
      onError: 'continueRegularOutput',
      position: [-3520, 1760],
      parameters: { operation: 'delete', tableId: 'message_buffer' },
    },
    { name: ANCHORS.waitTemplate, type: 'n8n-nodes-base.wait', typeVersion: 1.1, webhookId: 'busy-wait-hook', position: [-3448, 1980], parameters: { amount: 4 } },
    {
      name: ANCHORS.claimTemplate,
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      alwaysOutputData: true,
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
      position: [-3968, 1440],
      parameters: { operation: 'executeQuery', query: 'INSERT INTO customer_sessions …', options: { queryReplacement: '={{ $json.phone }}' } },
      credentials: { postgres: { id: 'jMEQ9bmnbStdptDT', name: 'Postgres account' } },
    },
    {
      name: ANCHORS.gateTemplate,
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [-3664, 1312],
      parameters: {
        conditions: {
          combinator: 'and',
          conditions: [{ id: 'lock-ok', leftValue: '={{ $json.phone_number }}', operator: { operation: 'notEmpty', singleValue: true, type: 'string' }, rightValue: 'true' }],
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        },
        looseTypeValidation: true,
        options: {},
      },
    },
    {
      name: ANCHORS.pageTemplate,
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.4,
      position: [-1696, 1856],
      parameters: {
        rules: { values: [pageRule('1321149431082632', 'ستايل بغداد'), pageRule('615262431673775', 'المميز')] },
        options: { fallbackOutput: 'extra', renameFallbackOutput: 'صفحة بلا توكن' },
      },
    },
    send(ANCHORS.sendTemplates[0], 'Meta_Messenger_StyleBaghdad'),
    send(ANCHORS.sendTemplates[1], 'Meta_Messenger_Bariq_All'),
    { name: ANCHORS.noToken, type: 'n8n-nodes-base.supabase', typeVersion: 1, position: [-960, 384], parameters: { tableId: 'failed_events' } },
    {
      name: ANCHORS.logTemplate,
      type: 'n8n-nodes-base.supabase',
      typeVersion: 1,
      retryOnFail: true,
      onError: 'continueRegularOutput',
      position: [-1328, 2160],
      parameters: { tableId: 'conversation_log', fieldsUi: { fieldValues: [{ fieldId: 'intent', fieldValue: 'bot_error' }] } },
      credentials: { supabaseApi: { id: '0J9V8THtgt8u2CWl', name: 'Supabase account' } },
    },
  ],
  connections: {
    [ANCHORS.human]: { main: [link('Log Customer Msg (Human Mode)'), link('Busy Retry?')] },
    'Log Customer Msg (Human Mode)': { main: [link(ANCHORS.remove)] },
    [ANCHORS.pageTemplate]: { main: [link(ANCHORS.sendTemplates[0]), link(ANCHORS.sendTemplates[1]), link(ANCHORS.noToken)] },
    [ANCHORS.sendTemplates[0]]: { main: [link(ANCHORS.logTemplate)] },
    [ANCHORS.sendTemplates[1]]: { main: [link(ANCHORS.logTemplate)] },
  },
})

const node = (wf: Workflow, name: string) => {
  const n = wf.nodes.find((x) => x.name === name)
  if (!n) throw new Error(`missing ${name}`)
  return n
}
const conditionsOf = (n: Node) => n.parameters.conditions?.conditions ?? []
const fieldsOf = (n: Node) => n.parameters.fieldsUi?.fieldValues ?? []
const next = (wf: Workflow, name: string) => (wf.connections[name]?.main ?? []).map((out) => (out ?? []).map((l) => l.node))

// يقيّم تعبير n8n «={{ … }}» بقيمة $json
const evalExpr = (expr: string, $json: Record<string, unknown>) =>
  new Function('$json', `return (${expr.replace(/^=\{\{\s*/, '').replace(/\s*\}\}$/, '')})`)($json)

describe('patchHumanAck — رد انتظار واحد بعد التحويل لموظف', () => {
  it('يوصل السلسلة بعد «Remove From Buffer (Human Mode)» بالترتيب', () => {
    const wf = fixture()
    const changes = patchHumanAck(wf)
    expect(changes).toHaveLength(2)
    expect(next(wf, ANCHORS.remove)).toEqual([[ACK_NODES.wait]])
    expect(next(wf, ACK_NODES.wait)).toEqual([[ACK_NODES.claim]])
    expect(next(wf, ACK_NODES.claim)).toEqual([[ACK_NODES.gate]])
    expect(next(wf, ACK_NODES.gate)).toEqual([[ACK_NODES.page], []])
    expect(next(wf, ACK_NODES.page)).toEqual([[ACK_NODES.send[0]], [ACK_NODES.send[1]], [ANCHORS.noToken]])
    for (const s of ACK_NODES.send) expect(next(wf, s)).toEqual([[ACK_NODES.log]])
    // فرع «Busy Retry?» ما ينلمس
    expect(next(wf, ANCHORS.human)).toEqual([['Log Customer Msg (Human Mode)'], ['Busy Retry?']])
  })

  it('الحذف يطلع عنصر دائماً حتى ما توقف السلسلة', () => {
    const wf = fixture()
    patchHumanAck(wf)
    expect(node(wf, ANCHORS.remove).alwaysOutputData).toBe(true)
  })

  it('آمن للتكرار: التشغيل الثاني ما يضيف شي', () => {
    const wf = fixture()
    patchHumanAck(wf)
    const count = wf.nodes.length
    const snapshot = JSON.stringify(wf)
    expect(patchHumanAck(wf)).toEqual([])
    expect(wf.nodes).toHaveLength(count)
    expect(JSON.stringify(wf)).toBe(snapshot)
  })

  it('الانتظار دقيقتين بوحدة صريحة وبـ webhookId جديد', () => {
    const wf = fixture()
    patchHumanAck(wf)
    const wait = node(wf, ACK_NODES.wait)
    expect(wait.type).toBe('n8n-nodes-base.wait')
    expect(wait.parameters).toEqual({ amount: 2, unit: 'minutes' })
    expect(wait.webhookId).toBeTruthy()
    expect(wait.webhookId).not.toBe('busy-wait-hook')
  })

  it('الحجز UPDATE ذرّي بحساب Postgres، والزبون أول معامل ومعرّف الصفحة الثاني', () => {
    const wf = fixture()
    patchHumanAck(wf)
    const claim = node(wf, ACK_NODES.claim)
    expect(claim.type).toBe('n8n-nodes-base.postgres')
    expect(claim.credentials).toEqual({ postgres: { id: 'jMEQ9bmnbStdptDT', name: 'Postgres account' } })
    expect(claim.alwaysOutputData).toBe(true)
    expect(claim.parameters.query).toBe(HUMAN_ACK_CLAIM_SQL)
    expect(claim.parameters.options?.queryReplacement).toBe(
      "={{ $('Session Context').first().json.phone }},{{ $('Message Data').first().json.phoneNumberId }}",
    )
  })

  it('شروط الحجز: محوّلة، ما انرسل رد بهالتحويل، والموظف ما كتب من بداية التحويل', () => {
    const sql = HUMAN_ACK_CLAIM_SQL.replace(/\s+/g, ' ')
    expect(sql).toMatch(/^UPDATE customer_sessions s SET human_ack_at = now\(\) WHERE s\.phone_number = \$1/)
    expect(sql).toContain('AND s.human_takeover = true')
    expect(sql).toContain('AND s.human_ack_at IS NULL')
    expect(sql).toContain("AND m.sender_type = 'agent'")
    expect(sql).toContain("AND c.platform = 'messenger'")
    expect(sql).toContain('(c.account_external_id = $2 OR c.account_external_id IS NULL)')
    expect(sql).toContain("m.created_at >= COALESCE(s.human_takeover_at - interval '1 minute', '-infinity'::timestamptz)")
    expect(sql.trim().endsWith('RETURNING s.id, s.phone_number;')).toBe(true)
  })

  it('البوابة تعدّي بس لو الحجز رجّع صف', () => {
    const wf = fixture()
    patchHumanAck(wf)
    const [cond] = conditionsOf(node(wf, ACK_NODES.gate))
    expect(cond.leftValue).toBe('={{ $json.phone_number }}')
    expect(cond.operator.operation).toBe('notEmpty')
    expect(cond.id).toBe('human-ack-claimed')
    // نسخة، مو نفس الكائن: «Lock Acquired?» تبقى كما هي
    expect(conditionsOf(node(wf, ANCHORS.gateTemplate))[0].id).toBe('lock-ok')
  })

  it('كل صفحة ترسل بتوكنها، بنفس قواعد سويتش الاعتذار', () => {
    const wf = fixture()
    patchHumanAck(wf)
    expect(node(wf, ACK_NODES.page).parameters).toEqual(node(wf, ANCHORS.pageTemplate).parameters)
    expect(node(wf, ACK_NODES.send[0]).credentials?.facebookGraphApi.name).toBe('Meta_Messenger_StyleBaghdad')
    expect(node(wf, ACK_NODES.send[1]).credentials?.facebookGraphApi.name).toBe('Meta_Messenger_Bariq_All')
    // الاعتذار الأصلي ما تغيّر
    expect(node(wf, ANCHORS.sendTemplates[0]).parameters.jsonBody).toContain('$json.fallbackReply')
  })

  it('جسم الإرسال: للزبون الي انحجز له الرد وبالنص بالضبط', () => {
    const wf = fixture()
    patchHumanAck(wf)
    for (const name of ACK_NODES.send) {
      const body = node(wf, name).parameters.jsonBody ?? ''
      expect(body).toBe(SEND_BODY)
      expect(JSON.parse(evalExpr(body, { phone_number: '28944586871867160' }))).toEqual({
        recipient: { id: '28944586871867160' },
        messaging_type: 'RESPONSE',
        message: { text: HUMAN_ACK_TEXT },
      })
    }
  })

  it('الرد ينسجل باللوحة كرد بوت بنية human_ack', () => {
    const wf = fixture()
    patchHumanAck(wf)
    const log = node(wf, ACK_NODES.log)
    expect(log.parameters.tableId).toBe('conversation_log')
    const fields = Object.fromEntries(fieldsOf(log).map((f) => [f.fieldId, f.fieldValue]))
    expect(fields).toEqual({
      phone_number: "={{ $('Session Context').first().json.phone }}",
      message_text: HUMAN_ACK_TEXT,
      sender: 'bot',
      direction: 'outgoing',
      intent: 'human_ack',
      platform: 'messenger',
      account_external_id: "={{ $('Message Data').first().json.phoneNumberId }}",
    })
    expect(fieldsOf(node(wf, ANCHORS.logTemplate))).toEqual([{ fieldId: 'intent', fieldValue: 'bot_error' }])
  })

  it('نص الرد ما يوعد بوقت', () => {
    expect(HUMAN_ACK_TEXT).toBe('وصلت رسالتك، موظف من الفريق راح يرد عليك بأقرب وقت')
    expect(HUMAN_ACK_TEXT).not.toMatch(/هس[ةه]|دقيق|ساع|[0-9٠-٩]/)
  })

  it('يكمل السلسلة لو alwaysOutputData مزيودة من قبل بس', () => {
    const wf = fixture()
    node(wf, ANCHORS.remove).alwaysOutputData = true
    const changes = patchHumanAck(wf)
    expect(changes).toHaveLength(1)
    expect(next(wf, ANCHORS.remove)).toEqual([[ACK_NODES.wait]])
  })

  it('يوقف إذا الحذف موصول بشي ثاني أو عقدة ناقصة', () => {
    const wired = fixture()
    wired.connections[ANCHORS.remove] = { main: [link('Something Else')] }
    expect(() => patchHumanAck(wired)).toThrow(/راجع يدوياً/)

    const missing = fixture()
    missing.nodes = missing.nodes.filter((n) => n.name !== ANCHORS.pageTemplate)
    expect(() => patchHumanAck(missing)).toThrow(new RegExp(ANCHORS.pageTemplate.replace(/[()]/g, '\\$&')))

    const pages = fixture()
    pages.connections[ANCHORS.pageTemplate].main.pop()
    expect(() => patchHumanAck(pages)).toThrow(/المخارج/)
  })

  it('الخطأ ما يخلي المسار نص معدّل', () => {
    const wf = fixture()
    wf.connections[ANCHORS.pageTemplate].main.pop()
    const snapshot = JSON.stringify(wf)
    expect(() => patchHumanAck(wf)).toThrow()
    expect(JSON.stringify(wf)).toBe(snapshot)
  })
})
