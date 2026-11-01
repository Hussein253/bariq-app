/**
 * الطلب التجريبي ما ينحسب بأهلية خصم أول طلب (ماسنجر 2026-10-31):
 *
 *   صاحب المتجر يجرّب البوت بحسابه، وطلباته التجريبية تنعلّم orders.is_test = true (الترحيل ٠٢٧). التطبيق يستثنيها من كل القوائم
 *   والأعداد والمجاميع (PR #39)، بس عقدة «تحديد التاجر» بماسنجر بعدها تحسبها بعمودي customer_prior_orders و customer_discounted_orders
 *   (n8n/harden-order-flow.mjs و n8n/first-order-discount-eligibility.mjs). حساب التجربة عند المتجر الي عنده خصم 15% صار عنده
 *   customer_discounted_orders = 1 بسبب الطلب التجريبي 51 بس، فالبوت بطّل يعرض خصم أول طلب بتجارب المحادثة الي بعده.
 *
 *   الإصلاح: العدّان يستثنون الطلب التجريبي (AND coalesce(o.is_test, false) = false). الأماكن الثلاث الي تقرا العدّين من «تحديد التاجر»
 *   تتبعهن بلا تعديل: حقل discount_pct بـ create_order (المبلغ الفعلي)، كتلة «عرض الخصم لهذا المتجر» ببرومت الوكيل (الوعد)،
 *   والحارس الأخير «Drop Repeated Blocks».
 *
 *   ما يتأثر: واتساب وإنستغرام، لأن «تحديد التاجر» عدهم ما يحسب العدّين ولا first_order_discount_pct (حارسهم الأخير يقرا
 *   customer_discounted_orders، بس النسبة تطلع 0 فماكو خصم). والطلب التجريبي الجديد ينحسب لحد ما ينعلّم is_test.
 *   أثر القاعدة على بيانات هسة (الاستعلام نفسه على القاعدة): حساب التجربة (الطلبات 41 و47 و51) customer_discounted_orders من 1 إلى 0
 *   و customer_prior_orders من 2 إلى 1. الطلبان التجريبيان الباقيان (29 و39) عند متجر بلا خصم ولا حساب مربوط.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/first-order-discount-test-orders.mjs
 *   DRY=1 N8N_KEY=<api key> node n8n/first-order-discount-test-orders.mjs     # يتحقق من المواضع وما يرسل شي
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/first-order-discount-test-orders.mjs
 *
 * آمن للتكرار: العدّ المزيود من قبل ينتجاهل، والعدّ الي شكله مو مثل المتوقع يوقف السكربت قبل أي تعديل. يحفظ نسخة «قبل» مرة وحدة
 * بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const CHANNEL = { id: 'GP0rtSxxEHWT3kLj', merchant: 'تحديد التاجر' }

// العدّان بنفس نص العقدة الحية حرفياً: طلبات الزبون عند نفس التاجر، غير ملغية وفيها بنود
const count = (extra, alias) =>
  `(SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled')${extra} AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS ${alias},`
export const NOT_TEST = ' AND coalesce(o.is_test, false) = false'
const DISCOUNTED = ' AND coalesce(o.discount_pct, 0) > 0'
export const COUNTS = [
  { alias: 'customer_prior_orders', from: count('', 'customer_prior_orders'), to: count(NOT_TEST, 'customer_prior_orders') },
  {
    alias: 'customer_discounted_orders',
    from: count(DISCOUNTED, 'customer_discounted_orders'),
    to: count(DISCOUNTED + NOT_TEST, 'customer_discounted_orders'),
  },
]

const times = (text, s) => text.split(s).length - 1

/** @returns {string[]} التعديلات (فاضية = مزيود من قبل) */
export const patchWorkflow = (wf) => {
  const merchant = wf.nodes.find((x) => x.name === CHANNEL.merchant)
  if (!merchant) throw new Error(`ماكو عقدة باسم ${CHANNEL.merchant}`)
  let q = String(merchant.parameters.query ?? '')
  const changes = []
  for (const c of COUNTS) {
    if (times(q, c.to) === 1) continue
    if (times(q, c.from) !== 1) {
      throw new Error(`${CHANNEL.merchant}: عدّ ${c.alias} مو بالشكل المتوقع؛ شغّل harden-order-flow.mjs messenger و first-order-discount-eligibility.mjs أول`)
    }
    q = q.replace(c.from, () => c.to)
    changes.push(`${c.alias}: يستثني الطلب التجريبي (is_test)`)
  }
  // ينكتب مرة وحدة بالآخر: عدّ شكله غلط يوقف السكربت والاستعلام مثل ما هو
  merchant.parameters.query = q
  return changes
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

const run = async () => {
  const local = process.env.SRC
  const wf = local ? JSON.parse(fs.readFileSync(local, 'utf8')) : await api(`/workflows/${CHANNEL.id}`)
  if (wf.id !== CHANNEL.id) throw new Error(`المسار ${wf.id} مو ماسنجر ${CHANNEL.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchWorkflow(wf)
  if (!changes.length) {
    console.log('— messenger: كل شي مزيود من قبل، ما أرسلت شي')
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}messenger:\n  - ${changes.join('\n  - ')}`)
  if (DRY) return
  if (local) {
    fs.writeFileSync(process.env.OUT ?? local.replace(/\.json$/, '.patched.json'), JSON.stringify(wf, null, 2))
    return
  }
  const file = path.join(HERE, 'backups', `messenger-${wf.id}-before-first-order-discount-test-orders.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(before, null, 2))
  const saved = await save(wf)
  const q = saved.nodes.find((x) => x.name === CHANNEL.merchant).parameters.query
  console.log(`✓ messenger (${saved.name}) | active: ${saved.active} | versionId: ${saved.versionId} | activeVersionId: ${saved.activeVersionId ?? '-'}`)
  for (const c of COUNTS) console.log(`   ${c.alias} يستثني الطلب التجريبي: ${q.includes(c.to)}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (!KEY && !process.env.SRC) {
    console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
    process.exit(1)
  }
  await run()
}
