// رد انتظار واحد للزبون بعد التحويل لموظف (ماسنجر 2026-10-24، الزبون 28944586871867160): بعد «تحوّلت لموظف الدعم»
// الزبون كتب «شنو عدكم الوان غيرها» و«موجودين» وما وصله شي ~11.5 دقيقة، لأن فرع «Human Takeover?» يسجّل الرسالة
// ويشيلها من البفر بس.
//
// هسة بعد «Remove From Buffer (Human Mode)»: «Human Ack Wait» (دقيقتين) ← «Claim Human Ack» (UPDATE ذرّي واحد) ←
// «Human Ack Claimed?» ← توكن الصفحة ← «Send Human Ack» ← «Log Human Ack». الرد ينرسل مرة وحدة بكل تحويل وبس لو الموظف
// ما كتب شي من بداية التحويل؛ تحويل بدا برد من اللوحة ما يطلع بيه رد. الحقلان human_takeover_at و human_ack_at يمشيهما
// trigger بالقاعدة (supabase/migrations/030_human_takeover_ack.sql). ثلاث رسائل ورا بعض = رد واحد: الـ UPDATE الثاني
// يستنى قفل الصف ويعيد فحص human_ack_at بعد ما الأول يثبت.
//
// الرد ما يحدد وقت («هسة» تنشال حسب اختيار صاحب المتجر)، ونفس الرد يتسجل بـ conversation_log فيطلع باللوحة كرد بوت.

export const HUMAN_ACK_TEXT = 'وصلت رسالتك، موظف من الفريق راح يرد عليك بأقرب وقت'
export const HUMAN_ACK_WAIT_MINUTES = 2

// رد اللوحة يكتب رسالة الموظف بـ messages قبل ما يحط human_takeover = true، فرد الموظف الي فتح التحويل يسبق
// human_takeover_at بثواني (مهلة إرسال n8n). دقيقة هامش تغطيه.
export const STAFF_REPLY_GRACE = '1 minute'

// $1 = الزبون (PSID)، $2 = معرّف الصفحة. يرجّع صف بس لو الرد انحجز لهالتنفيذ.
export const HUMAN_ACK_CLAIM_SQL = `UPDATE customer_sessions s
   SET human_ack_at = now()
 WHERE s.phone_number = $1
   AND s.human_takeover = true
   AND s.human_ack_at IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE c.customer_phone = s.phone_number
        AND c.platform = 'messenger'
        AND (c.account_external_id = $2 OR c.account_external_id IS NULL)
        AND m.sender_type = 'agent'
        AND m.created_at >= COALESCE(s.human_takeover_at - interval '${STAFF_REPLY_GRACE}', '-infinity'::timestamptz)
   )
RETURNING s.id, s.phone_number;`

export const ANCHORS = {
  human: 'Human Takeover?',
  remove: 'Remove From Buffer (Human Mode)',
  waitTemplate: 'Busy Wait',
  claimTemplate: 'Acquire Session Lock',
  gateTemplate: 'Lock Acquired?',
  pageTemplate: 'اختيار توكن الصفحة (اعتذار)',
  sendTemplates: ['Send Fallback Reply', 'Send Fallback Reply (المميز)'],
  noToken: 'صفحة بلا توكن',
  logTemplate: 'Log Fallback Reply (Error)',
}

export const ACK_NODES = {
  wait: 'Human Ack Wait',
  claim: 'Claim Human Ack',
  gate: 'Human Ack Claimed?',
  page: 'اختيار توكن الصفحة (انتظار)',
  send: ['Send Human Ack', 'Send Human Ack (المميز)'],
  log: 'Log Human Ack',
}

const PHONE = "$('Session Context').first().json.phone"
const PAGE_ID = "$('Message Data').first().json.phoneNumberId"

export const SEND_BODY = `={{ JSON.stringify({ recipient: { id: $json.phone_number }, messaging_type: 'RESPONSE', message: { text: ${JSON.stringify(HUMAN_ACK_TEXT)} } }) }}`

const clone = (x) => JSON.parse(JSON.stringify(x))
const link = (node) => [{ node, type: 'main', index: 0 }]

/**
 * يضيف سلسلة رد الانتظار لفرع «Human Takeover?» (يعدّل wf بمكانه).
 * @returns {string[]} التعديلات (فاضية = مزيود من قبل)
 */
export function patchHumanAck(wf) {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.some((x) => x.name === name)
  const changes = []

  const human = by(ANCHORS.human)
  const remove = by(ANCHORS.remove)

  // الحذف ما يلگه صف (انشال قبل) فيطلع بلا عناصر وتوقف السلسلة؛ alwaysOutputData يخليها تكمل.
  // ينزاد بعد كل الفحوص، حتى الخطأ ما يخلي المسار نص معدّل
  const keepOutput = () => {
    if (remove.alwaysOutputData === true) return
    remove.alwaysOutputData = true
    changes.unshift(`${ANCHORS.remove}: alwaysOutputData حتى رد الانتظار يكمل حتى لو الحذف ما لگه صف`)
  }

  if (has(ACK_NODES.wait)) {
    keepOutput()
    return changes
  }

  const after = wf.connections[ANCHORS.remove]?.main?.[0] ?? []
  if (after.length) throw new Error(`${ANCHORS.remove} موصول بـ ${after.map((l) => l.node).join('، ')}، راجع يدوياً`)
  for (const name of Object.values(ACK_NODES).flat()) {
    if (has(name)) throw new Error(`${name} موجودة بلا ${ACK_NODES.wait}، راجع يدوياً`)
  }

  const [x, y] = human.position
  const at = (dx, dy = 0) => [x + dx, y + 440 + dy]
  const uuid = () => globalThis.crypto.randomUUID()

  const waitTpl = by(ANCHORS.waitTemplate)
  const wait = {
    id: uuid(),
    name: ACK_NODES.wait,
    type: waitTpl.type,
    typeVersion: waitTpl.typeVersion,
    position: at(672),
    webhookId: uuid(),
    parameters: { amount: HUMAN_ACK_WAIT_MINUTES, unit: 'minutes' },
  }

  const claim = clone(by(ANCHORS.claimTemplate))
  Object.assign(claim, {
    id: uuid(),
    name: ACK_NODES.claim,
    position: at(896),
    alwaysOutputData: true,
    parameters: {
      operation: 'executeQuery',
      query: HUMAN_ACK_CLAIM_SQL,
      options: { queryReplacement: `={{ ${PHONE} }},{{ ${PAGE_ID} }}` },
    },
  })

  const gate = clone(by(ANCHORS.gateTemplate))
  Object.assign(gate, { id: uuid(), name: ACK_NODES.gate, position: at(1120) })
  const cond = gate.parameters.conditions.conditions
  if (cond.length !== 1 || cond[0].leftValue !== '={{ $json.phone_number }}') {
    throw new Error(`${ANCHORS.gateTemplate} تغيّر شرطها، راجع يدوياً`)
  }
  cond[0].id = 'human-ack-claimed'

  const page = clone(by(ANCHORS.pageTemplate))
  Object.assign(page, { id: uuid(), name: ACK_NODES.page, position: at(1344) })

  const sends = ANCHORS.sendTemplates.map((tplName, i) => {
    const send = clone(by(tplName))
    Object.assign(send, { id: uuid(), name: ACK_NODES.send[i], position: at(1568, i * 160 - 80) })
    send.parameters.jsonBody = SEND_BODY
    return send
  })

  const log = clone(by(ANCHORS.logTemplate))
  Object.assign(log, { id: uuid(), name: ACK_NODES.log, position: at(1792) })
  log.parameters.fieldsUi.fieldValues = [
    { fieldId: 'phone_number', fieldValue: `={{ ${PHONE} }}` },
    { fieldId: 'message_text', fieldValue: HUMAN_ACK_TEXT },
    { fieldId: 'sender', fieldValue: 'bot' },
    { fieldId: 'direction', fieldValue: 'outgoing' },
    { fieldId: 'intent', fieldValue: 'human_ack' },
    { fieldId: 'platform', fieldValue: 'messenger' },
    { fieldId: 'account_external_id', fieldValue: `={{ ${PAGE_ID} }}` },
  ]

  // مخارج السويتش: صفحة لكل توكن بنفس ترتيب «اعتذار»، والأخير «صفحة بلا توكن»
  const pageOuts = wf.connections[ANCHORS.pageTemplate]?.main ?? []
  const expected = [...ANCHORS.sendTemplates, ANCHORS.noToken]
  if (pageOuts.length !== expected.length || pageOuts.some((out, i) => out?.[0]?.node !== expected[i])) {
    throw new Error(`${ANCHORS.pageTemplate}: المخارج مو ${expected.join(' / ')}، راجع يدوياً`)
  }
  by(ANCHORS.noToken)

  wf.nodes.push(wait, claim, gate, page, ...sends, log)
  wf.connections[ANCHORS.remove] = { main: [link(ACK_NODES.wait)] }
  wf.connections[ACK_NODES.wait] = { main: [link(ACK_NODES.claim)] }
  wf.connections[ACK_NODES.claim] = { main: [link(ACK_NODES.gate)] }
  wf.connections[ACK_NODES.gate] = { main: [link(ACK_NODES.page), []] }
  wf.connections[ACK_NODES.page] = { main: [...ACK_NODES.send.map(link), link(ANCHORS.noToken)] }
  for (const name of ACK_NODES.send) wf.connections[name] = { main: [link(ACK_NODES.log)] }
  changes.push(
    `${ACK_NODES.wait} (${HUMAN_ACK_WAIT_MINUTES} دقيقة) ← ${ACK_NODES.claim} ← ${ACK_NODES.gate} ← ${ACK_NODES.page} ← ${ACK_NODES.send.join(' / ')} ← ${ACK_NODES.log}: رد انتظار واحد بكل تحويل`,
  )
  keepOutput()
  return changes
}
