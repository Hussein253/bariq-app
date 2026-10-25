/**
 * فحص نافذة 24 ساعة ينتقل من مسار «رد اللوحة» إلى التطبيق (ماسنجر 2026-10-25، التنفيذ 1946):
 *
 *   رد الموظف «مرحبا شلون اساعدك» دخل n8n طبيعي، بس عقدة «فحص نافذة 24 ساعة» (Postgres) علقت 21 ثانية
 *   وانقطعت (Connection timed out — جهاز n8n يتقطع اتصاله بـ Supabase سيدني)، ثم الإرسال لفيسبوك 10 ثواني
 *   وانقطع. المجموع 31 ثانية والتطبيق ينتظر 15: الفقاعة بقت بلا أثر للفشل والزبون ما استلم شي.
 *
 *   هسه التطبيق يفحص النافذة بنفس الاستعلام (lib/message-delivery-server.ts) قبل ما يستدعي n8n، ويرسل
 *   بس داخلها. فالمسار يصير: السر ← البيانات ← قناة الرد ← الإرسال، بلا أي اتصال بقاعدة البيانات، وأطول
 *   شي فيه مهلة إرسال Meta (10 ثواني لماسنجر) — أقل من مهلة التطبيق (15).
 *
 *   ينشال: «فحص نافذة 24 ساعة»، «داخل نافذة 24 ساعة؟»، «رفض: خارج نافذة 24 ساعة» (409).
 *   «البيانات صالحة؟» (صح) ← «قناة الرد» مباشرة.
 *
 * ⚠️ الترتيب: شغّله بعد ما ينشر Vercel نسخة التطبيق الي تفحص النافذة. قبلها ماكو فحص بأي مكان،
 *    وواتساب يقبل رد خارج النافذة ثم يسقطه بصمت.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/dashboard-reply-app-window.mjs
 *   DRY=1 N8N_KEY=<api key> node n8n/dashboard-reply-app-window.mjs     # يتحقق من المواضع وما يرسل شي
 * آمن للتكرار. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups (نقطة الرجوع، مو versionId).
 */
import fs from 'node:fs'
import path from 'node:path'
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
const N = {
  valid: 'البيانات صالحة؟',
  windowCheck: 'فحص نافذة 24 ساعة',
  inWindow: 'داخل نافذة 24 ساعة؟',
  outside: 'رفض: خارج نافذة 24 ساعة',
  channelSwitch: 'قناة الرد',
  note: 'Sticky Note c2e25631',
  checkGroup: 'التحقق من الطلب',
}
const REMOVED = [N.windowCheck, N.inWindow, N.outside]
const CHECK_GROUP_DESCRIPTION = 'يرفض بـ 401 بلا سر، و400 لبيانات خاطئة. نافذة 24 ساعة يفحصها التطبيق قبل ما يرسل هنا'

const NOTE = '## رد اللوحة → واتساب وماسنجر\nيستقبل ردود الموظفين من لوحة برق (N8N_WEBHOOK_URL) ويرسلها للزبون: channel = whatsapp أو messenger.\n\n- السر: ترويسة Authorization: Bearer <BARIQ_N8N_OUTBOUND_SECRET>. المسار يحفظ بصمة SHA-256 للسر فقط، لا السر نفسه.\n- واتساب: account_external_id فارغ = الرقم القديم 1245317385330588 (المتجر الأول).\n- ماسنجر: account_external_id (معرّف الصفحة) إلزامي ومن الصفحتين المعروفتين، والإرسال بتوكن الصفحة عبر Graph API /me/messages.\n- نافذة 24 ساعة: يفحصها التطبيق (lib/message-delivery-server.ts) ويرسل هنا بس داخلها. المسار ما يتصل بقاعدة البيانات: اتصال هالجهاز بـ Supabase يتقطع (التنفيذ 1946).\n- لا إعادة محاولة تلقائية: الفشل يرجع 502 فيظهر على فقاعة الرد بزر «إعادة الإرسال» بدل رسالة مكررة للزبون.\n- العقد الكامل: docs/n8n-dashboard-reply.md'

const api = async (p, init) => {
  const res = await fetch(`${API}${p}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${p} → ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

const patch = async () => {
  const wf = await api(`/workflows/${WF_ID}`)
  const has = (name) => wf.nodes.find((x) => x.name === name)
  if (!has(N.valid) || !has(N.channelSwitch)) throw new Error('ماكو عقدتا «البيانات صالحة؟» و«قناة الرد» — المسار تغيّر، راجعه يدوياً')
  const done = []

  const backup = path.join(HERE, 'backups', `dashboard-reply-${WF_ID}-before-app-window.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  // ١. البيانات صالحة؟ (صح) ← قناة الرد مباشرة
  const validOut = (wf.connections[N.valid] ??= { main: [] }).main
  const trueOut = validOut[0] ?? []
  if (trueOut.length !== 1 || trueOut[0].node !== N.channelSwitch) {
    validOut[0] = [{ node: N.channelSwitch, type: 'main', index: 0 }]
    done.push('البيانات صالحة؟ ← قناة الرد')
  }

  // ٢. شيل عقد النافذة وروابطها ومجموعتها
  const removedNodes = wf.nodes.filter((n) => REMOVED.includes(n.name))
  const removedIds = removedNodes.map((n) => n.id)
  if (removedIds.length) {
    wf.nodes = wf.nodes.filter((n) => !REMOVED.includes(n.name))
    for (const name of REMOVED) delete wf.connections[name]
    for (const g of wf.nodeGroups ?? []) g.nodeIds = g.nodeIds.filter((id) => !removedIds.includes(id))
    done.push(`انشالت: ${removedNodes.map((n) => n.name).join('، ')}`)
  }
  // ما يبقى رابط لعقدة انشالت
  for (const conn of Object.values(wf.connections)) {
    for (const [i, outs] of (conn.main ?? []).entries()) conn.main[i] = (outs ?? []).filter((l) => !REMOVED.includes(l.node))
  }

  // ٣. وصف مجموعة التحقق والملاحظة
  const group = (wf.nodeGroups ?? []).find((g) => g.name === N.checkGroup)
  if (group && group.description !== CHECK_GROUP_DESCRIPTION) {
    group.description = CHECK_GROUP_DESCRIPTION
    done.push('وصف مجموعة «التحقق من الطلب»')
  }
  const note = has(N.note)
  if (note && note.parameters.content !== NOTE) {
    note.parameters.content = NOTE
    done.push('ملاحظة المسار')
  }

  if (!done.length) {
    console.log('— كل شي مزيود من قبل، ما أرسلت شي')
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}راح يتغيّر — ${done.join('، ')}`)
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
  console.log(`\n✓ ${saved.name} | active: ${saved.active} | nodes: ${saved.nodes.length} | versionId: ${saved.versionId} | activeVersionId: ${saved.activeVersionId}`)
  console.log(`   عقد النافذة باقية: ${REMOVED.filter((n) => names.includes(n)).join('، ') || 'لا'}`)
  console.log(`   البيانات صالحة؟ ← ${(saved.connections[N.valid]?.main?.[0] ?? []).map((l) => l.node).join('، ')}`)
}

await patch()
