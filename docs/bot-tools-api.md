# أدوات الموظف الذكي — `/api/bot-tools/:tool`

أربع أدوات **قراءة فقط** تستدعيها مسارات n8n بدل `supabaseTool` المباشر. المنطق في
`lib/bot-tools/` (مختبَر)، والأنواع في [`lib/product-knowledge.ts`](../lib/product-knowledge.ts)،
والسكيما في الترحيل [`029`](../supabase/migrations/029_product_groups_and_policy_columns.sql).

> **شرط التشغيل:** الترحيل ٠٢٩ مُطبَّق على قاعدة البيانات. قبله ترجع الأدوات 500
> (`تعذّر تنفيذ الأداة`) والسجلّ يحمل `BOT_TOOL_FAILED` باسم الجدول الناقص. لا يوجد ردّ
> فارغ صامت.

## الطلب

```
POST /api/bot-tools/{search_products | get_product_details | check_availability | quote_shipping}
x-bariq-signature: <hex>          ← HMAC-SHA256(الجسم الخام، BARIQ_BOT_WEBHOOK_SECRET)
Content-Type: application/json

{ "merchant_id": "<uuid>", "input": { ... } }
```

- **`merchant_id`** تضعه عقدة n8n من «تحديد التاجر» (حساب التواصل المعتمد) — **لا
  `$fromAI` أبداً** (درس C1). يُغطّيه التوقيع. المسار لا يقرأ هوية التاجر من `input`.
- **`input`** وحده ما يملؤه النموذج. مفاتيح زائدة فيه تُهمل.
- السرّ نفسه الذي يستعمله `/api/webhooks/bot` — لا متغيّر بيئة جديد.
- التوقيع على **النص الخام** كما يُرسَل بالضبط: أرسل السلسلة نفسها التي وُقِّعت، لا JSON
  يُعاد تسلسله.

```js
// Node — للتجربة اليدوية
import { createHmac } from 'node:crypto'
const body = JSON.stringify({ merchant_id: '<uuid>', input: { query: 'تيشيرت' } })
const sig = createHmac('sha256', process.env.BARIQ_BOT_WEBHOOK_SECRET).update(body, 'utf8').digest('hex')
```

### الاستجابة

| الحالة | المعنى |
|---|---|
| `200 { success: true, result }` | `result.status` يحمل النتيجة، و«لا نتيجة» هنا حالة عادية (انظر أدناه) |
| `400` | مدخل ناقص/خاطئ — الرسالة تسمّي الحقل |
| `401` / `503` | توقيع مفقود/خاطئ، أو السرّ غير مضبوط على الخادم (مغلق) |
| `404` | أداة غير معروفة (بعد التحقق من التوقيع) |
| `429` | تجاوز ٦٠٠ نداء/دقيقة |
| `500 { success: false, error: 'تعذّر تنفيذ الأداة' }` | فشل القاعدة؛ تفاصيله في السجلّ فقط |

## الأدوات

كل `null` في النواتج يعني **غير محدَّد**: لا يُخمَّن ولا يُحسب، ويحوّل الوكيل الزبون لموظف.
`0` قرار صريح من التاجر (لا ضمان…).

### `search_products` — `{ query, category? }`
يبحث في عائلات المنتجات (اسم/فئة) بالإملاء المطبَّع (القبعه = قبعة) ويعيد حتى ٥ بطاقات:
```json
{ "status": "ok", "truncated": false, "cards": [{
  "group_id": "…uuid", "name": "تيشيرت", "category": "ملابس",
  "price_from_iqd": 15000, "price_to_iqd": 17000,
  "available_units": 11, "in_stock": true,
  "available_colors": ["أبيض", "أسود"], "available_sizes": ["large", "small"],
  "warranty_months": null, "return_days": 7,
  "top_features": ["قطن 100%"], "has_details": true } ] }
```
`{ "status": "no_match" }` حين لا شيء. بلا `query` ولا `category` = تصفّح (المتوفر أولاً).
المصفوفتان لا تحفظان الأزواج: «أسود/لارج» متوفر؟ تُجيب عنها `check_availability`.

### `get_product_details` — `{ group_id }`
`{ status: 'ok', name, category, description, key_features[], warranty_months, return_days,
variants: [{ variant_id, color, size, price_iqd, in_stock }], policies: { return_policy, warranty_policy } }`
أو `{ status: 'not_found' }` (معرّف غير صالح، أو عائلة غير موجودة، أو لتاجر آخر).
`variant_id` = `products.id` = `order_items.variant_id`.

### `check_availability` — `{ group_id, color?, size? }`
المخزون لحظي. اللون/القياس يُطابَقان بمفردات الزبون (`لارج = large`، `سودا = أسود`).
```json
{ "status": "ok", "matches": [{ "variant_id": 1, "color": "أسود", "size": "large",
  "price_iqd": 15000, "available": true, "stock": 5 }] }
```
`matches: []` = لا توجد هذه التركيبة. `not_found` = العائلة نفسها غير موجودة.
المتغيّر المعطَّل (`status` ∈ `inactive`، `معطل`) لا يظهر أبداً.

### `quote_shipping` — `{ governorate?, area_name? }`
أجرة التاجر المعلنة (`merchant_delivery_settings`): محافظة الانطلاق ← محلي، غيرها ← بقية المحافظات.
`delivery_areas` تحدّد المحافظة فقط.
- `{ status: 'quoted', governorate, scope: 'local'|'other', fee_iqd, days, note }`
- `{ status: 'needs_governorate', candidates: [...] }` — يسأل الوكيل الزبون عن المحافظة، ولا يسمّي إلا ما في `candidates`.
- `{ status: 'unavailable', reason: 'no_delivery_settings'|'invalid_delivery_settings' }` — لا أجرة تُذكر، تحويل لموظف.

## وصل n8n (لم يُنفَّذ بعد)

- كل أداة عقدة HTTP تُستدعى من الوكيل، و`merchant_id` فيها تعبير من «تحديد التاجر»،
  وحقول `input` وحدها `$fromAI`.
- التوقيع يحتاج حساب HMAC على الجسم الخام قبل الإرسال. أبسط ترتيب مقترح: مسار فرعي
  (Workflow Tool) فيه عقدة Code/Crypto تحسب التوقيع ثم HTTP Request. **لم يُجرَّب في
  n8n** (لا وصول له من هذه البيئة) — يُختبر أولاً على نسخة الاختبار المعزولة.
- أداة `find_delivery_area` الحالية تُستبدل بـ `quote_shipping`، و`get_available_products`
  بـ `search_products` + `check_availability`.

## حدود معروفة

- **التوقيع بلا طابع زمني** (نفس M1): طلب مُلتقَط يمكن إعادته. الأثر قراءة بيانات يعرضها
  التاجر للزبائن أصلاً.
- **الصفر في الأجرة:** `merchant_delivery_settings` يقبل `0` ويحفظ حقلاً فارغاً `0`
  (`Number('') = 0`)، فلا يُميَّز «مجاني» من «لم يُضبط». الأداة تعيد `fee_iqd: 0` كما هي.
- **دليل المناطق:** الصف الشاذ (`area_name='القادسية'` تحت محافظة `'الديوانية'`) يُهمل لأن
  محافظته ليست من `IRAQI_GOVERNORATES`؛ يُسأل الزبون عن المحافظة.
- **التجميع بالاسم** عند تعبئة ٠٢٩: «تيشيرت» و«تي شيرت» عائلتان حتى يدمجهما التاجر.
- **قيم `color`/`size` الحية لم تُراجَع:** المطابقة تفترض مفردات المتجر الحالية (small/medium/large/xl).
