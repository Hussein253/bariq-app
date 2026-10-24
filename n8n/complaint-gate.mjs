/**
 * تحويل المحادثة لموظف بإنذار كاذب (ماسنجر 2026-10-24، التنفيذ 1573، الزبون سأل «رايد قطعه من منتجكم» جواباً لسؤال البوت عن المنتج):
 *
 *   فاحص الشكاوى (نموذج) فهم «قطعة» كأنها قطعة غيار وصنّفها other_complaint (ثقة medium)، فاستبدلت «Complaint Guard» رد الوكيل
 *   السليم («تدلل… شكم وحدة تريد؟») برسالة اعتذار ثابتة «حقك علينا، وآسفين على هالإزعاج… الموضوع تحوّل لموظف الدعم»، وحطّت
 *   human_takeover=true وbot_active=false بجلسة الزبون وبمحادثته ببرق: البوت سكت عن الزبون كله، وطلعت إشعار شكوى للتاجر.
 *   (ورسالة الاعتذار الثابتة نفسها هي «الرد المكرر» الي يطلع بكل تحويل: نفس الجملة حرفياً.)
 *
 *   مسحنا 249 تنفيذاً بالقنوات الثلاث: 5 تحويلات من الفاحص، وكلها خاطئة (1573 وشوكت يوصل؟ وألو موجود؟ وحبيبي مرتضى ومنو وياي)،
 *   ثلاثة منها انسدّت قبل بحارس wants_human. فالإصلاح من أربع جهات:
 *     ١. سياق الفاحص: «orderingNow» ما كانت تعرف إن البوت سأل «شنو المنتج / شكم وحدة؟» (ORDER_CUES ما فيها هالصيغ).
 *     ٢. برومت الفاحص: فقرة تقول إن طلب الشراء «رايد قطعة / وحدة / قطعتين» ما هو شكوى أبداً («قطعة» = وحدة).
 *     ٣. حارس حتمي بعقدة «Complaint Hint»: شكوى بغير wants_human لازم بكلام الزبون نفسه كلمة شكوى (n8n/complaint-cues.js)، وإلا
 *        ما يوقّف البوت والرد يبقى للوكيل (التقرير يبقى بـ complaintCheck.heldBack للمراجعة). الوكيل يقدر يحوّل بسطره بنفسه.
 *     ٤. تنظيف جلسة الزبون الي انحبست بالخطأ (تنفَّذ يدوياً بالقاعدة، مو من هنا).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/complaint-gate.mjs messenger whatsapp instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/complaint-gate.mjs messenger whatsapp instagram   # يتحقق من المواضع وما يرسل شي
 * آمن للتكرار. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPLAINT_CUE_WORDS } from './complaint-cues.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'
if (!KEY) {
  console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
  process.exit(1)
}

const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', build: 'Build Complaint Check', hint: 'Complaint Hint' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', build: 'Build Complaint Check', hint: 'Complaint Hint' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', build: 'تجهيز فحص الشكوى', hint: 'تلميح الشكوى' },
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

const swap = (text, from, to, label) => {
  const parts = text.split(from)
  if (parts.length !== 2) throw new Error(`[${label}] لازم يتطابق مرة وحدة، تطابق ${parts.length - 1}`)
  return parts.join(to)
}

// ————— ١. سياق الفاحص + ٢. برومته (عقدة Build Complaint Check) —————

const CUES_FROM = 'const ORDER_CUES = /طلب[كچ] (?:هس[ةه] )?صار|'
const CUES_TO = 'const ORDER_CUES = /شكم وحدة|شنو المنتج|يا منتج|طلب[كچ] (?:هس[ةه] )?صار|'
const CUES_MARKER = 'شكم وحدة|شنو المنتج|يا منتج'
// ردّ الاستلام الأولي «تم عزيزي، تم تأكيد طلبك… ونعتمد عنوانك السابق بـ … لو تغير؟» ما بيه «طلبك هسة صار»، فبدون هالإشارتين
// الفاحص يظن البوت مو بنص طلب وجواب الزبون («نفسه»، «لا غيّر») يتصنّف غلط.
const CUES2_FROM = 'const ORDER_CUES = /شكم وحدة|'
const CUES2_TO = 'const ORDER_CUES = /تم تأكيد طلب[كچ]|عنوان[كچ] السابق|شكم وحدة|'
const CUES2_MARKER = 'تم تأكيد طلب[كچ]'
// النسخة الي نزلت قبل (كانت «تم حجز طلبك»): تنبدّل بالحي
const CUES2_OLD = 'تم حجز طلب[كچ]|'

const ORDER_BULLET = '- asking to place, confirm or book an order ("أريد تثبيت الطلب", "ثبتلي الطلب", "احجزلي", "قم بتثبيت الطلب"), or giving their name when the bot asked for it, with or without a warm word ("حبيبي", "عزيزي", "أخوي", "غالي")'
const BUY_BULLET = ORDER_BULLET
  + '\n- asking to buy a product or a quantity, including with the word "قطعة" (in shop talk it means one unit, never a spare part): "رايد قطعه من منتجكم", "اريد وحدة", "اريد قطعتين", "اريد حبة". A purchase request is never a complaint, even when it comes right after a message about prices or the bot\'s question about the product. "قطعة" points at a problem only when the customer also says something is broken, missing, wrong or damaged.'
const BUY_MARKER = 'never a spare part'

// ————— ٣. حارس حتمي (عقدة Complaint Hint) —————

const GATE_ANCHOR = "  heldBack = 'the customer never asked for a person in their own words; a presence check such as «ألو، موجود؟» is not a handoff';\n}"
const GATE_MARKER = 'COMPLAINT_WORDS'
const gateCode = () => `${GATE_ANCHOR}
// A complaint the classifier alone found must show a complaint word in the customer's own message (n8n/complaint-cues.js).
// Messenger 2026-10-24: «رايد قطعه من منتجكم» (answering the bot's question) was read as a spare-part complaint and the bot
// went silent for that customer; all 5 classifier handoffs found in 249 executions were false alarms. A held-back decision
// stays in complaintCheck.heldBack for staff review, and the agent can still hand off by itself with NOTIFICATION_TYPE: complaint.
const COMPLAINT_WORDS = ${JSON.stringify(COMPLAINT_CUE_WORDS)};
const normCue = (s) => String(s ?? '').replace(/\\p{M}/gu, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
if (handoff && ok && answer.category !== 'wants_human' && !new RegExp(COMPLAINT_WORDS.join('|')).test(normCue(newMessages))) {
  handoff = false;
  heldBack = 'no complaint word in the customer message («' + String(answer.evidence || '').slice(0, 60) + '»); the classifier alone does not stop the chat, the agent answers normally';
}`

const patch = async (channel) => {
  const c = CHANNELS[channel]
  const wf = await api(`/workflows/${c.id}`)
  const pick = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بمسار ${channel}`)
    return n
  }

  const backup = path.join(HERE, 'backups', `${channel}-${c.id}-before-complaint-gate.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  const done = []
  const skipped = []
  const mark = (ok, label) => (ok ? done : skipped).push(label)

  const build = pick(c.build)
  let b = build.parameters.jsCode
  if (b.includes(CUES_MARKER)) {
    mark(false, 'ORDER_CUES (سياق الفاحص)')
  } else {
    b = swap(b, CUES_FROM, CUES_TO, `${channel}/order-cues`)
    mark(true, 'ORDER_CUES (سياق الفاحص)')
  }
  if (b.includes(CUES2_MARKER)) {
    mark(false, 'ORDER_CUES: «تم تأكيد طلبك» و«عنوانك السابق»')
  } else if (b.includes(CUES2_OLD)) {
    b = swap(b, CUES2_OLD, CUES2_MARKER + '|', `${channel}/order-cues-booked-rename`)
    mark(true, 'ORDER_CUES: «تم حجز طلبك» ← «تم تأكيد طلبك»')
  } else {
    b = swap(b, CUES2_FROM, CUES2_TO, `${channel}/order-cues-booked`)
    mark(true, 'ORDER_CUES: «تم تأكيد طلبك» و«عنوانك السابق»')
  }
  if (b.includes(BUY_MARKER)) {
    mark(false, 'فقرة «طلب الشراء مو شكوى» ببرومت الفاحص')
  } else {
    b = swap(b, ORDER_BULLET, BUY_BULLET, `${channel}/buy-bullet`)
    mark(true, 'فقرة «طلب الشراء مو شكوى» ببرومت الفاحص')
  }
  build.parameters.jsCode = b

  const hint = pick(c.hint)
  if (hint.parameters.jsCode.includes(GATE_MARKER)) {
    mark(false, 'حارس كلمة الشكوى')
  } else {
    hint.parameters.jsCode = swap(hint.parameters.jsCode, GATE_ANCHOR, gateCode(), `${channel}/gate`)
    mark(true, 'حارس كلمة الشكوى')
  }

  if (skipped.length) console.log(`— ${channel}: مزيود من قبل — ${skipped.join('، ')}`)
  if (!done.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}: راح ينزاد/يتغيّر — ${done.join('، ')}`)
  if (DRY) {
    if (process.env.DUMP) {
      fs.mkdirSync(process.env.DUMP, { recursive: true })
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-complaint-build.js`), build.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-complaint-hint.js`), hint.parameters.jsCode)
    }
    return
  }

  const saved = await api(`/workflows/${c.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: wf.settings ?? {},
      ...(wf.staticData ? { staticData: wf.staticData } : {}),
    }),
  })
  const sv = (n) => saved.nodes.find((x) => x.name === n)
  console.log(`\n✓ ${channel} (${saved.name}) | active: ${saved.active} | nodes: ${saved.nodes.length}`)
  console.log(`   ORDER_CUES فيها «شكم وحدة»: ${sv(c.build).parameters.jsCode.includes(CUES_MARKER)}`)
  console.log(`   فقرة الشراء ببرومت الفاحص: ${sv(c.build).parameters.jsCode.includes(BUY_MARKER)}`)
  console.log(`   حارس كلمة الشكوى بـ ${c.hint}: ${sv(c.hint).parameters.jsCode.includes(GATE_MARKER)}`)
}

const targets = process.argv.slice(2)
if (!targets.length) throw new Error(`حدّد القناة: ${Object.keys(CHANNELS).join(' أو ')}`)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join('، ')})`)
  await patch(t)
}
