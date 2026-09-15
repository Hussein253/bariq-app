# الثغرات المتبقية — ما لا يُغلق قبل بناء المصادقة

هذا الملف يسجّل ما بقي مفتوحاً بعد جولة التحصين، ولماذا، وما الخطوة الدقيقة
لإغلاقه. وُجد حتى لا يُنشر شيء وأحدهم يظن أن الجولة أغلقت كل شيء.

**الحالة: المنصة غير جاهزة للنشر التجاري.** ما يلي ثلاث ثغرات حرجة لا تُغلق
إلا بتسجيل الدخول، وقد استُثني من هذه الجولة بطلب صريح.

---

## ١. لا يوجد تسجيل دخول — كل الصفحات مفتوحة

`/admin` (لوحة مالك المنصة: أرصدة كل التجار، الإيرادات، العمولات)
و`/operations` و`/workspace` و`/dashboard` تُفتح بالرابط بلا أي تحقق هوية.
لا `middleware.ts` ولا جلسة Supabase Auth في المشروع.

**الأثر:** أي شخص يعرف الرابط يرى البيانات المالية لكل التجار ويعدّلها.

**الإغلاق:** Supabase Auth + `middleware.ts` + استعمال `public.profiles`
(الجدول موجود ومعرَّف في الترحيل ٠١٠، ويحمل `user_id` و`merchant_id` و`role`،
ولا يستعمله أي كود بعد).

---

## ٢. هوية التاجر تأتي من شريط العنوان في مسارات لوحة التحكم

أُغلق في هذه الجولة على المسارات التي تملك آلية مصادقة آلية:

| المسار | قبل | بعد |
|---|---|---|
| `GET/POST /api/orders` | `?merchant_id=` أو جسم الطلب مع سقوط على `'m1'` | مفتاح API إلزامي، والتاجر يُشتق منه |
| `GET/PATCH /api/orders/:id` | بلا أي تحقق | مفتاح API + تقييد بشحنات صاحب المفتاح |
| `POST /api/delivery/sync` | بلا أي تحقق | توقيع HMAC إلزامي |
| `POST /api/webhooks/bot` | بلا أي تحقق | توقيع HMAC إلزامي |

**ما زال مفتوحاً** — مسارات تخدم لوحة التاجر مباشرة، وتأخذ `merchant_id` من
الرابط لأن لا جلسة تُشتق منها:

- `/api/catalog`
- `/api/coupons`
- `/api/ai-agents`
- `/api/social-accounts`
- `/api/order-books`
- `/api/campaigns`
- `/api/merchant-settings`
- `/api/marketers`
- `/api/merchants`

تبديل المعرّف في الرابط يقرأ ويكتب بيانات تاجر آخر.

**الإغلاق:** بعد المصادقة، يُستبدل قارئ `searchParams.get('merchant_id')` في
كل منها بدالة واحدة تقرأ `profiles.merchant_id` من الجلسة. المُبدِّل
`components/MerchantSwitcher.tsx` يُحذف أو يُقصر على دور `platform_owner`.

---

## ٣. محادثات كل الزبائن مقروءة لأي زائر

`supabase/migrations/003_live_conversations_realtime.sql` يمنح `anon` قراءة
`conversations` و`messages` بشرط `using (true)`. المفتاح الـ anon موجود في
حزمة المتصفح، فأي شخص يستطيع سحب كل المحادثات: أرقام هواتف، عناوين، مبالغ،
نصوص كاملة — لكل زبائن كل التجار.

**لماذا لم تُغلق في هذه الجولة:** السياسة الحالية هي ما يُشغّل Supabase
Realtime في `components/LiveConversations.tsx`. تضييقها بلا مصادقة يعني إما
تعطيل البث الحي، أو استبداله باستطلاع دوري عبر مسار خادم — وهو مسار عام أيضاً
ما دام لا يوجد دخول، فلا يُغلق التسريب بل ينقله.

**الإغلاق (يُطبَّق فور توفّر `profiles`):**

```sql
-- دالة مساعدة: التاجر المرتبط بالمستخدم الحالي
create or replace function public.current_merchant_id()
returns uuid language sql stable security definer
set search_path to 'public', 'pg_temp' as $$
  select merchant_id from public.profiles where user_id = auth.uid()
$$;

drop policy if exists "conversations_select_client" on public.conversations;
create policy "conversations_select_own" on public.conversations
  for select to authenticated
  using (merchant_id = public.current_merchant_id());

drop policy if exists "conversations_update_bot_active" on public.conversations;

drop policy if exists "messages_select_client" on public.messages;
create policy "messages_select_own" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and c.merchant_id = public.current_merchant_id()
  ));
```

ثم سحب الصلاحية من `anon` نهائياً:

```sql
revoke select on table public.conversations from anon;
revoke select on table public.messages from anon;
```

---

## ٤. بوابات الدفع — مُعطَّلة عمداً

`lib/payments/zaincash.ts` و`qicard.ts` كانتا محاكاة كاملة تُعرَض كتكامل حي،
و`GET /api/payments/callback` كان يسجّل "تم الدفع" لأي طلب يُمرَّر معرّفه في
الرابط. حُذفت المحاكاة، والمساران يردّان ٥٠١.

**ما يلزم للتفعيل** موثّق في `lib/payments/index.ts`. لا تُبنى قبل توفّر
التوثيق الرسمي وبيانات الاعتماد — تخمين شكل استجابة بوابة دفع مخالف لبند ٢-أ
في `CLAUDE.md`.

**تنبيه تسويقي:** وصف المنصة في `app/layout.tsx` ما زال يذكر "بوابات الدفع
الإلكترونية العراقية (زين كاش وكي كارد)". تُراجَع الصياغة قبل النشر — بيع
ميزة غير موجودة قرار تجاري لا هندسي، ولذلك لم تُغيَّر تلقائياً.

---

## ٥. ملاحظات تشغيلية أصغر

- **حدّ معدّل الطلبات** (`lib/rate-limit.ts`) داخل الذاكرة: يقيّد كل نسخة
  serverless على حدة. يوقف الإغراق من مصدر واحد لا هجوماً موزّعاً. الترقية
  عند الحاجة: مخزن مشترك (Vercel KV / Upstash) بنفس الواجهة.
- **لا مراقبة أخطاء** (Sentry أو ما يعادله). صفحات الخطأ تعرض `digest` يربط
  شكوى المستخدم بسجل الخادم، وهو بديل مؤقت لا دائم.
- **لا سجل تدقيق (audit log)** لتغييرات الحالة المالية. الحد الأدنى: جدول
  يقيّد من غيّر حالة شحنة ومتى ومن أي مصدر.
- **لا نسخ احتياطي موثَّق ولا خطة استرجاع** لقاعدة البيانات.
