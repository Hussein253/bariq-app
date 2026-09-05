# Workflow: Order → Shipment Intake (استقبال الطلب المؤكَّد وتحويله إلى شحنة)

## الحالة
**تصميم فقط — لم يُنشأ بعد في n8n.** ينفَّذ بعد موافقة صريحة (نفس نمط العمل المتبع في migration جدول shipments).

## نطاق هذه المرحلة (وفق البند ج - التطوير المرحلي في CLAUDE.md)
تغطي هذه الوحدة المعزولة المراحل 1-3 فقط:
1. استقبال البيانات (Webhook)
2. التحقق من الصحة و Idempotency (رقم الهاتف العراقي + منع تكرار الشحنة)
3. التخزين الآمن في `public.shipments`

**خارج النطاق عمداً (مرحلة قادمة منفصلة):** استدعاء API شركة الشحن الخارجية، إشعارات واتساب لتأكيد الشحن، إعادة المحاولة عند فشل استدعاء خارجي.

## لماذا Webhook مستقل بدل تعديل الـ workflow الحي مباشرة؟
فحصت workflow "واتساب ذكي — متجر تشيرتات صيفية" (نشِط، 54 عقدة) عبر n8n MCP. النتيجة:
- `create_order` (أداة يستدعيها الـ AI Agent) تُدرج في `orders` لكن `order_id` الناتج لا يُمرَّر كحقل ثابت لبقية الـ workflow (هو داخل تفكير الـ Agent فقط).
- `NOTIFICATION_TYPE: order_completed` يُستخرَج فعلاً في عقدة `Parse Agent Output` (`notification_type`, `shouldNotifyTelegram`) لكن **لا يوجد أي فرع يستهلكه حالياً** — فقط `complaint` مربوط بعقدة `Is Complaint?`.

بمعنى: نقطة "اكتمال الطلب" غير حتمية برمجياً بعد في الـ workflow الحي. ربط هذه الوحدة به قرار منفصل (خيارات أدناه) وليس تخميناً أفعله الآن.

---

## هيكل العقد (Nodes)

```
[Webhook: POST /shipment-intake]
        │  body: { "order_id": <bigint> }
        ▼
[Code: Validate Input]              -- order_id موجود ورقمي، وإلا Respond 400
        ▼
[Supabase: Get Order]               -- getAll orders WHERE order_id = eq
        ▼
[IF: Order Found?]  ──ال (لا)──▶ [Respond: 404 لم يُعثر على الطلب]
        │ نعم
        ▼
[Code: Normalize & Validate]        -- تطبيع الهاتف + التحقق + بناء full_address
        │  (يرمي Error إن فشل التحقق → onError يذهب لعقدة Respond 422)
        ▼
[Supabase: Check Existing Shipment] -- getAll shipments WHERE order_id = eq
        ▼
[IF: Shipment Exists?] ──نعم──▶ [Respond: 200 موجودة مسبقاً + tracking_number]
        │ لا
        ▼
[Supabase: Get Merchant]            -- getAll merchants LIMIT 1 (متجر واحد حالياً)
        ▼
[IF: Merchant Configured?] ──لا──▶ [Respond: 500 "لا يوجد تاجر مُهيّأ في merchants"]
        │ نعم
        ▼
[Code: Build Shipment Payload]
        ▼
[Supabase: Insert Shipment]  (onError → Code: Handle Duplicate Race)
        ▼
[Respond: 201 + tracking_number]
```

---

## 1) Code node — "Validate Input"
```javascript
const orderId = $json.body?.order_id ?? $json.order_id;

if (orderId === undefined || orderId === null || isNaN(Number(orderId))) {
  throw new Error('order_id مفقود أو غير رقمي في جسم الطلب.');
}

return [{ json: { order_id: Number(orderId) } }];
```
(اربط مخرج الخطأ `onError: continueErrorOutput` بعقدة `Respond: 400`.)

---

## 2) Supabase node — "Get Order"
- Operation: `getAll`
- Table: `orders`
- Filter: `order_id` `eq` `={{ $json.order_id }}`
- Limit: 1

## 3) IF — "Order Found?"
- الشرط: `{{ $json.order_id }}` `notEmpty` (على مخرجات Get Order)

---

## 4) Code node — "Normalize & Validate"
يعالج **مشكلة صيغة الهاتف الدولية القادمة من واتساب** المكتشَفة فعلياً في الـ workflow الحي (`964XXXXXXXXXX`) ويحوّلها لصيغة `07XXXXXXXXX` المطابقة تماماً لقيد `CHECK` في جدول `shipments` (لم يتغيّر القيد نفسه، كما طُلب في الخطوة السابقة).

```javascript
const order = $json;

function normalizeIraqiPhone(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/[^0-9]/g, '');

  // صيغة دولية (كما تصل من WhatsApp Trigger: messages[0].from) -> صيغة محلية
  if (digits.startsWith('964') && digits.length === 13) {
    digits = '0' + digits.slice(3);
  }
  // رقم بلا صفر بادئ (مثال: 7701234567)
  if (digits.length === 10 && digits.startsWith('7')) {
    digits = '0' + digits;
  }
  return digits;
}

// نفس القيد الحرفي الموجود في CHECK constraint بجدول shipments - لم يُعدَّل
const IRAQI_PHONE_REGEX = /^07[0-9]{9}$/;

const rawPhone = order.contact_phone || order.phone_number || order.phone || '';
const normalizedPhone = normalizeIraqiPhone(rawPhone);

if (!IRAQI_PHONE_REGEX.test(normalizedPhone || '')) {
  throw new Error(
    `رقم هاتف غير صالح للطلب #${order.order_id}: "${rawPhone}" (بعد التطبيع: "${normalizedPhone}"). المطلوب صيغة 07XXXXXXXXX.`
  );
}

const fullAddress = [order.address, order.address_details].filter(Boolean).join(' - ');
if (!fullAddress) {
  throw new Error(`عنوان غير كافٍ للطلب #${order.order_id} (address و address_details فارغان).`);
}
if (!order.governorate) {
  throw new Error(`المحافظة غير محددة للطلب #${order.order_id}.`);
}

return [{
  json: {
    order_id: order.order_id,
    recipient_name: order.customer_name || order.name || 'زبون واتساب',
    recipient_phone: normalizedPhone,
    governorate: order.governorate,
    district: order.district || null,
    full_address: fullAddress,
    // ملاحظة: orders لا يحتوي عمود "أقرب نقطة دالة" حالياً - يُترك فارغاً هنا عمداً
    nearest_landmark: null,
    cod_amount_iqd: Number(order.items_total_iqd) || 0,
    delivery_fee_iqd: Number(order.delivery_fee_iqd) || 0,
    idempotency_key: `whatsapp-order-${order.order_id}`,
  }
}];
```
(اربط مخرج الخطأ بعقدة `Respond: 422` تعرض `error.message` مباشرة - رسالة واضحة ومفيدة، مطابقة لقواعد صياغة ردود البوت في CLAUDE.md لو أردت لاحقاً تحويلها لرسالة واتساب للمشغّل).

---

## 5) Supabase node — "Check Existing Shipment"
- Operation: `getAll`
- Table: `shipments`
- Filter: `order_id` `eq` `={{ $json.order_id }}`
- Limit: 1

## 6) IF — "Shipment Exists?"
- الشرط: `{{ $json.id }}` `notEmpty`
- عند "نعم" → `Respond` بـ 200 و`{{ $json.tracking_number }}` (استجابة **Idempotent** حقيقية: نفس الطلب المعاد إرساله لا يُنشئ شحنة ثانية ولا يُرجع خطأ).

---

## 7) Supabase node — "Get Merchant"
- Operation: `getAll`
- Table: `merchants`
- Limit: 1
- (لا فلترة حالياً - افتراض متجر واحد فقط، مطابق لبنية الـ AI Agent الحالية "ستايل بغداد". عند إضافة تجار آخرين لاحقاً، تُستبدل بفلترة حسب رقم واتساب البزنس أو معرّف صريح.)

## IF — "Merchant Configured?"
- الشرط: `{{ $json.id }}` `notEmpty`
- عند "لا" → `Respond` بـ 500: `"لا يوجد تاجر مُهيّأ في جدول merchants - أضف صفاً واحداً على الأقل قبل تشغيل هذا الـ Workflow"`

---

## 8) Code node — "Build Shipment Payload"
```javascript
const validated = $('Normalize & Validate').item.json;
const merchant = $('Get Merchant').item.json;

return [{
  json: {
    order_id: validated.order_id,
    merchant_id: merchant.id,
    recipient_name: validated.recipient_name,
    recipient_phone: validated.recipient_phone,
    governorate: validated.governorate,
    district: validated.district,
    nearest_landmark: validated.nearest_landmark,
    full_address: validated.full_address,
    cod_amount_iqd: validated.cod_amount_iqd,
    delivery_fee_iqd: validated.delivery_fee_iqd,
    idempotency_key: validated.idempotency_key,
  }
}];
```

## 9) Supabase node — "Insert Shipment"
- Operation: `create` (insert)
- Table: `shipments`
- الحقول: كل مخرجات العقدة السابقة (mapping مباشر)
- `onError`: `continueErrorOutput` (لالتقاط تعارض `unique` في حال سباق تزامن نادر - Race Condition بين "Check Existing" و"Insert")

## 10) Code node — "Handle Duplicate Race" (على مخرج الخطأ فقط)
```javascript
const err = String($json.error || $json.message || '');
const isDuplicate = /duplicate key|already exists|unique constraint/i.test(err);

if (!isDuplicate) {
  // خطأ حقيقي غير متعلق بالتكرار - يُعاد رفعه ليظهر بوضوح في تنفيذ الـ Workflow
  throw new Error(`فشل إدراج الشحنة: ${err}`);
}

return [{ json: { duplicate_race: true, order_id: $('Build Shipment Payload').item.json.order_id } }];
```
(يُتبع بعقدة Supabase `Get Existing Shipment` بنفس فلتر `order_id` ثم `Respond` 200 بنفس منطق عقدة 6 - يضمن أن أي تعارض تزامن نادر يُعامَل كنجاح idempotent وليس فشل 500.)

---

## نقاط حرجة يجب حسمها قبل التفعيل الفعلي

1. **عائق تشغيلي فوري:** يجب إدراج صف واحد على الأقل في `merchants` يدوياً قبل أي اختبار حقيقي (مثال: الاسم المستخرج فعلياً من الـ AI Agent الحي هو "ستايل بغداد" - لكن لا أعرف رقم هاتفه أو api_key الحقيقيين، فلن أخترعهما).
2. **نقطة الاستدعاء (Trigger Wiring)** - لم أحسمها لعدم وجود حتمية برمجية حالية في الـ workflow الحي. ثلاثة خيارات:
   - أ) إضافة عقدة جديدة على `Parse Agent Output` في الـ workflow الحي: عند `notification_type === 'order_completed'`، استدعاء هذا الـ Webhook (يتطلب أيضاً تعديل بسيط ليمرّر `order_id` بشكل حتمي بدل الاعتماد على قرار الـ Agent).
   - ب) **Supabase Database Webhook** على جدول `orders` يُطلَق عند `UPDATE current_state = 'confirmed'` (يتطلب أولاً أن يلتزم الـ Agent فعلياً باستدعاء `update_order_status` عند كل تأكيد طلب - غير مضمون حالياً من الطرف).
   - ج) تشغيل يدوي/من لوحة التشغيل (`/operations`) بعد مراجعة بشرية للطلب قبل تحويله لشحنة - الأكثر أماناً مالياً لكن يفقد الأتمتة الكاملة.
