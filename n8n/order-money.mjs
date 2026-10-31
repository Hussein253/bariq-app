/**
 * مبلغ الملخص = مبلغ الطلب المحفوظ (ماسنجر 2026-10-31، الطلب 51). التفاصيل والحساب بـ n8n/order-money.js.
 *
 *   آخر حارس («Drop Repeated Blocks»): الرد الي بيه «المجموع الكلي» تنحسب أرقامه من نفس مصادر القاعدة —
 *   الكتالوج (price_iqd) وأجور التوصيل (delivery_fees من إعدادات التاجر) ونسبة الخصم (نفس حقل create_order) —
 *   ويتصحح سطر التوصيل والمجموع، ويذكر خصم أول طلب إذا ما مذكور.
 *   ماسنجر بخصم أول طلب، وواتساب بدون (create_order بواتساب ما بيه discount_pct، فالطلب ينحفظ بدون خصم).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/order-money.mjs messenger whatsapp
 *   DRY=1 N8N_KEY=<api key> node n8n/order-money.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/order-money.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/ack-guard.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'order-money.js'), 'utf8')

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', guard: 'Drop Repeated Blocks', merchant: 'تحديد التاجر', discount: true },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', guard: 'Drop Repeated Blocks', merchant: 'تحديد التاجر', discount: false },
}

const MARK = 'n8n/order-money.js'
const RETURN_LINE = 'return { json: { ...$json, output: text } };'
const BLOCK_RE = /\/\/ ---- n8n\/order-money\.js \(مولّد[\s\S]*?\/\/ ---- نهاية n8n\/order-money\.js ----\r?\n\r?\n/
const NAMES = ['moneyLatin', 'moneyNorm', 'moneyEscape', 'formatIqd', 'parseIqd', 'parseDeliveryFees', 'GOVERNORATES', 'governoratesIn',
  'deliveryFeeFor', 'QTY_UNIT', 'summaryQuantity', 'unitListPrice', 'orderDiscountPct', 'TOTAL_RE', 'FEE_RE', 'ITEMS_RE', 'fixSummaryMoney']

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}

export const guardBlock = (c, eol = '\n') => {
  const body = MODULE.replace(/^\/\*\*[\s\S]*?\*\/\r?\n\r?\n/, '').replace(/^export /gm, '').trimEnd()
  const block = `// ---- ${MARK} (مولّد بـ n8n/order-money.mjs — لا تعدّل هنا) ----
${body}
text = (() => {
  try {
    const m = (() => { try { return $(${JSON.stringify(c.merchant)}).first().json || {}; } catch (e) { return {}; } })();
    const catalog = Array.isArray(m.catalog) ? m.catalog : (() => { try { return JSON.parse(m.catalog || '[]'); } catch (e) { return []; } })();
    return fixSummaryMoney(text, { catalog, deliveryFees: String(m.delivery_fees || ''), discountPct: ${c.discount ? 'orderDiscountPct(m)' : '0'} });
  } catch (e) { return text; }
})();
// ---- نهاية ${MARK} ----

`
  return block.replace(/\r?\n/g, eol)
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const guard = wf.nodes.find((x) => x.name === c.guard)
  if (!guard) throw new Error(`ماكو عقدة باسم ${c.guard}`)
  if (!wf.nodes.some((x) => x.name === c.merchant)) throw new Error(`ماكو عقدة باسم ${c.merchant}`)
  const code = String(guard.parameters.jsCode ?? '')
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  if (code.includes(MARK)) {
    if (!BLOCK_RE.test(code)) throw new Error(`${c.guard}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    const next = code.replace(BLOCK_RE, () => guardBlock(c, eol))
    if (next === code) return []
    guard.parameters.jsCode = next
    return [`${c.guard}: ${MARK} محدّث`]
  }
  for (const name of NAMES) {
    if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.guard}: الاسم ${name} مستعمل من قبل`)
  }
  once(code, RETURN_LINE, `${c.guard}: سطر الإرجاع`)
  guard.parameters.jsCode = code.replace(RETURN_LINE, () => guardBlock(c, eol) + RETURN_LINE)
  return [`${c.guard}: مبلغ الملخص ينحسب مثل القاعدة (التوصيل حسب المحافظة${c.discount ? '، وخصم أول طلب' : ''})`]
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-order-money.json`)
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
