/**
 * صور المنتجات بالبوت (طلب صاحب المتجر 2026-10-29): «إذا الزبون طلب صورة المنتج من البوت، يدزله صور المنتج».
 *
 *   التاجر يرفع الصور من لوحة برق (الترحيل ٠٣٢ + /api/catalog/images)، والمنطق كله بـ n8n/product-images.js (مختبَر).
 *   هذا السكربت يزرعه بالمسارات الثلاث:
 *     ١. «تحديد التاجر»: عمود product_images = public.bot_product_images_section(merchant_id).
 *     ٢. برومت الوكيل: قسم «صور المنتجات» قبل تعليمات المتجر، بس إذا القائمة مو فاضية.
 *     ٣. «Product Images Marker» بين الوكيل والحارس الأول: تشيل سطر IMAGES وتحفظ الرموز.
 *     ٤. بعد إرسال الرد النصي: «Product Images?» ← «Load Product Images» ← (توكن الصفحة) ← «Send Product Image»
 *        لكل صورة، وفشل التحميل أو الإرسال ← «Log Product Image Error» (failed_events). الصور ما توقف الرد أبداً.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/product-images.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/product-images.mjs messenger           # يطبع التعديلات وما يرسل شي
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/product-images.mjs messenger   # على ملف محلي، بلا n8n
 *
 * آمن للتكرار: كل تعديل مزيود من قبل ينتجاهل. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 * ⚠️ PUT على مسار مفعّل ينشره فوراً. واتساب: إذا البوت ما يرد بعده، عطّل المسار، انتظر ≥60 ثانية، وفعّله مرة وحدة.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { PROMPT_RULES, PROMPT_SECTION } from './product-images.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const MODULE = fs.readFileSync(path.join(HERE, 'product-images.js'), 'utf8')

const MERCHANT = 'تحديد التاجر'

export const CHANNELS = {
  whatsapp: {
    id: 'i3fCYtVjPHtqvXvm',
    agent: 'Iraqi Store AI Agent',
    prompt: 'Build User Prompt',
    lastBot: 'Load Last Bot Message',
    parsed: 'Parse Agent Output',
    after: ['Send WhatsApp Reply'],
    phone: "$('Message Data').first().json.phone",
    names: {
      marker: 'Product Images Marker',
      gate: 'Product Images?',
      load: 'Load Product Images',
      log: 'Log Product Image Error',
    },
    send: {
      kind: 'whatsapp',
      template: 'Send WhatsApp Reply',
      name: 'Send Product Image',
      session: 'Session Context',
    },
  },
  messenger: {
    id: 'GP0rtSxxEHWT3kLj',
    agent: 'Iraqi Store AI Agent',
    prompt: 'Build User Prompt',
    lastBot: 'Load Last Bot Message',
    parsed: 'Parse Agent Output',
    after: ['Send Messenger Reply', 'Send Messenger Reply (المميز)', 'Send Voice Reply (style)', 'Send Voice Reply (premium)'],
    phone: "$('Message Data').first().json.phone",
    names: {
      marker: 'Product Images Marker',
      gate: 'Product Images?',
      load: 'Load Product Images',
      log: 'Log Product Image Error',
    },
    send: {
      kind: 'graph',
      switch: 'اختيار توكن الصفحة',
      switchName: 'اختيار توكن الصفحة (صور)',
      outputs: [
        { key: 'ستايل بغداد', template: 'Send Messenger Reply', name: 'Send Product Image' },
        { key: 'المميز', template: 'Send Messenger Reply (المميز)', name: 'Send Product Image (المميز)' },
      ],
    },
  },
  instagram: {
    id: 'CTuJ0eGVthUjREVJ',
    agent: 'وكيل المبيعات (علاء)',
    prompt: 'تجهيز رسالة الوكيل',
    lastBot: 'تحميل آخر رد للبوت',
    parsed: 'تحليل مخرجات الوكيل',
    after: ['إرسال رد Instagram'],
    phone: "$('بيانات الرسالة').first().json.phone",
    names: {
      marker: 'علامة صور المنتج',
      gate: 'صور المنتج؟',
      load: 'تحميل صور المنتج',
      log: 'تسجيل فشل صورة المنتج',
    },
    send: {
      kind: 'graph',
      switch: 'اختيار توكن الحساب',
      switchName: 'اختيار توكن الحساب (صور)',
      outputs: [{ key: 'ستايل بغداد', template: 'إرسال رد Instagram', name: 'إرسال صورة المنتج' }],
    },
  },
}

const SECTION_FIELD = 'product_images'
const SECTION_SQL = `public.bot_product_images_section(sa.merchant_id) AS ${SECTION_FIELD},`
const MERCHANT_SECTION = "{{ $('تحديد التاجر').first().json.merchant_section }}"

const PROMPT_EXPR_HEAD = `{{ (() => { const l = String($('${MERCHANT}').first().json.${SECTION_FIELD} || '').trim(); `
const PROMPT_EXPR_TAIL = ` : ''; })() }}`

/** تعبير البرومت: القسم كامل إذا القائمة مو فاضية، وإلا ولا حرف (تاجر بلا صور = البوت مثل ما جان). */
export const PROMPT_EXPR =
  PROMPT_EXPR_HEAD + `return l ? ${JSON.stringify(PROMPT_SECTION + '\n')} + l + ${JSON.stringify(PROMPT_RULES)}` + PROMPT_EXPR_TAIL

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** نفس التعبير بأي نسخة قديمة من القواعد: حتى تعديل PROMPT_RULES يوصل للمسارات المزيودة من قبل. */
const ANY_PROMPT_EXPR = new RegExp(escapeRe(PROMPT_EXPR_HEAD) + '[\\s\\S]*?' + escapeRe(PROMPT_EXPR_TAIL))

/** كود عقدة العلامة: المصدر المختبَر + مدخلات المسار. */
export const markerCode = (c) => MODULE.replace(/^export /gm, '').trimEnd() + `

// ---- n8n: المدخلات من عقد هذا المسار (مولّد من n8n/product-images.js — لا تعدّل هنا) ----
const NODES = ${JSON.stringify({ prompt: c.prompt, lastBot: c.lastBot })};
const j = $input.item.json || {};
const customerMessage = (() => { try { return String($(NODES.prompt).first().json.combinedMessage || ''); } catch (e) { return ''; } })();
const lastBotReply = (() => { try { return String($(NODES.lastBot).first().json.last_bot || ''); } catch (e) { return ''; } })();
try {
  const r = productImagesMarker({ output: j.output ?? j.text ?? '', customerMessage, lastBotReply });
  return { json: { ...j, output: r.output, productImageCodes: r.codes, productImageCodesDropped: r.dropped } };
} catch (e) {
  // الصور إضافة: أي خطأ هنا ما يوقف الرد، يمشي بدون صور
  return { json: { ...j, productImageCodes: [] } };
}
`

const gateCode = (c) => `// صور المنتج: الرموز من «${c.names.marker}» (الوكيل كتب IMAGES والزبون طالب صورة). رد التحويل لموظف ما ينبعث وياه صور.
// مولّد من n8n/product-images.mjs — لا تعدّل هنا.
let codes = [];
try { codes = $(${JSON.stringify(c.names.marker)}).first().json.productImageCodes || []; } catch (e) { codes = []; }
let notification = '';
try { notification = String($(${JSON.stringify(c.parsed)}).first().json.notification_type || ''); } catch (e) { notification = ''; }
if (!Array.isArray(codes) || !codes.length || /complaint/i.test(notification)) return [];
return [{ json: { codes: codes.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).join('|') } }];
`

const loadQuery = (storageOrigin) => `-- صور المنتج: رموز الوكيل ← صور هذا التاجر وحده (public.bot_product_images، الترحيل ٠٣٢): أول ٣ رموز، ٦ صور كحد أعلى.
-- الحاوية product-images عامة: Meta تنزّل الصورة من هذا الرابط مباشرة.
SELECT '${storageOrigin}/storage/v1/object/public/product-images/' || path AS url, code, product_name, color
  FROM public.bot_product_images($1::uuid, string_to_array($2, '|')::bigint[]);`

const graphBody = (recipient) =>
  `={{ JSON.stringify({ recipient: { id: ${recipient} }, messaging_type: 'RESPONSE', message: { attachment: { type: 'image', payload: { url: $json.url } } } }) }}`

const clone = (node, name, position, patch = {}) => ({
  ...JSON.parse(JSON.stringify(node)),
  id: crypto.randomUUID(),
  name,
  position,
  ...patch,
})

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

/** @returns {string[]} التعديلات (فاضية = المسار مرتب من قبل) */
export const patchWorkflow = (wf, c) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`ماكو عقدة باسم ${name}`)
    return n
  }
  const has = (name) => wf.nodes.some((x) => x.name === name)
  const outs = (name) => (wf.connections[name] ??= { main: [] }).main
  const link = (from, to, index = 0) => {
    const out = outs(from)
    while (out.length <= index) out.push([])
    out[index] ??= []
    if (out[index].some((l) => l.node === to)) return false
    out[index].push({ node: to, type: 'main', index: 0 })
    changes.push(`وصلة ${from}${index ? ` (مخرج ${index})` : ''} ← ${to}`)
    return true
  }
  const changes = []
  const N = c.names
  // كل صورة رسالة: قالب رد النص عليه «Execute Once»، ونسخة الإرسال جانت ترثه فتدز أول صورة بس
  const sendEach = (name) => {
    const n = by(name)
    if (!n.executeOnce) return
    n.executeOnce = false
    changes.push(`${name}: Execute Once منطفي، تنرسل كل الصور`)
  }

  // التحقق قبل أي تعديل: كل عقدة يعتمد عليها المسار موجودة
  const merchant = by(MERCHANT)
  const agent = by(c.agent)
  by(c.prompt); by(c.lastBot); by(c.parsed)
  for (const a of c.after) by(a)
  const errorTemplate = by('Log Shipment Error')
  const voiceSave = wf.nodes.find((n) => /\.supabase\.co\/storage\/v1\/object\/conversation-media/.test(String(n.parameters?.url ?? '')))
  const storageOrigin = (String(voiceSave?.parameters?.url ?? '').match(/https:\/\/[a-z0-9]+\.supabase\.co/) ?? [])[0]
  if (!storageOrigin) throw new Error('ما لگيت رابط Supabase بعقدة حفظ الصوت')

  // ١. عمود القائمة بـ «تحديد التاجر»
  const q = String(merchant.parameters.query ?? '')
  if (!q.includes('bot_product_images_section')) {
    const anchor = /SELECT sa\.merchant_id,\n/
    if (!anchor.test(q)) throw new Error(`${MERCHANT}: ما لگيت «SELECT sa.merchant_id,» حتى أضيف عمود الصور`)
    merchant.parameters.query = q.replace(anchor, (m) => `${m}       ${SECTION_SQL}\n`)
    changes.push(`${MERCHANT}: عمود ${SECTION_FIELD}`)
  }

  // ٢. قسم البرومت قبل تعليمات المتجر
  const opts = (agent.parameters.options ??= {})
  const sm = String(opts.systemMessage ?? '')
  if (!sm.includes(`json.${SECTION_FIELD}`)) {
    if (!sm.includes(MERCHANT_SECTION)) throw new Error(`${c.agent}: ما لگيت merchant_section بالبرومت`)
    opts.systemMessage = sm.replace(MERCHANT_SECTION, PROMPT_EXPR + MERCHANT_SECTION)
    changes.push(`${c.agent}: قسم «صور المنتجات» بالبرومت`)
  } else if (!sm.includes(PROMPT_EXPR)) {
    if (!ANY_PROMPT_EXPR.test(sm)) throw new Error(`${c.agent}: ما لگيت تعبير «صور المنتجات» القديم حتى أحدّثه`)
    opts.systemMessage = sm.replace(ANY_PROMPT_EXPR, () => PROMPT_EXPR)
    changes.push(`${c.agent}: قواعد «صور المنتجات» محدّثة`)
  }

  // ٣. العلامة بين الوكيل وأول عقدة بعده
  const agentOut = outs(c.agent)
  const firstAfter = (agentOut[0] ?? []).filter((l) => l.node !== N.marker)
  if (!has(N.marker)) {
    if (firstAfter.length !== 1) throw new Error(`${c.agent}: متوقع عقدة وحدة بعد الوكيل، لگيت ${firstAfter.length}`)
    const next = by(firstAfter[0].node)
    wf.nodes.push({
      id: crypto.randomUUID(),
      name: N.marker,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [next.position[0] - 112, next.position[1] + 208],
      parameters: { mode: 'runOnceForEachItem', jsCode: markerCode(c) },
    })
    changes.push(`${N.marker}: سطر IMAGES ينشال قبل الحراس`)
  } else if (by(N.marker).parameters.jsCode !== markerCode(c)) {
    by(N.marker).parameters.jsCode = markerCode(c) // الكود دائماً من المصدر
    changes.push(`${N.marker}: الكود محدّث من n8n/product-images.js`)
  }
  if (firstAfter.length) {
    agentOut[0] = [{ node: N.marker, type: 'main', index: 0 }]
    for (const l of firstAfter) link(N.marker, l.node)
    changes.push(`وصلة ${c.agent} ← ${N.marker}`)
  }

  // ٤. فرع الإرسال بعد الرد النصي
  const base = by(c.after[0]).position
  const at = (dx, dy = 0) => [base[0] + dx, base[1] + dy]
  if (!has(N.gate)) {
    wf.nodes.push({
      id: crypto.randomUUID(),
      name: N.gate,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: at(240, -224),
      parameters: { jsCode: gateCode(c) },
    })
    changes.push(`${N.gate}: الصور بعد ما ينرسل الرد`)
  }
  for (const a of c.after) link(a, N.gate)

  if (!has(N.load)) {
    wf.nodes.push({
      id: crypto.randomUUID(),
      name: N.load,
      type: merchant.type,
      typeVersion: merchant.typeVersion,
      position: at(480, -224),
      credentials: JSON.parse(JSON.stringify(merchant.credentials)),
      onError: 'continueErrorOutput',
      parameters: {
        operation: 'executeQuery',
        query: loadQuery(storageOrigin),
        options: { queryReplacement: `={{ $('${MERCHANT}').first().json.merchant_id }},{{ $json.codes }}` },
      },
    })
    changes.push(`${N.load}: صور الرموز لهذا التاجر وحده`)
  }
  link(N.gate, N.load)

  if (!has(N.log)) {
    wf.nodes.push(clone(errorTemplate, N.log, at(1200, -64), {
      onError: 'continueRegularOutput',
      parameters: {
        tableId: 'failed_events',
        fieldsUi: {
          fieldValues: [
            { fieldId: 'workflow_name', fieldValue: '={{ $workflow.name }}' },
            { fieldId: 'node_name', fieldValue: 'Send Product Image' },
            { fieldId: 'phone_number', fieldValue: `={{ ${c.phone} }}` },
            { fieldId: 'error_message', fieldValue: "={{ String($json.error?.message || $json.error || $json.message || 'product image failed').slice(0, 300) }}" },
            { fieldId: 'status', fieldValue: 'OPEN' },
            { fieldId: 'raw_input', fieldValue: "={{ { execution_id: $execution.id, source: 'product_images', url: $json.url || null } }}" },
          ],
        },
      },
    }))
    changes.push(`${N.log}: فشل الصور بـ failed_events`)
  }
  link(N.load, N.log, 1)

  if (c.send.kind === 'whatsapp') {
    const s = c.send
    if (!has(s.name)) {
      wf.nodes.push(clone(by(s.template), s.name, at(720, -224), {
        onError: 'continueErrorOutput',
        executeOnce: false,
        parameters: {
          operation: 'send',
          phoneNumberId: `={{ $('${s.session}').first().json.phoneNumberId }}`,
          recipientPhoneNumber: `={{ $('${s.session}').first().json.phone }}`,
          messageType: 'image',
          mediaPath: 'useMediaLink',
          mediaLink: '={{ $json.url }}',
          additionalFields: {},
        },
      }))
      changes.push(`${s.name}: كل صورة رسالة واتساب`)
    }
    sendEach(s.name)
    link(N.load, s.name)
    link(s.name, N.log, 1)
  } else {
    const s = c.send
    const sw = by(s.switch)
    const keys = sw.parameters.rules.values.map((r) => r.outputKey)
    if (!has(s.switchName)) {
      wf.nodes.push(clone(sw, s.switchName, at(720, -224)))
      changes.push(`${s.switchName}: توكن الصفحة للصور`)
    }
    link(N.load, s.switchName)
    const recipient = `$('${c.parsed}').first().json.phone`
    s.outputs.forEach((o, i) => {
      const index = keys.indexOf(o.key)
      if (index < 0) throw new Error(`${s.switch}: ما لگيت مخرج «${o.key}»`)
      if (!has(o.name)) {
        const tpl = by(o.template)
        wf.nodes.push(clone(tpl, o.name, at(960, -224 + i * 160), {
          onError: 'continueErrorOutput',
          executeOnce: false,
          parameters: {
            ...JSON.parse(JSON.stringify(tpl.parameters)),
            jsonBody: graphBody(recipient),
            options: { batching: { batch: { batchSize: 1, batchInterval: 700 } } },
          },
        }))
        changes.push(`${o.name}: كل صورة رسالة (${o.key})`)
      }
      sendEach(o.name)
      link(s.switchName, o.name, index)
      link(o.name, N.log, 1)
    })
  }

  return changes
}

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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-product-images.json`)
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
