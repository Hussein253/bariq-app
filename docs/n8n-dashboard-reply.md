# رد اللوحة → واتساب وماسنجر (n8n)

حين يرد موظف أو تاجر على محادثة واتساب أو ماسنجر من اللوحة، يحفظ التطبيق الرسالة ثم
يرسلها إلى مسار n8n **«رد اللوحة → واتساب»** ليوصلها للزبون.

> ماسنجر كان يُحفظ رده باللوحة ويوقف البوت بلا ما يوصل للزبون (التطبيق ما كان يستدعي المسار إلا لواتساب،
> والمسار يرفض غير واتساب). وُصّل بـ `n8n/dashboard-reply-messenger.mjs`. إنستغرام للحين «حُفظ داخلياً» بلا إرسال.

قبل هذا المسار كان `N8N_WEBHOOK_URL` في الإنتاج يشير إلى مساحة n8n Cloud
محذوفة: الرد يُحفظ ويظهر في اللوحة، ويُطفأ البوت للمحادثة، ولا يصل للزبون
شيء.

## العقد

```
POST {N8N_WEBHOOK_URL}
Content-Type: application/json
Authorization: Bearer {BARIQ_N8N_OUTBOUND_SECRET}
```

```ts
// lib/n8n-outbound.ts — DashboardReplyPayload
{
  phone_number: string            // واتساب: أرقام فقط، 8–15 رقماً (E.164 بلا +): 964…. ماسنجر: PSID، 8–25 رقماً
  message_text: string            // غير فارغ، 4096 حرفاً لواتساب و2000 لماسنجر (حدّ كل منصة)
  channel: 'whatsapp' | 'messenger'  // غيرها يُرفض (unsupported_channel)
  source: 'bariq-dashboard'       // للتتبّع فقط، لا يُفحص
  account_external_id?: string | null  // واتساب: phone_number_id للرقم المُرسِل، null/غائب = الرقم القديم. ماسنجر: معرّف الصفحة، إلزامي
}
```

| الحالة | الجسم | المعنى |
|---|---|---|
| 200 | `{ ok: true, message_id }` | قبِل واتساب الرسالة (`wamid`) |
| 400 | `{ ok: false, error }` | `unsupported_channel` / `invalid_phone_number` / `empty_message_text` / `message_text_too_long` / `invalid_account_external_id` / (ماسنجر) `missing_account_external_id` / `unknown_account` |
| 401 | `{ ok: false, error: 'unauthorized' }` | السرّ غائب أو خاطئ |
| 409 | `{ ok: false, error: 'outside_24h_window', last_incoming_at }` | لم يراسل الزبون خلال 24 ساعة (على منصة القناة نفسها) |
| 502 | `{ ok: false, error: '<channel>_send_failed', detail }` | رفض Meta الإرسال (`whatsapp_send_failed` أو `messenger_send_failed`) |

أي حالة غير 2xx تنكتب على الرسالة نفسها (الترحيل ٠٣٠، `lib/message-delivery.ts`) وتظهر على فقاعة الرد
بزر «إعادة الإرسال»، ويرى فريق برق رمز السبب بجانبها (`n8n 502: messenger_send_failed — …` مثلاً):

| نتيجة الإرسال | `delivery_status` |
|---|---|
| 200 | `sent` (+ `external_message_id`) |
| 4xx، 502 برفض صريح من Meta، n8n ما ينوصل (`ECONNREFUSED`…)، خارج النافذة | `failed` — أكيد ما وصل |
| مهلة التطبيق (15 ث)، انقطاع بعد الاتصال، 502 بانقطاع n8n عن Meta | `unknown` — ممكن وصل، الإعادة بتأكيد |

الإعادة: `POST /api/conversations/:id/messages/:messageId/resend` — حجز بتحديث مشروط (`delivery_attempts`)
فضغطتان ما ترسلان مرتين.

## خطوات المسار

1. **استقبال رد اللوحة** — Webhook ‏POST على `/webhook/bariq-dashboard-reply`.
2. **تجهيز الطلب** — يحسب بصمة SHA-256 للسرّ القادم، ويطبّع الحقول، ويحدّد
   سبب الرفض إن وُجد.
3. **السر صحيح؟** — يقارن البصمة بالمحفوظة ← وإلا 401. المسار لا يحفظ السرّ
   نفسه، فتسرّب المسار لا يكشفه.
4. **البيانات صالحة؟** ← وإلا 400.
5. ~~فحص نافذة 24 ساعة~~ — انتقل للتطبيق (`lib/message-delivery-server.ts`، نفس الاستعلام على
   `conversation_log`) ويُشال من المسار بـ `n8n/dashboard-reply-app-window.mjs`: عقدة Postgres علقت
   21 ثانية بالتنفيذ 1946 (جهاز n8n يتقطع اتصاله بـ Supabase) فتجاوز المسار مهلة التطبيق. خارج
   النافذة التطبيق ما يستدعي n8n أصلاً (`failed`, `outside_24h_window`)، وإن تعذّر الفحص يُرسل على أي حال.
   رمز 409 يبقى بالجدول أعلاه لنسخة المسار القديمة بس.
6. **قناة الرد** — توجّه حسب `channel`:
   - **واتساب:** بحساب `WhatsApp account`، ومن `account_external_id` أو الرقم القديم `1245317385330588`.
   - **ماسنجر:** **صفحة ماسنجر** تختار توكن الصفحة من `account_external_id` (ستايل بغداد `1321149431082632`، المميز
     `615262431673775`، نفس اعتمادات بوت ماسنجر)، ثم Graph API ‏`/me/messages` بـ `messaging_type: RESPONSE`.
     الصفحة الناقصة أو المجهولة تنرفض قبل الإرسال (ما نخمّن).
   ← 200 أو 502.

### لماذا فحص الـ 24 ساعة

ماسنجر نفس القيد: `RESPONSE` ما تُقبل خارج 24 ساعة من آخر رسالة للزبون (تحتاج وسم Human Agent، غير مفعّل هنا).
واتساب لا يسمح بالرسائل الحرة إلا خلال 24 ساعة من آخر رسالة للزبون. خارجها
**يقبل الطلب ويرد 200 بمعرّف رسالة، ثم يُسقطها لاحقاً** (حالة `failed` تصل
بـ webhook منفصل). بدون الفحص كانت اللوحة ستقول «أُرسل» والزبون لم يستلم شيئاً.
الرد خارج النافذة يحتاج قالب رسالة معتمداً — غير مبني بعد.

### لماذا لا إعادة محاولة

إعادة المحاولة بعد مهلة قد ترسل الرسالة مرتين إن كانت الأولى وصلت. الفشل
يظهر للموظف فيقرّر بنفسه.

## الإعداد

| أين | ماذا |
|---|---|
| Vercel ← Production | `N8N_WEBHOOK_URL` = رابط الإنتاج للمسار، و`BARIQ_N8N_OUTBOUND_SECRET` = السرّ (كلاهما Sensitive) |
| n8n ← عقدة «السر صحيح؟» | بصمة SHA-256 للسرّ نفسه |

تغيير السرّ = تحديث الاثنين معاً، ثم إعادة نشر Vercel (المتغيّرات لا تسري
إلا على نشرة جديدة).

```bash
openssl rand -hex 32                                      # سرّ جديد
printf %s "$SECRET" | openssl dgst -sha256                # بصمته لعقدة n8n
```

## ⚠️ مؤقت: n8n على جهاز شخصي

الرابط الحالي `https://bariq-n8n.tail7a92cb.ts.net/webhook/bariq-dashboard-reply`
يمرّ عبر Tailscale Funnel إلى n8n على جهاز شخصي. انطفاء الجهاز أو نومه أو
Tailscale يوقف الردود (تظهر في اللوحة كفشل، لا تضيع بصمت). عند النقل لخادم
دائم: يُستورد المسار، ويُحدَّث `N8N_WEBHOOK_URL`، ويُفضَّل نقل فحص السرّ إلى
مصادقة Header Auth المدمجة في عقدة Webhook.

> **٢٠٢٦-١٠-٢٧:** الاسم القديم `desktop-rlkh4un.tail7a92cb.ts.net` اختفى من DNS
> العام (NXDOMAIN من خوادم ts.net نفسها) مع أن Funnel شغّال وإعدادات Tailscale
> سليمة، فصار الرد يفشل بـ `fetch failed (ENOTFOUND)` ورسائل Meta ما توصل. سُدّ
> مؤقتاً بنفق Cloudflare سريع، ثم أُعيدت تسمية الجهاز إلى `bariq-n8n` فنُشر الاسم
> الجديد بنحو ١٥ دقيقة. السبب من جهة Tailscale ولم يُعرف. إن تكرّر:
> `tailscale set --hostname=<اسم جديد>` ثم `tailscale funnel reset` و
> `tailscale funnel --bg 5678`، وبعدها تحديث Meta و`N8N_WEBHOOK_URL` و`WEBHOOK_URL`.
