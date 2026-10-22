/**
 * يصلّح مشكلتين بمسارات البوت الحية بـ n8n (ماسنجر وواتساب وإنستغرام)، طلعن بمحادثة ماسنجر
 * 2026-10-22 (الزبون 28960616086881740):
 *
 *   ١. الحجز يضيع: الزبون سأل عن المنتجات، البوت كله «عدنا غسالة أوتوماتيك أل جي»، وبعدين كال «ثبتلي الطلب».
 *      البوت طلب منه الاسم والعنوان والرقم، وبعد ما انطاه إياهن رد: «طلبك هسة صار جاهز، لكن أحتاج تفاصيل الطلب
 *      مثل المنتج والعدد». يعني أخذ كل شي إلا الطلب نفسه. السبب: ماكو ولا بند محفوظ بـ session_data (السلة ظلت {})،
 *      والرسالة الي بيها «قم بتثبيت الطلب غسالة أوتوماتيك LG 8 كيلو» وصلت والبوت موقوف (تحويل لموظف)، فانحذفت من
 *      البفر وما دخلت ذاكرة الوكيل أبداً.
 *      العلاج: عقدة «سياق الطلب» قبل الوكيل — تمشّي ويا البرومت رسائل الزبون الأخيرة من conversation_log
 *      (فالخيط ما ينقطع بإيقاف أو فجوة)، وإذا بيّن إن اكو طلب جاري وماكو بند محفوظ، تخلي الوكيل يسأل عن المنتج
 *      والعدد بس ويخزنهن قبل أي معلومة توصيل. ويا قواعد بنفس المعنى ببرومت الوكيل وبفحص ما قبل الإرسال.
 *
 *   ٢. «هل أنتم موجود؟» يحوّل لموظف: فاحص الشكاوى صنّف «ألو هل أنتم موجود أريد تثبيت الطلب» (وقبلها «حبيبي مرتضى»)
 *      wants_human، فحارس الشكوى بدّل رد الوكيل بـ «المحادثة تحوّلت لموظف الدعم» ووقف المحادثة بنص الطلب.
 *      العلاج: الفاحص انلزم إن سؤال «اكو أحد؟» مو طلب موظف، وزيادة عليه حارس حتمي بعقدة تلميح الشكوى يرفض تحويل
 *      wants_human إذا الزبون ما ذكر بكلامه موظف أو إنسان أو إدارة…، وقسم ببرومت الوكيل يخليه يجاوب «إي موجود»
 *      ويكمّل من وين وقفوا.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/fix-order-context-and-presence.mjs            # الثلاثة
 *   N8N_KEY=<api key> node n8n/fix-order-context-and-presence.mjs messenger  # قناة وحدة
 *
 * آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل، وكود العقدة ينبني دائماً من n8n/order-context-hint.js فتعديل
 * المصدر يوصل بإعادة التشغيل. يسحب نسخة طرية من n8n قبل كل تعديل ويحفظ نسخة «قبل» مرة وحدة بـ n8n/backups،
 * فما يرجّع أي تعديل ثاني تم بالواجهة.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
if (!KEY) {
  console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
  process.exit(1)
}

// أسماء العقد تختلف بين المسارات (إنستغرام كله عربي)، وعدد فحوصات «قبل الإرسال» يختلف أيضاً.
// itemsAnchor: آخر سطر بقسم «قواعد حمراء» الي ينضاف وراه — واتساب يختلف لأن رقم الزبون يجي من المنصة.
const MERCHANT_SECTION = "{{ $('تحديد التاجر').first().json.merchant_section }}"
const CHECK_TAIL = 'إذا رسالة الزبون تحية بس: الرد ترحيب و«شلون أكدر أساعدك اليوم؟»، بدون «شلونك؟».'
const ITEMS_ANCHOR_META =
  '- ممنوع تكتب الملخص أو "أثبّتلك الطلب؟" إذا الزبون ما كتب رقم هاتف صحيح بالمحادثة. إذا ناقص، اطلبه وحده وبوضوح.'

const CHANNELS = {
  messenger: {
    id: 'GP0rtSxxEHWT3kLj',
    agent: 'Iraqi Store AI Agent',
    hint: 'Complaint Hint',
    build: 'Build Complaint Check',
    prompt: 'Build User Prompt',
    recent: 'Load Recent Customer Messages',
    node: 'Order Context Hint',
    itemsAnchor: ITEMS_ANCHOR_META,
    lastCheck: 15,
  },
  whatsapp: {
    id: 'i3fCYtVjPHtqvXvm',
    agent: 'Iraqi Store AI Agent',
    hint: 'Complaint Hint',
    build: 'Build Complaint Check',
    prompt: 'Build User Prompt',
    recent: 'Load Recent Customer Messages',
    node: 'Order Context Hint',
    itemsAnchor:
      '- إذا الزبون كتب رقم تواصل ثاني ناقص أو غلط، ممنوع تكتب الملخص أو "أثبّتلك الطلب؟" قبل ما تنبّهه وتاخذ منه الرقم الصحيح (أو يكتفي برقم الواتساب).',
    lastCheck: 17,
  },
  instagram: {
    id: 'CTuJ0eGVthUjREVJ',
    agent: 'وكيل المبيعات (علاء)',
    hint: 'تلميح الشكوى',
    build: 'تجهيز فحص الشكوى',
    prompt: 'تجهيز رسالة الوكيل',
    recent: 'تحميل رسائل الزبون السابقة',
    node: 'سياق الطلب',
    itemsAnchor: ITEMS_ANCHOR_META,
    lastCheck: 15,
  },
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

// ————— ١. نصوص برومت الوكيل —————

const ITEMS_BEFORE_ADDRESS = `
- ممنوع تطلب الاسم أو العنوان أو رقم الهاتف أو أي معلومة توصيل، وممنوع تكتب «طلبك هسة صار» أو «طلبك جاهز»، قبل ما تتحدد بنود الطلب (المنتج والعدد، واللون والقياس إذا للمنتج لون وقياس). إذا الزبون كال «ثبتلي الطلب» أو «اريد أطلب» وبنود الطلب مو معروفة، ردك سؤال واحد عن البنود بس: «تدلل، يا منتج تريد وشكم وحدة؟» — وإذا سمّى المنتج قبل بالمحادثة أعد اسمه عليه واسأله عن العدد بس، وإذا المتجر عنده منتج واحد سمّيه واسأل عن العدد.
- ممنوع بنفس الرد تطلب العنوان أو تعيده أو تكتب «طلبك هسة صار» وتقول «أحتاج تفاصيل الطلب» أو «شنو المنتج»: إذا البنود مو معروفة، الرد سؤال عن المنتج والعدد بس، بدون أي معلومة توصيل.
- بعد ما يتحدد البند خزّنه فوراً بـ update_session_data قبل ما تطلب أي معلومة توصيل، حتى ما يضيع الطلب إذا انقطعت المحادثة.`

const PRESENCE_ANCHOR = '# اللهجة والأسلوب'

const PRESENCE_SECTION = `# إذا سأل الزبون «اكو أحد؟»
- إذا الزبون يتأكد إذا اكو أحد يرد عليه (ألو، موجود؟، هل أنت موجود؟، هل أنتم موجودين؟، اكو أحد؟، تسمعني؟، ترد عليّ؟، وينكم؟، شنو صار؟، ما ترد؟): ابدي ردك بإنك موجود بجملة قصيرة مثل «إي موجود عيني» أو «إي موجود، تدلل»، وبعدها كمّل بنفس الرد من وين وقفتوا أو جاوب على سؤاله.
- هذا السؤال مو طلب تحويل لموظف: ممنوع تحوّله لموظف وممنوع تكتب NOTIFICATION_TYPE: complaint بسببه. التحويل بس إذا طلب موظف أو إنسان أو الإدارة بصراحة، أو عنده شكوى.
- إذا سأل «اكو أحد؟» ويا طلب (مثل «ألو موجود؟ أريد تثبيت الطلب»)، جاوب إنك موجود وكمّل بطلبه بنفس الرد.
- نفس الشي إذا كتب اسمه بس أو كلمة ودّ (حبيبي، عزيزي، أخوي، غالي): هذا مو طلب موظف، استلم المعلومة وكمّل.

`

const checksFor = (n) => ({
  anchor: `${n}. ${CHECK_TAIL}${MERCHANT_SECTION}`,
  text: `${n}. ${CHECK_TAIL}
${n + 1}. إذا بالرد طلب للاسم أو العنوان أو رقم الهاتف، أو عبارة «طلبك هسة صار»: لازم بنود الطلب معروفة ومكتوبة بالرد (المنتج والعدد). إذا مو معروفة، شيل كل هذا وخلي الرد سؤال واحد عن المنتج والعدد.
${n + 2}. إذا الزبون سأل إذا اكو أحد (ألو، موجود؟، ترد عليّ؟): الرد يبدي بإنك موجود، وبدون أي تحويل لموظف.${MERCHANT_SECTION}`,
})

// ————— ٢. فاحص الشكاوى: «اكو أحد؟» مو wants_human —————

const CLASSIFIER_WANTS_HUMAN_ANCHOR =
  '- wants_human: asks for a person, staff, the owner or management, or says they do not want to talk to a bot ("أريد أحچي ويا موظف", "حولني على الإدارة", "ما أريد روبوت")'

const CLASSIFIER_WANTS_HUMAN =
  '- wants_human: asks in their own words for a person, staff, the owner or management, or says they do not want to talk to a bot ("أريد أحچي ويا موظف", "حولني على الإدارة", "ما أريد روبوت"). The customer has to ask for a human: checking that someone is there, or being impatient for an answer, is not this.'

const CLASSIFIER_NOT_ANCHOR =
  '- praise or thanks after delivery ("وصلني الطلب حلو كلش"), greetings, small talk'

const CLASSIFIER_NOT = `- praise or thanks after delivery ("وصلني الطلب حلو كلش"), greetings, small talk
- checking that someone is there or that the chat is alive ("ألو", "موجود؟", "هل أنت موجود؟", "هل أنتم موجودين؟", "اكو أحد؟", "تسمعني؟", "ترد عليّ؟", "وينكم؟", "شنو صار؟", "ما ترد؟"), on its own or together with an order request ("ألو موجود؟ أريد تثبيت الطلب"). The bot answers that it is there and carries on, so this is never wants_human.
- asking to place, confirm or book an order ("أريد تثبيت الطلب", "ثبتلي الطلب", "احجزلي", "قم بتثبيت الطلب"), or giving their name when the bot asked for it, with or without a warm word ("حبيبي", "عزيزي", "أخوي", "غالي")`

// ————— ٣. كود العقدة والحارس، مولّدين من n8n/order-context-hint.js (المصدر المختبَر) —————

const MODULE = fs.readFileSync(path.join(HERE, 'order-context-hint.js'), 'utf8')

// نفس التعبير المستعمل بالاختبارات، ينقرا من المصدر حتى ما ينفرز نسختين منه
const ASKS_LINE = (MODULE.match(/^export const ASKS_FOR_HUMAN = .*$/m) ?? [])[0]?.replace(/^export /, '')
if (!ASKS_LINE) throw new Error('ما لگيت ASKS_FOR_HUMAN بـ n8n/order-context-hint.js')

const nodeCode = (c) => MODULE.replace(/^export /gm, '').trimEnd() + `

// ---- n8n: المدخلات من عقد هذا المسار (مولّد من n8n/order-context-hint.js — لا تعدّل هنا) ----
const NODES = ${JSON.stringify({ prompt: c.prompt, recent: c.recent })};
const j = $json;
const base = (() => { try { return $(NODES.prompt).first().json || {}; } catch (e) { return {}; } })();
const recent = (() => {
  try { return $(NODES.recent).all().map((i) => String((i.json || {}).message_text || '')); } catch (e) { return []; }
})();
try {
  const res = orderContextHint({
    combinedMessage: base.combinedMessage,
    sessionData: base.sessionData,
    recentMessages: recent,
    orderingNow: (j.complaintCheck || {}).ordering_now === true,
  });
  return [{ json: { ...j, userPrompt: String(j.userPrompt || '') + res.hint, orderContext: res.orderContext }, pairedItem: { item: 0 } }];
} catch (e) {
  // التنبيه ما يوقف الرد أبداً: أي خطأ هنا يمرّر البرومت مثل ما هو ويُسجَّل السبب
  return [{ json: { ...j, orderContext: { error: String((e && e.message) || e) } }, pairedItem: { item: 0 } }];
}
`

const GUARD_ANCHOR = '\nconst errorText = (() => {'

const guardFor = (c) => String.raw`
// «ألو، موجود؟»، «حبيبي مرتضى»: the classifier sometimes reads a presence check, or a warm word, as a request for a
// person, and the chat stops dead in the middle of an order (Messenger, 2026-10-22). A wants_human handoff now needs
// the customer's own words to name a person or refuse the bot; otherwise it is held back and the agent answers that
// it is there and carries on (see the «اكو أحد؟» section of its prompt). Real complaints are untouched.
const bareText = (s) => String(s ?? '').replace(/\p{M}/gu, '');
const newMessages = (() => { try { return bareText($('` + c.prompt + String.raw`').first().json.combinedMessage); } catch (e) { return ''; } })();
` + ASKS_LINE + String.raw`
if (handoff && ok && answer.category === 'wants_human' && !ASKS_FOR_HUMAN.test(newMessages)) {
  handoff = false;
  heldBack = 'the customer never asked for a person in their own words; a presence check such as «ألو، موجود؟» is not a handoff';
}
const errorText = (() => {`

// ————— التنفيذ —————

const patch = async (channel) => {
  const c = CHANNELS[channel]
  const wf = await api(`/workflows/${c.id}`)
  const pick = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بمسار ${channel}`)
    return n
  }

  // النسخة «قبل» تنكتب مرة وحدة: إعادة التشغيل ما تدوسها بنسخة بعد التعديل
  const backup = path.join(HERE, 'backups', `${channel}-${c.id}-before-order-context.json`)
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  const agent = pick(c.agent)
  const hint = pick(c.hint)
  const build = pick(c.build)
  pick(c.prompt)
  pick(c.recent)
  const done = []
  const skipped = []

  // برومت الوكيل
  let sys = agent.parameters.options.systemMessage
  if (sys.includes('ممنوع تطلب الاسم أو العنوان أو رقم الهاتف أو أي معلومة توصيل')) {
    skipped.push('قاعدة البنود قبل العنوان')
  } else {
    sys = swap(sys, c.itemsAnchor, c.itemsAnchor + ITEMS_BEFORE_ADDRESS, `${channel}/prompt-items`)
    done.push('قاعدة البنود قبل العنوان')
  }
  if (sys.includes('# إذا سأل الزبون «اكو أحد؟»')) {
    skipped.push('قسم «اكو أحد؟»')
  } else {
    sys = swap(sys, PRESENCE_ANCHOR, PRESENCE_SECTION + PRESENCE_ANCHOR, `${channel}/prompt-presence`)
    done.push('قسم «اكو أحد؟»')
  }
  const checks = checksFor(c.lastCheck)
  if (sys.includes(`${c.lastCheck + 2}. إذا الزبون سأل إذا اكو أحد`)) {
    skipped.push('فحوصات ما قبل الإرسال')
  } else {
    sys = swap(sys, checks.anchor, checks.text, `${channel}/prompt-checks`)
    done.push(`فحصي ${c.lastCheck + 1} و${c.lastCheck + 2}`)
  }
  agent.parameters.options.systemMessage = sys

  // فاحص الشكاوى
  let code = build.parameters.jsCode
  if (code.includes('checking that someone is there or that the chat is alive')) {
    skipped.push('برومت الفاحص')
  } else {
    code = swap(code, CLASSIFIER_WANTS_HUMAN_ANCHOR, CLASSIFIER_WANTS_HUMAN, `${channel}/classifier-wants_human`)
    code = swap(code, CLASSIFIER_NOT_ANCHOR, CLASSIFIER_NOT, `${channel}/classifier-not`)
    done.push('برومت الفاحص')
  }
  build.parameters.jsCode = code

  // الحارس الحتمي
  let hintCode = hint.parameters.jsCode
  if (hintCode.includes('ASKS_FOR_HUMAN')) {
    skipped.push('حارس wants_human')
  } else {
    hintCode = swap(hintCode, GUARD_ANCHOR, guardFor(c), `${channel}/hint-guard`)
    done.push('حارس wants_human')
  }
  hint.parameters.jsCode = hintCode

  // عقدة سياق الطلب — كودها ينبني دائماً من المصدر، فتعديل المصدر يوصل بإعادة التشغيل
  const code2 = nodeCode(c)
  const existing = wf.nodes.find((n) => n.name === c.node)
  if (existing) {
    if (existing.parameters.jsCode === code2) {
      skipped.push(`عقدة ${c.node}`)
    } else {
      existing.parameters.jsCode = code2
      done.push(`تحديث كود ${c.node}`)
    }
  } else {
    wf.nodes.push({
      parameters: { jsCode: code2 },
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [hint.position[0] - 384, hint.position[1]],
      id: crypto.randomUUID(),
      name: c.node,
    })
    const out = wf.connections[c.hint].main[0]
    const i = out.findIndex((x) => x.node === c.agent)
    if (i < 0) throw new Error(`[${channel}] ${c.hint} ما يوصل للوكيل، المسار تغيّر`)
    out[i] = { node: c.node, type: 'main', index: 0 }
    wf.connections[c.node] = { main: [[{ node: c.agent, type: 'main', index: 0 }]] }
    done.push(`عقدة ${c.node}`)
  }

  if (skipped.length) console.log(`— ${channel}: مزيود من قبل — ${skipped.join('، ')}`)
  if (!done.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
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
  console.log(`   انزاد: ${done.join('، ')}`)
  console.log(`   قسم «اكو أحد؟»: ${savedSys.includes('# إذا سأل الزبون «اكو أحد؟»')}`)
  console.log(`   البنود قبل العنوان: ${savedSys.includes('ممنوع تطلب الاسم أو العنوان أو رقم الهاتف أو أي معلومة توصيل')}`)
  console.log(`   فحص ${c.lastCheck + 2}: ${savedSys.includes(`${c.lastCheck + 2}. إذا الزبون سأل إذا اكو أحد`)}`)
  console.log(`   برومت الفاحص: ${sv(c.build).parameters.jsCode.includes('checking that someone is there')}`)
  console.log(`   حارس wants_human: ${sv(c.hint).parameters.jsCode.includes('ASKS_FOR_HUMAN')}`)
  console.log(`   ${c.node} → ${JSON.stringify(saved.connections[c.node]?.main?.[0]?.map((x) => x.node))}`)
}

const targets = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHANNELS)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join('، ')})`)
  await patch(t)
}
