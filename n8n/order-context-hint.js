/**
 * سياق الطلب (Order Context Hint) — عقدة كود بمسارات البوت قبل الوكيل مباشرة
 * ==========================================================================
 * تصلّح حالتين انكشفن بمحادثة ماسنجر 2026-10-22 (الزبون 28960616086881740): الزبون سأل عن المنتجات،
 * البوت كله «عدنا غسالة أوتوماتيك أل جي 8 كيلو»، وبعدين كال «ثبتلي الطلب». البوت طلب الاسم والعنوان
 * والرقم، وبعد ما انطاه إياهن رد: «طلبك هسة صار جاهز، لكن أحتاج تفاصيل الطلب مثل المنتج والعدد» —
 * يعني أخذ كل شي إلا الطلب نفسه.
 *
 *   ١. سجل المحادثة: رسائل توصل والبوت موقوف (تحويل لموظف) تنحذف من البفر وما تدخل ذاكرة الوكيل أبداً،
 *      فلمن يرجع البوت يشتغل يكون الطلب ضايع. رسائل الزبون الأخيرة (24 ساعة، من conversation_log) تمشي
 *      ويا البرومت كسجل، فالخيط يصمد بعد الإيقاف أو تصفير الذاكرة أو الفجوة الطويلة.
 *
 *   ٢. تنبيه البنود: إذا بيّن إن اكو طلب جاري (الزبون كال «ثبتلي الطلب» هسة أو قبل، أو رد البوت الأخير
 *      كان يأخذ تفاصيل الطلب) وماكو ولا بند محفوظ بالسلة، التنبيه يخلي البند هو الشي الوحيد الي يسأل
 *      عنه الوكيل بهذا الرد، ويخزنه بـ update_session_data قبل أي معلومة توصيل.
 *
 *   ٣. التأكيد مرة وحدة (ماسنجر 2026-10-22 الساعة 12:09، الزبون 28960616086881740): البوت عرض عليه
 *      البنود والمبلغ الكلي (300,500)، الزبون كال «اوك ثبت طلب»، والبوت رجع طلب تأكيد ثاني («أحتاج فقط
 *      تأكيد على التفاصيل… آخد الإذن»)، وبعد «ثبت» الثانية كتب ورا 3 create_order وids مخمّنة (order_id 0 وvariant 1).
 *      إذا رد البوت الأخير عرض المبلغ الكلي (أو «أثبّتلك الطلب؟») ورسالة الزبون موافقة قصيرة بدون سؤال ولا تعديل
 *      ولا نفي، التنبيه يلزم الوكيل ينفّذ التثبيت هسة بترتيب أدوات ثابت بدون ما يطلب تأكيد ثاني.
 *
 * ASKS_FOR_HUMAN تخص الحارس الحتمي بعقدة Complaint Hint: فاحص الشكاوى صنّف «ألو هل أنتم موجود أريد
 * تثبيت الطلب» و«حبيبي مرتضى» على إنهن wants_human ووقف المحادثة بنص الطلب. التحويل هسة يحتاج الزبون
 * يذكر بكلامه موظف أو إنسان أو إدارة… وإلا ينمسك.
 *
 * هذا الملف مصدر الكود: n8n/fix-order-context-and-presence.mjs يحوّله لعقدة n8n،
 * وtests/order-context-hint.test.ts يختبره.
 */

const bare = (s) => String(s ?? '').replace(/[ً-ٰٟـ]/g, '').replace(/\s+/g, ' ').trim();

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

// «ثبتلي الطلب»، «أريد تثبيت الطلب»، «احجزلي»: الزبون يطلب يثبّت الطلب — هسة أو بأي رسالة من اليوم.
const WANTS_ORDER = /ثبتل|ثبت الطلب|تثبيت|اثبت|احجزل|احجز|اطلبل|اريد اطلب|رايد اطلب|اريد الطلب|رايد الطلب|كمل الطلب|نكمل الطلب|سجلل|سجل الطلب/;

// للمطابقة بس (مو للعرض): بلا تشكيل، وهمزات وياء وتاء مربوطة موحّدة.
const norm = (s) => bare(s).toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

// موافقة صريحة قصيرة على الي عرضه البوت: «ثبت»، «اوك ثبت طلب»، «إي»، «تمام»، «يلا».
const AFFIRM = new Set([
  'ثبت', 'ثبتها', 'ثبته', 'ثبتلي', 'ثبتيه', 'ثبتوا', 'اثبت', 'اثبتها', 'اثبته', 'تثبيت',
  'اوك', 'اوكي', 'اوكيه', 'ok', 'okay', 'اي', 'ايه', 'ايوه', 'ايوا', 'نعم', 'اكيد', 'تمام', 'موافق',
  'يلا', 'ماشي', 'زين', 'حاضر', 'اكد', 'اكدها', 'اكدلي', 'كمل', 'نكمل', 'صح', 'صحيح', 'خلص',
]);
// كلمة وحدة من هاي تلغي الموافقة: نفي، تعديل، أو سؤال («ثبت بس غير العنوان»، «شكد يصير؟»).
const NOT_A_CONFIRM = new Set([
  'لا', 'لاء', 'مو', 'ما', 'غير', 'غيري', 'بدل', 'بدلي', 'الغ', 'الغي', 'الغاء', 'عدل', 'عدلي',
  'اضيف', 'اضف', 'ضيف', 'زيد', 'زيدلي', 'شكد', 'شكم', 'ليش', 'شلون', 'شنو', 'وين', 'متى', 'شوكت', 'هل',
]);
// جواب «ما عندك شي ثاني تحب تضيفه؟»: ماكو إضافة، يعني كمّل.
const NO_MORE = /ماكو شي|ماكو غير|ما عندي شي|ما اريد شي|بس هيج|هيج بس|هذا بس|كافي|لا شكرا/;
// رد البوت الأخير عرض المبلغ الكلي أو سأل «أثبّتلك الطلب؟»: هذا الي الزبون يوافق عليه.
const SHOWED_TOTAL = /المجموع الكلي|كاش عند الاستلام|اثبتلك الطلب/;
// الطلب تثبّت أصلاً: «تمام شكراً» بعده مو تأكيد جديد (وإلا ينعمل طلب مكرر).
const ALREADY_PLACED = /رقم الطلب|تم تثبيت|تثبت بنجاح|طلبك تثبت|طلبك انحجز|المندوب يتصل/;

/**
 * الزبون وافق صراحة على رد البوت الأخير الي بيه المبلغ الكلي؟ (التأكيد المطلوب مرة وحدة بس)
 * @param {object}   [input]
 * @param {string}   [input.combinedMessage]  رسائل الزبون الجديدة بهذا الدور
 * @param {string[]} [input.botReplies]       ردود البوت الأخيرة، الأحدث أول
 */
export function confirmedOnce({ combinedMessage = '', botReplies = [] } = {}) {
  const msg = norm(combinedMessage);
  const last = norm(Array.isArray(botReplies) ? botReplies[0] : '');
  if (!msg || !last) return false;
  if (!SHOWED_TOTAL.test(last) || ALREADY_PLACED.test(last)) return false;
  // البصمة تفريغها ممكن يغلط: تمشي بمسارها (Voice Confirm Guard) وما نفرض عليها تثبيت
  if (/رساله صوتيه|\[/.test(msg)) return false;
  if (/[?؟]/.test(msg)) return false;
  const tokens = msg.split(/[\s,.،؛!:\-_/\\()]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 8) return false;
  if (NO_MORE.test(msg)) return true;
  if (tokens.some((t) => NOT_A_CONFIRM.has(t))) return false;
  return tokens.some((t) => AFFIRM.has(t));
}

// ردك السابق سأل الزبون عن عنوانه السابق («نعتمد عنوانك السابق بـ … لو تغير؟») وهو يجاوب
const PREV_ADDRESS_ASKED = /نعتمد عنوان[كچ] السابق/;

const ADDRESS_ANSWER_HINT = '\n\n[الزبون يرد على سؤالك «نعتمد عنوانك السابق … لو تغير؟»: ممنوع تعيد «تم تأكيد طلبك» أو سؤال العنوان من جديد، والبنود هي الي ذكرتها بردك السابق (خزّنها بـ update_session_data إذا السلة فاضية).'
  + ' إذا وافق (إي، نفسه، اعتمد، تمام) اعتمد العنوان السابق والاسم ورقم التواصل بذاك الطلب وكمّل بملخص الطلب (البنود، أجور التوصيل، المبلغ الكلي كاش عند الاستلام) وبآخره «أثبّتلك الطلب؟».'
  + ' ممنوع create_order بهذا الرد: الزبون لسه ما شاف المبلغ الكلي، وموافقته على العنوان مو موافقة على الطلب.'
  + ' إذا كال تغيّر أو دز عنوان جديد اعتمد الجديد بس واطلب الناقص.]';

const NO_ORDER_YET_HINT = '\n\n[ممنوع create_order بهذا الرد: ردك السابق ما عرض المبلغ الكلي والزبون ما وافق عليه بعد، والطلب ما ينحجز إلا بموافقته الصريحة.'
  + ' إذا معلومات التوصيل كاملة اعرض الملخص (البنود، أجور التوصيل، المبلغ الكلي) وبآخره «أثبّتلك الطلب؟»، وإذا ناقصة اطلب الناقص بس.]';

const CONFIRM_ONCE_HINT ='\n\n[تأكيد الزبون واصل: رسالته هذي موافقة صريحة على ردك السابق (البنود والمبلغ الكلي)، وهذا هو التأكيد الوحيد المطلوب.'
  + ' ممنوع تطلب تأكيد ثاني، وممنوع تعيد الملخص، وممنوع «أحتاج تأكيد» و«آخذ الإذن» و«تمام هيج؟».'
  + ' إذا الاسم والمحافظة والعنوان وأقرب نقطة دالة معروفة بالمحادثة، ثبّت الطلب هسة بنفس هذا الرد، أداة وحدة كل مرة وانتظر نتيجتها قبل الي بعدها:'
  + ' (١) get_available_products وخذ variant_id حرفياً من نتيجتها (البنود مثل ما ذكرتها بردك السابق، حتى لو السلة فاضية)'
  + ' (٢) create_order مرة وحدة بس، والمبالغ أرقام بدون فواصل (مثل 300500)'
  + ' (٣) add_order_item لكل بند بـ order_id من نتيجة create_order حرفياً'
  + ' (٤) get_customer_orders وانقل أرقام الطلب الأحدث حرفياً برسالة التثبيت (ممنوع تحسبها من جديد)'
  + ' (٥) update_session_data بسلة فارغة.'
  + ' إذا ناقص شي من معلومات التوصيل، اطلب الناقص بس بدون ما تعيد طلب التأكيد.]';

// كلام الزبون الي يعني فعلاً «أريد موظف». «ألو، موجود؟» أو اسمه أو كلمة ودّ (حبيبي) ماكو بيها ولا وحدة،
// فتحويل wants_human بدونها ينمسك. القائمة واسعة عن قصد: تمرير تحويل حقيقي أهون من إيقاف تحويل مستحق.
export const ASKS_FOR_HUMAN = /موظف|مشرف|مسؤول|مسئول|مدير|ادار|إدار|صاحب|مالك|انسان|إنسان|بشر|ادمي|آدمي|شخص|روبوت|بوت|حول|اتكلم|اكلم|احچي|احجي|خدمة العملاء|خدمه العملاء/;

// <browsing>
// الزبون يستفسر بس («عندك غسالة؟»، «شكد سعرها؟»، «شنو أيام الدوام؟») وما قال إنه يريد يطلب: الرد جواب وبس. بدون هالفصل
// البوت يعامل «عندك منتجات غسالة؟» كطلب، فيكتب «تمام هيج؟» ويقترح عنوان الطلب السابق (ماسنجر 2026-10-24، التنفيذ 864).
// النية تتبع explicitBuyIntent (نية شراء صريحة): «أريد أعرف شكد سعرها» هسة استفسار، والزبون يكمّل الطلب هو لما يقرر.
const INQUIRY = /عندك|عندكم|عدكم|عدك|اكو|ماكو|موجود|متوفر|تتوفر|توفر|شنو|شكد|بكم|سعر|اسعار|دوام|ساعات|توصيل|توصلون|هل |[?؟]/;

// نية شراء صريحة بكلام الزبون نفسه (توجيه صاحب المتجر 2026-10-25): الحجز («تم تأكيد طلبك» وسؤال العنوان) ما ينفتح على ذكر لون أو كلمة
// عابرة. كانت كلمة «اريد» لحالها تكفي، فـ«زين اريد الالوان الموجودة» (التنفيذ 1929) طلع «شكم قطعة رايد؟». هسة فعل الحجز أو الشراء،
// أو الرغبة ويا عدد أو ضمير («اريد وحدة»، «اريدها»، «طالب منك عشر قطع»)، أو الزبون دز عنوانه أو رقمه بنفسه.
const WANT = '(?:اريد|اريده|رايد|رايده|ابي|ابغي|ابغى|احتاج|بدي|طالب(?: منك)?|انطيني|عطيني|اعطيني)';
const QTY_WORD = '(?:[0-9٠-٩]+|وحده|واحده|وحدتين|قطعه|قطعتين|حبه|حبتين|ثنين|اثنين|ثلاث|اربع|خمس|ست|سبع|ثمان|تسع|عشر)';
const EXPLICIT_BUY = [
  /احجز|ثبت|اثبت|تثبيت|سجلل|سجل الطلب|كمل الطلب|نكمل الطلب/,
  /اطلب(?!\s+موظف)|اشتري|شلون (?:اشتري|اطلب|احجز|اخذ)/,
  /(?:^|\s)(?:اخذ|اخذها|اخذه|ماخذ|ماخذها|راح اخذ)(?=\s|$|[.!،,؟?])/,
  /(?:دز|دزو|ابعث|وصل|جيب|جيبو)ل(?:ي|نا)\s+(?:ها|الطلب|ال?غساله|[0-9٠-٩]|وحده|واحده|قطعه|حبه)/,
  /(?:دز|ابعث|وصل)ها(?=\s|$|[.!،,؟?])/,
  new RegExp('(?:^|\\s)' + WANT + '\\s+' + QTY_WORD + '(?=\\s|$|[.!،,؟?])'),
  /(?:^|\s)(?:اريد|رايد|ابي|ابغي)(?:ها|ه)(?=\s|$|[.!،,؟?])/,
  /عنواني|اعطيك العنوان|انطيك العنوان|هذا عنواني|اسمي |(?:^|\D)07[0-9]{9}(?!\d)/,
];

const toLatinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * الزبون قال بكلامه إنه يريد يشتري؟ («احجزلي»، «ثبتلي وحدة»، «اريد وحدة»، «شلون أشتري؟»، «أعطيك العنوان»)
 * ذكر لون أو قياس، «تمام»، «اريد أعرف»، «اريد الألوان» مو نية شراء.
 * @param {string} message       رسالة الزبون الحالية
 * @param {string} [productNames] أسماء المنتجات («أ، ب»): «اريد الغسالة» نية شراء
 */
export function explicitBuyIntent(message, productNames = '') {
  const msg = toLatinDigits(norm(message)).replace(/^\[رساله صوتيه[^\]]*\]:?\s*/, '');
  if (!msg) return false;
  if (EXPLICIT_BUY.some((re) => re.test(msg))) return true;
  // «اريد الغسالة» / «رايد غسالة»: الرغبة ويا أول كلمة من اسم منتج بالمتجر
  const heads = String(productNames ?? '').split('،').map((n) => norm(n).split(' ')[0]).filter((w) => w && w.length >= 3);
  return heads.some((w) => new RegExp('(?:^|\\s)' + WANT + '\\s+(?:ال)?' + w.replace(/^ال/, '') + '(?=\\s|$|[.!،,؟?])').test(msg));
}

// «١٠» أو «وحدتين» جواب على سؤال البوت «شكم قطعة رايد؟» بطلب جاري: هذا كمال الطلب مو كلمة عابرة
const QTY_ONLY = new RegExp('^' + QTY_WORD + '(?:\\s+(?:قطع|قطعه|وحدات|وحده|حبات|حبه))?$');
const QTY_ASKED = /شكم\s+(?:قطعه|قطع|وحده|حبه)/;
export function quantityAnswer(message, lastBotReply = '') {
  const msg = toLatinDigits(norm(message)).replace(/[.!،,؟?]/g, '').trim();
  return QTY_ONLY.test(msg) && QTY_ASKED.test(norm(lastBotReply));
}
// رد البوت الأخير عرض المبلغ الكلي أو طلب معلومات توصيل: الزبون بنص الطلب حتى لو رسالته الحالية سؤال («وين توصلون؟»).
// «تمام هيج؟» و«نعتمد عنوانك السابق» و«ما عندك شي ثاني» مو هنا عمداً: البوت نفسه كتبهن بغلط على سؤال استفسار (ماسنجر 2026-10-24،
// التنفيذ 1156) وبقاؤهن بالسجل خلّى السؤال اللاحق («شكد سعر الغسالة؟») يتصنّف «طلب جاري». البنود المحفوظة (cartLength) والفاحص
// (orderingNow) هم الي يعرّفون الطلب الحقيقي.
const ORDER_PROMPT = /اثبتلك الطلب|المجموع الكلي|اسمك وعنوانك|رقم الهاتف|رقم التليفون|رقم تليفونك/
// «بعدين اشوف»، «ما ادري»: الزبون يأجّل (حتى لو البوت كان بنص أسئلة الطلب والسلة فاضية): رد لطيف بدون دفع للعنوان أو العدد
// (ماسنجر 2026-10-24، التنفيذ 1652: «ما ادري بعدين اشوف» ← «شكم وحدة تريد؟»)
const DEFER = /بعدين|لاحقا|ما ادري|خليني اشوف|اشوف بعدين|مو الان|مو هسه|ارجع لك|ارجعلك|افكر/

export const BROWSING_HINT = '\n\n[الزبون هسة يستفسر بس (سؤال عن توفر أو سعر أو دوام أو توصيل) وما قال إنه يريد يطلب: جاوب على سؤاله بس بجملة أو جملتين.'
  + ' إذا سأل عن منتج اذكر المتوفر وسعره من get_available_products.'
  + ' جواب التوفر صريح من أول كلمة: إذا المنتج بقائمة منتجات المتجر ← «إي عدنا [المنتج] بـ [سعره]»؛ وإذا مو بالقائمة (مثل «شاشة سمارت») ← «لا عزيزي، ما عدنا [المنتج الي سأل عنه]، عدنا بس [المتوفر]»؛'
  + ' وإذا سأل «عندك غير هذا؟» أو «بس هذا الموجود؟» ← «حالياً عدنا بس [المتوفر]». ممنوع تجاوب بـ «عدنا [منتج ثاني]» كأنه جواب على سؤاله، وممنوع «شكم قطعة رايد؟».'
  + ' وإذا قال «بعدين» أو «ما ادري» أو «خليني أشوف» جاوبه بلطف «خذ راحتك عزيزي، وإذا احتجت شي أني موجود» بدون أي سؤال.'
  + ' ممنوع بهذا الرد «تمام هيج؟» و«ما عندك شي ثاني تحب تضيفه؟»، وممنوع تذكر أو تقترح عنوانه أو اسمه أو رقمه من طلب سابق،'
  + ' وممنوع تطلب معلومات توصيل أو تكتب ملخص طلب، وممنوع STAGE أكبر من 1.'
  + ' التأكيد وعنوان الطلب السابق يبدون بس بعد ما يقول إنه يريد يطلب.]';

/**
 * @param {object}   [input]
 * @param {string}   [input.message]        رسالة الزبون الحالية
 * @param {number}   [input.cartLength]     عدد بنود السلة المحفوظة
 * @param {boolean}  [input.orderingNow]    رد البوت الأخير كان يأخذ تفاصيل الطلب (من فاحص الشكاوى)
 * @param {boolean}  [input.askedToOrder]   طلب تثبيت بهذه الرسالة أو برسائل اليوم
 * @param {boolean}  [input.confirmed]      موافقة صريحة على الملخص
 * @param {string}   [input.lastBotReply]   آخر رد للبوت
 */
export function isBrowsing({ message = '', cartLength = 0, orderingNow = false, askedToOrder = false, confirmed = false, lastBotReply = '' } = {}) {
  const msg = norm(message).replace(/^\[رساله صوتيه[^\]]*\]:?\s*/, '')
  if (cartLength === 0 && !confirmed && DEFER.test(msg) && !explicitBuyIntent(msg)) return true
  if (cartLength > 0 || orderingNow === true || askedToOrder || confirmed) return false
  if (ORDER_PROMPT.test(norm(lastBotReply))) return false
  return INQUIRY.test(msg) && !explicitBuyIntent(msg)
}
// </browsing>

// <single-product>
// المتجر عنده منتج واحد بس (أسماء المنتجات المتوفرة من عقدة «تحديد التاجر»، مفصولة بـ «،»): «تدلل، يا منتج تريد وشكم وحدة؟» الجاهزة
// ببرومت الوكيل وتنبيه البنود تسأل الزبون عن منتج وما اكو غير واحد (ماسنجر 2026-10-24، التنفيذ 1565: «تمام احجزلي الطلب» ← «شنو المنتج
// الي تريد تحجزه؟»). هالتنبيه يلغيها لهالمتاجر ويقول للوكيل ينطق باسم المنتج بالمفرد.
// «قطعة» أو «وحدة» أو «حبة» لحالها (بدون رقم قبلها): العدد 1. «3 قطع» و«قطعتين» ما تنطبق.
const ONE_UNIT = /(?:^|\s)(?:قطعه|وحده|حبه)(?=\s|$|[؟?.,،!])/

export function singleProductOf(productNames) {
  const list = String(productNames ?? '').split('،').map((s) => s.trim()).filter(Boolean)
  return list.length === 1 ? list[0] : ''
}

/**
 * @param {object} [input]
 * @param {string} [input.productNames]   أسماء المنتجات المتوفرة («أ، ب»)
 * @param {string} [input.message]        رسالة الزبون الحالية
 * @param {boolean} [input.needsItems]    طلب جاري وماكو بنود محفوظة
 * @param {boolean} [input.askedToOrder]
 * @param {boolean} [input.orderingNow]
 * @returns {string} التنبيه، أو '' إذا المتجر عنده أكثر من منتج أو الزبون ما يريد يطلب
 */
export function singleProductNote({ productNames = '', message = '', needsItems = false, askedToOrder = false, orderingNow = false } = {}) {
  const name = singleProductOf(productNames)
  if (!name) return ''
  if (!(needsItems || askedToOrder || orderingNow === true || explicitBuyIntent(message, productNames))) return ''
  // «رايد قطعه من منتجكم» (ماسنجر 2026-10-24، التنفيذ 1573): «قطعة/وحدة/حبة» بكلام الزبون = العدد 1، والوكيل رجع سأله «شكم وحدة تريد؟»
  const oneUnit = ONE_UNIT.test(norm(message))
  return '\n\n[المتجر عنده منتج واحد بس: «' + name + '». هذا التنبيه يلغي أي تعليمة ثانية تقول اسأل الزبون «شنو المنتج» أو «يا منتج»:'
    + ' الزبون يقصد هذا المنتج دائماً، فممنوع تسأله أي منتج يريد وممنوع تحچي كأن اكو خيارات أو منتجات (ممنوع «عدنا منتجات»، كل «عدنا ' + name + '»).'
    + (oneUnit
      ? ' الزبون كال «قطعة/وحدة/حبة» يعني العدد = 1: ممنوع تسأله شكم وحدة؛ أكّد «' + name + '، وحدة» وكمّل بالخطوة الجاية حسب قسم «خطوات الطلب».'
      : ' أكّد اسمه بالرد واسأله عن العدد بس (واللون والقياس إذا للمنتج لون وقياس).')
    + ']'
}
// </single-product>

// <own-voice>
// الزبون كال «رايد قطعه من منتجك» والبوت رد «تدلل، رايد وحدة من غسالة…!» (ماسنجر 2026-10-24، التنفيذ 1577؛ ونفسه بالتنفيذ 1573): رجّع كلمة الزبون
// بلسانه كأنه هو الي يطلب، فطلع الرد حوار مع النفس قدام الزبون. التنبيه يخلي الرد كلام موظف مبيعات عراقي خبير ويا الزبون: ترحيب دافي،
// وطلبه بجملة اسمية بدون فعل «رايد». الحارس الحتمي بعقدة الحارس (n8n/own-voice.js) هو الطبقة الثانية لو النموذج ما التزم.
// وبعد توجيه صاحب المتجر: الرد «تم عزيزي، تم تأكيد طلبك» (استلام أولي مو تثبيت: الطلب ما ينحجز إلا بموافقة الزبون) ويا سؤال العنوان،
// وإذا عنده عنوان سابق يأكده («نعتمد عنوانك السابق بـ … لو تغير؟»).
const OWN_ADDRESS_ASK = ' وبنفس الرد اسأله عن عنوانه: إذا اكو سطر «عنوان سابق للزبون» بالبيانات الداخلية اسأله «نعتمد عنوانك السابق بـ [العنوان] لو تغير؟» حتى يأكده،'
  + ' وإذا ماكو اطلب اسمه وعنوانه الكامل (المحافظة والمنطقة وأقرب نقطة دالة) ورقم التليفون.'
const OWN_BOOKED = '«تم عزيزي، تم تأكيد طلبك» (للزبونة: «تم عزيزتي، تم تأكيد طلبك»)'

// المتجر عنده منتج واحد والزبون كال «قطعة/وحدة/حبة»: المنتج والعدد معروفين من الرسالة نفسها، ما نحتاج نسأل عن البنود
export function itemsKnownFromMessage({ productNames = '', message = '' } = {}) {
  return Boolean(singleProductOf(productNames)) && ONE_UNIT.test(norm(message))
}

export function ownVoiceNote({ message = '', productNames = '', needsItems = false } = {}) {
  if (!(needsItems || explicitBuyIntent(message, productNames))) return ''
  const name = singleProductOf(productNames)
  const known = itemsKnownFromMessage({ productNames, message })
  return '\n\n[أسلوب الرد — موظف مبيعات عراقي خبير: «رايد/اريد/ابي» بكلام الزبون كلمته هو مو كلمتك، فممنوع تردد طلبه بصيغة المتكلم («رايد وحدة من…»، «أريد…»، «ابي…») كأن إنت الي تطلب،'
    + ' وممنوع تفكّر بصوت عالي («خليني أشوف»، «لحظة أتأكد») أو تسأل سؤال وتجاوبه بنفسك. ردك كلام ويا الزبون مباشرة.'
    + (known
      ? ' البند معروف من رسالته (' + name + '، وحدة): ابدي بـ ' + OWN_BOOKED + ' وبعدها البند بجملة اسمية: «' + name + '، وحدة.»،' + OWN_ADDRESS_ASK
        + ' خزّن البند بصمت بـ update_session_data.'
      : ' إذا البنود (المنتج والعدد) لسه ناقصة: ابدي بـ «تدلل عزيزي،» (للزبونة: «تدللين عزيزتي،») واسأل عن الناقص بس.'
        + ' وإذا اكتملت البنود بهذا الرد: ابدي بـ ' + OWN_BOOKED + ' وبعدها البنود بجملة اسمية بدون فعل «رايد»،' + OWN_ADDRESS_ASK)
    + ' «تم تأكيد طلبك» استلام أولي بس: الطلب ما ينحجز (create_order) إلا بموافقة الزبون الصريحة على ردك الي بيه المبلغ الكلي،'
    + ' وممنوع «تم تثبيت طلبك» ولا رقم طلب ولا «المندوب يتصل» قبل create_order.'
    + ' كلمة «رايد» تنكتب بس بسؤال للزبون («شكم قطعة رايد؟»).]'
}
// </own-voice>

// <catalog>
// الكتالوج الحقيقي (products بعقدة «تحديد التاجر» → catalog) يمشي ويا كل دور، وطلب الزبون للون أو سعة مو موجودة ينكشف بالكود مو بذاكرة النموذج.
// ماسنجر 2026-10-24: الغسالة بيضاء بس، والزبون «اريد وحدة لون أسود» ← «تم عزيزي، تم تأكيد طلبك» (التنفيذ 1741)، و«لون أسود تمام» ←
// «تم تأكيد طلبك… لون أسود» (1747)؛ و«زين 5 كيلو» والمتوفر 8 كيلو ← «شكم قطعة رايد؟» (1691). الوكيل ما استدعى get_available_products
// بولا رد منهن، وتنبيه «أسلوب الرد» نفسه كان يكله افتح الحجز. الحارس الحتمي بعقدة الحارس (n8n/catalog-guard.js) هو الطبقة الثانية.

// اللون الأساسي ← صيغه (بعد norm وبدون «ال»). «بنيه» مو لون: «آني بنية» إشارة إن الزبونة بنت.
const COLOR_FORMS = {
  اسود: ['اسود', 'سودا', 'سوداء', 'black'],
  ابيض: ['ابيض', 'بيضا', 'بيضاء', 'white'],
  احمر: ['احمر', 'حمرا', 'حمراء', 'red'],
  ازرق: ['ازرق', 'زرقا', 'زرقاء', 'blue'],
  اخضر: ['اخضر', 'خضرا', 'خضراء', 'green'],
  اصفر: ['اصفر', 'صفرا', 'صفراء', 'yellow'],
  رمادي: ['رمادي', 'رماديه', 'رصاصي', 'رصاصيه', 'gray', 'grey'],
  فضي: ['فضي', 'فضيه', 'سلفر', 'سيلفر', 'silver'],
  ذهبي: ['ذهبي', 'ذهبيه', 'جولد', 'كولد', 'gold'],
  بني: ['بني', 'قهوائي', 'قهوائيه', 'brown'],
  وردي: ['وردي', 'ورديه', 'بمبي', 'بينك', 'pink'],
  بنفسجي: ['بنفسجي', 'بنفسجيه', 'موف', 'purple'],
  برتقالي: ['برتقالي', 'برتقاليه', 'orange'],
  كحلي: ['كحلي', 'كحليه', 'navy'],
  بيج: ['بيج', 'beige'],
  ستيل: ['ستيل', 'ستانلس', 'steel'],
};
const COLOR_LABEL = {
  اسود: 'الأسود', ابيض: 'الأبيض', احمر: 'الأحمر', ازرق: 'الأزرق', اخضر: 'الأخضر', اصفر: 'الأصفر', رمادي: 'الرمادي', فضي: 'الفضي',
  ذهبي: 'الذهبي', بني: 'البني', وردي: 'الوردي', بنفسجي: 'البنفسجي', برتقالي: 'البرتقالي', كحلي: 'الكحلي', بيج: 'البيج', ستيل: 'الستيل',
};
const FORM_TO_COLOR = new Map(Object.entries(COLOR_FORMS).flatMap(([k, forms]) => forms.map((f) => [f, k])));

// «بالأسود»، «والبيضاء»، «الاسود» ← الصيغة بدون حرف الجر و«ال»
const colorOf = (token) => {
  const t = String(token ?? '').toLowerCase();
  for (const cand of [t, t.replace(/^(?:و|ب|ف|ل)?ال/, ''), t.replace(/^(?:و|ب)/, '')]) {
    if (FORM_TO_COLOR.has(cand)) return FORM_TO_COLOR.get(cand);
  }
  return '';
};
const colorsIn = (text) => [...new Set(norm(text).split(/[^\p{L}\p{N}]+/u).map(colorOf).filter(Boolean))];

// السعة بالرقم والوحدة: «5 كيلو»، «8كيلو»، «55 انج»، «20 لتر»
const UNIT = { كيلو: 'كيلو', كغم: 'كيلو', كيلوغرام: 'كيلو', kg: 'كيلو', انج: 'انج', انش: 'انج', بوصه: 'انج', لتر: 'لتر', طن: 'طن' };
const CAP_RE = /(\d+(?:[.,]\d+)?)\s*(كيلوغرام|كيلو|كغم|kg|انج|انش|بوصه|لتر|طن)(?![\p{L}])/gu;
const capacitiesIn = (text) => {
  const out = [];
  for (const m of toLatinDigits(norm(text)).matchAll(CAP_RE)) {
    const c = { n: Number(m[1].replace(',', '.')), unit: UNIT[m[2]] };
    if (!out.some((x) => x.n === c.n && x.unit === c.unit)) out.push(c);
  }
  return out;
};
const capLabel = (c) => `${c.n} ${c.unit}`;

/**
 * صفوف الكتالوج من عقدة «تحديد التاجر» (catalog: [{ name, color, size, price_iqd }]) — JSON أو مصفوفة
 * @returns {{ name: string, color: string, size: string, price: number, colors: string[], caps: {n:number,unit:string}[] }[]}
 */
export function normalizeCatalog(raw) {
  let rows = raw;
  for (let i = 0; i < 2 && typeof rows === 'string'; i++) { try { rows = JSON.parse(rows); } catch { rows = []; } }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && String(r.name ?? '').trim())
    .map((r) => {
      const name = String(r.name).trim();
      const color = String(r.color ?? '').trim();
      const size = String(r.size ?? '').trim();
      const price = Number(r.price_iqd ?? r.price ?? 0) || 0;
      return { name, color, size, price, colors: colorsIn(color), caps: capacitiesIn(name + ' ' + size) };
    });
}

const fmtIqd = (n) => Math.round(n).toLocaleString('en-US');
const joinAr = (list) => (list.length <= 1 ? list.join('') : list.slice(0, -1).join('، ') + ' و' + list[list.length - 1]);

// الزبون سمّى منتج بالاسم («الغسالة»): المقارنة على هذا المنتج بس، وإلا على كل الكتالوج
const mentioned = (catalog, message) => {
  const msg = norm(message);
  return catalog.filter((p) => norm(p.name).split(' ').some((w) => w.length >= 4 && msg.includes(w.replace(/^ال/, ''))));
};

/**
 * الزبون ذكر لون أو سعة مو موجودة بالكتالوج؟ (المقارنة بس على المنتجات الي لونها أو سعتها مسجلة)
 * @returns {null | { kind: 'color'|'capacity', requested: string, requestedLabel: string, available: string[], product: string }}
 */
export function specMismatch({ message = '', catalog = [] } = {}) {
  if (!catalog.length || !norm(message)) return null;
  const named = mentioned(catalog, message);
  const pool = named.length ? named : catalog;
  const product = pool.length === 1 ? pool[0].name : '';
  for (const color of colorsIn(message)) {
    const known = pool.filter((p) => p.colors.length);
    if (!known.length || known.some((p) => p.colors.includes(color))) continue;
    const available = [...new Set(known.flatMap((p) => p.colors))].map((c) => COLOR_LABEL[c] ?? c);
    return { kind: 'color', requested: color, requestedLabel: COLOR_LABEL[color] ?? color, available, product };
  }
  for (const cap of capacitiesIn(message)) {
    const withUnit = pool.filter((p) => p.caps.some((c) => c.unit === cap.unit));
    if (!withUnit.length || withUnit.some((p) => p.caps.some((c) => c.unit === cap.unit && c.n === cap.n))) continue;
    const available = [...new Set(withUnit.flatMap((p) => p.caps.filter((c) => c.unit === cap.unit).map(capLabel)))];
    return { kind: 'capacity', requested: capLabel(cap), requestedLabel: capLabel(cap), available, product };
  }
  return null;
}

// سؤال عن مواصفة ما مسجلة بالكتالوج («كم امبير تسحب؟»، «ممكن اعرف مواصفاتها»). الضمان والإرجاع إلهم قاعدة تحويل بالبرومت، فمو هنا.
const SPEC_Q = /امبير|واط|استهلاك|تسحب|كهربا|مواصفات|مواصفه|ابعاد|حجمها|حجمه|وزنها|وزنه|طولها|عرضها|ارتفاع|سرعه|دوران|برامج|موديل|سنه الصنع|منشا|صنع وين/;
export const isSpecQuestion = (message) => SPEC_Q.test(norm(message));

export function catalogFactsHint(catalog = []) {
  if (!catalog.length) return '';
  const lines = catalog.slice(0, 30).map((p) => '- ' + p.name
    + ' — اللون: ' + (p.color || 'مو مسجل')
    + (p.size ? ' — القياس: ' + p.size : '')
    + (p.price ? ' — السعر: ' + fmtIqd(p.price) + ' دينار' : ''));
  return '\n\n[كتالوج المتجر هسة — من قاعدة البيانات بهذا الدور، وهو الحقيقة الوحيدة عن المنتجات (أقوى من ذاكرتك ومن أي رد سابق إلك):\n'
    + lines.join('\n')
    + '\nأي لون أو قياس أو سعة أو مواصفة مو مكتوبة هنا يعني مو متوفرة أو مو معروفة: ممنوع تقول عنها «عدنا» أو «متوفر» أو توافق الزبون عليها أو تحطها بطلبه،'
    + ' وإذا اللون «مو مسجل» ممنوع تأكد أي لون. المواصفات المعروفة هي بس الي بالاسم والحقول فوق.]';
}

export function mismatchHint(m, { repeated = false } = {}) {
  if (!m) return '';
  const avail = joinAr(m.available);
  const what = m.kind === 'color' ? 'اللون «' + m.requestedLabel + '»' : 'السعة «' + m.requestedLabel + '»';
  const example = m.kind === 'color'
    ? '«حياك الله عزيزي، ' + (m.product ? 'بخصوص ' + m.product + '، ' : '') + 'عدنا بس اللون ' + avail + (m.available.length === 1 ? ' (لون أنيق وعملي)' : '')
      + '، و' + m.requestedLabel + ' للأسف ما عدنا حالياً. تحب أدزلك تفاصيل ' + avail + '؟»'
    : '«حياك الله عزيزي، الي عدنا هسة ' + (m.product || 'بس الـ ' + avail) + (m.product ? ' بس' : '') + '، والـ ' + m.requestedLabel
      + ' للأسف ما عدنا حالياً. تحب أدزلك تفاصيل الـ ' + avail + '؟»';
  return '\n\n[تنبيه حاسم (فوق أي تنبيه ثاني): الزبون ذكر ' + what + ' وهذا مو متوفر بالكتالوج (المتوفر: ' + avail + ' بس).'
    + ' ممنوع توافقه أو تكتب إنه متوفر أو تحطه بطلبه، وممنوع بهذا الرد «تم تأكيد طلبك» و«طلبك هسة صار» وأي طلب للاسم أو العنوان أو الرقم، وممنوع سؤال عن العدد.'
    + (repeated
      ? ' ردك السابق صحّحله نفس الشي وهو رجع عليه: لا تعيد نفس الجملة؛ قله بلطف إنه حالياً ماكو غير ' + avail + ' وإذا يناسبه إنت حاضر تخدمه، بدون سؤال ثاني.]'
      : ' صحّح المعلومة بلطف وثقة مثل بايع شاطر: المتوفر ' + avail + ' بس و' + m.requestedLabel + ' مو متوفر حالياً، وبعدها سؤال واحد خفيف إذا يحب تفاصيل المتوفر. مثال: ' + example + ']');
}

export const SPEC_HINT = '\n\n[الزبون يسأل عن مواصفة: المعروف عن المنتج هو بس الي بالكتالوج فوق (النوع والماركة والسعة من الاسم، واللون، والسعر) والي مكتوب بمعلومات النشاط.'
  + ' ممنوع تخترع رقم أو مواصفة (امبير، واط، أبعاد، وزن، سرعة، برامج، سنة صنع…). جاوب مثل بايع واثق: ابدي بالمعروف عن المنتج بجملة وحدة،'
  + ' وبعدها قل إن هالتفصيلة بالذات ما مسجلة عندك هسة، وإذا يحب تحوّل سؤاله لموظف من الفريق يأكدها بالضبط.'
  + ' ممنوع تبدي بـ «أعتذر» أو «للأسف ما عندي معلومات» أو «عذراً هاي يتطلب اتصال»، وممنوع «أنصحك بالتواصل مع موظف الدعم»، وممنوع بهذا الرد سؤال عن العدد.]';

export const NO_BUY_YET_HINT = '\n\n[الزبون لسه ما قال بصراحة إنه يريد يشتري (مثل «احجزلي»، «ثبتلي وحدة»، «اريد وحدة»، «شلون أشتري؟»، «أعطيك العنوان»):'
  + ' ذكر لون أو قياس أو كلمة مثل «تمام» أو «زين» أو «حلو» مو قرار شراء. ركّز على جوابه وإقناعه بالمعلومة الصحيحة بس.'
  + ' ممنوع بهذا الرد «تم تأكيد طلبك» و«طلبك هسة صار»، وممنوع تطلب الاسم أو العنوان أو رقم الهاتف أو تقترح عنوان سابق، وممنوع «شكم قطعة رايد؟».]';

// الرسالة بيها شي ممكن النموذج يفهمه قرار شراء: لون، سعة، رغبة بلا عدد، كلمة موافقة («تمام»، «زين»، «حلو»)، أو الفاحص شايف طلب جاري
const BUY_RISK = /اريد|رايد|ابي|تمام|زين|حلو|اوك|اوكي|ماشي|يلا|موافق|حجز|طلب/;
const buyRisk = (message, orderingNow = false) => orderingNow === true || colorsIn(message).length > 0 || capacitiesIn(message).length > 0 || BUY_RISK.test(norm(message));

// ردك السابق صحّح نفس اللون أو السعة: الزبون يصرّ، فالتنبيه يطلب جملة ثانية مو نفس التصحيح
const UNAVAILABLE = /ماكو|ما\s*(?:متوفر|عدنا|موجود)|مو\s+(?:متوفر|موجود)|غير\s+(?:متوفر|موجود)|للاسف|نفذ|نفد/;
export const correctedBefore = (m, lastBotReply = '') => {
  const last = norm(lastBotReply);
  if (!m || !UNAVAILABLE.test(last)) return false;
  return m.kind === 'color' ? colorsIn(last).includes(m.requested) : capacitiesIn(last).some((c) => capLabel(c) === m.requested);
};
// </catalog>

/**
 * @param {object}   [input]
 * @param {string}   [input.combinedMessage]  رسائل الزبون الجديدة بهذا الدور
 * @param {object}   [input.sessionData]      session_data للزبون (السلة بيها cart)
 * @param {string[]} [input.recentMessages]   رسائل الزبون آخر 24 ساعة، الأحدث أول (conversation_log)
 * @param {boolean}  [input.orderingNow]      رد البوت الأخير كان يأخذ تفاصيل الطلب (من Complaint Hint)
 * @param {string[]} [input.botReplies]       ردود البوت الأخيرة، الأحدث أول (Load Recent Bot Replies)
 * @param {string}   [input.productNames]     أسماء المنتجات المتوفرة مفصولة بـ «،» (product_names من عقدة تحديد التاجر)
 * @param {object[]|string} [input.catalog]   صفوف الكتالوج (catalog من عقدة تحديد التاجر): الاسم واللون والقياس والسعر
 */
export function orderContextHint({ combinedMessage = '', sessionData = null, recentMessages = [], orderingNow = false, botReplies = [], productNames = '', catalog = [] } = {}) {
  const current = bare(combinedMessage);

  // الدور الحالي ينلوگ بفرع ثاني، فممكن يكون أو ما يكون بالسجل لهسة: أي رسالة موجودة أصلاً بالرسائل
  // الجديدة تنشال بدل ما تنعرض على الوكيل مرتين.
  const earlier = recentMessages
    .map((t) => String(t ?? '').trim())
    .filter((t) => t && !(current && current.includes(bare(t))))
    .slice(0, 8)
    .reverse()
    .map((t) => '- ' + clip(t, 200));

  const cart = sessionData && Array.isArray(sessionData.cart) ? sessionData.cart : [];
  const askedToOrder = WANTS_ORDER.test(current) || recentMessages.some((t) => WANTS_ORDER.test(bare(t)));
  const confirmed = confirmedOnce({ combinedMessage, botReplies });
  // الزبون وافق على بنود ومبلغ البوت عرضهم بردّه السابق: البنود معروفة حتى لو السلة فاضية
  // الزبون سمّى العدد بنفسه والمتجر عنده منتج واحد («رايد قطعه»): البند معروف، فلا سؤال بنود ولا منع للعنوان
  const itemsFromMessage = itemsKnownFromMessage({ productNames, message: combinedMessage });
  // ردك السابق سأل «نعتمد عنوانك السابق… لو تغير؟» والزبون يجاوب عليه: البنود استقرت بردك السابق، والموافقة هذي على العنوان بس
  const lastBotNorm = norm(Array.isArray(botReplies) ? botReplies[0] : '');
  const placed = ALREADY_PLACED.test(lastBotNorm);
  const addressAsked = !confirmed && !placed && PREV_ADDRESS_ASKED.test(lastBotNorm);
  // استفسار بس: «شنو عندك شاشة سمارت؟» أو «ما عندك بس غسالة؟». الحكم يتبع رسالة الزبون الحالية والسلة ورد البوت الأخير، مو كلمة «احجزلي» قبل ساعات
  // بسجل اليوم (ماسنجر 2026-10-24، التنفيذ 1638: سجل بيه «احجزلي» خلّى استفسار يتعامل كطلب والبوت رد «عدنا غسالة… شكم قطعة رايد؟» بدل الجواب)
  const browsing = isBrowsing({
    message: combinedMessage, cartLength: cart.length, orderingNow, askedToOrder: WANTS_ORDER.test(current), confirmed,
    lastBotReply: Array.isArray(botReplies) ? botReplies[0] : '',
  });
  // الكتالوج ونية الشراء: لون أو سعة مو موجودة تتصحح أول، والحجز ما ينفتح إلا بنية شراء صريحة أو بطلب جاري فعلاً
  const items = normalizeCatalog(catalog);
  const lastBotReply = Array.isArray(botReplies) ? botReplies[0] : '';
  const mismatch = specMismatch({ message: combinedMessage, catalog: items });
  const explicitIntent = explicitBuyIntent(combinedMessage, productNames) || quantityAnswer(combinedMessage, lastBotReply);
  const inFlow = cart.length > 0 || confirmed || addressAsked || ORDER_PROMPT.test(lastBotNorm);
  const bookingAllowed = !mismatch && (explicitIntent || inFlow);
  const specQuestion = !mismatch && isSpecQuestion(combinedMessage);
  const needsItems = !mismatch && !confirmed && !itemsFromMessage && !addressAsked && !browsing && cart.length === 0 && (askedToOrder || orderingNow === true);
  // طلب جاري وردك السابق ما عرض المبلغ الكلي: الزبون ما وافق على شي لهسة، فما ينحجز طلب
  const totalNotShown = !confirmed && !placed && !browsing && !SHOWED_TOTAL.test(lastBotNorm) && (askedToOrder || cart.length > 0 || orderingNow === true);

  let hint = '';
  if (earlier.length) {
    hint += '\n\n[سجل المحادثة — رسائل الزبون السابقة بهالمحادثة، الأقدم أول. هذي للفهم بس ومو رسائل جديدة:'
      + ' لا تجاوب عليها من جديد ولا ترحب من جديد، بس استعملها حتى تعرف شنو طلب الزبون قبل وشنو قاله إلك.\n'
      + earlier.join('\n') + ']';
  }
  hint += catalogFactsHint(items);
  if (needsItems) {
    hint += '\n\n[تنبيه داخلي: الزبون يريد يثبت طلبه بس ماكو ولا بند محفوظ لهذا الطلب، يعني إحنا ما نعرف شنو يريد.'
      + ' ردك هذا عن البنود بس: إذا سمّى المنتج بالمحادثة (شوف سجل المحادثة فوق) أعد اسمه عليه واسأله شكم وحدة يريد،'
      + ' وإذا ما سمّاه استدعِ get_available_products واسأله يا منتج يريد وشكم وحدة.'
      + ' بعد ما يتحدد البند خزّنه بـ update_session_data قبل أي شي ثاني.'
      + ' ممنوع بهذا الرد تطلب الاسم أو العنوان أو رقم الهاتف، وممنوع تكتب «طلبك هسة صار» أو ملخص أو «أثبّتلك الطلب؟».]';
  }

  if (confirmed) hint += CONFIRM_ONCE_HINT;

  if (browsing) hint += BROWSING_HINT;

  const single = mismatch ? '' : singleProductNote({ productNames, message: combinedMessage, needsItems, askedToOrder, orderingNow });
  hint += single;

  // الحجز النهائي (create_order) بموافقة الزبون الصريحة على المبلغ الكلي بس. «اعتمد» جواب على سؤال العنوان مو موافقة على الطلب
  // (ماسنجر 2026-10-24، التنفيذ 1591: «اعتمد» ← create_order والزبون ما شاف المبلغ، طلب 47).
  if (addressAsked) hint += ADDRESS_ANSWER_HINT;
  else if (totalNotShown) hint += NO_ORDER_YET_HINT;

  // التأكيد الواصل له تنبيهه الخاص (ثبّت وبس)، والاستفسار جواب وبس، وجواب سؤال العنوان ما يرجع يفتتح بـ «تم تأكيد طلبك» من جديد
  // (التنفيذ 1588: «تمام اعتمد العنوان» ← نفس الافتتاحية ونفس سؤال العنوان)
  if (!confirmed && !browsing && !addressAsked && bookingAllowed) hint += ownVoiceNote({ message: combinedMessage, productNames, needsItems });
  // بلا نية شراء صريحة وبلا طلب جاري: جواب وإقناع بس، بدون فتح حجز (تنبيه البنود والاستفسار عدهم قواعدهم). التحية لحالها ما تحتاجه
  else if (!confirmed && !browsing && !addressAsked && !needsItems && !mismatch && buyRisk(combinedMessage, orderingNow)) hint += NO_BUY_YET_HINT;
  if (specQuestion) hint += SPEC_HINT;
  // التصحيح آخر تنبيه حتى يغلب أي تعليمة فوقه
  const repeated = correctedBefore(mismatch, lastBotReply);
  if (mismatch) hint += mismatchHint(mismatch, { repeated });

  return {
    hint,
    orderContext: {
      itemsKnown: cart.length > 0, needsItems, askedToOrder, confirmedOnce: confirmed, browsing, singleProduct: single ? singleProductOf(productNames) : '', history: earlier.length,
      explicitIntent, bookingAllowed, specQuestion, mismatch: mismatch ? { ...mismatch, repeated } : null,
      catalog: items.map((p) => ({ name: p.name, color: p.color, price: p.price, colors: p.colors.map((c) => COLOR_LABEL[c] ?? c) })),
    },
  };
}
