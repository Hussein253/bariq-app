/**
 * قفل جلسة عالق يضيّع رسائل الزبون كلها (ماسنجر 2026-10-24، الزبون 27942467065427043):
 *
 *   انقطع الاتصال بـ OpenAI ثم بـ Supabase بنفس الدقيقة (التنفيذ 1584): الوكيل فشل فنزل لمسار الخطأ وأرسل اعتذار «صار خلل بسيط»، بس
 *   عقدة «Release Lock After Error» أخذت 21 ثانية ورجّعت {} (فشل بلا أثر)، فبقى customer_sessions.is_processing = true.
 *   بعدها كل رسالة من هالزبون (التنفيذ 1586: بصمة) توصل لـ «Continue After Debounce?» وتلكى isProcessing = true فتنقطع بلا رد ولا تسجيل
 *   (تمر على «Human Takeover?» وتنتهي). عقدة «Acquire Session Lock» عندها تجاوز للقفل القديم (أكثر من دقيقتين)، بس ما توصلها الرسالة أصلاً.
 *
 *   واتساب كان عنده الفحص بتعبير isProcessing بعقدة «Session Context» (القفل الأقدم من دقيقتين ما يُعدّ قفلاً)؛ ماسنجر وإنستغرام لا.
 *   هذا السكربت ينقل نفس التعبير لهم، فالقفل العالق يتحرر ذاتياً بعد دقيقتين بدل ما يبقى للأبد. نفس عتبة Acquire Session Lock بالضبط.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/stale-session-lock.mjs messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/stale-session-lock.mjs messenger instagram   # يتحقق من المواضع وما يرسل شي
 * آمن للتكرار (واتساب مزيود أصلاً). يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
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

const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', context: 'Session Context' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', context: 'Session Context' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', context: 'سياق الجلسة' },
}

// نفس تعبير واتساب: قفل أقدم من دقيقتين (updated_at يتحدّث بـ Acquire Session Lock) ما يوقف الرسالة
const STALE_AWARE = "={{ ($json.is_processing === true || $json.is_processing === 'true') && !($json.updated_at && DateTime.fromISO(String($json.updated_at)) < $now.minus({ minutes: 2 })) }}"
const MARKER = '$now.minus({ minutes: 2 })'

const api = async (p, init) => {
  const res = await fetch(`${API}${p}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${p} → ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

const patch = async (channel) => {
  const c = CHANNELS[channel]
  const wf = await api(`/workflows/${c.id}`)
  const node = wf.nodes.find((x) => x.name === c.context)
  if (!node) throw new Error(`ماكو عقدة باسم ${c.context} بمسار ${channel}`)
  const assign = node.parameters.assignments.assignments.find((a) => a.name === 'isProcessing')
  if (!assign) throw new Error(`ماكو حقل isProcessing بعقدة ${c.context} (${channel})`)

  if (String(assign.value).includes(MARKER)) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  const backup = path.join(HERE, 'backups', `${channel}-${c.id}-before-stale-session-lock.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  console.log(`${DRY ? '[DRY] ' : ''}${channel}: راح يتغيّر — isProcessing بعقدة ${c.context} يتجاهل القفل الأقدم من دقيقتين`)
  if (DRY) return
  assign.value = STALE_AWARE

  const saved = await api(`/workflows/${c.id}`, {
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
  const sv = saved.nodes.find((x) => x.name === c.context).parameters.assignments.assignments.find((a) => a.name === 'isProcessing')
  console.log(`✓ ${channel} (${saved.name}) | active: ${saved.active} | الفحص موجود: ${String(sv.value).includes(MARKER)}`)
}

const targets = process.argv.slice(2)
if (!targets.length) throw new Error(`حدّد القناة: ${Object.keys(CHANNELS).join(' أو ')}`)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join('، ')})`)
  await patch(t)
}
