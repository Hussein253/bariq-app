# تحصين ردود البوت (n8n): السكربتات، ترتيب التشغيل، والتراجع

كل سكربت هنا يعدّل مسارات n8n **الحيّة** (ماسنجر `GP0rtSxxEHWT3kLj`، واتساب `i3fCYtVjPHtqvXvm`، إنستغرام `CTuJ0eGVthUjREVJ`)
عبر واجهة n8n، بمفتاح `N8N_KEY` (موجود بمدخل `n8n-local` داخل `~/.claude.json`، ما ينكتب بأي ملف).
كلها آمنة للتكرار: كل تعديل مزيود من قبل ينتجاهل، و`DRY=1` يتحقق من المواضع وما يرسل شي، و`DUMP=<مجلد>` يكتب الأكواد المعدّلة للفحص.
نسخة «قبل» تنحفظ مرة وحدة بـ `n8n/backups/` (مستثناة من git).

```bash
N8N_KEY=… node n8n/<script>.mjs messenger whatsapp instagram
```

| السكربت | شنو يعالج | القنوات |
|---|---|---|
| `direct-voice-reply.mjs` | الرد على البصمة يبدي بالجواب، بدون «وصلتني البصمة»؛ وإذا ما وضح شي يطلب من الزبون كتابته بلطف (`voice-ack.js`) | الثلاث |
| `premium-replies.mjs` | الاستفسار جواب وبس بلا «تمام هيج؟» وعنوان سابق (`order-pushing.js` + `isBrowsing`)، دمج التفريغات (`reconcile-prompt.mjs`)، برومت التفريغ (`stt-prompt.mjs`)، منتج واحد (`single-product.js`)، مؤشر «يكتب…»، ومنع «الحوار مع النفس»: البوت ما يردد طلب الزبون بلسانه («رايد وحدة من…») بل يرد «تم عزيزي، تم تأكيد طلبك» (استلام أولي مو حجز: الطلب ما ينحجز بـ create_order إلا بموافقة الزبون) ويسمّي المنتج والعدد ويسأل عن العنوان، وإذا عنده عنوان سابق يأكده (`own-voice.js` حارس حتمي + `ownVoiceNote` تنبيه بسياق الطلب + قاعدة حمراء ببرومت الوكيل) | الثلاث (المؤشر ماسنجر بس؛ تنبيه `ownVoiceNote` ماسنجر وواتساب بس لأن سياق الطلب بإنستغرام نسخة أقدم) |
| `first-order-discount-eligibility.mjs` | الخصم لأول طلب ينحسب بيه خصم فعلاً (`customer_discounted_orders`)، لا لأي زبون عنده طلب سابق | ماسنجر |
| `complaint-gate.mjs` | منع التحويل الكاذب لموظف: شكوى الفاحص تحتاج كلمة شكوى بكلام الزبون (`complaint-cues.js`) | الثلاث |

`harden-order-flow.mjs` و`fix-order-context-and-presence.mjs` أقدم (تأكيد مرة وحدة، سياق الطلب)، و`order-context-node.mjs` يبني كود عقدة «سياق الطلب» من المصدر المختبَر `order-context-hint.js`.

## ترتيب التشغيل
1. `direct-voice-reply.mjs` (يحقن `stripVoiceAck` بعقدة الحارس) ثم `premium-replies.mjs` (يبني عقدة الحارس من نسخة «قبل» ويضيف كتلتَي الاستفسار والمنتج الوحيد فوق كتلة البصمة).
2. `first-order-discount-eligibility.mjs` (ماسنجر).
3. `complaint-gate.mjs`.

⚠️ `premium-replies.mjs` يبني برومتَي الدمج والتفريغ وعقدة الحارس وسياق الطلب (إنستغرام) **من نسخة «قبل»** المحفوظة، مو من الحي، فأي تعديل يدوي لهالعقد بعد النسخة ينكتب فوقه. عدّل بالمصدر (`n8n/*.js`) وأعد التشغيل.

## التراجع
`n8n/backups/<قناة>-<id>-before-<اسم-السكربت>.json` هو المسار كامل قبل التعديل. للتراجع: `PUT /api/v1/workflows/<id>` بمحتواه (name, nodes, connections, settings)، أو استيراده من واجهة n8n.

## الاختبارات
`npm test` يغطي المنطق النقي: `voice-ack`, `order-pushing`, `single-product`, `own-voice`, `complaint-cues`, `order-context-hint`. الفحص الحي يكون بتتبع التنفيذ (n8n ← Executions) بعد رسالة تجريبية؛ ما في اختبار آلي ضد n8n.

## ملاحظات تشغيلية
- فاحص الشكاوى (نموذج) غلط بكل التحويلات الخمسة الي لقيناها بـ 249 تنفيذاً. كل تحويل يحبس الزبون (`customer_sessions.human_takeover=true` و`bot_active=false` ويا `conversations.bot_active=false`)؛ تحرير الجلسة بعد التحويل يتم يدوياً (ما في إلغاء تلقائي).
- القرار الحتمي بالأهلية والمبالغ (`discount_pct` بـ `create_order`) يجي من الكود، أما الكلام الي يقوله البوت عن السعر فيتبع البرومت.
