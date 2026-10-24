/**
 * أهلية خصم أول طلب = «ما استفاد من الخصم قبل»، مو «ما عنده طلب سابق» (ماسنجر 2026-10-24، التنفيذان 1557 و1561):
 *
 *   الزبون 28386991107651965 عنده طلب سابق واحد (41) انحسب بسعره الكامل 350,000 بدون خصم (orders.discount_pct = 0، بسبب خلل ٠٢٩
 *   القديم الي كان يمحو الخصم). عقدة «تحديد التاجر» كانت تحسب customer_prior_orders = 1 فتعتبره مو مؤهل، والبوت وعده بالخصم
 *   (297,500) من دون ما تتفق التعليمات: مرة قال «الخصم لأول طلب بس»، ومرة «15% فيصير 297,500». والمطلوب: الزبون الي ما أخذ خصم
 *   فعلاً (طلبه السابق انحسب بالمبلغ الكامل) يبقى مؤهل، والزبون الي أخذ الخصم بطلب سابق ما يتوعد بسعر مخصوم.
 *
 *   القاعدة الجديدة: مؤهل إذا ماكو طلب سابق (غير ملغي، فيه بنود) عند نفس التاجر بنسبة خصم > 0. عقدة «تحديد التاجر» تطلّع
 *   customer_discounted_orders بدل الاعتماد على customer_prior_orders بس، وتتبعها مكانان:
 *     • حقل discount_pct بـ create_order (يحدد المبلغ الفعلي المثبَّت، حتمي مو من النموذج)
 *     • كتلة «عرض الخصم لهذا المتجر» ببرومت الوكيل (الكلام الي يوعد بيه الزبون)
 *   customer_prior_orders تبقى مثل ما هي (ما تنمس، قد يستعملها غيرها).
 *
 *   ما يتأثر: واتساب وإنستغرام (ماكو خصم هناك ولا discount_pct بـ create_order).
 *   أثر القاعدة على بيانات هسة (الاستعلام نفسه على القاعدة): زبون واحد من اثنين عنده طلبات سابقة بدون أي خصم، هذا الزبون.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/first-order-discount-eligibility.mjs
 *   DRY=1 N8N_KEY=<api key> node n8n/first-order-discount-eligibility.mjs     # يتحقق من المواضع وما يرسل شي
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

const CHANNEL = { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent', merchant: 'تحديد التاجر', createOrder: 'create_order' }

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

const MARKER = 'customer_discounted_orders'

// ————— ١. استعلام «تحديد التاجر» —————
const SQL_ANCHOR = 'AS customer_prior_orders,'
const SQL_NEW = `${SQL_ANCHOR}\n       (SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled') AND coalesce(o.discount_pct, 0) > 0 AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS customer_discounted_orders,`

// ————— ٢. حقل discount_pct بـ create_order (المبلغ الفعلي) —————
const FIELD_OLD = "return Number(t.customer_prior_orders || 0) === 0 ? Number(t.first_order_discount_pct || 0) : 0;"
const FIELD_NEW = "return Number(t.customer_discounted_orders ?? t.customer_prior_orders ?? 0) === 0 ? Number(t.first_order_discount_pct || 0) : 0;"

// ————— ٣. كتلة «عرض الخصم لهذا المتجر» ببرومت الوكيل (الكلام الي يوعد بيه الزبون) —————
const DISCOUNT_TITLE = '# عرض الخصم لهذا المتجر'
const DISCOUNT_END = '})() }}'
const BLOCK_SWAPS = [
  {
    label: 'شرط الأهلية',
    from: "const first = Number(t.customer_prior_orders || 0) === 0;",
    to: "const first = Number(t.customer_discounted_orders ?? t.customer_prior_orders ?? 0) === 0;",
  },
  {
    label: 'وصف العرض',
    from: "'- عدنا خصم ' + pct + '% على أول طلب للزبون ويا المتجر، بدون حد أدنى",
    to: "'- عدنا خصم ' + pct + '% على أول طلب يستفيد منه الزبون ويا المتجر (أول طلب ينحسب بيه خصم فعلاً)، بدون حد أدنى",
  },
  {
    label: 'حالة المؤهل',
    from: "'- حالة هذا الزبون: ما عنده أي طلب سابق ويا المتجر، يعني هذا أول طلب إله والخصم يشمله. لا تكتب «إذا كان هذا أول طلب»؛ الحالة مؤكدة وثابتة لحد ما ينتهي هذا الطلب.'",
    to: "'- حالة هذا الزبون: ما استفاد من خصم أول طلب قبل (ماكو طلب سابق انحسب بيه خصم؛ وحتى لو عنده طلب سابق فهو انحسب بسعره الكامل)، يعني الخصم يشمل هذا الطلب. لا تكتب «إذا كان هذا أول طلب» ولا تذكر طلباته السابقة؛ الحالة مؤكدة وثابتة لحد ما ينتهي هذا الطلب.'",
  },
  {
    label: 'مثال السعر للمؤهل',
    from: "مثل: «الغسالة سعرها 350,000 دينار، وبما إنه أول طلب إلك يصير سعرها ' + ex + ' دينار بعد خصم ' + pct + '%».",
    to: "مثل: «الغسالة سعرها 350,000 دينار، والخصم ' + pct + '% يشمل طلبك فيصير سعرها ' + ex + ' دينار».",
  },
  {
    label: 'حالة غير المؤهل',
    from: "'- حالة هذا الزبون: عنده طلب سابق ويا المتجر، فالخصم ما يشمله. إذا سأل عن الخصم وضّح بلطف إن الخصم لأول طلب بس، والأسعار تبقى مثل ما هي، وممنوع تحسب أي خصم بالملخص أو بـ create_order.'",
    to: "'- حالة هذا الزبون: استفاد من خصم أول طلب بطلب سابق ويا المتجر، فالخصم ما يشمله هسة. إذا سأل عن الخصم أو السعر: وضّح بلطف إن خصم أول طلب انستعمل بطلبه السابق، واذكر سعر الكتالوج الأصلي بس. ممنوع تذكر أو تحسب أي سعر بعد خصم (مثل ' + ex + ' دينار للغسالة بـ 350,000) وممنوع أي خصم بالملخص أو بـ create_order.'",
  },
]

const patch = async () => {
  const c = CHANNEL
  const wf = await api(`/workflows/${c.id}`)
  const pick = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name} بماسنجر`)
    return n
  }

  const backup = path.join(HERE, 'backups', `messenger-${c.id}-before-discount-eligibility.json`)
  if (!DRY && !fs.existsSync(backup)) fs.writeFileSync(backup, JSON.stringify(wf, null, 2))

  const done = []
  const skipped = []
  const mark = (ok, label) => (ok ? done : skipped).push(label)

  // الاستعلام
  const merchant = pick(c.merchant)
  if (merchant.parameters.query.includes(MARKER)) {
    mark(false, 'عمود customer_discounted_orders')
  } else {
    merchant.parameters.query = swap(merchant.parameters.query, SQL_ANCHOR, SQL_NEW, 'sql')
    mark(true, 'عمود customer_discounted_orders')
  }

  // حقل create_order
  const fields = pick(c.createOrder).parameters.fieldsUi.fieldValues
  const df = fields.find((f) => f.fieldId === 'discount_pct')
  if (!df) throw new Error('ماكو حقل discount_pct بـ create_order؛ شغّل harden-order-flow.mjs messenger أول')
  if (df.fieldValue.includes(MARKER)) {
    mark(false, 'حقل discount_pct')
  } else {
    df.fieldValue = swap(df.fieldValue, FIELD_OLD, FIELD_NEW, 'create_order')
    mark(true, 'حقل discount_pct (المبلغ الفعلي)')
  }

  // كتلة البرومت
  const agent = pick(c.agent)
  let sys = agent.parameters.options.systemMessage
  const t = sys.indexOf(DISCOUNT_TITLE)
  if (t < 0) throw new Error('ما لگيت كتلة الخصم ببرومت الوكيل')
  if (sys.indexOf(DISCOUNT_TITLE, t + 1) >= 0) throw new Error('كتلتا خصم ببرومت الوكيل؛ نظّف الموضع يدوياً')
  const i = sys.lastIndexOf('{{ (() =>', t)
  const j = sys.indexOf(DISCOUNT_END, t) + DISCOUNT_END.length
  if (i < 0 || j < DISCOUNT_END.length) throw new Error('حدود كتلة الخصم غير متوقعة')
  let block = sys.slice(i, j)
  if (block.includes(MARKER)) {
    mark(false, 'كتلة عرض الخصم ببرومت الوكيل')
  } else {
    for (const s of BLOCK_SWAPS) block = swap(block, s.from, s.to, `block/${s.label}`)
    sys = sys.slice(0, i) + block + sys.slice(j)
    agent.parameters.options.systemMessage = sys
    mark(true, 'كتلة عرض الخصم ببرومت الوكيل')
  }

  if (skipped.length) console.log(`— messenger: مزيود من قبل — ${skipped.join('، ')}`)
  if (!done.length) {
    console.log('— messenger: كل شي مزيود من قبل، ما أرسلت شي')
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}messenger: راح ينزاد/يتغيّر — ${done.join('، ')}`)
  if (DRY) {
    if (process.env.DUMP) {
      fs.mkdirSync(process.env.DUMP, { recursive: true })
      fs.writeFileSync(path.join(process.env.DUMP, 'discount-block.txt'), block)
      fs.writeFileSync(path.join(process.env.DUMP, 'merchant.sql'), merchant.parameters.query)
      fs.writeFileSync(path.join(process.env.DUMP, 'discount-field.txt'), df.fieldValue)
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
  console.log(`\n✓ messenger (${saved.name}) | active: ${saved.active} | nodes: ${saved.nodes.length}`)
  console.log(`   SQL فيه customer_discounted_orders: ${sv(c.merchant).parameters.query.includes(MARKER)}`)
  console.log(`   حقل discount_pct يستعمله: ${sv(c.createOrder).parameters.fieldsUi.fieldValues.find((f) => f.fieldId === 'discount_pct').fieldValue.includes(MARKER)}`)
  console.log(`   كتلة الخصم ببرومت الوكيل: ${savedSys.includes(MARKER)} | كتلة وحدة: ${savedSys.split(DISCOUNT_TITLE).length - 1 === 1}`)
}

await patch()
