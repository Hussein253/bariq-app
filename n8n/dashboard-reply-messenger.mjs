/**
 * رد الموظف من اللوحة ما كان يوصل لزبون ماسنجر (2026-10-24، المحادثتان 28386991107651965 و27942467065427043):
 *
 *   مسار n8n «رد اللوحة → واتساب» (Bg1y71DM0Bi16pbB) يقبل channel: 'whatsapp' بس ويرفض غيره بـ unsupported_channel، وتطبيق اللوحة
 *   (app/api/conversations/[id]/reply) ما يستدعيه أصلاً إلا لواتساب: رد الموظف على ماسنجر ينحفظ ويظهر باللوحة («موظف» بالأخضر) ويوقف البوت
 *   بس ما يمرّ على Meta أبداً (channel_send_supported = false). الزبون ما يشوف شي.
 *
 *   هذا السكربت يعلّم المسار يرسل لماسنجر بنفس عقد واتساب (docs/n8n-dashboard-reply.md):
 *     - التحقق: channel = whatsapp أو messenger. PSID ماسنجر 8–25 رقم، النص لحد 2000 حرف، و account_external_id (معرّف الصفحة) لازم يكون
 *       من الصفحتين المعروفتين (ستايل بغداد 1321149431082632، المميز 615262431673775). ماكو تخمين: صفحة ناقصة أو مجهولة ← 400.
 *     - نافذة 24 ساعة: نفس الفحص بس على منصة القناة (platform = channel). خارجها ← 409 outside_24h_window (Meta ما تقبل RESPONSE خارجها).
 *     - الإرسال: Graph API /me/messages بتوكن الصفحة (نفس اعتمادات بوت ماسنجر: Meta_Messenger_StyleBaghdad / Meta_Messenger_Bariq_All).
 *     - الرد: 200 { ok, message_id } أو 502 { error: '<channel>_send_failed', detail }. بدون إعادة محاولة (رسالة مكررة للزبون أسوأ من فشل ظاهر).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/dashboard-reply-messenger.mjs
 *   DRY=1 N8N_KEY=<api key> node n8n/dashboard-reply-messenger.mjs   # يتحقق من المواضع وما يرسل شي
 * آمن للتكرار. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'
if (!KEY) {
  console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
  process.exit(1)
}

const WF_ID = 'Bg1y71DM0Bi16pbB'
const PAGES = [
  { id: '1321149431082632', node: 'إرسال ماسنجر (ستايل بغداد)', key: 'ستايل بغداد', cred: { id: 'qS4EAO9c0GWykWQe', name: 'Meta_Messenger_StyleBaghdad' } },
  { id: '615262431673775', node: 'إرسال ماسنجر (المميز)', key: 'المميز', cred: { id: 'FCeKE3HF3ADSpmsg', name: 'Meta_Messenger_Bariq_All' } },
]
const N = {
  prep: 'تجهيز الطلب',
  windowCheck: 'فحص نافذة 24 ساعة',
  inWindow: 'داخل نافذة 24 ساعة؟',
  waSend: 'إرسال الرد عبر واتساب',
  ok: 'تم الإرسال',
  fail: 'فشل الإرسال',
  channelSwitch: 'قناة الرد',
  pageSwitch: 'صفحة ماسنجر',
  unknownPage: 'رفض: حساب غير معروف',
  note: 'Sticky Note c2e25631',
  group: 'الإرسال والرد',
}
const GROUP_DESCRIPTION = 'يوجّه حسب القناة، ويرسل النص (واتساب من رقم التاجر، وماسنجر من توكن الصفحة)، ويرد 200 بمعرّف الرسالة أو 502 بسبب الفشل'

const api = async (p, init) => {
  const res = await fetch(`${API}${p}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${p} → ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

// ————— التعبيرات —————

const VALIDATION = "={{ (() => { const b = $json.body ?? {}; const ch = String(b.channel ?? ''); const phone = String(b.phone_number ?? '').trim(); const text = typeof b.message_text === 'string' ? b.message_text : ''; const acc = b.account_external_id; const PHONE = { whatsapp: /^[0-9]{8,15}$/, messenger: /^[0-9]{8,25}$/ }; const MAX = { whatsapp: 4096, messenger: 2000 }; if (!PHONE[ch]) return 'unsupported_channel'; if (!PHONE[ch].test(phone)) return 'invalid_phone_number'; if (!text.trim()) return 'empty_message_text'; if (text.length > MAX[ch]) return 'message_text_too_long'; if (acc != null && acc !== '' && !/^[0-9]+$/.test(String(acc))) return 'invalid_account_external_id'; if (ch === 'messenger' && (acc == null || acc === '')) return 'missing_account_external_id'; if (ch === 'messenger' && !" + JSON.stringify(PAGES.map((p) => p.id)) + ".includes(String(acc))) return 'unknown_account'; return ''; })() }}"
const PHONE_NUMBER_ID = "={{ String($json.body?.account_external_id || ($json.body?.channel === 'whatsapp' ? '1245317385330588' : '')) }}"
const CHANNEL = "={{ String($json.body?.channel ?? '') }}"

const WINDOW_QUERY = "SELECT coalesce(max(created_at) > now() - interval '24 hours', false) AS within_window,\n       max(created_at) AS last_incoming_at\nFROM conversation_log\nWHERE phone_number = $1\n  AND direction IN ('incoming', 'in')\n  AND coalesce(platform, 'whatsapp') = $2;"
const WINDOW_PARAMS = '={{ [$json.phone, $json.channel] }}'

const OK_BODY = "={{ JSON.stringify({ ok: true, message_id: $json.messages?.[0]?.id ?? $json.message_id ?? null }) }}"
const FAIL_BODY = "={{ JSON.stringify({ ok: false, error: $('" + N.prep + "').first().json.channel + '_send_failed', detail: String($json.error?.message ?? $json.error ?? $json.message ?? 'unknown') }) }}"
const SEND_BODY = "={{ JSON.stringify({ recipient: { id: $('" + N.prep + "').first().json.phone }, messaging_type: 'RESPONSE', message: { text: $('" + N.prep + "').first().json.text } }) }}"

const NOTE = '## رد اللوحة → واتساب وماسنجر\nيستقبل ردود الموظفين من لوحة برق (N8N_WEBHOOK_URL) ويرسلها للزبون: channel = whatsapp أو messenger.\n\n- السر: ترويسة Authorization: Bearer <BARIQ_N8N_OUTBOUND_SECRET>. المسار يحفظ بصمة SHA-256 للسر فقط، لا السر نفسه.\n- واتساب: account_external_id فارغ = الرقم القديم 1245317385330588 (المتجر الأول).\n- ماسنجر: account_external_id (معرّف الصفحة) إلزامي ومن الصفحتين المعروفتين، والإرسال بتوكن الصفحة عبر Graph API /me/messages.\n- نافذة 24 ساعة (حسب منصة القناة): إن لم يراسل الزبون خلالها يرد 409. تعذّر الفحص = إرسال على أي حال.\n- لا إعادة محاولة تلقائية: الفشل يرجع 502 فيظهر في اللوحة بدل رسالة مكررة للزبون.\n- العقد الكامل: docs/n8n-dashboard-reply.md'

// ————— البناء —————

const uuid = () => crypto.randomUUID()

const switchNode = (name, position, leftExpr, rules, fallbackName) => ({
  id: uuid(),
  name,
  type: 'n8n-nodes-base.switch',
  typeVersion: 3.4,
  position,
  parameters: {
    rules: {
      values: rules.map(([key, value]) => ({
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 },
          conditions: [{ id: uuid(), leftValue: leftExpr, rightValue: value, operator: { type: 'string', operation: 'equals' } }],
          combinator: 'and',
        },
        renameOutput: true,
        outputKey: key,
      })),
    },
    options: { fallbackOutput: 'extra', renameFallbackOutput: fallbackName },
  },
})

const sendNode = (page, position) => ({
  id: uuid(),
  name: page.node,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.3,
  position,
  onError: 'continueErrorOutput', // فشل Meta يروح لـ «فشل الإرسال» (502) بدل ما يوقف المسار
  credentials: { facebookGraphApi: page.cred },
  parameters: {
    method: 'POST',
    url: 'https://graph.facebook.com/v23.0/me/messages',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'facebookGraphApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: SEND_BODY,
    options: { timeout: 15000 },
  },
})

const unknownPageNode = (position) => ({
  id: uuid(),
  name: N.unknownPage,
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position,
  parameters: { respondWith: 'json', responseBody: '{ "ok": false, "error": "unknown_account" }', options: { responseCode: 400 } },
})

const patch = async () => {
  const wf = await api(`/workflows/${WF_ID}`)
  const pick = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بمسار رد اللوحة`)
    return n
  }
  const has = (name) => wf.nodes.find((x) => x.name === name)
  const done = []
  const skipped = []
  const mark = (ok, label) => (ok ? done : skipped).push(label)

  const backup = path.join(HERE, 'backups', `dashboard-reply-${WF_ID}-before-messenger.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  // ١. تجهيز الطلب: القناة، معرّف الحساب، والتحقق
  const prep = pick(N.prep)
  const assigns = prep.parameters.assignments.assignments
  const setAssign = (id, name, value) => {
    const a = assigns.find((x) => x.id === id || x.name === name)
    if (a) {
      if (a.value === value) return false
      a.value = value
      return true
    }
    assigns.push({ id, name, value, type: 'string' })
    return true
  }
  const c1 = setAssign('channel', 'channel', CHANNEL)
  const c2 = setAssign('phone-number-id', 'phoneNumberId', PHONE_NUMBER_ID)
  const c3 = setAssign('validation-error', 'validationError', VALIDATION)
  mark(c1 || c2 || c3, 'تحقق الطلب (قناة ماسنجر، الصفحة، الحدود)')

  // ٢. فحص النافذة حسب منصة القناة
  const win = pick(N.windowCheck)
  const winChanged = win.parameters.query !== WINDOW_QUERY || win.parameters.options.queryReplacement !== WINDOW_PARAMS
  win.parameters.query = WINDOW_QUERY
  win.parameters.options.queryReplacement = WINDOW_PARAMS
  mark(winChanged, 'فحص نافذة 24 ساعة بمنصة القناة')

  // ٣. ردود النجاح والفشل تناسب القناتين
  const okN = pick(N.ok)
  const failN = pick(N.fail)
  const respChanged = okN.parameters.responseBody !== OK_BODY || failN.parameters.responseBody !== FAIL_BODY
  okN.parameters.responseBody = OK_BODY
  failN.parameters.responseBody = FAIL_BODY
  mark(respChanged, 'ردّا النجاح والفشل')

  // ٤. عقد التوجيه والإرسال
  const win0 = pick(N.inWindow).position
  const wa = pick(N.waSend)
  let routed = false
  if (!has(N.channelSwitch)) {
    const chSwitch = switchNode(N.channelSwitch, [win0[0] + 260, win0[1] - 40], "={{ $('" + N.prep + "').first().json.channel }}", [['واتساب', 'whatsapp'], ['ماسنجر', 'messenger']], 'قناة مجهولة')
    const pgSwitch = switchNode(N.pageSwitch, [win0[0] + 560, win0[1] + 200], "={{ $('" + N.prep + "').first().json.phoneNumberId }}", PAGES.map((p) => [p.key, p.id]), 'صفحة مجهولة')
    wf.nodes.push(chSwitch, pgSwitch)
    PAGES.forEach((p, i) => wf.nodes.push(sendNode(p, [win0[0] + 860, win0[1] + 140 + i * 140])))
    const unknown = unknownPageNode([win0[0] + 860, win0[1] + 440])
    unknown.typeVersion = okN.typeVersion // نفس إصدار عقد الرد الموجودة
    wf.nodes.push(unknown)
    routed = true
  }
  // النافذة (صح) ← قناة الرد ← واتساب/صفحة ماسنجر ← عقدة الإرسال ← نجاح/فشل
  const link = (from, outIdx, to) => {
    wf.connections[from] ??= { main: [] }
    const outs = (wf.connections[from].main[outIdx] ??= [])
    if (!outs.some((l) => l.node === to)) {
      outs.push({ node: to, type: 'main', index: 0 })
      return true
    }
    return false
  }
  const unlink = (from, outIdx, to) => {
    const outs = wf.connections[from]?.main?.[outIdx]
    if (!outs || !outs.some((l) => l.node === to)) return false
    wf.connections[from].main[outIdx] = outs.filter((l) => l.node !== to)
    return true
  }
  let wired = false
  wired = unlink(N.inWindow, 0, N.waSend) || wired
  wired = link(N.inWindow, 0, N.channelSwitch) || wired
  wired = link(N.channelSwitch, 0, N.waSend) || wired
  wired = link(N.channelSwitch, 1, N.pageSwitch) || wired
  // مخرج «قناة مجهولة» (الثالث) ما إله وجهة: التحقق يمنع وصولها، فنوصله لرفض الحساب بدل ما يعلق الـ webhook
  wired = link(N.channelSwitch, 2, N.unknownPage) || wired
  PAGES.forEach((p, i) => {
    wired = link(N.pageSwitch, i, p.node) || wired
    wired = link(p.node, 0, N.ok) || wired
    wired = link(p.node, 1, N.fail) || wired
  })
  wired = link(N.pageSwitch, PAGES.length, N.unknownPage) || wired
  mark(routed || wired, 'توجيه القناة والصفحة وإرسال ماسنجر')
  void wa

  // ٥. مجموعة «الإرسال والرد»: n8n يشترط مجموعة متصلة بمدخل وحيد، فعقد التوجيه والإرسال الجديدة تدخل المجموعة نفسها
  const group = (wf.nodeGroups ?? []).find((g) => g.name === N.group)
  if (!group) throw new Error('ماكو مجموعة عقد باسم ' + N.group)
  const newIds = [N.channelSwitch, N.pageSwitch, ...PAGES.map((pg) => pg.node), N.unknownPage].map((n) => pick(n).id)
  const missing = newIds.filter((id) => !group.nodeIds.includes(id))
  group.nodeIds.push(...missing)
  const groupDescChanged = group.description !== GROUP_DESCRIPTION
  group.description = GROUP_DESCRIPTION
  mark(missing.length > 0 || groupDescChanged, 'مجموعة «الإرسال والرد»')

  // ٦. ملاحظة المسار
  const note = has(N.note)
  if (note) {
    const noteChanged = note.parameters.content !== NOTE
    note.parameters.content = NOTE
    mark(noteChanged, 'ملاحظة المسار')
  }

  if (skipped.length) console.log(`— مزيود من قبل — ${skipped.join('، ')}`)
  if (!done.length) {
    console.log('— كل شي مزيود من قبل، ما أرسلت شي')
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}راح ينزاد/يتغيّر — ${done.join('، ')}`)
  if (DRY) return

  const saved = await api(`/workflows/${WF_ID}`, {
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
  const names = saved.nodes.map((n) => n.name)
  console.log(`\n✓ ${saved.name} | active: ${saved.active} | nodes: ${saved.nodes.length}`)
  console.log(`   عقد ماسنجر: ${[N.channelSwitch, N.pageSwitch, ...PAGES.map((p) => p.node), N.unknownPage].every((n) => names.includes(n))}`)
  console.log(`   النافذة ← قناة الرد: ${(saved.connections[N.inWindow]?.main?.[0] ?? []).map((l) => l.node).join('، ')}`)
}

await patch()
