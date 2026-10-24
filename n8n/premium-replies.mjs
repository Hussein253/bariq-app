/**
 * رد البوت بمستوى أرقى — ثلاث ملاحظات طلعن من تتبع بصمة ماسنجر 2026-10-24 (التنفيذ 864، الزبون سأل «عندك منتجات غسالة؟»):
 *
 *   ١. الاستفسار جواب وبس: البوت كتب «عدنا غسالة… تمام هيج؟» ثم «ونعتمد عنوانك السابق بـ … لو تغير؟»، يعني عامل السؤال طلب
 *      وكشف عنوان طلب سابق. الإصلاح بثلاث طبقات: تنبيه أخير بعقدة «سياق الطلب» (isBrowsing بـ n8n/order-context-hint.js)،
 *      سطر بقسم «جاوب على قد السؤال» ببرومت الوكيل، وحذف حتمي بعقدة الحارس (n8n/order-pushing.js) مع إرجاع STAGE لـ 1.
 *
 *   ٢. دمج التفريغات: برومت «Prepare Reconcile» (n8n/reconcile-prompt.mjs): المعنى أول ثم الأصوات، المحرك الي كتب أكثر ما يتشال
 *      كلامه، وتحية Whisper المخترعة تتشال (التنفيذ 611 ضيّع «كم توصيل للعامرية»). انقاس على 12 عيّنة حقيقية بتكرار 4–6 مرات
 *      بـ reasoning_effort: low (متوسط يوصل 7–31 ثانية، فما اعتمدناه).
 *
 *      وبصمة 1156 («شكد سعر الغسالة؟ وأكو ديسكاونت على السعر؟») ضاع ذيلها عند الدمج: n8n/stt-prompt.mjs (برومت التفريغ) وقاعدة «لا ترمي جملة
 *      لأنها مشوّشة» بالدمج، وSKIP لكلمات السعر حتى ما تصير «منطقة» كاذبة.
 *
 *   ٣. مؤشر «يكتب…»: ينرسل sender_action: typing_on من أول المسار، بعد «Upsert Customer Session» (الي يرجّع صف الجلسة بـ human_takeover)
 *      وبوابة «Typing Allowed?» تمنعه بوضع الموظف. كان بعد الـ debounce (الثانية 22 من 39 ببصمة)، فنقلناه حتى يبدي بالثانية ~17.
 *      الفرع الجديد فوق «Keep Phone After Upsert» بالواجهة لأن n8n (executionOrder v1) ينفّذ الفرع الأعلى أول، وانفحصت بمسار مؤقت.
 *      كل عقدة إرسال بيها onError: continueRegularOutput وtimeout 3 ثواني، فأي فشل ما يوقف الرد. التكلفة 1.5–2.8 ثانية ببداية الرد.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/premium-replies.mjs messenger
 *   DRY=1 N8N_KEY=<api key> node n8n/premium-replies.mjs messenger           # يتحقق من المواضع وما يرسل شي
 *   DRY=1 DUMP=<مجلد> ...                                                      # ويكتب الأكواد المعدّلة هناك
 *
 * آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل، وكتلة order-pushing بعقدة الحارس وكود «سياق الطلب» ينبنون دائماً من المصدر
 * المختبَر. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups. يعتمد على direct-voice-reply.mjs (جملة stripVoiceAck بعقدة الحارس).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { nodeCode } from './order-context-node.mjs'
import { patchPrepareReconcile, RECONCILE_MARKER } from './reconcile-prompt.mjs'
import { patchVoiceContext, STT_MARKER } from './stt-prompt.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'
if (!KEY) {
  console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
  process.exit(1)
}

const CHANNELS = {
  messenger: {
    id: 'GP0rtSxxEHWT3kLj',
    agent: 'Iraqi Store AI Agent',
    guard: 'Voice Confirm Guard',
    orderNode: 'Order Context Hint',
    orderCtx: { prompt: 'Build User Prompt', recent: 'Load Recent Customer Messages', bot: 'Load Recent Bot Replies' },
    reconcile: 'Prepare Reconcile',
    stt: 'Voice Context',
    typing: {
      after: 'Upsert Customer Session', // يرجّع صف الجلسة (فيه human_takeover) من أول الطريق، بعد حفظ رسالة الزبون بالبفر
      before: 'Keep Phone After Upsert', // التالي بالمسار الرئيسي؛ بوابة المؤشر لازم تكون فوقه بالواجهة حتى تنفّذ أول
      legacyGate: 'Continue After Debounce?', // مكان المؤشر بالنسخة الأولى (بعد الـ debounce): نشيله منه
      gateTemplate: 'Continue After Debounce?', // نسخ هيكل عقدة IF منها
      pageSwitch: 'اختيار توكن الصفحة', // قواعده تفرّق الصفحتين بـ phoneNumberId؛ ننسخها
      pageIdFrom: "$('Message Data').first().json.phone",
      senders: [
        { name: 'Typing On (ستايل بغداد)', cloneFrom: 'Send Messenger Reply' },
        { name: 'Typing On (المميز)', cloneFrom: 'Send Messenger Reply (المميز)' },
      ],
    },
  },
  // واتساب: نفس أسماء ماسنجر. مؤشر «يكتب…» ما ينزاد هنا (واتساب Cloud API يحتاج message_id وstatus=read، مو sender_action)
  whatsapp: {
    id: 'i3fCYtVjPHtqvXvm',
    agent: 'Iraqi Store AI Agent',
    guard: 'Voice Confirm Guard',
    orderNode: 'Order Context Hint',
    orderCtx: { prompt: 'Build User Prompt', recent: 'Load Recent Customer Messages', bot: 'Load Recent Bot Replies' },
    reconcile: 'Prepare Reconcile',
    stt: 'Voice Context',
    typing: null,
  },
  // إنستغرام: نفس المنطق بأسماء عقد عربية. مؤشر الكتابة يتأجل (القنوات الثلاث تتقاس بعد ما يتحدد مكانه الأنسب بماسنجر)
  instagram: {
    id: 'CTuJ0eGVthUjREVJ',
    agent: 'وكيل المبيعات (علاء)',
    guard: 'ضمان تأكيد الصوت',
    orderNode: 'سياق الطلب',
    orderMode: 'legacy', // كود «سياق الطلب» هناك نسخة أقدم (بلا confirmedOnce) وبرومته بلا قسم «التأكيد مرة وحدة»: ننزّل isBrowsing بس، ما نبنيه من المصدر
    orderCtx: { prompt: 'تجهيز رسالة الوكيل', recent: 'تحميل رسائل الزبون السابقة', bot: 'تحميل ردود البوت الأخيرة' },
    reconcile: 'تجهيز دمج التفريغات',
    stt: 'سياق الصوت',
    typing: null,
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

// ————— ١. برومت الوكيل —————

const BROWSE_ANCHOR = '- سؤال عن المنتجات أو الأسعار: اعرض المتوفر وسعر القطعة وبس، وخلي الزبون يكمّل هو.'
const BROWSE_MARKER = 'سؤال عن توفر منتج أو سعره أو الدوام أو التوصيل مو طلب'
const BROWSE_LINE = BROWSE_ANCHOR
  + '\n- سؤال عن توفر منتج أو سعره أو الدوام أو التوصيل مو طلب: جاوب بجملة أو جملتين (المتوفر وسعره من get_available_products)، بدون «تمام هيج؟» وبدون «ما عندك شي ثاني تحب تضيفه؟» وبدون عنوان أو اسم من طلب سابق. هذي كلها تبدي بس بعد ما يكول الزبون إنه يريد يطلب.'

const SINGLE_MARKER = 'إذا قائمة «منتجات المتجر هسة» فوق فيها منتج واحد بس'
const SINGLE_ANCHOR = 'هذي كلها تبدي بس بعد ما يكول الزبون إنه يريد يطلب.'
const SINGLE_LINE = SINGLE_ANCHOR
  + '\n- ' + SINGLE_MARKER + ': ممنوع تسأل «شنو المنتج» أو «يا منتج» (هذا يلغي جملة «تدلل، يا منتج تريد وشكم وحدة؟» بالقواعد الحمراء) وممنوع تحچي كأن اكو منتجات متعددة («عدنا منتجات»)؛ الزبون يقصد هذا المنتج دائماً. أكّد اسمه واسأل عن العدد بس.'

// ————— ٢. عقدة الحارس —————

const PUSH_BEGIN = '// >>> order-pushing (مولّد من n8n/order-pushing.js — لا تعدّل هنا)'
const PUSH_END = '// <<< order-pushing'
const ACK_CALL = 'if (voice) text = stripVoiceAck(text); // جملة «وصلتني البصمة» تنشال قبل باقي فحوص الحارس' // من direct-voice-reply.mjs
const ASK_OLD = 'if (voice && stage !== 0 && stage !== 1) {'
const ASK_NEW = 'if (voice && !browsing && stage !== 0 && stage !== 1) {'
const pushCall = (c) => `const browsing = (() => { try { return $('${c.orderNode}').first().json.orderContext.browsing === true; } catch (e) { return false; } })();\n`
  + 'if (browsing) text = stripOrderPushing(text); // استفسار بس: جواب وبس، بدون «تمام هيج؟» وعنوان سابق'

const SINGLE_BEGIN = '// >>> single-product (مولّد من n8n/single-product.js — لا تعدّل هنا)'
const SINGLE_END = '// <<< single-product'
const singleCall = () => "const singleProduct = (() => { try { const l = String($('تحديد التاجر').first().json.product_names || '').split('،').map((x) => x.trim()).filter(Boolean); return l.length === 1 ? l[0] : ''; } catch (e) { return ''; } })();\n"
  + 'if (singleProduct) text = fixSingleProductAsk(text, singleProduct); // منتج واحد بالمتجر: ما نسأل «شنو المنتج»'

const singleBlock = () => {
  const src = fs.readFileSync(path.join(HERE, 'single-product.js'), 'utf8').replace(/^export /gm, '').trimEnd()
  return `${SINGLE_BEGIN}\n${src}\n${SINGLE_END}\n`
}

const pushBlock = () => {
  const src = fs.readFileSync(path.join(HERE, 'order-pushing.js'), 'utf8').replace(/^export /gm, '').trimEnd()
  return `${PUSH_BEGIN}\n${src}\n${PUSH_END}\n`
}

const patchGuard = (code, c, label) => {
  let out = code
  const b = out.indexOf(PUSH_BEGIN)
  if (b >= 0) {
    const e = out.indexOf(PUSH_END, b)
    if (e < 0) throw new Error(`[${label}] كتلة order-pushing بدون نهاية`)
    out = out.slice(0, b) + out.slice(e + PUSH_END.length).replace(/^\n/, '')
  }
  out = out.split(`${pushCall(c)}\n`).join('')
  out = out.split(ASK_NEW).join(ASK_OLD)
  if (!out.includes(ACK_CALL)) throw new Error(`[${label}] ما لگيت نداء stripVoiceAck؛ شغّل direct-voice-reply.mjs أول`)
  // كتلة المنتج الوحيد ونداؤها: تنشال القديمة (إذا موجودة) وتنحقن من جديد
  const sb = out.indexOf(SINGLE_BEGIN)
  if (sb >= 0) {
    const se = out.indexOf(SINGLE_END, sb)
    if (se < 0) throw new Error(`[${label}] كتلة single-product بدون نهاية`)
    out = out.slice(0, sb) + out.slice(se + SINGLE_END.length).replace(/^\n/, '')
  }
  out = out.split(`${singleCall()}\n`).join('')
  out = swap(out, ACK_CALL, `${pushCall(c)}\n${singleCall()}\n${ACK_CALL}`, `${label}/push-call`)
  out = swap(out, ASK_OLD, ASK_NEW, `${label}/ask-gate`)
  return singleBlock() + pushBlock() + out
}

// ————— ٣. مؤشر «يكتب…» —————

const TYPING_BODY = (idExpr) => `={{ JSON.stringify({ recipient: { id: ${idExpr} }, sender_action: 'typing_on' }) }}`

const GATE_NAME = 'Typing Allowed?'
const SWITCH_NAME = 'Typing Page?'
// صف الجلسة من الـ Upsert: human_takeover بوليان (أو نص «true» مثل ما يقرأه Session Context)
const GATE_EXPR = "={{ !($json.human_takeover === true || $json.human_takeover === 'true') }}"

/** @returns {string[]} التعديلات الي صارت (فاضية = المسار مرتب من قبل) */
const addTyping = (wf, c, label) => {
  const t = c.typing
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`[${label}] ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.find((x) => x.name === name)
  const changes = []
  const samePos = (a, b) => a && b && a[0] === b[0] && a[1] === b[1]
  const place = (node, pos) => { if (!samePos(node.position, pos)) { node.position = pos; changes.push(`موضع ${node.name}`) } }
  const hasLink = (from, outIdx, to) => ((wf.connections[from]?.main ?? [])[outIdx] ?? []).some((l) => l.node === to)

  const before = by(t.before)
  by(t.after) // يتأكد إنها موجودة
  const [bx, by0] = before.position
  const gateY = by0 - 300 // فوق «before» بالواجهة: n8n ينفّذ الفرع الأعلى أول (مفحوص بمسار مؤقت)

  // بوابة: ما نرسل «يكتب…» إلا إذا الجلسة مو بوضع موظف (نفس شرط humanTakeover بـ Session Context)
  let gate = has(GATE_NAME)
  if (!gate) {
    const tpl = by(t.gateTemplate)
    gate = {
      id: crypto.randomUUID(),
      name: GATE_NAME,
      type: tpl.type,
      typeVersion: tpl.typeVersion,
      position: [bx, gateY],
      parameters: JSON.parse(JSON.stringify(tpl.parameters)),
    }
    gate.parameters.conditions.conditions = [{
      id: 'typing-allowed',
      leftValue: GATE_EXPR,
      operator: { type: 'boolean', operation: 'true', singleValue: true },
    }]
    wf.nodes.push(gate)
    changes.push('بوابة المؤشر')
  }
  place(gate, [bx, gateY])

  // اختيار الصفحة وعقدتا الإرسال (إذا موجودات من النسخة الأولى نعيد تموضعها بس)
  let sw = has(SWITCH_NAME)
  if (!sw) {
    const pageSwitch = by(t.pageSwitch)
    sw = {
      id: crypto.randomUUID(),
      name: SWITCH_NAME,
      type: pageSwitch.type,
      typeVersion: pageSwitch.typeVersion,
      position: [bx + 300, gateY],
      parameters: { ...JSON.parse(JSON.stringify(pageSwitch.parameters)), options: {} }, // بدون مخرج «صفحة بلا توكن»
    }
    wf.nodes.push(sw)
    changes.push('اختيار صفحة المؤشر')
  }
  place(sw, [bx + 300, gateY])
  t.senders.forEach((s, i) => {
    let node = has(s.name)
    if (!node) {
      const src = by(s.cloneFrom)
      node = {
        id: crypto.randomUUID(),
        name: s.name,
        type: src.type,
        typeVersion: src.typeVersion,
        position: [bx + 600, gateY - 60 + i * 120],
        credentials: JSON.parse(JSON.stringify(src.credentials)),
        onError: 'continueRegularOutput', // فشل المؤشر ما يوقف الرد
        parameters: {
          method: 'POST',
          url: src.parameters.url,
          authentication: 'predefinedCredentialType',
          nodeCredentialType: src.parameters.nodeCredentialType,
          sendBody: true,
          specifyBody: 'json',
          jsonBody: TYPING_BODY(t.pageIdFrom),
          options: { timeout: 3000 },
        },
      }
      wf.nodes.push(node)
      changes.push(s.name)
    }
    place(node, [bx + 600, gateY - 60 + i * 120])
  })

  // الوصلات: Upsert → [بوابة، المسار الرئيسي]، بوابة(صح) → اختيار الصفحة → عقدتا الإرسال
  if (!hasLink(t.after, 0, GATE_NAME)) {
    ;(wf.connections[t.after].main[0] ??= []).unshift({ node: GATE_NAME, type: 'main', index: 0 })
    changes.push(`وصلة ${t.after} ← بوابة المؤشر`)
  }
  if (!hasLink(GATE_NAME, 0, SWITCH_NAME)) {
    wf.connections[GATE_NAME] = { main: [[{ node: SWITCH_NAME, type: 'main', index: 0 }]] }
    changes.push('وصلة البوابة ← اختيار الصفحة')
  }
  t.senders.forEach((s, i) => {
    if (!hasLink(SWITCH_NAME, i, s.name)) {
      wf.connections[SWITCH_NAME] ??= { main: [] }
      wf.connections[SWITCH_NAME].main[i] = [{ node: s.name, type: 'main', index: 0 }]
      changes.push(`وصلة اختيار الصفحة ← ${s.name}`)
    }
  })
  // النسخة الأولى كانت بعد الـ debounce: تنشال من هناك حتى ما ينرسل المؤشر مرتين
  const legacy = wf.connections[t.legacyGate]?.main?.[0]
  if (legacy && legacy.some((l) => l.node === SWITCH_NAME)) {
    wf.connections[t.legacyGate].main[0] = legacy.filter((l) => l.node !== SWITCH_NAME)
    changes.push(`شيل المؤشر من ${t.legacyGate}`)
  }
  return changes
}


// ————— سياق الطلب (إنستغرام): نسخة أقدم من المصدر، فنحقن isBrowsing بدل ما نبني العقدة من جديد —————

const BROWSE_BEGIN = '// >>> browsing (مولّد من n8n/order-context-hint.js — لا تعدّل هنا)'
const BROWSE_END = '// <<< browsing'
const LEGACY_HEADER = "function orderContextHint({ combinedMessage = '', sessionData = null, recentMessages = [], orderingNow = false } = {}) {"
const LEGACY_HEADER_NEW = "function orderContextHint({ combinedMessage = '', sessionData = null, recentMessages = [], orderingNow = false, botReplies = [], productNames = '' } = {}) {"
const LEGACY_RETURN ='  return { hint, orderContext: { itemsKnown: cart.length > 0, needsItems, askedToOrder, history: earlier.length } };'
const LEGACY_RETURN_NEW = [
  "  const browsing = isBrowsing({ message: combinedMessage, cartLength: cart.length, orderingNow, askedToOrder, confirmed: false, lastBotReply: Array.isArray(botReplies) ? botReplies[0] : '' });",
  '  if (browsing) hint += BROWSING_HINT;',
  '',
  '  hint += singleProductNote({ productNames, message: combinedMessage, needsItems, askedToOrder, orderingNow });',
  '',
  '  return { hint, orderContext: { itemsKnown: cart.length > 0, needsItems, askedToOrder, browsing, singleProduct: singleProductOf(productNames), history: earlier.length } };',
].join('\n')
const LEGACY_CALL = '    orderingNow: (j.complaintCheck || {}).ordering_now === true,\n  });'
const LEGACY_CALL_NEW = '    orderingNow: (j.complaintCheck || {}).ordering_now === true,\n    botReplies,\n    productNames,\n  });'
const LEGACY_TRY = 'try {\n  const res = orderContextHint({'
const BOT_READ = [
  "const productNames = (() => { try { return String($(NODES.merchant).first().json.product_names || ''); } catch (e) { return ''; } })();",
  'const botReplies = (() => {',
  '  try {',
  '    let r = $(NODES.bot).first().json.replies;',
  "    if (typeof r === 'string') r = JSON.parse(r);",
  "    return Array.isArray(r) ? r.map((x) => String(x || '')) : [];",
  '  } catch (e) { return []; }',
  '})();',
  '',
].join('\n')
const DEF_NORM = "const norm = (s) => bare(s).toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');\n\n"

const browsingBlock = () => {
  const src = fs.readFileSync(path.join(HERE, 'order-context-hint.js'), 'utf8')
  const a = src.indexOf('// <browsing>')
  const b = src.indexOf('// </single-product>')
  if (a < 0 || b < 0) throw new Error('ما لگيت علامتي <browsing>/<single-product> بـ order-context-hint.js')
  const body = src.slice(a + '// <browsing>'.length, b).replace(/^export /gm, '').trim()
  return `${BROWSE_BEGIN}\n${body}\n${BROWSE_END}\n\n`
}

const patchLegacyOrderNode = (code, c, label) => {
  let out = code
  const b = out.indexOf(BROWSE_BEGIN)
  if (b >= 0) {
    const e = out.indexOf(BROWSE_END, b)
    if (e < 0) throw new Error(`[${label}] كتلة browsing بدون نهاية`)
    out = out.slice(0, b) + out.slice(e + BROWSE_END.length).replace(/^\n+/, '')
  }
  // الكتلة قبل تعليق JSDoc الي فوق الدالة (و«norm» إذا هالنسخة القديمة ما عندها)
  const fn = out.indexOf(out.includes(LEGACY_HEADER_NEW) ? LEGACY_HEADER_NEW : LEGACY_HEADER)
  if (fn < 0) throw new Error(`[${label}] ما لگيت ترويسة orderContextHint`)
  const doc = out.lastIndexOf('/**', fn)
  out = out.slice(0, doc) + (/const norm = /.test(out) ? '' : DEF_NORM) + browsingBlock() + out.slice(doc)
  if (!out.includes(LEGACY_HEADER_NEW)) out = swap(out, LEGACY_HEADER, LEGACY_HEADER_NEW, `${label}/header`)
  if (!out.includes('const browsing = isBrowsing(')) out = swap(out, LEGACY_RETURN, LEGACY_RETURN_NEW, `${label}/return`)
  if (!out.includes('"bot":')) {
    const from = `const NODES = ${JSON.stringify({ prompt: c.orderCtx.prompt, recent: c.orderCtx.recent })};`
    out = swap(out, from, `const NODES = ${JSON.stringify({ ...c.orderCtx, merchant: 'تحديد التاجر' })};`, `${label}/nodes`)
  }
  if (!out.includes('const botReplies = (() => {')) out = swap(out, LEGACY_TRY, BOT_READ + LEGACY_TRY, `${label}/bot-read`)
  if (!out.includes('    botReplies,\n  });')) out = swap(out, LEGACY_CALL, LEGACY_CALL_NEW, `${label}/call`)
  return out
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

  const backup = path.join(HERE, 'backups', `${channel}-${c.id}-before-premium-replies.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  // برومتا الدمج والتفريغ ينبنون دائماً من نسخة «قبل» (مو من الحي) حتى كل تحديث للتعديلات يمشي بدل ما يوقفه الـ marker القديم
  const before = fs.existsSync(backup) ? JSON.parse(fs.readFileSync(backup, 'utf8')) : wf
  const baseCode = (name) => {
    const n = before.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بنسخة «قبل» لمسار ${channel}`)
    return n.parameters.jsCode
  }

  const done = []
  const skipped = []
  const mark = (ok, label) => (ok ? done : skipped).push(label)

  // برومت الوكيل
  const agent = pick(c.agent)
  let sys = agent.parameters.options.systemMessage
  if (sys.includes(BROWSE_MARKER)) {
    mark(false, 'سطر الاستفسار ببرومت الوكيل')
  } else {
    sys = swap(sys, BROWSE_ANCHOR, BROWSE_LINE, `${channel}/browse-line`)
    mark(true, 'سطر الاستفسار ببرومت الوكيل')
  }
  if (sys.includes(SINGLE_MARKER)) {
    mark(false, 'سطر المنتج الوحيد ببرومت الوكيل')
  } else {
    sys = swap(sys, SINGLE_ANCHOR, SINGLE_LINE, `${channel}/single-line`)
    mark(true, 'سطر المنتج الوحيد ببرومت الوكيل')
  }
  agent.parameters.options.systemMessage = sys

  // سياق الطلب: الكود ينبني دائماً من المصدر المختبَر
  const order = pick(c.orderNode)
  const orderCode = c.orderMode === 'legacy' ? patchLegacyOrderNode(baseCode(c.orderNode), c, `${channel}/order`) : nodeCode(c.orderCtx)
  if (order.parameters.jsCode === orderCode) {
    mark(false, `كود ${c.orderNode}`)
  } else {
    order.parameters.jsCode = orderCode
    mark(true, `كود ${c.orderNode} (isBrowsing)`)
  }

  // الحارس
  const guard = pick(c.guard)
  const guardCode = patchGuard(baseCode(c.guard), c, `${channel}/guard`)
  if (guardCode === guard.parameters.jsCode) {
    mark(false, `كود ${c.guard}`)
  } else {
    guard.parameters.jsCode = guardCode
    mark(true, `كود ${c.guard} (stripOrderPushing)`)
  }

  // دمج التفريغات
  const rec = pick(c.reconcile)
  const recCode = patchPrepareReconcile(baseCode(c.reconcile))
  if (recCode === rec.parameters.jsCode) {
    mark(false, `برومت ${c.reconcile}`)
  } else {
    rec.parameters.jsCode = recCode
    mark(true, `برومت ${c.reconcile}`)
  }

  // برومت التفريغ
  const stt = pick(c.stt)
  const sttCode = patchVoiceContext(baseCode(c.stt))
  if (sttCode === stt.parameters.jsCode) {
    mark(false, `برومت ${c.stt}`)
  } else {
    stt.parameters.jsCode = sttCode
    mark(true, `برومت ${c.stt} (مفردات الاستفسار + سطر المواضيع)`)
  }

  // مؤشر الكتابة
  if (c.typing) {
    const typingChanges = addTyping(wf, c, channel)
    mark(typingChanges.length > 0, `مؤشر «يكتب…» بعد الحفظ (${typingChanges.length ? typingChanges.join('، ') : 'مرتب'})`)
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
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-guard.js`), guard.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-order-hint.js`), order.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-reconcile.js`), rec.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-stt.js`), stt.parameters.jsCode)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-system.txt`), sys)
      fs.writeFileSync(path.join(process.env.DUMP, `${channel}-workflow.json`), JSON.stringify({ nodes: wf.nodes, connections: wf.connections }, null, 1))
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
  console.log(`   سطر الاستفسار ببرومت الوكيل: ${sv(c.agent).parameters.options.systemMessage.includes(BROWSE_MARKER)}`)
  console.log(`   كود ${c.orderNode} فيه isBrowsing: ${sv(c.orderNode).parameters.jsCode.includes('function isBrowsing')}`)
  console.log(`   كود ${c.guard} فيه stripOrderPushing ومناداته: ${sv(c.guard).parameters.jsCode.includes('function stripOrderPushing') && sv(c.guard).parameters.jsCode.includes(ASK_NEW)}`)
  console.log(`   برومت ${c.reconcile} الجديد: ${sv(c.reconcile).parameters.jsCode.includes(RECONCILE_MARKER)}`)
  console.log(`   برومت ${c.stt} الجديد: ${sv(c.stt).parameters.jsCode.includes(STT_MARKER)}`)
  if (c.typing) {
    const t = c.typing
    const out0 = (name) => ((saved.connections[name]?.main ?? [])[0] ?? []).map((x) => x.node)
    const y = (name) => sv(name).position[1]
    console.log(`   مؤشر الكتابة: وصلات ${t.after}: ${out0(t.after).join(' ، ')} | بوابة ← ${out0(GATE_NAME).join(' ، ')}`)
    console.log(`   البوابة فوق «${t.before}» بالواجهة: ${y(GATE_NAME) < y(t.before)} | ما بقى مؤشر بـ ${t.legacyGate}: ${!out0(t.legacyGate).includes(SWITCH_NAME)}`)
  }
}

const targets = process.argv.slice(2)
if (!targets.length) throw new Error(`حدّد القناة: ${Object.keys(CHANNELS).join(' أو ')}`)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join('، ')})`)
  await patch(t)
}
