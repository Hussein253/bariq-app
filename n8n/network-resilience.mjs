/**
 * انقطاعات شبكة مؤقتة (OpenAI/Supabase/Meta بنفس الدقيقة) كانت تضيّع رسالة الزبون أو تخرّب رد اللوحة (ماسنجر 2026-10-24):
 *
 *   ١. التنفيذ 1933 («بيها احجام؟»): عقدة «Mark as Processed» (insert بـ processed_messages) أخذت 99.8 ثانية ثم فشلت بـ
 *      duplicate key. أول محاولة وصلت للقاعدة فعلاً (created_at بعد 1.3 ثانية من بداية التنفيذ) بس ردّها ضاع بالشبكة، فأعادت العقدة المحاولة
 *      (retryOnFail) وانضربت بالمفتاح الأساسي: الرسالة انقطعت بلا رد. فحص «Check Already Processed» اللي قبلها هو حارس التكرار الحقيقي،
 *      والعلامة بعد الفحص تسجيل بس: بلا إعادة محاولة (إعادة insert ما تنفع، ونجاحها الأول مضمون ضمنياً) وفشلها ما يوقف الرسالة
 *      (onError: continueRegularOutput). الطلبات المتزامنة المكررة يمسكها قفل الجلسة (Acquire Session Lock) بعدين.
 *      (إنستغرام عنده مسار خطأ مخصص «تجاهل الحدث المكرر»، ما انلمس.)
 *
 *   ٢. التنفيذ 1935 (رد اللوحة لماسنجر): عقدة الإرسال انتظرت 15 ثانية نفس مهلة التطبيق (sendDashboardReply)، فالتطبيق يقطع قبل ما يوصله رد 502
 *      بسبب الفشل. مهلة n8n تنزل لـ 10 ثواني حتى يوصل سبب الفشل للوحة («n8n 502: messenger_send_failed») والموظف يعيد الإرسال بنفسه
 *      (بدون إعادة محاولة تلقائية: ممكن الرسالة الأولى وصلت وتنكرر للزبون).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/network-resilience.mjs
 *   DRY=1 N8N_KEY=<api key> node n8n/network-resilience.mjs     # يتحقق من المواضع وما يرسل شي
 * آمن للتكرار. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
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

const TARGETS = [
  { channel: 'messenger', id: 'GP0rtSxxEHWT3kLj', mark: 'Mark as Processed' },
  { channel: 'whatsapp', id: 'i3fCYtVjPHtqvXvm', mark: 'Mark as Processed' },
]
const DASHBOARD = { channel: 'dashboard-reply', id: 'Bg1y71DM0Bi16pbB', senders: ['إرسال ماسنجر (ستايل بغداد)', 'إرسال ماسنجر (المميز)'], timeoutMs: 10000 }

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
  const file = path.join(HERE, 'backups', `${label}-${wf.id}-before-network-resilience.json`)
  if (!DRY && !fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(wf, null, 2))
}

const patchMark = async ({ channel, id, mark }) => {
  const wf = await api(`/workflows/${id}`)
  const node = wf.nodes.find((n) => n.name === mark)
  if (!node) throw new Error(`ماكو عقدة باسم ${mark} بمسار ${channel}`)
  if (node.retryOnFail === false && node.onError === 'continueRegularOutput') {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}: ${mark} ← بلا إعادة محاولة، وفشلها ما يوقف الرسالة (كان retry=${node.retryOnFail} onError=${node.onError ?? '-'})`)
  if (DRY) return
  backup(wf, channel)
  node.retryOnFail = false
  node.onError = 'continueRegularOutput'
  delete node.maxTries
  delete node.waitBetweenTries
  const saved = await save(wf)
  const sv = saved.nodes.find((n) => n.name === mark)
  console.log(`✓ ${channel} | active: ${saved.active} | retryOnFail: ${sv.retryOnFail} | onError: ${sv.onError}`)
}

const patchDashboard = async ({ channel, id, senders, timeoutMs }) => {
  const wf = await api(`/workflows/${id}`)
  const nodes = senders.map((name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بمسار ${channel}`)
    return n
  })
  const pending = nodes.filter((n) => n.parameters.options?.timeout !== timeoutMs)
  if (!pending.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}: مهلة الإرسال ← ${timeoutMs} مللي ثانية (${pending.map((n) => n.name).join('، ')})`)
  if (DRY) return
  backup(wf, channel)
  for (const n of pending) n.parameters.options = { ...(n.parameters.options ?? {}), timeout: timeoutMs }
  const saved = await save(wf)
  console.log(`✓ ${channel} | active: ${saved.active} | المهلة: ${senders.map((s) => saved.nodes.find((x) => x.name === s).parameters.options.timeout).join('، ')}`)
}

for (const t of TARGETS) await patchMark(t)
await patchDashboard(DASHBOARD)
