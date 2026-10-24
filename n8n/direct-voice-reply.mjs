/**
 * رد البوت على البصمة يبدي بالجواب نفسه، من دون «وصلتني البصمة، تسأل عن …» (محادثة 2026-10-24: الزبون سأل بالبصمة
 * عن المنتجات وأيام الدوام، والرد بدا بـ «وصلتني البصمة، تسأل عن المنتجات وشنو أيام الدوام» وبان جاف).
 * وإذا شي ما وضح بالبصمة، البوت يطلب من الزبون بلطف واحترام يكتبه كتابة.
 *
 * ثلاث طبقات (البرومت وحده ما يكفي: النموذج يرجع يكتب جملة الاستلام أحياناً):
 *   ١. برومت الوكيل: قسم «الرد على البصمة»، ومثال سؤال التوضيح بأسلوب أدفأ، وفحص قبل الإرسال.
 *   ٢. عقدة «Voice Check»: تنبيه آخر البرومت يبدّل «اكتب قبله سطر إن الاسم والعنوان وصلت بالصوت» بمنع جملة الاستلام.
 *   ٣. عقدة «Voice Confirm Guard»: بعد رد الوكيل تنشال جملة الاستلام حتميّاً (n8n/voice-ack.js → stripVoiceAck).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/direct-voice-reply.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/direct-voice-reply.mjs whatsapp messenger instagram   # يتحقق من المواضع وما يرسل شي
 *
 * إنستغرام نفس المنطق بأسماء عقد عربية: وكيل المبيعات (علاء)، فحص الرسالة الصوتية، ضمان تأكيد الصوت.
 * آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل، وكتلة voice-ack ببداية عقدة الحارس تنبني دائماً من المصدر المختبَر.
 * يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
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
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent', check: 'Voice Check', guard: 'Voice Confirm Guard' },
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent', check: 'Voice Check', guard: 'Voice Confirm Guard' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', agent: 'وكيل المبيعات (علاء)', check: 'فحص الرسالة الصوتية', guard: 'ضمان تأكيد الصوت' },
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

// ————— ١. برومت الوكيل —————

const SECTION_TITLE = '# الرد على البصمة (الرسالة الصوتية)'
const SECTION_ANCHOR = '# رسالة مو مفهومة'
const SECTION = `${SECTION_TITLE}
- جاوب على كلام الزبون بالبصمة مباشرة، مثل لو كتبه كتابة. ممنوع تذكر إن البصمة وصلتك أو إنك سمعتها أو استلمتها: ماكو «وصلتني البصمة» ولا «وصلتني الرسالة الصوتية» ولا «سمعت بصمتك» ولا «استلمت الفويس»، وممنوع تعيد سؤاله عليه («تسأل عن…»، «تريد…»). ردك يبدي بالجواب نفسه.
  مثال: الزبون سأل بالبصمة عن المنتجات وأيام الدوام → «عدنا غسالة أوتوماتيك ال جي 8 كيلو. دوامنا من السبت للخميس من 10 ص لحد 11 م.» (مو «وصلتني البصمة، تسأل عن المنتجات وأيام الدوام…»).
- إذا شي ما وضح بالبصمة (كلمة، اسم، رقم، منطقة، أو الطلب كله) لا تخمّنه: اطلب منه بلطف واحترام يوضحه كتابة، واذكر الجزء المو واضح بس. إذا جزء من البصمة واضح جاوب عليه أول، وبعدها اسأل عن المو واضح.
  مثال لجزء مو واضح: «عذراً منك عيني، الجزء الأخير من البصمة ما وضح عندي زين. لو تتكرم تكتبه كتابة حتى أخدمك بدقة؟»
  مثال إذا البصمة كلها ما وضحت: «عذراً منك عيني، البصمة ما وضحت عندي زين. لو تتكرم تكتبلي طلبك أو سؤالك كتابة حتى أخدمك بدقة؟»
  للزبونة: «لو تتكرمين وتكتبين…». بدون ✅ وبدون «تمام هيج؟» بهالرد.
- معلومات الطلب الي تجي بالبصمة (الاسم، العنوان، الرقم، البنود) تنعاد على الزبون وتنتأكد مثل ما موضح بقسم «تأكيد الطلب ويا الزبون»، بس بدون جملة «وصلتني البصمة» ولا «وصلني … بالصوت» قبلها.

`

const UNCLEAR_FROM = '«البصمة ما وضحت عندي زين، وصلتني «هاي ضرغام». شنو تقصد بيها؟ إذا اسم منطقة اكتبها كتابة.»'
const UNCLEAR_TO = '«عذراً منك عيني، البصمة ما وضحت عندي زين، وكلمة «هاي ضرغام» ما فهمتها. لو تتكرم تكتبلي شنو تقصد كتابة حتى أخدمك بدقة؟» (وللزبونة: لو تتكرمين وتكتبيلي). بأسلوب لطيف ومحترم، بدون ✅ وبدون 🌷.'

const CHECKS_TITLE = '# فحص قبل الإرسال'
const CHECK_MARKER = 'ماكو بالرد «وصلتني البصمة»'
const checkItem = (n) =>
  `${n}. إذا رسالة الزبون بصمة: ${CHECK_MARKER} ولا «وصلتني الرسالة الصوتية» ولا «سمعت» ولا «استلمت» ولا إعادة لسؤاله («تسأل عن…»)؛ الرد يبدي بالجواب نفسه. وإذا شي ما وضح بالبصمة، اطلب منه بلطف واحترام يكتبه كتابة.`

// ————— ٢. عقدة Voice Check —————

const CHECK_FROM = ': اكتب قبله سطر واحد قصير إن الاسم والعنوان وصلت بالصوت وخلي يتأكد منها، بدون قائمة ثانية للاسم والعنوان قبل الملخص.]\''
const CHECK_TO = '، بدون سطر قبله يقول إن الاسم والعنوان وصلت بالصوت وبدون قائمة ثانية للاسم والعنوان قبل الملخص.\'\n'
  + '    + \' جاوب على كلام الزبون بالبصمة مباشرة وكأنه كاتبه: ممنوع «وصلتني البصمة» و«وصلتني الرسالة الصوتية» و«سمعت بصمتك» و«استلمت»، وممنوع تعيد سؤاله عليه («تسأل عن…»)؛ ردك يبدي بالجواب نفسه. وإذا شي ما وضح بالبصمة، لا تخمّنه: اطلب منه بلطف واحترام يوضحه كتابة، واذكر الجزء المو واضح بس.]\''
const CHECK_NODE_MARKER = 'ممنوع «وصلتني البصمة»'

// ————— ٣. عقدة Voice Confirm Guard —————

const ACK_BEGIN = '// >>> voice-ack (مولّد من n8n/voice-ack.js — لا تعدّل هنا)'
const ACK_END = '// <<< voice-ack'
const ACK_CALL = 'if (voice) text = stripVoiceAck(text); // جملة «وصلتني البصمة» تنشال قبل باقي فحوص الحارس'
const ACK_CALL_ANCHOR = "let text = String($json.output ?? '');"

const ackBlock = () => {
  const src = fs.readFileSync(path.join(HERE, 'voice-ack.js'), 'utf8').replace(/^export /gm, '').trimEnd()
  return `${ACK_BEGIN}\n${src}\n${ACK_END}\n`
}

/** @returns {string} كود الحارس بعد إدراج كتلة voice-ack ومناداتها (آمن للتكرار) */
const patchGuard = (code, label) => {
  let out = code
  const b = out.indexOf(ACK_BEGIN)
  if (b >= 0) {
    const e = out.indexOf(ACK_END, b)
    if (e < 0) throw new Error(`[${label}] كتلة voice-ack بدون نهاية`)
    out = out.slice(0, b) + out.slice(e + ACK_END.length).replace(/^\n/, '')
  }
  out = out.split(`\n${ACK_CALL}`).join('')
  out = swap(out, ACK_CALL_ANCHOR, `${ACK_CALL_ANCHOR}\n${ACK_CALL}`, `${label}/ack-call`)
  return ackBlock() + out
}

// ————— التنفيذ —————

const patch = async (channel) => {
  const c = CHANNELS[channel]
  const wf = await api(`/workflows/${c.id}`)
  const pick = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بمسار ${channel}`)
    return n
  }

  const backup = path.join(HERE, 'backups', `${channel}-${c.id}-before-direct-voice-reply.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  const done = []
  const skipped = []
  const mark = (ok, label) => (ok ? done : skipped).push(label)

  // برومت الوكيل
  const agent = pick(c.agent)
  let sys = agent.parameters.options.systemMessage

  if (sys.includes(SECTION_TITLE)) {
    mark(false, 'قسم الرد على البصمة')
  } else {
    sys = swap(sys, SECTION_ANCHOR, SECTION + SECTION_ANCHOR, `${channel}/section`)
    mark(true, 'قسم الرد على البصمة')
  }

  if (sys.includes('عذراً منك عيني، البصمة ما وضحت عندي زين، وكلمة')) {
    mark(false, 'مثال سؤال التوضيح')
  } else {
    sys = swap(sys, UNCLEAR_FROM, UNCLEAR_TO, `${channel}/unclear-example`)
    mark(true, 'مثال سؤال التوضيح')
  }

  if (sys.includes(CHECK_MARKER)) {
    mark(false, 'فحص قبل الإرسال')
  } else {
    // آخر فحص مرقّم بقسم «فحص قبل الإرسال» (القسم ينتهي بأول سطر فاضي)
    const t = sys.indexOf(CHECKS_TITLE)
    if (t < 0) throw new Error(`[${channel}] ما لگيت قسم ${CHECKS_TITLE}`)
    const end = sys.indexOf('\n\n', t)
    const stop = end < 0 ? sys.length : end
    const nums = [...sys.slice(t, stop).matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]))
    if (!nums.length) throw new Error(`[${channel}] ما لگيت فحوص مرقّمة بقسم ${CHECKS_TITLE}`)
    const n = Math.max(...nums) + 1
    sys = sys.slice(0, stop) + '\n' + checkItem(n) + sys.slice(stop)
    mark(true, `فحص ${n}`)
  }
  agent.parameters.options.systemMessage = sys

  // عقدة Voice Check
  const check = pick(c.check)
  if (check.parameters.jsCode.includes(CHECK_NODE_MARKER)) {
    mark(false, `تنبيه ${c.check}`)
  } else {
    check.parameters.jsCode = swap(check.parameters.jsCode, CHECK_FROM, CHECK_TO, `${channel}/voice-check`)
    mark(true, `تنبيه ${c.check}`)
  }

  // عقدة Voice Confirm Guard
  const guard = pick(c.guard)
  const guardCode = patchGuard(guard.parameters.jsCode, `${channel}/guard`)
  if (guardCode === guard.parameters.jsCode) {
    mark(false, `كود ${c.guard}`)
  } else {
    guard.parameters.jsCode = guardCode
    mark(true, `كود ${c.guard} (stripVoiceAck)`)
  }

  if (skipped.length) console.log(`— ${channel}: مزيود من قبل — ${skipped.join('، ')}`)
  if (!done.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}: راح ينزاد/يتغيّر — ${done.join('، ')}`)
  if (DRY) {
    // DUMP=<مجلد>: يكتب الأكواد والبرومت المعدّلة هناك حتى تنفحص (تشغيل الحارس بعيّنات) قبل ما تنرسل
    if (process.env.DUMP) {
      fs.mkdirSync(process.env.DUMP, { recursive: true })
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-guard.js`), guard.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-voice-check.js`), check.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-system.txt`), sys)
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
  const savedSys = sv(c.agent).parameters.options.systemMessage
  console.log(`\n✓ ${channel} (${saved.name}) | active: ${saved.active}`)
  console.log(`   قسم الرد على البصمة: ${savedSys.includes(SECTION_TITLE)}`)
  console.log(`   مثال التوضيح الجديد: ${savedSys.includes('عذراً منك عيني، البصمة ما وضحت عندي زين، وكلمة')}`)
  console.log(`   فحص قبل الإرسال: ${savedSys.includes(CHECK_MARKER)}`)
  console.log(`   تنبيه ${c.check}: ${sv(c.check).parameters.jsCode.includes(CHECK_NODE_MARKER)}`)
  console.log(`   كود ${c.guard} فيه stripVoiceAck ومناداته: ${sv(c.guard).parameters.jsCode.includes('function stripVoiceAck') && sv(c.guard).parameters.jsCode.includes(ACK_CALL)}`)
}

const targets = process.argv.slice(2)
if (!targets.length) throw new Error(`حدّد القناة: ${Object.keys(CHANNELS).join(' أو ')}`)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join('، ')})`)
  await patch(t)
}
