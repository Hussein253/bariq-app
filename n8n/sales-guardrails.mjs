/**
 * حواجز البيع الصارمة — من تتبع آخر 60 رسالة ماسنجر (2026-10-24، متجر الغسالة البيضاء الوحيدة):
 *
 *   ١. البوت ألّف لون: «اريد وحدة لون أسود» ← «تم عزيزي، تم تأكيد طلبك» (التنفيذ 1741)، و«لون أسود تمام» ← «تم تأكيد طلبك… لون أسود» (1747)،
 *      و«زين 5 كيلو» والمتوفر 8 كيلو ← «فيا شكم قطعة رايد؟» (1691). الوكيل ما استدعى get_available_products بولا وحدة منهن.
 *      الإصلاح: عمود catalog بعقدة «تحديد التاجر» (الاسم واللون والقياس والسعر)، يمشي ويا كل دور بعقدة «سياق الطلب» كحقيقة وحيدة،
 *      وspecMismatch يكشف اللون أو السعة المو موجودة بالكود؛ وحارس حتمي (n8n/catalog-guard.js) يبدّل أي رد وافق أو فتح حجز بتصحيح لطيف.
 *
 *   ٢. الحجز ينفتح على كلمة عابرة: «اريد» لحالها كانت نية شراء، فـ«زين اريد الالوان الموجودة» (1929) طلع «شكم قطعة رايد؟».
 *      هسة explicitBuyIntent (فعل حجز أو شراء، رغبة ويا عدد أو ضمير، عنوان أو رقم من الزبون) و bookingAllowed بـ orderContext،
 *      والحارس يشيل «تم تأكيد طلبك» وسؤال العنوان والعدد إذا الحجز مو مسموح.
 *
 *   ٣. الاستسلام السريع بالمواصفات: «كم امبير تسحب» ← «أنصحك بالتواصل مع موظف الدعم» (1918)، «ممكن اعرف مواصفاتها» ← «هاي يتطلب اتصال
 *      مع موظف» (1925). تنبيه SPEC_HINT: جواب بالمعروف أول، وبعدها عرض تحويل لطيف للتفصيلة المو مسجلة.
 *
 *   ٤. برومت الوكيل: قسم «حواجز صارمة» فوق «ممنوع الهلوسة»، وتعديل القواعد الي كانت تفتح الحجز أو تحوّل من أول كلمة، وفحوص 21–23 قبل الإرسال.
 *
 * الاستعمال:
 *   N8N_KEY=<api key> node n8n/sales-guardrails.mjs messenger
 *   DRY=1 N8N_KEY=<api key> node n8n/sales-guardrails.mjs messenger           # يتحقق من المواضع وما يرسل شي
 *   DRY=1 DUMP=<مجلد> ...                                                      # ويكتب البرومت والأكواد المعدّلة هناك
 *
 * ⚠️ يشتغل بعد premium-replies.mjs: ذاك يبني عقدة الحارس وسياق الطلب من نسخة «قبل»، فإذا رجع اشتغل لازم هذا يرجع يشتغل وراه.
 * آمن للتكرار: كتل الكود تنبني دائماً من المصدر المختبَر، وكل تعديل بالبرومت مزيود من قبل ينتجاهل. يحفظ نسخة «قبل» مرة وحدة بـ n8n/backups.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nodeCode } from './order-context-node.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const API = process.env.N8N_API ?? 'http://localhost:5678/api/v1'
const KEY = process.env.N8N_KEY
const DRY = process.env.DRY === '1'
const DUMP = process.env.DUMP

// ماسنجر وواتساب: نفس أسماء العقد (إنستغرام بأسماء عربية وسياق طلب أقدم، فمو هنا)
const NAMES = {
  agent: 'Iraqi Store AI Agent',
  guard: 'Voice Confirm Guard',
  orderNode: 'Order Context Hint',
  merchant: 'تحديد التاجر',
  prompt: 'Build User Prompt',
  orderCtx: { prompt: 'Build User Prompt', recent: 'Load Recent Customer Messages', bot: 'Load Recent Bot Replies', merchant: 'تحديد التاجر' },
}
const CHANNELS = {
  messenger: { id: 'GP0rtSxxEHWT3kLj', ...NAMES },
  whatsapp: { id: 'i3fCYtVjPHtqvXvm', ...NAMES },
}

const swap = (text, from, to, label) => {
  const parts = text.split(from)
  if (parts.length !== 2) throw new Error(`[${label}] لازم يتطابق مرة وحدة، تطابق ${parts.length - 1}`)
  return parts.join(to)
}

// ————— ١. عمود catalog بعقدة «تحديد التاجر» —————

const SQL_ANCHOR = "IS NOT NULL), '') AS product_names,"
const SQL_MARKER = 'AS catalog,'
const SQL_CATALOG = SQL_ANCHOR + `
       -- صفوف الكتالوج (الاسم واللون والقياس والسعر) لعقدة «سياق الطلب» وحارس الكتالوج: لون أو سعة مو موجودة تنكشف بالكود (n8n/sales-guardrails.mjs)
       coalesce((SELECT json_agg(json_build_object('name', btrim(p.name), 'color', nullif(btrim(p.color), ''), 'size', nullif(btrim(p.size), ''), 'price_iqd', p.price_iqd) ORDER BY p.id)
                   FROM products p
                  WHERE p.merchant_id = sa.merchant_id AND coalesce(p.stock, 0) > 0
                    AND nullif(btrim(p.name), '') IS NOT NULL), '[]'::json) AS catalog,`

const patchSql = (query, label) => (query.includes(SQL_MARKER) ? query : swap(query, SQL_ANCHOR, SQL_CATALOG, `${label}/sql`))

// وقت آخر رد للبوت بعقدة «Load Recent Bot Replies»: سؤال طلب أقدم من 6 ساعات ما يُعدّ طلب جاري (التنفيذ 1997، سؤال عنوان من أمس)
const BOT_ANCHOR = "SELECT coalesce(json_agg(message_text ORDER BY created_at DESC), '[]'::json) AS replies\n"
const BOT_MARKER = 'last_reply_at'
const BOT_SQL = "SELECT coalesce(json_agg(message_text ORDER BY created_at DESC), '[]'::json) AS replies,\n       max(created_at) AS last_reply_at\n"
const patchBotReplies = (query, label) => (query.includes(BOT_MARKER) ? query : swap(query, BOT_ANCHOR, BOT_SQL, `${label}/bot-replies`))

// ————— ٢. عقدة الحارس —————

const CG_BEGIN = '// >>> catalog-guard (مولّد من n8n/catalog-guard.js — لا تعدّل هنا)'
const CG_END = '// <<< catalog-guard'
const VOICE_CALL = 'text = fixEchoedRequest(text, singleProduct); // «رايد وحدة من…» بلسان البوت تصير جملة اسمية' // من premium-replies.mjs
const cgHead = (c) => [
  `const catalogCtx = (() => { try { return $('${c.orderNode}').first().json.orderContext || {}; } catch (e) { return {}; } })();`,
  `const customerMsg = (() => { try { return String($('${c.prompt}').first().json.combinedMessage || ''); } catch (e) { return ''; } })();`,
]
const cgCall = (c) => [
  ...cgHead(c),
  "const cgCtx = { ...catalogCtx, placingOrder: ran('create_order') };",
  // العنوان السابق بعد عنوان جديد، لون أو سعة مو موجودة، حجز بلا نية شراء، لمسة بشرية، وأجرة التوصيل الصح (حتى برسالة التثبيت)
  // وتحية بس تاخذ رد تحية (التنفيذ 2126)
  'text = greetingReply(fixDeliveryFee(humanTouch(guardCatalogReply(dropPreviousAddress(text, cgCtx), cgCtx), { message: customerMsg }), cgCtx), cgCtx);',
].join('\n')
// نداءات النسخ السابقة: تنشال قبل ما ينحقن النداء الجديد حتى ما يتكرر
const cgLegacyCalls = (c) => [
  [...cgHead(c), "const cgCtx = { ...catalogCtx, placingOrder: ran('create_order') };",
    'text = fixDeliveryFee(humanTouch(guardCatalogReply(dropPreviousAddress(text, cgCtx), cgCtx), { message: customerMsg }), cgCtx);'].join('\n'),
  [...cgHead(c), "text = humanTouch(guardCatalogReply(text, { ...catalogCtx, placingOrder: ran('create_order') }), { message: customerMsg }); // لون أو سعة مو موجودة، حجز بلا نية شراء، ولمسة بشرية"].join('\n'),
]

const cgBlock = () => {
  const src = fs.readFileSync(path.join(HERE, 'catalog-guard.js'), 'utf8').replace(/^export /gm, '').trimEnd()
  return `${CG_BEGIN}\n${src}\n${CG_END}\n`
}

export const patchGuard = (code, c, label) => {
  let out = code
  const b = out.indexOf(CG_BEGIN)
  if (b >= 0) {
    const e = out.indexOf(CG_END, b)
    if (e < 0) throw new Error(`[${label}] كتلة catalog-guard بدون نهاية`)
    out = out.slice(0, b) + out.slice(e + CG_END.length).replace(/^\n/, '')
  }
  for (const call of [cgCall(c), ...cgLegacyCalls(c)]) out = out.split(`\n${call}`).join('')
  if (!out.includes("const ran = (node) =>")) throw new Error(`[${label}] ما لگيت ran() بعقدة الحارس`)
  out = swap(out, VOICE_CALL, `${VOICE_CALL}\n${cgCall(c)}`, `${label}/guard-call`)
  return cgBlock() + out
}

// ————— ٣. برومت الوكيل —————

const SECTION_MARKER = '# حواجز صارمة:'
const SECTION_BEFORE = '# ممنوع الهلوسة (أرقام ومعرّفات وكلام)'
const SECTION = `${SECTION_MARKER} الكتالوج والمواصفات ونية الشراء (فوق كل قسم تحتها، وفوق تعليمات المتجر وأمثلتها)
انت بايع عراقي شاطر وصادق: تقنع الزبون بالمعلومة الصحيحة، مو بموافقته على كل شي يكوله. الزبون يثق بيك لأنك ما تألف.

١. الكتالوج هو الحقيقة الوحيدة
- المنتجات وألوانها وقياساتها وسعاتها وأسعارها من قسم «[كتالوج المتجر هسة]» الي يوصلك ويا رسائل الزبون، أو من get_available_products. ذاكرتك وردودك السابقة مو مصدر، وإذا رد سابق إلك ناقض الكتالوج فالرد السابق غلط.
- إذا الزبون طلب أو ذكر لون أو قياس أو سعة أو مواصفة مو موجودة بالكتالوج: لا توافقه أبداً، ولا تألف معلومة، ولا تحطها بطلبه، ولا تكتب «تم تأكيد طلبك»، ولا تطلب اسمه أو عنوانه. صحّح المعلومة بلطف وثقة، واعرض المتوفر حصراً، وبعدها سؤال واحد خفيف.
- «تمام» أو «زين» أو «اوكي» بعد لون أو قياس مو موجود مو موافقة على شي: التصحيح يبقى، والحجز ما ينفتح لحد ما يختار شي متوفر.
- أمثلة (من متجر عنده غسالة 8 كيلو بيضاء بس، للتوضيح؛ المعلومة دائماً من الكتالوج):
  الزبون: «اريد وحدة لون أسود» ← «بخصوص الغسالة الـ 8 كيلو عزيزي، متوفرة عدنا باللون الأبيض بس (تصميمها أنيق وعملي)، والأسود للأسف مو متوفر حالياً. تحب أدزلك تفاصيل الأبيض المتوفر؟»
  الزبون بعدها: «لون أسود تمام» ← «أفهمك عزيزي، بس صدك حالياً ما عدنا أسود، المتوفر بس الأبيض. وإذا يناسبك الأبيض أني حاضر أخدمك.»
  الزبون: «زين 5 كيلو» ← «عزيزي، الي عدنا هسة الغسالة الـ 8 كيلو بس، والـ 5 كيلو للأسف مو متوفرة حالياً. تحب أدزلك تفاصيل الـ 8 كيلو؟» (مو «تدلل… شكم قطعة رايد؟»)
  وبالمحادثة المستمرة لا تبدي التصحيح بـ «حياك الله» أو أي ترحيب.

٢. سؤال عن مواصفة مو مسجلة (امبير، استهلاك كهرباء، أبعاد، وزن، سرعة، برامج…)
- ممنوع تستسلم أو تحوّل من أول كلمة، وممنوع تخترع رقم. جاوب بثقة بالمعروف (النوع والماركة والسعة من اسم المنتج، واللون، والسعر، والي مكتوب بمعلومات النشاط مثل الفحص عند الاستلام إذا مكتوب)، وبعدها قل إن هالتفصيلة بالذات ما مسجلة عندك هسة، واعرض بجملة قصيرة تحوّل سؤاله لموظف من الفريق يأكدها إذا يحب.
  مثال: «كم امبير تسحب؟» ← «هي غسالة أوتوماتيك أل جي سعة 8 كيلو، لونها أبيض وسعرها 350,000 دينار. استهلاكها بالأمبير بالضبط ما مسجل عندي هسة، وإذا تحب أحوّل سؤالك لموظف من الفريق يأكدلك الرقم.»
- ممنوع: «أعتذر، للأسف ما عندي معلومات»، «عذراً، هاي يتطلب اتصال مع موظف»، «أنصحك بالتواصل مع موظف الدعم».

٣. نية الشراء: متى تفتح الحجز
- الحجز = «تم تأكيد طلبك»، «طلبك هسة صار»، طلب الاسم أو العنوان أو المحافظة أو رقم الهاتف، أو «نعتمد عنوانك السابق». هذا كله ممنوع إلا إذا الزبون أبدى نية شراء واضحة وصريحة بكلامه، مثل: «اريد أحجز»، «احجزلي»، «ثبتلي وحدة»، «اريد وحدة» أو «اريد ٣ قطع»، «شلون أشتري؟»، «شلون أطلب؟»، «دزلي وحدة»، «آخذها»، «أعطيك العنوان»؛ أو كتب عنوانه أو رقمه بنفسه؛ أو جاوب على سؤالك عن العدد بطلب بداه هو؛ أو الطلب جاري فعلاً (بنود محفوظة، أو ردك السابق طلب معلومات التوصيل).
- مو نية شراء: ذكر لون أو قياس أو سعة («لون أسود»، «5 كيلو»)، كلمات عابرة («تمام»، «زين»، «حلو»، «اوكي»)، «اريد أعرف…»، «اريد الألوان الموجودة»، سؤال عن سعر أو مواصفات أو توصيل، ستيكر أو لايك.
- إذا النقاش بعده استفسار: جاوب وأقنع بالمعلومة الصحيحة بس، بدون طلب معلومات شخصية وبدون «شكم قطعة رايد؟» وبدون «تحب تطلب؟». الزبون يكمّل هو لما يقرر.
- حتى ويا نية شراء صريحة: إذا الي طلبه مو موجود بالكتالوج، التصحيح أول (بند ١) وما ينفتح الحجز لحد ما يختار شي متوفر.
- رد إلك قديم (من يوم سابق أو قبل ساعات)، أو طلب انحجز قبل، مو طلب جاري. وإذا الزبون سأل عن شي ثاني (اتصال، توصيل، مواصفات، لون) فهذا مو جواب على سؤال العنوان أو العدد: جاوب سؤاله بس، ولا تكمّل حجز قديم ولا تقترح عنوان طلب سابق.
- ممنوع تفترض نية حجز ما قالها الزبون («فهمت إنك حاب تحجز…»)، وممنوع تقترح «نعتمد عنوانك السابق» إلا إذا الزبون طلب يشتري بصراحة بهالمحادثة ووصلتوا لمعلومات التوصيل.

٤. أثناء الطلب (بعد نية الشراء الصريحة)
- إذا ردك السابق ذكر البند والعدد («تم تأكيد طلبك… غسالة، وحدة»)، ممنوع تسأل «شكم قطعة رايد؟» من جديد؛ كمّل بالناقص من معلومات التوصيل أو بالملخص.
- إذا الزبون ذكر عنوان أو محافظة بهالمحادثة، هذا هو العنوان المعتمد: ممنوع تذكر أو تقترح عنوان أي طلب سابق، حتى لو كال إن اسمه ورقمه «نفسه» (خذ الاسم والرقم من الطلب السابق بس إذا كال هيج، والعنوان الجديد يبقى).
- أجور التوصيل: أجرة محافظة المتجر غير أجرة باقي المحافظات. إذا وصلك سطر «أجور التوصيل لهذا الزبون» التزم برقمه حرفياً بكل رد وبالملخص وبـ create_order وبرسالة التثبيت، والمجموع الكلي = سعر القطعة × العدد + هالأجرة.

٥. الزبون يريد يتصل أو ما يعرف يقرا ويكتب
- «شلون أتصل عليكم؟»، «انطيني رقمكم»، «ما أعرف أقرا، دزلي بصمة»: هذا مو طلب حجز. انطيه رقم التواصل المكتوب بمعلومات النشاط حرفياً (إذا مكتوب)، وقله: «وإذا تحب، موظف من الفريق يتصل بيك ويحچي وياك». جملتين قصار وواضحات، بدون أي سؤال عن الطلب أو العدد أو العنوان.

٦. أسلوب بايع حقيقي
- ردك جملة جواب، وجملة إقناع قصيرة إذا بمحلها (من معلومات حقيقية بس)، وسؤال واحد بالكثير.
- إذا الزبون سلّم («السلام عليكم») رد السلام أول حتى لو بنص المحادثة.
- ممنوع الخواتيم الآلية: «أكدر أساعدك بشي ثاني؟»، «إذا تحتاج شي ثاني أو عندك أي استفسار كلي»، «تخبرني بخصوص هالموضوع؟»، «شنو رايد تسأل أكثر؟».
- بالتصحيح أو الرفض ابدي بـ «حياك الله» أو «أفهمك» أو ادخل بالجواب؛ «تدلل» بس لما تلبي طلب.
- ممنوع العبارات الغريبة أو المترجمة («نضغط على طلبك»، «فيا»، «تفضل توضحلي»، «تخبرني»).

`

const PROMPT_EDITS = [
  {
    label: 'افتتاحية «تم تأكيد طلبك» بشرط نية الشراء والكتالوج',
    from: 'لما بنود طلبه تتحدد ردك يبدي بـ «تم عزيزي، تم تأكيد طلبك»',
    to: 'لما بنود طلبه تتحدد (وبس إذا أبدى نية شراء صريحة وكل الي طلبه موجود بالكتالوج — قسم «حواجز صارمة») ردك يبدي بـ «تم عزيزي، تم تأكيد طلبك»',
  },
  {
    label: 'المعلومة المو موجودة: جواب بالمعروف أول (قواعد حمراء)',
    from: '- أي معلومة ما طلعت بنتيجة الأدوات ولا مكتوبة بهذي التعليمات، لا تخمّنها ولا تألفها. قل: "خليني أتأكدلك" واعرض التحويل لموظف.',
    to: '- أي معلومة ما طلعت بنتيجة الأدوات ولا بالكتالوج ولا مكتوبة بهذي التعليمات، لا تخمّنها ولا تألفها: جاوب بالمعروف أول، وبعدها قل إن هالتفصيلة بالذات ما مسجلة عندك واعرض التحويل لموظف يأكدها (قسم «حواجز صارمة» بند ٢).',
  },
  {
    label: 'المعلومة المو موجودة: جواب بالمعروف أول (ممنوع الهلوسة)',
    from: '- إذا ما متأكد من معلومة، قل «خليني أتأكدلك» واعرض التحويل لموظف بدل ما تخمّن.',
    to: '- إذا ما متأكد من معلومة، لا تخمّن: جاوب بالمعروف، وقل إن هالتفصيلة ما مسجلة عندك، واعرض التحويل لموظف يأكدها.',
  },
  {
    label: 'سؤال العدد واللون بس ويا نية شراء صريحة',
    from: '- تسأل عن العدد أو اللون أو القياس بس إذا الزبون قال بوضوح إنه رايد يطلب (مثل: اريد، رايد، احجزلي، اطلبلي، دزلي) وناقصة معلومة لازمة لطلبه.',
    to: '- تسأل عن العدد أو اللون أو القياس بس إذا الزبون أبدى نية شراء صريحة (مثل: اريد وحدة، رايد قطعتين، احجزلي، ثبتلي، اطلبلي، دزلي وحدة، شلون أشتري؟) وناقصة معلومة لازمة لطلبه. «اريد أعرف…» و«اريد الألوان» و«لون أسود تمام» مو نية شراء.',
  },
  {
    label: 'قسم «تأكيد الطلب ويا الزبون» بشرط نية الشراء والكتالوج',
    from: 'طبّق هذا القسم بكل رد تتحدد بيه بنود الطلب (اللون والقياس والعدد) أو تتغيّر، سواء الطلب جا كتابة أو بصمة:',
    to: 'طبّق هذا القسم بكل رد تتحدد بيه بنود الطلب (اللون والقياس والعدد) أو تتغيّر، سواء الطلب جا كتابة أو بصمة — بشرط الزبون أبدى نية شراء صريحة وكل الي طلبه موجود بالكتالوج (قسم «حواجز صارمة»)؛ وإلا صحّح أو جاوب بس:',
  },
  {
    label: 'فحوص 21–23 قبل الإرسال',
    from: 'وإذا شي ما وضح بالبصمة، اطلب منه بلطف واحترام يكتبه كتابة.',
    to: 'وإذا شي ما وضح بالبصمة، اطلب منه بلطف واحترام يكتبه كتابة.\n'
      + '21. كل لون أو قياس أو سعة بالرد موجودة بالكتالوج؛ وإذا الزبون طلب شي مو موجود، الرد تصحيح لطيف بالمتوفر حصراً، بدون «تم تأكيد طلبك» وبدون طلب عنوان.\n'
      + '22. إذا بالرد «تم تأكيد طلبك» أو طلب الاسم أو العنوان أو الرقم: الزبون أبدى نية شراء صريحة (قسم «حواجز صارمة» بند ٣)، وإلا شيلها.\n'
      + '23. ماكو بالرد «أعتذر، للأسف ما عندي معلومات» ولا «أنصحك بالتواصل مع موظف الدعم» ولا خاتمة آلية («أكدر أساعدك بشي ثاني؟»).',
  },
]

export const patchPrompt = (sys, label) => {
  let out = sys
  const at = out.indexOf(SECTION_MARKER)
  if (at >= 0) {
    const end = out.indexOf(SECTION_BEFORE, at)
    if (end < 0) throw new Error(`[${label}] قسم «حواجز صارمة» بلا «${SECTION_BEFORE}» بعده`)
    out = out.slice(0, at) + out.slice(end)
  }
  out = swap(out, SECTION_BEFORE, SECTION + SECTION_BEFORE, `${label}/section`)
  for (const e of PROMPT_EDITS) {
    if (out.includes(e.to)) continue
    out = swap(out, e.from, e.to, `${label}/${e.label}`)
  }
  return out
}

// تذكير «Build User Prompt» الثابت كان يطلب «تأكيد الطلب ويا الزبون» على أي ذكر لبنود
const REMIND_FROM = '[تذكير داخلي للبوت: إذا الزبون طلب بنود جديدة أو غيّر بنود، رد بصيغة «تأكيد الطلب ويا الزبون»:'
const REMIND_TO = '[تذكير داخلي للبوت: إذا الزبون طلب بنود جديدة أو غيّر بنود بنية شراء صريحة وكل الي طلبه موجود بالكتالوج، رد بصيغة «تأكيد الطلب ويا الزبون»:'

// ————— التشغيل —————

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

/** @returns {{ changes: string[], dump: Record<string, string> }} */
export const patchWorkflow = (wf, c, label) => {
  const by = (name) => {
    const n = wf.nodes.find((x) => x.name === name)
    if (!n) throw new Error(`[${label}] ماكو عقدة باسم ${name}`)
    return n
  }
  const changes = []
  const set = (desc, get, put, next) => {
    const before = get()
    if (before !== next) { put(next); changes.push(desc) }
    return next
  }

  const merchant = by(c.merchant)
  const sql = set('عمود catalog بـ ' + c.merchant, () => merchant.parameters.query, (v) => { merchant.parameters.query = v }, patchSql(merchant.parameters.query, label))

  const bot = by(c.orderCtx.bot)
  set('وقت آخر رد بـ ' + c.orderCtx.bot, () => bot.parameters.query, (v) => { bot.parameters.query = v }, patchBotReplies(bot.parameters.query, label))

  const order = by(c.orderNode)
  const orderCode = set('كود ' + c.orderNode + ' من n8n/order-context-hint.js', () => order.parameters.jsCode, (v) => { order.parameters.jsCode = v }, nodeCode(c.orderCtx))

  const guard = by(c.guard)
  const guardCode = set('كتلة catalog-guard بـ ' + c.guard, () => guard.parameters.jsCode, (v) => { guard.parameters.jsCode = v }, patchGuard(guard.parameters.jsCode, c, label))

  const agent = by(c.agent)
  const sys = set('برومت الوكيل: قسم «حواجز صارمة» وتعديلاته', () => agent.parameters.options.systemMessage, (v) => { agent.parameters.options.systemMessage = v }, patchPrompt(agent.parameters.options.systemMessage, label))

  const up = by(c.prompt).parameters.assignments.assignments.find((a) => a.name === 'userPrompt')
  if (!up) throw new Error(`[${label}] ماكو حقل userPrompt بـ ${c.prompt}`)
  set('تذكير ' + c.prompt + ' بشرط نية الشراء', () => up.value, (v) => { up.value = v },
    up.value.includes(REMIND_TO) ? up.value : swap(up.value, REMIND_FROM, REMIND_TO, `${label}/reminder`))

  return { changes, dump: { 'merchant.sql': sql, 'order-context.js': orderCode, 'guard.js': guardCode, 'system-prompt.txt': sys } }
}

const run = async (channel) => {
  const c = CHANNELS[channel]
  if (!c) throw new Error(`قناة مو معروفة: ${channel} (${Object.keys(CHANNELS).join('، ')})`)
  const wf = await api(`/workflows/${c.id}`)
  const before = JSON.parse(JSON.stringify(wf))
  const { changes, dump } = patchWorkflow(wf, c, channel)
  if (DUMP) {
    fs.mkdirSync(DUMP, { recursive: true })
    for (const [f, v] of Object.entries(dump)) fs.writeFileSync(path.join(DUMP, `${channel}-${f}`), v)
  }
  if (!changes.length) {
    console.log(`— ${channel}: كل شي مزيود من قبل، ما أرسلت شي`)
    return
  }
  console.log(`${DRY ? '[DRY] ' : ''}${channel}:\n  - ${changes.join('\n  - ')}`)
  if (DRY) return
  const file = path.join(HERE, 'backups', `${channel}-${wf.id}-before-sales-guardrails.json`)
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(before, null, 2))
  const saved = await save(wf)
  console.log(`✓ ${channel} | active: ${saved.active} | العقد: ${saved.nodes.length}`)
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  if (!KEY) {
    console.error('لازم N8N_KEY (مفتاح n8n API). موجود بمدخل n8n-local داخل ~/.claude.json')
    process.exit(1)
  }
  const channels = process.argv.slice(2)
  if (!channels.length) {
    console.error('حدد القناة: messenger و/أو whatsapp')
    process.exit(1)
  }
  for (const ch of channels) await run(ch)
}
