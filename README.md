# برق ⚡ — منصة الأتمتة والربط اللوجستي الذكي

منصة "شركة المندوب للتوصيل السريع" التي تربط قنوات المراسلة (واتساب، إنستغرام، ماسنجر)
بنظام إدارة الطلبات والشحن، من أول رسالة للزبون حتى التسوية المالية مع التاجر.

> **قبل أول تشغيل:** شغّل [`supabase/seed/001_bootstrap_platform_owner.sql`](supabase/seed/001_bootstrap_platform_owner.sql)
> لمنح حسابك دور مالك المنصة — بدونه لا يستطيع أحد الدخول.
> وحالة الأمان الكاملة في [`docs/security-open-items.md`](docs/security-open-items.md).

> قواعد التطوير الملزمة في [`CLAUDE.md`](CLAUDE.md) — اقرأها قبل أي تعديل.
> أهمّها: منع تخمين المعرّفات والمبالغ المالية، واعتماد هيكل البيانات قبل كتابة منطق الأعمال.

---

## التشغيل محلياً

```bash
npm install
cp .env.example .env.local   # ثم املأ المفاتيح والأسرار
npm run dev
```

يفتح على <http://localhost:3000>.

### أوامر التحقق

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest run
npm run build       # next build
```

الأربعة تعمل على كل دفعة في [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

### متغيّرات البيئة

| المتغيّر | الاستخدام |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عنوان مشروع Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | مفتاح المتصفح — محكوم بسياسات RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخادم حصراً — **لا يُستورد أبداً في كود المتصفح** |
| `BARIQ_BOT_WEBHOOK_SECRET` | سرّ توقيع `/api/webhooks/bot` |
| `BARIQ_DELIVERY_SYNC_SECRET` | سرّ توقيع `/api/delivery/sync` |
| `N8N_WEBHOOK_URL` | نقطة إرسال ردود اللوحة إلى واتساب عبر n8n |

الأسرار إلزامية: المسار الذي يغيب سرّه يردّ ٥٠٣ ولا يقبل شيئاً. نسيان الضبط
يجب أن يوقف المسار لا أن يفتحه.

---

## المسارات

| المسار | الوصف |
|---|---|
| `/` | صفحة التعريف بالمنصة والباقات — عامة |
| `/login` | تسجيل الدخول — الطريق الوحيد إلى ما تحته |
| `/operations` | لوحة العمليات: الطلبات، التجار، المروّجون، الحملات |
| `/operations/chats` | خدمة العملاء: محادثات القنوات الثلاث عبر Supabase Realtime |
| `/operations/whatsapp` | لوحة واتساب المستقلة |
| `/workspace` | مساحة التاجر: الكتالوج، الموظفون الأذكياء، الإعدادات |
| `/admin` | لوحة مالك المنصة |
| `/dashboard` | تتبّع الشحنات الميداني وحالاتها المالية |

### الصلاحيات

| الدور (`profiles.role`) | يرى |
|---|---|
| `platform_owner` | كل شيء بما فيه `/admin`، وله فتح مساحة أي تاجر (مع تقييد في `admin_impersonation_log`) |
| `staff` | `/operations` و `/operations/chats` و `/dashboard` |
| `merchant` | `/workspace` — تاجره وحده |

الحسابات يُنشئها مالك المنصة: لا يوجد تسجيل ذاتي. حساب في `auth.users` بلا
صف في `profiles` لا يُمنح أي صلاحية وتُنهى جلسته فور الدخول.

**`middleware.ts` يمنع غير الداخل**، و`requireRole` في الصفحة تفحص الدور.
الفحصان مفصولان عمداً: فحص الدور يحتاج قراءة من القاعدة، ووضعه على حافة
الشبكة يُبطّئ كل طلب ويجعل الصلاحية تُفحص في مكانين فيفترقان.

---

## الـ API

### `POST /api/orders` — إنشاء طلب من نظام التاجر

```bash
curl -X POST https://<host>/api/orders \
  -H "Authorization: Bearer brq_live_xxxxxxxx" \
  -H "Idempotency-Key: order-2026-09-15-0042" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "أحمد الجبوري",
    "customer_phone": "07701234567",
    "governorate": "بغداد",
    "district": "الكرادة",
    "full_address": "شارع ٦٢، قرب صيدلية النور",
    "order_content": "حذاء رياضي أسود قياس ٤٢",
    "cod_amount_iqd": 35000,
    "delivery_fee_iqd": 5000
  }'
```

- **المفتاح إلزامي.** التاجر يُشتق منه، ولا يُقبل `merchant_id` من المُرسِل.
- **`Idempotency-Key` إلزامية.** إعادة الإرسال بنفس المفتاح تُعيد الشحنة
  الأصلية ولا تُنشئ ثانية.
- **`cod_amount_iqd` و`delivery_fee_iqd` حقلان مستقلان مطلوبان.** لا قيمة
  افتراضية لأيّهما: الحقل الغائب يُرفض برد ٤٢٢ ولا يُخمَّن.

`GET /api/orders` بنفس المفتاح يُعيد شحنات صاحبه فقط، مع `?status=` و`?search=`.

### `POST /api/delivery/sync` — تحديث حالة شحنة

موقَّع بـ `x-bariq-signature`. يقبل `tracking_number` و`action` من:
`pickup` · `in_transit` · `out_for_delivery` · `delivered` · `postponed` ·
`returned` · `settled`. التأجيل والإرجاع يلزمهما `reason`.

الانتقال المخالف للتسلسل يُرفض بـ ٤٠٩ مع قائمة الانتقالات المسموحة.
الحالة نفسها مرّتين ترجع `unchanged: true` بلا أثر مكرر.

### `POST /api/webhooks/bot` — أحداث البوت

موقَّع بـ `x-bariq-signature`. الأحداث: `message_received` · `message_sent` ·
`order_created` · `order_status_query` · `human_handover`.

### بوابات الدفع

`‎/api/payments/*` تردّ **٥٠١**. التكامل غير مبنيّ — التفاصيل في
[`lib/payments/index.ts`](lib/payments/index.ts).

---

## المكدّس التقني

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS 4** — واجهة RTL بخط IBM Plex Sans Arabic
- **Supabase** (PostgreSQL + Realtime + RLS) لكل البيانات
- **Vitest** للاختبارات
- **n8n** لمسارات الأتمتة — التوثيق في [`docs/`](docs/)
- **Meta Graph API** لقنوات المراسلة

---

## أعراف المشروع

**الأرقام العربية موحّدة في كل الواجهات.** استخدم دوال [`lib/formatters.ts`](lib/formatters.ts)
(`toArabicDigits`, `formatArabicCurrency`, `formatArabicNumber`) ولا تطبع أرقاماً خاماً.

**فصل الخادم عن المتصفح.** ملفات `*-server.ts` تستعمل `service_role` ويُمنع استيرادها
في مكوّنات العميل. ما يُقرأ بمفتاح anon يجب أن تحميه سياسة RLS.

**لا مبلغ افتراضي ولا رقم هاتف افتراضي.** الحقل المالي الغائب يُرفض
([`lib/order-validation.ts`](lib/order-validation.ts))، ولا يُملأ بقيمة مُقدَّرة.
الاختبارات في [`tests/order-validation.test.ts`](tests/order-validation.test.ts) تحرس هذا.

**هوية التاجر من الجلسة لا من الرابط.** في المسارات استعمل
[`requireMerchantScope`](lib/api-session.ts)، وفي الصفحات
[`loadWorkspaceContext`](lib/workspace-context.ts). `searchParams.get('merchant_id')`
ليس هوية — هو طلب يُمحَّص، ويُتجاهل لغير مالك المنصة.

**لا يُطبع رقم هاتف زبون في السجلات.** استعمل [`lib/log.ts`](lib/log.ts): `maskPhone`
لرقم الهاتف و`maskText` لنص الرسالة. سجلات Vercel تُقرأ خارج حماية RLS.

**آلة حالات الشحنة** تتبع تدفقاً صارماً لا يقبل القفز العشوائي:

```
ORDER_RECEIVED → PICKED_UP_SAME_DAY → IN_TRANSIT_HUB → OUT_FOR_DELIVERY
    → DELIVERED | POSTPONED | RETURNED → SETTLED_FINANCIALLY
```

الفرض في مُحفّز قاعدة البيانات، ونسخة [`lib/shipments.ts`](lib/shipments.ts) لتوجيه
الواجهة فقط. اختبار في [`tests/shipment-state-machine.test.ts`](tests/shipment-state-machine.test.ts)
يقرأ خريطة المُحفّز من ملف الترحيل ويقارنها بنسخة الكود، فيكشف أي افتراق.

**الفصل المالي إلزامي:** قيمة البضاعة (COD) وأجرة التوصيل حقلان منفصلان، وصافي
مستحق التاجر عمود محسوب في القاعدة (`GENERATED ALWAYS`) لا يُخزَّن مُخمَّناً.

---

## قاعدة البيانات

كل المخطط موثَّق في [`supabase/migrations/`](supabase/migrations/). الترحيل
`010_document_live_schema.sql` يوثّق الجداول الـ ١٨ التي كانت تعيش في لوحة
Supabase فقط — مُستخرَجة من القاعدة الحية لا مكتوبة من الذاكرة.

**أي تغيير في المخطط يبدأ بملف ترحيل، لا بلوحة Supabase.** التعديل في اللوحة
لا يمرّ بمراجعة ولا يترك أثراً، ويجعل إنشاء بيئة اختبار مستحيلاً.

---

## الباقات

تُقرأ من جدول `plans` وتُعرض في `/` فوراً عند أي تعديل، بلا إعادة نشر.
الباقة التي لم يُعتمد سعرها بعد (`price_iqd_monthly IS NULL`) تظهر "قريباً" بدل رقم مُخمَّن.
حدود الباقة مفروضة بمُحفّز `enforce_plan_limit` في القاعدة، لا في الكود.

---

## النشر

يُنشر تلقائياً على Vercel عند الدفع إلى `main` بعد نجاح CI. تأكّد من ضبط كل
متغيّرات البيئة أعلاه في إعدادات المشروع على Vercel قبل أول نشر.
