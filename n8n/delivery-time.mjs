/**
 * سؤال «شوكت يوصل؟» (ماسنجر 2026-10-29، التنفيذات 2869 و2879 و2898). التفاصيل بـ n8n/delivery-time.js (مختبَر).
 *
 *   ١. «تحديد التاجر» (الثلاث): عمود delivery_days — مدة التوصيل الي كتبها التاجر بلوحة برق
 *      (merchant_delivery_settings.local_days / other_days) جملة جاهزة. بلا إعدادات = ''.
 *   ٢. عقدة سياق الطلب («Order Context Hint» / «سياق الطلب»): تنبيه حاسم بآخر البرومت إذا الزبون سأل شوكت يوصل.
 *   ٣. الحارس الأخير («Drop Repeated Blocks» / «حذف المكرر من الرد»): وعد بمدة مو مكتوبة بالإعدادات ينشال،
 *      وسؤال الوصول ما يطلع بلا جواب. ينحط قبل سطر الإرجاع، بعد كتلة n8n/reply-reliability.js.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/delivery-time.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/delivery-time.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/delivery-time.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/answer-accuracy.mjs). آمن للتكرار: الكتل المزيودة تتحدث لآخر نسخة،
 * ويحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'delivery-time.js'), 'utf8')

export const CHANNELS = {
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', context: 'Order Context Hint', guard: 'Drop Repeated Blocks', hints: 'Conversation Hints' },
  messenger: { id: 'GP0rtSxxEHWT3kLj', context: 'Order Context Hint', guard: 'Drop Repeated Blocks', hints: 'Conversation Hints' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', context: 'سياق الطلب', guard: 'حذف المكرر من الرد', hints: 'تلميحات المحادثة' },
}

const MARK = 'n8n/delivery-time.js'
const MERCHANT = 'تحديد التاجر'
const NAMES = ['dtNorm', 'DT_WHEN', 'DT_ARRIVE', 'DT_EN', 'isDeliveryTimeQuestion', 'daysPhrase', 'dtStated', 'deliveryTimeAnswer',
  'deliveryTimeHint', 'DT_ABOUT', 'DT_CLAIM', 'DT_ANSWERED', 'dtHidden', 'guardDeliveryTime']

// ١. SQL: عمود جديد بعد delivery_fees. نفس صيغة daysPhrase
const SQL_ANCHOR = 'END AS delivery_fees,'
const days = (col) => `CASE WHEN ${col} = 0 THEN 'بنفس اليوم' WHEN ${col} = 1 THEN 'خلال يوم واحد' WHEN ${col} = 2 THEN 'خلال يومين'`
  + ` WHEN ${col} <= 10 THEN 'خلال ' || ${col} || ' أيام' ELSE 'خلال ' || ${col} || ' يوم' END`
export const SQL_ADD = `
       -- مدة التوصيل من إعدادات التاجر («المدة (أيام)» بلوحة برق): جواب «شوكت يوصل» من الإعدادات بس (${MARK})
       CASE WHEN ds.merchant_id IS NULL OR ds.local_days IS NULL OR ds.other_days IS NULL THEN ''
            ELSE format('مدة التوصيل المعلنة من المتجر: %s ل%s، و%s لباقي المحافظات.',
                        ${days('ds.local_days')},
                        CASE WHEN btrim(ds.base_governorate) LIKE 'ال%' THEN substr(btrim(ds.base_governorate), 2)
                             ELSE btrim(ds.base_governorate) END,
                        ${days('ds.other_days')})
       END AS delivery_days,`

// ٢. التنبيه: بآخر البرومت، بسطر الإرجاع الناجح للعقدة
const HINT_OLD = '+ res.hint,'
const HINT_NEW = `+ res.hint + deliveryTimeHint(base.combinedMessage, (() => { try { return String($('${MERCHANT}').first().json.delivery_days || ''); } catch (e) { return ''; } })()),`

// ٣. الحارس
const RETURN_LINE = 'return { json: { ...$json, output: text } };'
const guardBlock = (c) => `${injected()}text = (() => {
  try {
    const said = (() => { try { return String($(${JSON.stringify(c.hints)}).first().json.combinedMessage || ''); } catch (e) { return ''; } })();
    const deliveryDays = (() => { try { return String($('${MERCHANT}').first().json.delivery_days || ''); } catch (e) { return ''; } })();
    return guardDeliveryTime(text, { said, deliveryDays });
  } catch (e) { return text; }
})();
// ---- نهاية ${MARK} ----

`

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const BLOCK_RE = new RegExp(`// ---- ${esc(MARK)} \\(مولّد[\\s\\S]*?// ---- نهاية ${esc(MARK)} ----\\r?\\n\\r?\\n`)

/** كود الوحدة كما ينحقن: بلا export، ومعلَّم بمصدره. */
export const injected = () => `// ---- ${MARK} (مولّد بـ n8n/delivery-time.mjs — لا تعدّل هنا) ----\n`
  + MODULE.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '').replace(/^export /gm, '').trimEnd() + '\n'
const hintBlock = () => injected() + `// ---- نهاية ${MARK} ----\n\n`

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}
const eolOf = (code) => (code.includes('\r\n') ? '\r\n' : '\n')
const withEol = (s, eol) => s.replace(/\r?\n/g, eol)
const checkNames = (code, what) => {
  for (const name of NAMES) {
    if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${what}: الاسم ${name} مستعمل من قبل`)
  }
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // ١. «تحديد التاجر»: عمود delivery_days
  const merchant = by(MERCHANT)
  const q = String(merchant.parameters.query ?? '')
  if (!q.includes('AS delivery_days')) {
    once(q, SQL_ANCHOR, `${MERCHANT}: delivery_fees`)
    if (!/merchant_delivery_settings ds\b/.test(q)) throw new Error(`${MERCHANT}: ما لگيت merchant_delivery_settings ds`)
    merchant.parameters.query = q.replace(SQL_ANCHOR, () => SQL_ANCHOR + withEol(SQL_ADD, eolOf(q)))
    changes.push(`${MERCHANT}: مدة التوصيل من الإعدادات (delivery_days)`)
  }

  // ٢. سياق الطلب: الوحدة بأول الكود، والتنبيه بسطر الإرجاع
  const ctx = by(c.context)
  let code = String(ctx.parameters.jsCode ?? '')
  const eol = eolOf(code)
  if (!code.includes(MARK)) {
    checkNames(code, c.context)
    once(code, HINT_OLD, `${c.context}: سطر الإرجاع`)
    code = withEol(hintBlock(), eol) + code.replace(HINT_OLD, () => HINT_NEW)
    changes.push(`${c.context}: تنبيه «شوكت يوصل» بآخر البرومت`)
  } else {
    if (!BLOCK_RE.test(code)) throw new Error(`${c.context}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    if (!code.includes(HINT_NEW)) throw new Error(`${c.context}: سطر التنبيه مو بالشكل المتوقع`)
    const next = code.replace(BLOCK_RE, () => withEol(hintBlock(), eol))
    if (next !== code) { code = next; changes.push(`${c.context}: ${MARK} محدّث`) }
  }
  ctx.parameters.jsCode = code

  // ٣. الحارس: قبل سطر الإرجاع (بعد كتلة reply-reliability)، وسطر الإرجاع يبقى مرة وحدة
  const guard = by(c.guard)
  const gcode = String(guard.parameters.jsCode ?? '')
  const geol = eolOf(gcode)
  const block = withEol(guardBlock(c), geol)
  if (!gcode.includes(MARK)) {
    checkNames(gcode, c.guard)
    once(gcode, RETURN_LINE, `${c.guard}: سطر الإرجاع`)
    guard.parameters.jsCode = gcode.replace(RETURN_LINE, () => block + RETURN_LINE)
    changes.push(`${c.guard}: وعد بمدة وصول مو مكتوبة ينشال، وسؤال الوصول ينجاوب`)
  } else {
    if (!BLOCK_RE.test(gcode)) throw new Error(`${c.guard}: ما لگيت كتلة ${MARK} حتى أحدّثها`)
    const next = gcode.replace(BLOCK_RE, () => block)
    if (next !== gcode) { guard.parameters.jsCode = next; changes.push(`${c.guard}: ${MARK} محدّث`) }
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-delivery-time.json`)
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
