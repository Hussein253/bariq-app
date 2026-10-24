/**
 * يصلّح ثلاث مشاكل طلعن بمحادثة ماسنجر 2026-10-22 الساعة 12:08–12:12 (الزبون 28960616086881740، الطلبان 42 و43):
 *
 *   ١. السعر المخصوم يرجع للأصلي: البوت كال «297,500 بعد خصم 15% + توصيل = 300,500»، والزبون كال «ثبت»، ورسالة
 *      التثبيت طلعت «353,000». السبب مو النموذج بس: مُحفِّز order_items (ترحيل ٠٢٣) يفرض سعر الكتالوج على كل بند
 *      ويمحو الخصم. الإصلاح بالقاعدة (supabase/migrations/029_first_order_discount.sql)، وهنا نمرّر نسبة الخصم
 *      لـ create_order بحقل ثابت (مو من النموذج) ونخلي رسالة التثبيت تنقل أرقام الطلب من القاعدة.
 *
 *   ٢. التأكيد مرتين: البوت عرض المبلغ الكلي، الزبون كال «اوك ثبت طلب»، فرجع البوت يطلب تأكيد ثاني. التنبيه الحتمي
 *      بعقدة «سياق الطلب» (n8n/order-context-hint.js → confirmedOnce) يلزمه يثبّت مباشرة، ويا قسم ببرومت الوكيل.
 *
 *   ٣. الهلوسة: ids مخمّنة (order_id 0، variant_id 1)، ثلاث استدعاءات create_order (طلب مكرر 42 يتيم + 43)، لأن
 *      الأول فشل بـ «3,000» (فاصلة بحقل numeric) فأعاد النموذج المحاولة بلا ما يتأكد. العلاج: أرقام create_order
 *      تتنظف بالكود من الفواصل، وقسم «ممنوع الهلوسة» ببرومت الوكيل (ids من نتائج الأدوات حرفياً، أداة وحدة كل مرة،
 *      create_order مرة وحدة، ومبالغ رسالة التثبيت من get_customer_orders).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/harden-order-flow.mjs whatsapp
 *   N8N_KEY=<api key> node n8n/harden-order-flow.mjs messenger     # بعد تطبيق الترحيل ٠٢٩ بالقاعدة (يضيف حقل discount_pct)
 *   DRY=1 N8N_KEY=<api key> node n8n/harden-order-flow.mjs whatsapp  # يتحقق من المواضع وما يرسل شي
 *
 * إنستغرام ما يدخل هنا عمداً (ماكو خصم ولا حادثة هناك). آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل، وكود عقدة
 * «سياق الطلب» ينبني دائماً من المصدر. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups، ويسحب نسخة طرية قبل كل تعديل.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCode } from './order-context-node.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'
if (!KEY) {
  console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
  process.exit(1)
}

const CHANNELS = {
  whatsapp: {
    id: 'i3fCYtVjPHtqvXvm',
    agent: 'Iraqi Store AI Agent',
    prompt: 'Build User Prompt',
    recent: 'Load Recent Customer Messages',
    bot: 'Load Recent Bot Replies',
    node: 'Order Context Hint',
    merchantNode: 'تحديد التاجر',
    discount: false, // واتساب: «ممنوع أي خصم» ببرومته، وبلا discount_pct بـ create_order
  },
  messenger: {
    id: 'GP0rtSxxEHWT3kLj',
    agent: 'Iraqi Store AI Agent',
    prompt: 'Build User Prompt',
    recent: 'Load Recent Customer Messages',
    bot: 'Load Recent Bot Replies',
    node: 'Order Context Hint',
    merchantNode: 'تحديد التاجر',
    discount: true,
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

// ————— ١. نصوص برومت الوكيل (مشتركة بين القناتين) —————

const SECTION_ANCHOR = '# جاوب على قد السؤال (فوق قواعد الأسلوب والأمثلة)'

const SECTIONS = `# ممنوع الهلوسة (أرقام ومعرّفات وكلام)
- الأسعار والمبالغ تطلع من نتائج الأدوات وأجور التوصيل المكتوبة بقسم «التوصيل والدفع» بس. أي حساب تسويه خطوة خطوة على هذي الأرقام (سعر القطعة × العدد، وبعدين + التوصيل) وتكتب نتيجته. ممنوع مبلغ ما تكدر تثبت من وين طلع.
- المعرّفات حرفياً من نتيجة الأداة: variant_id من get_available_products (حقل id)، و order_id من نتيجة create_order. ممنوع تخمّن أو تكتب 0 أو 1 أو أي رقم من راسك؛ إذا ما عندك المعرّف استدعِ الأداة أول وانتظر نتيجتها.
- اسم المنتج مثل ما طلع من الأداة حرفياً، وممنوع تخترع كلمة أو اسم منتج أو مواصفة أو عبارة غريبة (مثل «آخذ الإذن» أو «أتأكد من النظام»): إما تنفّذ أو تسأل سؤال واضح واحد.
- ممنوع تقول «ماكو منتجات» أو «ما عدنا» إلا إذا get_available_products رجعت فاضية فعلاً بهذا الرد.
- إذا ما متأكد من معلومة، قل «خليني أتأكدلك» واعرض التحويل لموظف بدل ما تخمّن.
- الأدوات أداة وحدة كل مرة وانتظر نتيجتها: ممنوع تستدعي أداة تحتاج نتيجة أداة ثانية (مثل add_order_item قبل ما يرجع create_order) بنفس الخطوة.

# التأكيد مرة وحدة بس (ممنوع تكرار طلب التأكيد)
- طلب التأكيد يصير مرة وحدة بس لكل طلب: ردك الي بيه البنود والمبلغ الكلي (الملخص مع «أثبّتلك الطلب؟»، أو أي رد ذكرت بيه المجموع الكلي كاش عند الاستلام).
- أي موافقة صريحة من الزبون بعده (ثبت، اوك ثبت الطلب، ثبتلي، إي، أكيد، تمام، يلا، ماكو شي ثاني) هي التأكيد الوحيد المطلوب: ممنوع تطلب تأكيد ثاني، وممنوع تعيد الملخص أو تكتب «أحتاج تأكيد» أو «تمام هيج؟» من جديد. إذا معلومات التوصيل كاملة، نفّذ create_order بنفس هذا الرد.
- الملخص الكامل مو شرط إذا ردك السابق عرض البنود والمبلغ الكلي. بس إذا الزبون ما شاف المبلغ الكلي لهسة (ما ذكرته بأي رد)، اعرضه مرة وحدة بالملخص واسأل «أثبّتلك الطلب؟»، وجوابه التالي هو التأكيد.
- إذا بنص الطلب سأل الزبون سؤال (سعر، توصيل)، جاوبه وبنفس الرد اعرض البنود والمبلغ الكلي وسؤال التأكيد مرة وحدة.
- إذا عدّل الزبون شي بعد المبلغ (عدد، عنوان)، حدّث المبلغ واعرضه مرة وحدة وانتظر موافقته.

`

const REPLACEMENTS = [
  {
    label: 'create_order: شرط التأكيد',
    from:
      '- ممنوع استدعاء create_order قبل التأكيد الصريح المكتوب على الملخص. الستيكر أو اللايك أو التفاعل بإيموجي (رسالة تبدأ بـ "(ستيكر" أو "(تفاعل") مو تأكيد؛ اطلب تأكيد بالكتابة.',
    to:
      '- ممنوع استدعاء create_order قبل ما يوافق الزبون صراحة بالكتابة على ردك الي بيه المبلغ الكلي. الستيكر أو اللايك أو التفاعل بإيموجي (رسالة تبدأ بـ "(ستيكر" أو "(تفاعل") مو تأكيد؛ اطلب تأكيد بالكتابة.',
    marker: 'قبل ما يوافق الزبون صراحة بالكتابة على ردك الي بيه المبلغ الكلي',
  },
  {
    label: 'create_order: مرة وحدة بعد الموافقة',
    from:
      '- create_order تنستدعى بس إذا رسالتك السابقة كانت الملخص وبيها "أثبّتلك الطلب؟" والزبون جاوب عليها بتأكيد صريح. معلومات التوصيل وحدها مو تأكيد.',
    to:
      '- create_order تنستدعى مرة وحدة بس لكل طلب، بعد ما يوافق الزبون صراحة على ردك الي بيه المجموع الكلي (الملخص أو غيره). معلومات التوصيل وحدها مو تأكيد. إذا وافق، ثبّت الطلب بنفس الرد بدون ما تطلب تأكيد ثاني.',
    marker: 'تنستدعى مرة وحدة بس لكل طلب',
  },
  {
    label: 'خطوة 5: تثبيت',
    from: '5. تثبيت: بس بعد تأكيد صريح مكتوب على الملخص (مثل: إي، ثبّت، أكيد، تمام).',
    to: '5. تثبيت: بعد موافقة صريحة مكتوبة على ردك الي بيه المبلغ الكلي (مثل: إي، ثبّت، أكيد، تمام) — مرة وحدة وبدون تأكيد ثاني.',
    marker: '5. تثبيت: بعد موافقة صريحة مكتوبة',
  },
  {
    label: 'ترتيب أدوات التثبيت',
    from: '- بعد نجاح create_order: استدعِ add_order_item لكل بند، و update_session_data بسلة فارغة ومرحلة completed.',
    to: [
      '- ترتيب التثبيت (أداة وحدة كل مرة وانتظر نتيجتها): (١) get_available_products حتى تاخذ variant_id الصحيح (٢) create_order مرة وحدة بس (٣) add_order_item لكل بند بـ order_id من نتيجة create_order حرفياً (٤) get_customer_orders وخذ الطلب الأحدث (٥) update_session_data بسلة فارغة ومرحلة completed.',
      '- ممنوع تستدعي create_order مرتين لنفس الطلب: إذا رجعت رقم طلب، هذا هو الطلب وكمّل بيه حتى لو أداة ثانية فشلت. إذا فشلت create_order بخطأ، صحّح الحقل الغلط وأعدها مرة وحدة بس.',
      '- مبالغ create_order أرقام بس بدون فواصل ولا كلمات (مثل 300500 مو 300,500).',
    ].join('\n'),
    marker: '- ترتيب التثبيت (أداة وحدة كل مرة',
  },
  {
    label: 'رسالة التثبيت: المبالغ من القاعدة',
    from:
      '- رسالة التثبيت فيها: رقم الطلب، والمجموع الكلي المطلوب كاش عند الاستلام، و"المندوب يتصل بيك قبل لا يوصل"، وتنتهي بوردة 🌷 بس (بدون أي إيموجي ثاني).',
    to:
      '- رسالة التثبيت فيها: رقم الطلب، والمجموع الكلي المطلوب كاش عند الاستلام، و"المندوب يتصل بيك قبل لا يوصل"، وتنتهي بوردة 🌷 بس (بدون أي إيموجي ثاني). مبالغ الرسالة (سعر المنتجات، التوصيل، المجموع الكلي) تنقلها حرفياً من صف الطلب بنتيجة get_customer_orders، وممنوع تحسبها من جديد أو ترجع لسعر ثاني.',
    marker: 'تنقلها حرفياً من صف الطلب بنتيجة get_customer_orders',
  },
]

// آخر فحص ببرومت قبل الإرسال، يتبعه قسم تعليمات المتجر: نضيف وراه فحصين.
const LAST_CHECK_RE = /(\d+)\. إذا الزبون سأل إذا اكو أحد \(ألو، موجود؟، ترد عليّ؟\): الرد يبدي بإنك موجود، وبدون أي تحويل لموظف\./
const CHECKS_MARKER = 'ولا معرّف (variant_id أو order_id) مخمّن'

// ————— ٢. خصم أول طلب (ماسنجر) —————

// كتلتا تعليمات خاصتان بالمتجر تبدآن بنفس الشكل ({{ (() => …)، فنحدد كتلة الخصم بعنوانها مو بأول تطابق
const DISCOUNT_TITLE = '# عرض الخصم لهذا المتجر'
const DISCOUNT_END = '})() }}'
const DISCOUNT_MARKER = 'first_order_discount_pct'

// النسبة والأهلية من القاعدة (عقدة تحديد التاجر)، مو ثابتة بالبرومت. المثال بنفس النسبة حتى ما يتناقض.
const DISCOUNT_EXPR =
  "{{ (() => { const t = $('تحديد التاجر').first().json; const N = String.fromCharCode(10); const pct = Number(t.first_order_discount_pct || 0); if (!(pct > 0)) return ''; const first = Number(t.customer_prior_orders || 0) === 0; const keep = 100 - pct; const ex = Math.round(350000 * keep / 100).toLocaleString('en-US'); " +
  "return N + N + '# عرض الخصم لهذا المتجر (استثناء يلغي قاعدة «السعر ثابت» و«ممنوع أي خصم» و«بدون أي خصم» لهذا المتجر بس)' + N + " +
  "'- عدنا خصم ' + pct + '% على أول طلب للزبون ويا المتجر، بدون حد أدنى للمبلغ وبدون كود. الخصم على سعر المنتجات بس، مو على أجور التوصيل.' + N + " +
  "(first " +
  "? '- حالة هذا الزبون: ما عنده أي طلب سابق ويا المتجر، يعني هذا أول طلب إله والخصم يشمله. لا تكتب «إذا كان هذا أول طلب»؛ الحالة مؤكدة وثابتة لحد ما ينتهي هذا الطلب.' + N + " +
  "'- سعر القطعة بعد الخصم = السعر × ' + keep + ' ÷ 100 مقرّب لأقرب دينار. إذا سأل عن السعر: اذكر السعر الأصلي والسعر بعده، مثل: «الغسالة سعرها 350,000 دينار، وبما إنه أول طلب إلك يصير سعرها ' + ex + ' دينار بعد خصم ' + pct + '%».' + N + " +
  "'- بالملخص وبكل رد فيه مبالغ: اكتب سعر القطعة بعد الخصم، ومجموع المنتجات بعد الخصم، وسطر «خصم أول طلب ' + pct + '%»، وبعدها أجور التوصيل والمجموع الكلي. الخصم ثابت بهذا الطلب: ممنوع ترجع للسعر الأصلي بأي رد لاحق (تأكيد الطلب، الملخص، رسالة التثبيت) حتى لو الزبون كرر التأكيد.' + N + " +
  "'- النظام يطبّق الخصم تلقائياً على بنود الطلب لما تستدعي add_order_item. مبالغ create_order منك: items_total_iqd = مجموع المنتجات بعد الخصم، و grand_total_iqd = items_total_iqd + أجور التوصيل، وبعد add_order_item انقل أرقام الطلب من get_customer_orders حرفياً برسالة التثبيت.' " +
  ": '- حالة هذا الزبون: عنده طلب سابق ويا المتجر، فالخصم ما يشمله. إذا سأل عن الخصم وضّح بلطف إن الخصم لأول طلب بس، والأسعار تبقى مثل ما هي، وممنوع تحسب أي خصم بالملخص أو بـ create_order.') + N + " +
  "'- ممنوع أي خصم أو تخفيض ثاني غير هذا.'; })() }}"

// عقدة تحديد التاجر: «طلب سابق» = طلب فعلي بالبنود (الطلب اليتيم المكرر 42 ما يحسب)، ونسبة التاجر من القاعدة
const PRIOR_FROM =
  "(SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled')) AS customer_prior_orders,"
const PRIOR_TO =
  "(SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled') AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS customer_prior_orders,\n       coalesce(mp.first_order_discount_pct, 0) AS first_order_discount_pct,"

const DISCOUNT_FIELD = {
  fieldId: 'discount_pct',
  fieldValue:
    "={{ (() => { const t = $('تحديد التاجر').first().json; return Number(t.customer_prior_orders || 0) === 0 ? Number(t.first_order_discount_pct || 0) : 0; })() }}",
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

  const backup = path.join(HERE, 'backups', `${channel}-${c.id}-before-harden-order-flow.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  const done = []
  const skipped = []
  const mark = (ok, label) => (ok ? done : skipped).push(label)

  // برومت الوكيل
  const agent = pick(c.agent)
  let sys = agent.parameters.options.systemMessage

  if (sys.includes('# ممنوع الهلوسة (أرقام ومعرّفات وكلام)')) {
    mark(false, 'قسما الهلوسة والتأكيد مرة وحدة')
  } else {
    sys = swap(sys, SECTION_ANCHOR, SECTIONS + SECTION_ANCHOR, `${channel}/sections`)
    mark(true, 'قسما الهلوسة والتأكيد مرة وحدة')
  }
  for (const r of REPLACEMENTS) {
    if (sys.includes(r.marker)) {
      mark(false, r.label)
    } else {
      sys = swap(sys, r.from, r.to, `${channel}/${r.label}`)
      mark(true, r.label)
    }
  }
  if (sys.includes(CHECKS_MARKER)) {
    mark(false, 'فحوصات ما قبل الإرسال')
  } else {
    const m = sys.match(LAST_CHECK_RE)
    if (!m) throw new Error(`[${channel}] ما لگيت آخر فحص ببرومت قبل الإرسال`)
    const n = Number(m[1])
    const extra = `\n${n + 1}. كل مبلغ بالرد طالع من أرقام الأدوات أو من جمعها خطوة خطوة، والمجموع الكلي = مجموع المنتجات + أجور التوصيل بالضبط، ولا معرّف (variant_id أو order_id) مخمّن.\n${n + 2}. إذا الزبون وافق صراحة على ردك السابق الي بيه المبلغ الكلي: الرد هو تثبيت الطلب (create_order)، مو طلب تأكيد ثاني ولا إعادة ملخص.`
    sys = swap(sys, m[0], m[0] + extra, `${channel}/checks`)
    mark(true, `فحصي ${n + 1} و${n + 2}`)
  }

  if (c.discount) {
    const t = sys.indexOf(DISCOUNT_TITLE)
    if (t < 0) throw new Error(`[${channel}] ما لگيت كتلة الخصم ببرومت الوكيل`)
    if (sys.indexOf(DISCOUNT_TITLE, t + 1) >= 0) throw new Error(`[${channel}] كتلتا خصم ببرومت الوكيل؛ نظّف الموضع يدوياً قبل ما تكمّل`)
    const i = sys.lastIndexOf('{{ (() =>', t)
    const j = sys.indexOf(DISCOUNT_END, t)
    if (i < 0 || j < 0) throw new Error(`[${channel}] كتلة الخصم ما تبدأ بـ {{ (() => أو ما تنتهي بـ ${DISCOUNT_END}`)
    if (sys.slice(i, j).includes(DISCOUNT_MARKER)) {
      mark(false, 'كتلة الخصم')
    } else {
      sys = sys.slice(0, i) + DISCOUNT_EXPR + sys.slice(j + DISCOUNT_END.length)
      mark(true, 'كتلة الخصم (النسبة والأهلية من القاعدة)')
    }
  }
  agent.parameters.options.systemMessage = sys

  // create_order: أرقام نظيفة، وخصم أول طلب بحقل ثابت (ماسنجر)
  const create = pick('create_order')
  const fields = create.parameters.fieldsUi.fieldValues
  let cleaned = 0
  for (const f of fields) {
    if (!['items_total_iqd', 'delivery_fee_iqd', 'grand_total_iqd'].includes(f.fieldId)) continue
    if (f.fieldValue.includes(".replace(/[^0-9.]/g, '')")) continue
    const m = f.fieldValue.match(/^=\{\{ ([\s\S]*) \}\}$/)
    if (!m) throw new Error(`[${channel}] صيغة غير متوقعة لحقل ${f.fieldId}: ${f.fieldValue.slice(0, 80)}`)
    f.fieldValue = `={{ String(${m[1]}).replace(/[^0-9.]/g, '') }}`
    cleaned++
  }
  mark(cleaned > 0, `تنظيف أرقام create_order (${cleaned})`)
  if (c.discount) {
    const has = fields.find((f) => f.fieldId === 'discount_pct')
    if (has) {
      mark(false, 'حقل discount_pct')
    } else {
      fields.push(DISCOUNT_FIELD)
      mark(true, 'حقل discount_pct بـ create_order')
    }
    // عقدة تحديد التاجر
    const merchant = pick(c.merchantNode)
    let q = merchant.parameters.query
    if (q.includes('first_order_discount_pct')) {
      mark(false, 'SQL تحديد التاجر')
    } else {
      q = swap(q, PRIOR_FROM, PRIOR_TO, `${channel}/merchant-sql`)
      merchant.parameters.query = q
      mark(true, 'SQL تحديد التاجر (طلب سابق بالبنود + نسبة التاجر)')
    }
  }

  // عقدة سياق الطلب: الكود ينبني دائماً من المصدر المختبَر
  const hintNode = pick(c.node)
  const code = nodeCode(c)
  if (hintNode.parameters.jsCode === code) {
    mark(false, `كود ${c.node}`)
  } else {
    hintNode.parameters.jsCode = code
    mark(true, `تحديث كود ${c.node} (تأكيد مرة وحدة)`)
  }

  if (skipped.length) console.log(`— ${channel}: مزيود من قبل — ${skipped.join('، ')}`)
  if (!done.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}: راح ينزاد/يتغيّر — ${done.join('، ')}`)
  if (DRY) return

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
  const savedCreate = sv('create_order').parameters.fieldsUi.fieldValues
  console.log(`\n✓ ${channel} (${saved.name}) | active: ${saved.active}`)
  console.log(`   قسم الهلوسة: ${savedSys.includes('# ممنوع الهلوسة (أرقام ومعرّفات وكلام)')}`)
  console.log(`   قسم التأكيد مرة وحدة: ${savedSys.includes('# التأكيد مرة وحدة بس')}`)
  console.log(`   فحوصات الإرسال: ${savedSys.includes(CHECKS_MARKER)}`)
  console.log(`   أرقام create_order نظيفة: ${savedCreate.filter((f) => f.fieldValue.includes(".replace(/[^0-9.]/g, '')")).length}/3`)
  console.log(`   كود ${c.node} فيه confirmedOnce: ${sv(c.node).parameters.jsCode.includes('confirmedOnce')}`)
  if (c.discount) {
    console.log(`   كتلة الخصم من القاعدة: ${savedSys.includes(DISCOUNT_MARKER)} | كتلة وحدة: ${savedSys.split(DISCOUNT_TITLE).length - 1 === 1} | بلا نسبة 15% ثابتة: ${!savedSys.includes('عدنا خصم 15%')} | كتلة الأسلوب سليمة: ${savedSys.includes('# أسلوب ردك مع هذا المتجر')}`)
    console.log(`   حقل discount_pct: ${savedCreate.some((f) => f.fieldId === 'discount_pct')}`)
    console.log(`   SQL تحديد التاجر: ${sv(c.merchantNode).parameters.query.includes('first_order_discount_pct')}`)
  }
}

const targets = process.argv.slice(2)
if (!targets.length) throw new Error(`حدّد القناة: ${Object.keys(CHANNELS).join(' أو ')}`)
for (const t of targets) {
  if (!CHANNELS[t]) throw new Error(`قناة مجهولة: ${t} (المتاح: ${Object.keys(CHANNELS).join('، ')})`)
  await patch(t)
}
