/**
 * رقم الموبايل بأي صيغة (ماسنجر 2026-10-31): 07XXXXXXXXX، أو +964 / 00964 / 964 وبعدها الرقم.
 * التفاصيل والدالة بـ n8n/phone-formats.js.
 *
 *   ١. برومت الوكيل (ماسنجر وواتساب): سطر الرقم يقبل الصيغتين، والملخص يكتبه بـ 07، وممنوع يطلب من الزبون يبدي بـ 07.
 *   ٢. بوابة الرقم بعقدة «Clean Agent Reply» (ماسنجر بس، واتساب ما عنده بوابة): الرقم يُقرأ من رسالة الزبون بأي صيغة،
 *      وصياغة طلب الرقم ما تذكر 07 بس.
 *   ٣. بوابة الرقم: قبل الحجز (create_order) ما نكول «تم تأكيد طلبك»، هذا ملخص ينتظر موافقة الزبون (التنفيذ 3087:
 *      «اعتمد عليه» ← «تم عزيزي، تم تأكيد طلبك… أثبّتلك الطلب؟»).
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/phone-formats.mjs messenger whatsapp
 *   DRY=1 N8N_KEY=<api key> node n8n/phone-formats.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/phone-formats.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/understand-intent.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'phone-formats.js'), 'utf8')

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent', gate: 'Clean Agent Reply' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent', gate: null },
}

const MARK = 'n8n/phone-formats.js'
const PHONE_WORD_LINE = 'const PHONE_WORD = /رقم (?:ال)?(?:هاتف|موبايل|تلفون)/;'
const GIVEN_OLD = 'const given = (userPrompt.match(/contact_phone\\)\\s*:\\s*(0\\d{10})/) || [])[1];'
const GIVEN_NEW = `const customerText = (() => { try { return String($('Build User Prompt').item.json.combinedMessage || ''); } catch (e) { return ''; } })();
  const given = iraqiPhone(customerText) || (userPrompt.match(/contact_phone\\)\\s*:\\s*(0\\d{10})/) || [])[1];`
const WRONG_OLD = "'رقم الهاتف الي وصلني مو كامل أو غلط؛ رقم الموبايل لازم يكون 11 رقم ويبدي بـ 07. '"
const WRONG_NEW = "'رقم الهاتف الي وصلني مو كامل أو غلط؛ '"
const WRONG_TAIL_OLD = "' مرة ثانية حتى أثبّت الطلب.'"
const WRONG_TAIL_NEW = "' مرة ثانية (مثلاً 07... أو +964...) حتى أثبّت الطلب.'"
const ASK_OLD = "' (يبدي بـ 07) حتى أثبّت الطلب.'"
const ASK_NEW = "' (مثلاً 07... أو +964...) حتى أثبّت الطلب.'"
const GATE_ANCHOR = 'if (stageOf(text) !== 4 && !/order_completed/i.test(text) && CONFIRM_Q.test(text) && !PHONE_RE.test(toLatin(text))) {'
const CONFIRM_WORDING = `// قبل ما ينفتح الحجز (create_order) ما نكول «تم تأكيد طلبك»: هذا ملخص ينتظر موافقة الزبون (ماسنجر 2026-10-31، التنفيذ 3087)
if (!ran('create_order') && CONFIRM_Q.test(text)) text = text.replace(/تم عزيزي[،,]?\\s*تم تأكيد طلبك/, 'تمام عزيزي، هذا ملخص طلبك').replace(/تم تأكيد طلبك/, 'هذا ملخص طلبك');
`
const PROMPT_OLD = 'رقم موبايل عراقي 11 مرتبة يبدي بـ 07 (أو +964)'
const PROMPT_NEW = 'رقم موبايل عراقي بأي صيغة: 07XXXXXXXXX، أو +964 أو 00964 وبعدها الرقم. بالملخص اكتبه بصيغة 07 (11 رقم)، وممنوع تقول للزبون لازم يبدي بـ 07'

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}
const swapOnce = (code, from, to, what) => {
  once(code, from, what)
  return code.replace(from, () => to)
}
const eolOf = (code) => (code.includes('\r\n') ? '\r\n' : '\n')

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // ١. البرومت: سطر الرقم
  const opts = by(c.agent).parameters.options
  const sm = String(opts.systemMessage ?? '')
  if (sm.includes(PROMPT_OLD)) {
    opts.systemMessage = swapOnce(sm, PROMPT_OLD, PROMPT_NEW, `${c.agent}: سطر الرقم بالبرومت`)
    changes.push(`${c.agent}: الرقم يقبل 07 والدولي (+964)، والملخص بصيغة 07`)
  }

  // ٢ و٣. بوابة الرقم (ماسنجر)
  if (c.gate) {
    const node = by(c.gate)
    let code = String(node.parameters.jsCode ?? '')
    if (!code.includes(MARK)) {
      const eol = eolOf(code)
      const block = `// ---- ${MARK} (مولّد بـ n8n/phone-formats.mjs — لا تعدّل هنا) ----\n`
        + MODULE.replace(/^\/\*\*[\s\S]*?\*\/\n\n/, '').replace(/^export /gm, '').trimEnd()
        + `\n// ---- نهاية ${MARK} ----\n`
      const put = (s) => s.replace(/\r?\n/g, eol)
      code = swapOnce(code, PHONE_WORD_LINE, PHONE_WORD_LINE + '\n' + put(block), `${c.gate}: PHONE_WORD`)
      code = swapOnce(code, GIVEN_OLD, put(GIVEN_NEW), `${c.gate}: قراءة الرقم`)
      code = swapOnce(code, WRONG_OLD, WRONG_NEW, `${c.gate}: صياغة الرقم الغلط`)
      code = swapOnce(code, WRONG_TAIL_OLD, WRONG_TAIL_NEW, `${c.gate}: مثال الرقم`)
      code = swapOnce(code, ASK_OLD, ASK_NEW, `${c.gate}: صياغة طلب الرقم`)
      code = swapOnce(code, GATE_ANCHOR, put(CONFIRM_WORDING) + GATE_ANCHOR, `${c.gate}: قبل البوابة`)
      node.parameters.jsCode = code
      changes.push(`${c.gate}: الرقم يُقرأ بأي صيغة، وطلب الرقم ما يذكر 07 بس، و«تم تأكيد طلبك» ما تنقال قبل الحجز`)
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-phone-formats.json`)
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
