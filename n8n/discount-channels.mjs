/**
 * خصم أول طلب بنفس القواعد بكل القنوات (طلب صاحب المتجر 2026-11-01): ماسنجر يخصم والواتساب وإنستغرام ما يخصمون.
 *
 *   ١. «تحديد التاجر» (واتساب وإنستغرام): يقرا merchant_profiles.first_order_discount_pct، ويحسب طلبات الزبون السابقة
 *      (عدد طلبات بنود، وعدد المخصومة منها) بنفس استعلام ماسنجر. الزبون ينقرا برقمه (phone_number)، والاستعلام يأخذ
 *      رقم الزبون كـ $2.
 *   ٢. create_order (واتساب وإنستغرام): حقل discount_pct بنفس صيغة ماسنجر، فالمبلغ المثبّت يطابق اللي ينعرض للزبون.
 *   ٣. برومت الوكيل: كتلة «عرض الخصم لهذا المتجر» (n8n/discount-offer-block.txt) تنزرع بواتساب وإنستغرام، وبماسنجر تنستبدل
 *      بالنسخة المصححة (كانت تذكر «الغسالة سعرها 350,000»، وهذا المتجر ما عنده غسالات؛ السعر صار من الكتالوج).
 *
 *   الحساب المالي والتوصيل: n8n/order-money.mjs (نفس الحارس بكل القنوات).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/discount-channels.mjs messenger whatsapp instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/discount-channels.mjs whatsapp
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/discount-channels.mjs whatsapp
 *
 * تعديل موضعي على المسار الحي. آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

/** كتلة عرض الخصم بالبرومت (تعبير n8n) — المصدر في n8n/discount-offer-block.txt. */
export const OFFER_BLOCK = fs.readFileSync(path.join(HERE, 'discount-offer-block.txt'), 'utf8').trim()
const OFFER_MARK = 'const fmt = (n) => Math.round(n).toLocaleString'
const OFFER_OLD_PREFIX = "{{ (() => { const t = $('تحديد التاجر').first().json; const N = String.fromCharCode(10); const pct"
const OFFER_END = '})() }}'
const OFFER_TITLE = '# عرض الخصم لهذا المتجر'
const MERCHANT_SECTION = "{{ $('تحديد التاجر').first().json.merchant_section }}"

/** نفس تعبير حقل discount_pct بـ create_order بماسنجر. */
export const DISCOUNT_FIELD = "={{ (() => { const t = $('تحديد التاجر').first().json; return Number(t.customer_discounted_orders ?? t.customer_prior_orders ?? 0) === 0 ? Number(t.first_order_discount_pct || 0) : 0; })() }}"

const SQL_JOIN_OLD = 'LEFT JOIN merchant_delivery_settings ds ON ds.merchant_id = sa.merchant_id'
const SQL_JOIN_NEW = `${SQL_JOIN_OLD}\nLEFT JOIN merchant_profiles mp ON mp.merchant_id = sa.merchant_id`
const SQL_END_OLD = 'END AS catalog_guard\nFROM social_accounts sa'
const SQL_END_NEW = `END AS catalog_guard,
       (SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled') AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS customer_prior_orders,
       (SELECT count(*) FROM orders o WHERE o.merchant_id = sa.merchant_id AND o.phone_number = $2::text AND coalesce(o.current_state::text, '') NOT IN ('cancelled', 'canceled') AND coalesce(o.discount_pct, 0) > 0 AND EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.order_id)) AS customer_discounted_orders,
       coalesce(mp.first_order_discount_pct, 0) AS first_order_discount_pct
FROM social_accounts sa`

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent', merchant: 'تحديد التاجر', offerOnly: true },
  whatsapp: {
    id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent', merchant: 'تحديد التاجر', create: 'create_order',
    phoneSource: "$('Message Data').item.json.phone",
  },
  instagram: {
    id: 'CTuJ0eGVthUjREVJ', agent: 'وكيل المبيعات (علاء)', merchant: 'تحديد التاجر', create: 'create_order',
    phoneSource: "$('بيانات الرسالة').first().json.phone",
  },
}

const once = (text, needle, what) => {
  const n = text.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // ٣. برومت الوكيل: كتلة العرض
  const agent = by(c.agent)
  const sm = String(agent.parameters.options.systemMessage ?? '')
  if (c.offerOnly) {
    if (!sm.includes(OFFER_MARK)) {
      const start = sm.indexOf(OFFER_OLD_PREFIX)
      if (start < 0) throw new Error(`${c.agent}: ما لگيت كتلة الخصم الحالية`)
      if (sm.indexOf(OFFER_OLD_PREFIX, start + 1) >= 0) throw new Error(`${c.agent}: كتلتين خصم، نظّف يدوياً`)
      const end = sm.indexOf(OFFER_END, start) + OFFER_END.length
      if (end < OFFER_END.length) throw new Error(`${c.agent}: حدود كتلة الخصم غير متوقعة`)
      agent.parameters.options.systemMessage = sm.slice(0, start) + OFFER_BLOCK + sm.slice(end)
      changes.push(`${c.agent}: كتلة الخصم بالنسخة المصححة (السعر من الكتالوج، مو غسالة 350,000)`)
    }
    return changes
  }
  if (!sm.includes(OFFER_TITLE)) {
    once(sm, MERCHANT_SECTION, `${c.agent}: merchant_section`)
    agent.parameters.options.systemMessage = sm.replace(MERCHANT_SECTION, () => `${MERCHANT_SECTION}\n${OFFER_BLOCK}`)
    changes.push(`${c.agent}: كتلة «عرض الخصم لهذا المتجر» (خصم أول طلب)`)
  } else if (!sm.includes(OFFER_MARK)) {
    throw new Error(`${c.agent}: كتلة الخصم موجودة بصيغة قديمة، نظّفها يدوياً`)
  }

  // ١. تحديد التاجر: الاستعلام يحسب طلبات الزبون ويقرا نسبة الخصم
  const merchant = by(c.merchant)
  const q = String(merchant.parameters.query ?? '')
  if (!q.includes('AS first_order_discount_pct')) {
    once(q, SQL_JOIN_OLD, `${c.merchant}: join ds`)
    once(q, SQL_END_OLD, `${c.merchant}: نهاية الأعمدة`)
    merchant.parameters.query = q.replace(SQL_JOIN_OLD, () => SQL_JOIN_NEW).replace(SQL_END_OLD, () => SQL_END_NEW)
    changes.push(`${c.merchant}: نسبة خصم أول طلب وعدد طلبات الزبون (بالرقم)`)
  }
  // رقم الزبون كـ $2 بعد معرّف الحساب (المطابقة كاملة مع {{ }} حتى ما يتطابق phone مع phoneNumberId)
  const opts = (merchant.parameters.options ??= {})
  const phoneParam = `{{ ${c.phoneSource} }}`
  if (!String(opts.queryReplacement ?? '').includes(phoneParam)) {
    const current = String(opts.queryReplacement ?? '')
    if (!current.startsWith('=')) throw new Error(`${c.merchant}: queryReplacement بشكل غير متوقع`)
    opts.queryReplacement = `${current},${phoneParam}`
    changes.push(`${c.merchant}: رقم الزبون كمعامل ثاني للاستعلام`)
  }

  // ٢. create_order: حقل discount_pct
  if (c.create) {
    const co = by(c.create)
    const fields = (co.parameters.fieldsUi ??= {}).fieldValues ??= []
    if (!fields.some((f) => f.fieldId === 'discount_pct')) {
      fields.push({ fieldId: 'discount_pct', fieldValue: DISCOUNT_FIELD })
      changes.push(`${c.create}: discount_pct (نفس ماسنجر)`)
    }
  }
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

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const local = process.env.SRC
  const wf = local ? JSON.parse(fs.readFileSync(local, 'utf8')) : await api(`/workflows/${c.id}`)
  if (wf.id !== c.id) throw new Error(`${channel}: المسار ${wf.id} مو ${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const changes = patchWorkflow(wf, c)
  if (!changes.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}:\n  - ${changes.join('\n  - ')}`)
  if (DRY) return
  if (local) {
    fs.writeFileSync(process.env.OUT ?? local.replace(/\.json$/, '.patched.json'), JSON.stringify(wf, null, 2))
    return
  }
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-discount-channels.json`)
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(before, null, 2))
  const saved = await save(wf)
  console.log(`✓ ${channel} | active: ${saved.active} | العقد: ${saved.nodes.length}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (!KEY && !process.env.SRC) {
    console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
    process.exit(1)
  }
  const channels = process.argv.slice(2)
  if (!channels.length) {
    console.error(`حدد القناة: ${Object.keys(CHANNELS).join(' ')}`)
    process.exit(1)
  }
  for (const ch of channels) await run(ch)
}
