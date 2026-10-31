/**
 * افهم قصد الزبون قبل ما ترد (طلب صاحب المتجر 2026-10-31): قاعدة ثابتة بأول برومت الوكيل، فوق كل التعليمات.
 *
 *   ماسنجر 2026-10-29 14:37: «You're welcome! 🖤» ← «عدنا هودي شتوي باللون الأسود، هودي شتوي باللون الأبيض.»
 *   حارس «Drop Repeated Blocks» (n8n/reply-reliability.js) يعرف المجاملة من قائمة كلمات ثابتة، وسطر الشكر بالبرومت
 *   أمثلته عربية بس. صاحب المتجر يريد البوت يفهم ويحلل: الشكر والعفو والترحيب بأي لغة أو صيغة ينفهم ويتجاوب بمثله،
 *   مو بعرض منتجات. فالقاعدة تنحط قسم بأول البرومت (قبل «# الهوية») حتى تسبق كل التعليمات والأمثلة.
 *   الحارس يبقى شبكة أمان للصيغ المعروفة.
 *
 *   ماسنجر 2026-10-31: «اني طولي ١٧٠ و وزني ١٠٠ شنو القياس مناسب الي» ← «عدنا قياسات الهودي الشتوي: سمول، ميديم،
 *   لارج، واكس لارج. تحب أحولك؟». صاحب المتجر يريد جواب السؤال: قياس واحد بالاسم، لأي تاجر وأي منتج بقياسات.
 *   فالقسم بيه قاعدة «القياس المناسب» ويا دليل عام، وتنبيه SIZE_FIT_HINT (n8n/answer-accuracy.js) يحيل عليها.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/understand-intent.mjs whatsapp messenger instagram
 *   DRY=1 N8N_KEY=<api key> node n8n/understand-intent.mjs messenger
 *   SRC=<workflow.json> OUT=<patched.json> node n8n/understand-intent.mjs messenger
 *
 * تعديل موضعي على المسار الحي (مثل n8n/reply-scope.mjs). آمن للتكرار، ويحفظ نسخة «قبل» بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'

export const CHANNELS = {
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', agent: 'Iraqi Store AI Agent' },
  messenger: { id: 'GP0rtSxxEHWT3kLj', agent: 'Iraqi Store AI Agent' },
  instagram: { id: 'CTuJ0eGVthUjREVJ', agent: 'وكيل المبيعات (علاء)' },
}

/** القسم ينزرع قبل هذا العنوان (أول البرومت بالثلاث مسارات). */
export const IDENTITY_ANCHOR = '# الهوية\n'
export const INTENT_HEADING = '# قاعدة ثابتة: افهم قصد الزبون قبل ما ترد (فوق كل التعليمات والأمثلة)'
export const INTENT_RULE = `${INTENT_HEADING}
- اقرأ رسالة الزبون كلها وافهم شنو يقصد بيها، بأي لغة أو لهجة كتبها (عربي، عراقي، إنكليزي، كردي، إيموجي)، وجاوب على قصده هو. ممنوع ترد على كلمة وحدة بيها، أو تكمّل موضوع قديم، أو تعرض منتجات ما سأل عنها.
- شكر أو مجاملة أو ختام بلا سؤال ولا طلب (مثل: شكراً، تسلم، مشكور، الله يخليك، العفو، Thank you، Thanks، You're welcome، ❤️، 🌷): الرد جملة مجاملة قصيرة تناسبها وبس، مثل «العفو عزيزي، نتشرف بخدمتك بأي وقت 🌷». «You're welcome» أو «العفو» من الزبون معناها يرد على شكرك، مو يسأل شي.
- تحية أو ترحيب بلا سؤال (مثل: مرحبا، هلا، السلام عليكم، أهلاً وسهلاً، مرحبا بك، Hi، Hello): رد التحية بترحيب قصير و«شلون أكدر أساعدك؟» وبس.
- بهالحالتين ممنوع تذكر منتج أو لون أو قياس أو سعر أو توصيل، وممنوع تسأل عن الطلب.
- إذا ويا الشكر أو التحية سؤال أو طلب (مثل «شكراً، شكد التوصيل؟»): جاوب على السؤال.
- «تمام» أو «اوك» أو «إي» أو «👍» جواباً على سؤالك (مثل «أثبّتلك الطلب؟») موافقة مو مجاملة: كمّل الطلب.
- القياس المناسب: إذا الزبون ذكر طوله أو وزنه أو عمره وسأل شنو القياس الي يناسبه، جاوب بقياس واحد بالاسم (سمول، ميديم، لارج، اكس لارج، دبل اكس لارج…)، بجملة أو جملتين. ممنوع تعدد كل القياسات المتوفرة بدل الجواب، وممنوع تحوّله لموظف بدل ما تجاوب.
  - إذا ويا رسالة الزبون تنبيه داخلي بـ«القياس المحسوب لهذا الزبون»، هذا هو الجواب: اتبعه حرفياً، ولا تغيّره ولا تعيد حسابه.
  - إذا تعليمات المتجر أو وصف المنتج بيها جدول قياسات، اعتمده حرفياً. وإذا ماكو، استعمل هذا الدليل العام للملابس (تقريبي، والوزن هو الأساس): سمول لحد 60 كيلو / ميديم 60–70 / لارج 70–80 / اكس لارج 80–90 / دبل اكس لارج 90–105 / تربل اكس لارج فوق 105. إذا طوله فوق 180 سم اختار قياس أكبر بدرجة. وإذا بين قياسين، اختار الأكبر للراحة.
  - القياس المقترح لازم يكون من القياسات المتوفرة للمنتج. إذا قياسه المثالي مو متوفر، قلها بصراحة واقترح أقرب قياس متوفر ويا ملاحظة قصيرة، مثل: «طولك ١٧٠ ووزنك ١٠٠ يناسبك دبل اكس لارج، وأكبر قياس متوفر عدنا اكس لارج، راح يجي ضيق شوية.»
  - إذا ما ذكر طول ولا وزن، اسأله عنهن بجملة وحدة. وإذا عمره أقل من 14 سنة، قل إن قياسات المنتج للكبار.

`
// نسخة سابقة من القسم (أي محتوى بين العنوان و«# الهوية»): تتبدل بالحالية
const SECTION_RE = new RegExp(`${INTENT_HEADING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=# الهوية\\n)`)

/** @returns {string[]} التعديلات */
export const patchWorkflow = (wf, c) => {
  const agent = wf.nodes.find((x) => x.name === c.agent)
  if (!agent) throw new Error(`ماكو عقدة باسم ${c.agent}`)
  const opts = (agent.parameters.options ??= {})
  const sm = String(opts.systemMessage ?? '')
  if (sm.includes(INTENT_RULE)) return []
  if (sm.includes(INTENT_HEADING)) {
    if (!SECTION_RE.test(sm)) throw new Error(`${c.agent}: لگيت عنوان القاعدة بس ما لگيت «# الهوية» وراه`)
    opts.systemMessage = sm.replace(SECTION_RE, () => INTENT_RULE)
    return [`${c.agent}: قاعدة «افهم قصد الزبون» محدّثة`]
  }
  const n = sm.split(IDENTITY_ANCHOR).length - 1
  if (n !== 1) throw new Error(`${c.agent}: متوقع «# الهوية» مرة وحدة بالبرومت، لگيت ${n}`)
  opts.systemMessage = sm.replace(IDENTITY_ANCHOR, () => INTENT_RULE + IDENTITY_ANCHOR)
  return [`${c.agent}: قاعدة ثابتة بأول البرومت «افهم قصد الزبون» (الشكر والعفو والترحيب بأي لغة يتجاوب بمثله)`]
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
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-understand-intent.json`)
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
