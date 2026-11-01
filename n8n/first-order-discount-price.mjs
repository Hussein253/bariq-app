/**
 * خصم أول طلب بسؤال السعر (ماسنجر 2026-11-01، التنفيذ 3281): الزبون مؤهل (customer_discounted_orders = 0، النسبة 15%)
 * وسأل «إذا طلبت ٣ هودي أحمر شكد يصير السعر ويه التوصيل»، والبوت كال «السعر يصير 75,000 دينار» بدون خصم، والصحيح 63,750.
 *
 *   ١. البرومت: قواعد «ممنوع أي خصم» و«الأسعار من get_available_products حصراً وبدون أي خصم» و«سؤال عن السعر: سعر القطعة بس»
 *      تغلب قسم «عرض الخصم لهذا المتجر»، والموديل اتبع القواعد العامة. هسة كل قاعدة من هالنوع تستثني خصم أول طلب صراحة،
 *      وبفرع «مؤهل» من قسم الخصم سطر يقول إن سؤال السعر أو المجموع يتجاوب بالسعر بعد الخصم. غير المؤهل ما يتغيّر.
 *   ٢. حارس السعر بعقدة «Drop Repeated Blocks» (rrOffer، من الكود الأساسي للعقدة، مو من مولّد): يشتغل على منتج واحد بس،
 *      والهودي عنده ٣ ألوان بنفس السعر (25,000) فيرجع null. هسة يكفي سعر واحد لكل الصفوف.
 *      الحارس ينشر بـ GUARD=1 بس، قرار منفصل عن البرومت.
 *
 * ما يتغيّر: «تحديد التاجر» والأعداد وcreate_order ما تنلمس. حارس الملخص (order-money.js) ما يتغيّر: يقرا «٣ قطع» بس،
 * فسؤال المجموع بعدد بدون «قطع» يعتمد على البرومت لحد ما ينعالج بالمصدر.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/first-order-discount-price.mjs
 *   DRY=1 N8N_KEY=<api key> node n8n/first-order-discount-price.mjs     # يتحقق من المواضع وما يرسل شي
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/first-order-discount-price.mjs
 *
 * آمن للتكرار: التعديل المزيود من قبل ينتجاهل، والموضع الي شكله غير المتوقع يوقف السكربت قبل أي تعديل.
 * يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const CHANNEL = { id: 'GP0rtSxxEHWT3kLj', guard: 'Drop Repeated Blocks', agent: 'Iraqi Store AI Agent' }

/** التعليمة اللي تطلع بفرع المؤهل بس. القواعد تشير لها بالكلام، ما تقتبس أي سطر من القسم */
export const INSTRUCTION = 'تطبّق خصم أول طلب'

/** استثناء خصم أول طلب، يتكرر بكل قاعدة تمنع الخصم */
export const EXCEPT = `إلا إذا قسم «عرض الخصم» قال لك ${INSTRUCTION}`

// ————— ١. حارس السعر (rrOffer): سعر واحد يكفي لكل صفوف الكتالوج —————
export const GUARD_SWAPS = [
  {
    label: 'rrOffer: صفوف الكتالوج',
    from: 'if (items.length !== 1) return null;',
    to: 'if (items.length === 0) return null;\n      const prices = [...new Set(items.map((c) => Number(c.price_iqd)))];\n      if (prices.length !== 1) return null;',
  },
  { label: 'rrOffer: السعر', from: 'return { price: Number(items[0].price_iqd),', to: 'return { price: prices[0],' },
]

// ————— ٢. البرومت: استثناء خصم أول طلب بالقواعد المتعارضة، وسطر بفرع «مؤهل» بقسم الخصم —————
export const AGENT_SWAPS = [
  { label: 'ممنوع أي خصم', from: '- ممنوع أي خصم أو تخفيض أو هدية من عندك.', to: `- ممنوع أي خصم أو تخفيض أو هدية من عندك، ${EXCEPT}.` },
  {
    label: 'السعر ثابت',
    from: 'ممنوع تعرض أو تعطي أي خصم أو تخفيض أو هدية أو توصيل مجاني من عندك.',
    to: `ممنوع تعرض أو تعطي أي خصم أو تخفيض أو هدية أو توصيل مجاني من عندك، ${EXCEPT}.`,
  },
  {
    label: 'الأسعار من الأداة',
    from: '- الأسعار من get_available_products حصراً وبدون أي خصم.',
    to: `- الأسعار من get_available_products حصراً، وبدون أي خصم، ${EXCEPT}.`,
  },
  { label: 'سعر القطعة بس', from: 'سؤال عن السعر: سعر القطعة بس.', to: `سؤال عن السعر: سعر القطعة بس، ${EXCEPT}، فجاوب بالسعر بعد الخصم.` },
  { label: 'لا خصم من عندك', from: '4. لا تعطي تعويض أو خصم أو موعد من عندك.', to: `4. لا تعطي تعويض أو خصم أو موعد من عندك، ${EXCEPT}.` },
  {
    label: 'سطر السعر بفرع المؤهل',
    from: "'- بالملخص وبكل رد فيه مبالغ:",
    to: "'- تطبّق خصم أول طلب على هذا الطلب، ولو القواعد أعلاه تمنعه: إذا سأل عن السعر أو المجموع، جاوب بسعر القطعة بعد الخصم ومجموع الطلب بعده، وأجور التوصيل.' + N + '- بالملخص وبكل رد فيه مبالغ:",
  },
  {
    label: 'طلب الخصم أول مرة',
    from: '"هذا السعر ثابت وما نكدر ننزّله."',
    to: `"هذا السعر ثابت وما نكدر ننزّله." (${EXCEPT}: اذكر السعر بعد الخصم بدل هذا الكلام.)`,
  },
  {
    label: 'طلب الخصم مرة ثانية',
    from: '"ما عندي صلاحية أغيّر السعر، تحب أحوّلك لموظف من الفريق؟"',
    to: `"ما عندي صلاحية أغيّر السعر، تحب أحوّلك لموظف من الفريق؟" (${EXCEPT}: كرّر السعر بعد الخصم باختصار بدل هذي الجملة.)`,
  },
  {
    label: 'الاستثناء الوحيد',
    from: '(الاستثناء الوحيد خصم أول طلب إذا مذكور بقسم «عرض الخصم لهذا المتجر».)',
    to: `(الاستثناء الوحيد: ${EXCEPT}.)`,
  },
]

// ————— ٣. قسم الخصم: العنوان وسطر العرض بالفرعين، فينقلون لفرع المؤهل حتى غير المؤهل ما يسمع عرض الخصم —————
export const BLOCK_SWAPS = [
  {
    label: 'عنوان القسم',
    from: "'# عرض الخصم لهذا المتجر (استثناء يلغي قاعدة «السعر ثابت» و«ممنوع أي خصم» و«بدون أي خصم» لهذا المتجر بس)'",
    to: "'# عرض الخصم لهذا المتجر'",
  },
  {
    label: 'عرض الخصم بفرع المؤهل',
    from: "'- عدنا خصم ' + pct + '% على أول طلب يستفيد منه الزبون ويا المتجر (أول طلب ينحسب بيه خصم فعلاً)، بدون حد أدنى للمبلغ وبدون كود. الخصم على سعر المنتجات بس، مو على أجور التوصيل.'",
    to: "(first ? '- عدنا خصم ' + pct + '% على أول طلب يستفيد منه الزبون ويا المتجر (أول طلب ينحسب بيه خصم فعلاً)، بدون حد أدنى للمبلغ وبدون كود. الخصم على سعر المنتجات بس، مو على أجور التوصيل.' : '')",
  },
]

const swap = (text, from, to, label) => {
  const n = text.split(from).length - 1
  if (n !== 1) throw new Error(`[${label}] لازم يتطابق مرة وحدة، تطابق ${n}`)
  return text.replace(from, () => to)
}

/** @param {{ guard?: boolean }} [opts] الحارس يتعدّل بطلب صريح، قرار منفصل عن البرومت. @returns {string[]} التعديلات (فاضية = مزيود من قبل) */
export const patchWorkflow = (wf, { guard: withGuard = false } = {}) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []
  const guard = by(CHANNEL.guard)
  const agent = by(CHANNEL.agent)

  let code = String(guard.parameters.jsCode ?? '')
  for (const s of withGuard ? GUARD_SWAPS : []) {
    if (code.includes(s.to)) continue
    code = swap(code, s.from, s.to, s.label)
    changes.push(`${CHANNEL.guard}: ${s.label}`)
  }

  let sys = String(agent.parameters.options?.systemMessage ?? '')
  for (const s of [...BLOCK_SWAPS, ...AGENT_SWAPS]) {
    if (sys.includes(s.to)) continue
    sys = swap(sys, s.from, s.to, s.label)
    changes.push(`${CHANNEL.agent}: ${s.label}`)
  }

  if (changes.some((c) => c.startsWith(`${CHANNEL.guard}:`))) guard.parameters.jsCode = code
  if (changes.some((c) => c.startsWith(`${CHANNEL.agent}:`))) agent.parameters.options.systemMessage = sys
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
  const changes = patchWorkflow(wf, { guard: process.env.GUARD === '1' })
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
  const file = path.join(HERE, 'backups', `messenger-${wf.id}-before-first-order-discount-price.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(before, null, 2))
  const saved = await save(wf)
  console.log(`✓ messenger (${saved.name}) | active: ${saved.active} | versionId: ${saved.versionId} | activeVersionId: ${saved.activeVersionId ?? '-'}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (!KEY && !process.env.SRC) {
    console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
    process.exit(1)
  }
  await run()
}
