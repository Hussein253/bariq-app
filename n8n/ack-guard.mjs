/**
 * الموافقة ما تنعاد عليها نفس السؤال (ماسنجر 2026-10-31، التنفيذات 3111 و3119). التفاصيل والأمثلة بـ n8n/ack-guard.js.
 *
 *   ١. «Order Context Hint»: «تم» وكلمة «ملخص» يتعرفون كموافقة وتأكيد: الرد السابق اللي فيه «ملخص طلبك» ما يضيع
 *      من تتبع الطلب (ITEM_STATED)، وستيكر 👍 والإعجاب يصيرون موافقة (AFFIRM، confirmedOnce).
 *   ٢. «Drop Repeated Blocks» (آخر حارس): الزبون وافق بكلمة أو إعجاب، والرد يعيد سؤال التأكيد اللي البوت سأله قبل ←
 *      تنشال الجملة المكررة، وإذا ما بقى شي «تمام عزيزي 🌷».
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/ack-guard.mjs messenger whatsapp
 *   DRY=1 N8N_KEY=<api key> node n8n/ack-guard.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/ack-guard.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/phone-formats.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'ack-guard.js'), 'utf8')

export const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', context: 'Order Context Hint', guard: 'Drop Repeated Blocks' },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', context: 'Order Context Hint', guard: 'Drop Repeated Blocks' },
}

const MARK = 'n8n/ack-guard.js'
const ITEM_STATED_OLD = 'const ITEM_STATED = /تم تاكيد طلب|طلب[كچ] هسه صار|تفاصيل طلب[كچ]/;'
const ITEM_STATED_NEW = 'const ITEM_STATED = /تم تاكيد طلب|طلب[كچ] هسه صار|تفاصيل طلب[كچ]|ملخص طلب[كچ]/;'
const AFFIRM_OLD = "'كمل', 'نكمل', 'صح', 'صحيح', 'خلص',"
const AFFIRM_NEW = "'كمل', 'نكمل', 'صح', 'صحيح', 'خلص', 'تم', 'اعجاب', 'لايك', 'ستيكر',"
const CONFIRM_OLD = '  return tokens.some((t) => AFFIRM.has(t));'
const CONFIRM_NEW = '  return tokens.some((t) => AFFIRM.has(t)) || /[👍👌✅💯🙏❤🥰😊🌷👏]/u.test(combinedMessage);'
const RETURN_LINE = 'return { json: { ...$json, output: text } };'
const NAMES = ['ACK_WORDS', 'ACK_EMOJI', 'latinize', 'isAckMessage', 'DETAIL_CONFIRM_Q', 'hiddenLine', 'dropRepeatedConfirm']

const once = (code, needle, what) => {
  const n = code.split(needle).length - 1
  if (n !== 1) throw new Error(`${what}: متوقع مرة وحدة، لگيت ${n}`)
}

const guardBlock = (eol) => {
  const body = MODULE.replace(/^\/\*\*[\s\S]*?\*\/\r?\n\r?\n/, '').replace(/^export /gm, '').trimEnd()
  const block = `// ---- ${MARK} (مولّد بـ n8n/ack-guard.mjs — لا تعدّل هنا) ----
${body}
text = (() => {
  try {
    const said = (() => { try { return String($('Conversation Hints').first().json.combinedMessage || ''); } catch (e) { return ''; } })();
    const lastBot = (() => {
      try {
        const r = $('Load Recent Bot Replies').first().json.replies;
        const a = typeof r === 'string' ? JSON.parse(r) : r;
        return Array.isArray(a) ? String(a[0] || '') : '';
      } catch (e) { return ''; }
    })();
    return dropRepeatedConfirm(text, { said, lastBot });
  } catch (e) { return text; }
})();
// ---- نهاية ${MARK} ----

`
  return block.replace(/\r?\n/g, eol)
}

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []

  // ١. Order Context Hint: الموافقة والملخص
  const ctx = by(c.context)
  let oc = String(ctx.parameters.jsCode ?? '')
  if (!oc.includes(ITEM_STATED_NEW)) {
    once(oc, ITEM_STATED_OLD, `${c.context}: ITEM_STATED`)
    once(oc, AFFIRM_OLD, `${c.context}: AFFIRM`)
    once(oc, CONFIRM_OLD, `${c.context}: confirmedOnce`)
    oc = oc.replace(ITEM_STATED_OLD, () => ITEM_STATED_NEW)
      .replace(AFFIRM_OLD, () => AFFIRM_NEW)
      .replace(CONFIRM_OLD, () => CONFIRM_NEW)
    ctx.parameters.jsCode = oc
    changes.push(`${c.context}: «ملخص طلبك» تتعرف كتأكيد للطلب، و«تم» والإعجاب وستيكر الموافقة صارت موافقة`)
  }

  // ٢. آخر حارس: الموافقة ما تعيد سؤال التأكيد
  const guard = by(c.guard)
  const code = String(guard.parameters.jsCode ?? '')
  if (!code.includes(MARK)) {
    for (const name of NAMES) {
      if (new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code)) throw new Error(`${c.guard}: الاسم ${name} مستعمل من قبل`)
    }
    once(code, RETURN_LINE, `${c.guard}: سطر الإرجاع`)
    const eol = code.includes('\r\n') ? '\r\n' : '\n'
    guard.parameters.jsCode = code.replace(RETURN_LINE, () => guardBlock(eol) + RETURN_LINE)
    changes.push(`${c.guard}: الموافقة ما تعيد سؤال التأكيد (تنشال الجملة المكررة)`)
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-ack-guard.json`)
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
