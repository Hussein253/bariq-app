# دليل ربط n8n مع Webhook تطبيق برق

## 📍 رابط الـ Webhook

بعد النشر على Vercel، استخدم الرابط التالي في n8n:

```
https://bariq-app.vercel.app/api/webhooks/bot
```

### في التطوير المحلي (بدون نشر)

استخدم `ngrok` لفضح التطبيق المحلي للإنترنت:

```bash
# 1. شغّل تطبيق Next.js
npm run dev

# 2. في نافذة أخرى، شغّل ngrok
ngrok http 3000
```

سيعطيك ngrok رابطاً مثل: `https://abc123.ngrok-free.app`
فيكون رابط الـ Webhook:

```
https://abc123.ngrok-free.app/api/webhooks/bot
```

> ⚠️ **ملاحظة**: تأكد من أن رخصة ngrok مجانية وتسمح بالطلبات الواردة (HTTP)

---

## 🔧 إعداد Webhook في n8n

### الطريقة 1: استخدام Webhook Node (الاستقبال المباشر)

1. أضف عقدة **Webhook** في n8n
2. اضبط الإعدادات:
   - **HTTP Method**: `POST`
   - **Path**: `/bot`
   - **Response Mode**: `On Received` (أو `Last Node` حسب حاجتك)
   - **Authentication**: `None`

3. في Webhook URL ستجد الرابط: `https://your-admin-url.com/webhook/bot`
   (هذا هو رابط n8n، وليس رابط Vercel مباشرة)

### الطريقة 2: استخدام HTTP Request Node (الأكثر شيوعاً)

إذا كان n8n لديك يستقبل رسائل واتساب وتريد إرسالها إلى تطبيق برق:

1. أضف عقدة **HTTP Request** بعد عقدة Webhook الواردة من واتساب

2. إعدادات HTTP Request:
   - **Method**: `POST`
   - **URL**: `https://bariq-app.vercel.app/api/webhooks/bot` (أو رابط ngrok للتطوير)
   - **Body**: `JSON`
   - **Send Headers**: نعم
   - **Content-Type**: `application/json`

---

## 📦 هيكل الـ JSON المرسل من n8n

أرسل البيانات بهذا التنسيق من عقدة HTTP Request:

### 1. رسالة نصية عادية (`message_received`)
```json
{
  "event": "message_received",
  "channel": "whatsapp",
  "data": {
    "customer_phone": "07701234567",
    "customer_name": "أحمد الجبوري",
    "text": "مرحباً، كم سعر الساعة؟"
  }
}
```

### 2. إنشاء طلب جديد (`order_created`)
```json
{
  "event": "order_created",
  "channel": "whatsapp",
  "data": {
    "customer_phone": "07701234567",
    "customer_name": "أحمد الجبوري",
    "text": "أريد طلب ساعة يد",
    "item_name": "ساعة يد كلاسيكية",
    "quantity": 1,
    "total_amount": 40000,
    "address": "بغداد - الكرادة",
    "city": "بغداد",
    "payment_method": "عند الاستلام"
  }
}
```

### 3. الاستعلام عن حالة طلب (`order_status_query`)
```json
{
  "event": "order_status_query",
  "channel": "whatsapp",
  "data": {
    "customer_phone": "07701234567",
    "text": "وين وصل طلبي؟",
    "order_id": "BRQ-1001"
  }
}
```

### 4. تحويل لموظف بشري (`human_handover`)
```json
{
  "event": "human_handover",
  "channel": "whatsapp",
  "data": {
    "customer_phone": "07701234567",
    "text": "أريد التحدث مع موظف"
  }
}
```

---

## ⚙️ إعدادات HTTPS النهائية في n8n

في عقدة HTTP Request استخدم هذه الإعدادات:

| الإعداد | القيمة |
|---------|--------|
| Method | `POST` |
| URL | `https://bariq-app.vercel.app/api/webhooks/bot` |
| Body Content Type | `JSON` |
| Send Body | `نعم` |
| Content-Type Header | `application/json` |
| Timeout | `15000` (15 ثانية) |
| Retry | `0` (بدون إعادة محاولة لتجنب التكرار) |

---

## 🧪 اختبار الـ Webhook

يمكنك اختبار الـ Webhook بثلاث طرق:

### 1. من المتصفح (للتأكد أن الخادم متصل)
افتح هذا الرابط في المتصفح:
```
https://bariq-app.vercel.app/api/webhooks/bot
```
يجب أن ترى استجابة JSON مثل:
```json
{
  "status": "online",
  "service": "Bariq Bot Webhook API",
  "supported_channels": ["whatsapp", "messenger", "instagram", "telegram"],
  "version": "2.0.0"
}
```

### 2. بـ curl من الطرفية
```bash
curl -X POST https://bariq-app.vercel.app/api/webhooks/bot \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_received",
    "channel": "whatsapp",
    "data": {
      "customer_phone": "07701234567",
      "text": "رسالة اختبار"
    }
  }'
```

### 3. من n8n مباشرة
اضغط **Execute Node** في عقدة HTTP Request واجعل بيانات الاختبار بهذا الشكل:
```json
{
  "event": "message_received",
  "channel": "whatsapp",
  "data": {
    "customer_phone": "07701234567",
    "customer_name": "مستخدم تجريبي",
    "text": "رسالة اختبار من n8n"
  }
}
```

---

## 🔍 تتبع تدفق البيانات

عند وصول Webhook من n8n، يحدث التالي:

```
1. n8n → POST https://bariq-app.vercel.app/api/webhooks/bot
2. Next.js Route Handler يستقبل الطلب
3. console.log يظهر في لوحة Vercel: [BOT_WEBHOOK][RAW] {...}
4. saveMessageToSupabase → إدراج في جدول whatsapp_messages
5. Supabase Realtime يبث حدث INSERT
6. مكوّن WhatsAppChat.tsx يستقبل الحدث → يحدّث الحالة
7. الرسالة تظهر فوراً في صفحة /operations/whatsapp
```

### التحقق من نجاح الحفظ في Supabase

1. افتح [Supabase Dashboard](https://supabase.com/dashboard)
2. اختر مشروعك: `axgydfmhtxaubgxyqqzc`
3. اذهب إلى **Table Editor** → جدول `whatsapp_messages`
4. ستجد الرسائل الجديدة تظهر هناك فوراً

---

## ⚠️ ملاحظات مهمة

1. **بيئة Vercel**: عند النشر على Vercel، يجب إضافة متغيرات البيئة في:
   - Vercel Dashboard → Project Settings → Environment Variables
   - أضف: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

2. **مفتاح service_role**: يجب استخدام `service_role` ключ في الخادم فقط (كما يحدث الآن في كود الـ Webhook).

3. **مفتاح anon**: يجب أن يكون `anon` key في المتصفح وليس `service_role`. **القيمة الحالية في `.env.local` تحتاج إلى استبدال** بمفتاح `anon` الفعلي من لوحة Supabase.

4. **ngrok**: الرابط يتغير في كل مرة تشغّل ngrok، لذا تأكد من تحديثه في n8n عند كل تشغيل.

5. **CORS**: إذا واجهت مشاكل CORS من n8n، تأكد أن الطلب من الخادم (Server-side) وليس من المتصفح.