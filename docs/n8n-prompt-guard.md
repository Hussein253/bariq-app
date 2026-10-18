# حارس Prompt Injection في بوتات n8n

رسائل الزبائن لا تمر بـ Next.js: تصل من Meta إلى n8n مباشرة، وفيه يبني كل بوت
نص الوكيل. لذلك يعمل `lib/security/promptGuard.ts` داخل عقدة كود في المسارات
الثلاثة، **بعد** بناء نص الوكيل و**قبل** أي نموذج: تحميل السجل وفحص الشكوى
(نداء OpenAI) والوكيل نفسه.

## المكان

| البوت | المسار | بعد العقدة | عقدة الحارس | الشرط |
|---|---|---|---|---|
| واتساب | `i3fCYtVjPHtqvXvm` | `Build User Prompt` | `Prompt Guard` | `Prompt Safe?` |
| ماسنجر | `GP0rtSxxEHWT3kLj` | `Build User Prompt` | `Prompt Guard` | `Prompt Safe?` |
| إنستغرام | `CTuJ0eGVthUjREVJ` | `تجهيز رسالة الوكيل` | `حارس الرسائل` | `الرسالة آمنة؟` |

العقدة تفحص `combinedMessage` (رسائل الزبون المجمّعة، ومنها تفريغ البصمات) وتضيف
للعنصر `promptGuard = { isSafe, riskScore, categories, length, reply }`. نص الرسالة
لا يُنسخ داخله.

## فرع الرفض

نسخة من فرع «خطأ الوكيل» في البوت نفسه، بالإرسال نفسه (عقدة واتساب، أو اختيار
توكن الصفحة/الحساب في ماسنجر وإنستغرام):

1. يرسل للزبون `promptGuard.reply` (تحذير الحارس).
2. يفك قفل الجلسة ويفرغ المخزن المؤقت، كما بعد أي رد.
3. يسجّل في `conversation_log` رسالة الزبون والتحذير، `intent = 'prompt_blocked'`،
   فيرى الفريق المحادثة كاملة في اللوحة.
4. يسجّل صفاً في `failed_events` للمراجعة، **بلا نص الرسالة**:
   `node_name = 'Prompt Guard'`، `error_message = 'prompt_injection_blocked'`،
   `status = 'OPEN'`، `raw_input = { execution_id, risk_score, categories, message_length }`.

استعلام سجل الزبون السابق (`Load Recent Customer Messages` / `تحميل رسائل الزبون السابقة`)
يستثني `intent = 'prompt_blocked'`، فلا تعود الرسالة المرفوضة للوكيل في الرسالة التالية
عبر تلميحات المحادثة.

مراجعة الرفض (إيجابيات كاذبة):

```sql
select created_at, workflow_name, raw_input
from failed_events
where node_name = 'Prompt Guard' and status = 'OPEN'
order by created_at desc;
```

## تعديل الحارس

1. عدّل `lib/security/promptGuard.ts` واختباراته، ثم `npx vitest run`.
2. `node n8n/build-prompt-guard-node.mjs` يطبع كود العقدة (ASCII فقط، العربي `\uXXXX`).
3. الصقه في عقد الحارس الثلاث (مسودة)، ثم اختبر بـ `test_workflow` مع تثبيت كل عقدة
   ذات اعتماد، ثم انشر. احفظ JSON المسار قبل النشر كنقطة رجوع.

n8n يخزّن الكود بعد فك ترميز `\uXXXX` إلى حروفه، فقارن الكود المنشور بالمبني بعد
فك الترميز نفسه.

## حدود معروفة

- يمر نص البصمة على نموذج دمج التفريغات (`Reconcile Transcripts` / `دمج التفريغات`)
  قبل الحارس، والصورة على `تحليل الصورة` في إنستغرام. هذان يفرّغان ويصفان فقط، ولا
  يملكان أدوات ولا يكتبان أسعاراً.
- إن رمت العقدة خطأً برمجياً تمرّر الرسالة (fail-open) مثل حارس المخزون، والسبب في
  `promptGuard.error`. سعر البند يبقى من `products` بقيد القاعدة (الترحيل ٠٢٣) في كل
  الأحوال، أما أجرة التوصيل فما زال البوت يكتبها (انظر ٠٢٣)، والحارس لا يغني عن مصدر لها.
