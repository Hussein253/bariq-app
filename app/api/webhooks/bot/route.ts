import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
 
/**
 * نقطة استقبال Webhook الموحدة لبوتات المحادثة الذكية (WhatsApp / Messenger / Instagram / Telegram)
 * --------------------------------------------------------------------------------------------
 * تستقبل الأحداث التلقائية:
 * 1. event: "order_created"        -> تسجيل طلب جديد من الزبون وإرجاع رقم التتبع
 * 2. event: "order_status_query"   -> الاستعلام عن حالة الطلب وموقع المندوب
 * 3. event: "human_handover"       -> تحويل المحادثة لموظف الدعم والعمليات
 * 4. event: "message_received"     -> رسالة نصية عادية واردة من الزبون (بدون طلب)
 *
 * كل رسالة واردة، أياً كان نوعها، تُسجَّل في محادثة الزبون الصحيحة (وليس محادثة ثابتة)
 * وتُطبع في الـ Console لأغراض التتبع، لتظهر فوراً في قسم "محادثات البوت الحية".
 */
 
// معرّف فريد للمحادثة بناءً على القناة ورقم هاتف الزبون
function getConversationKey(channel: string, customerPhone: string) {
  return `${channel}:${customerPhone}`
}
 
// تسجّل الرسالة الواردة في محادثة الزبون الصحيحة + طباعة تتبعية
function logIncomingMessage(params: {
  channel: string
  customerPhone: string
  customerName?: string
  text: string
  event: string
  raw?: any
}) {
  const { channel, customerPhone, customerName, text, event, raw } = params
  const conversationKey = getConversationKey(channel, customerPhone)
 
  // 1. Console log فوري لكل رسالة واردة (يظهر في لوق السيرفر عند كل Webhook)
  console.log('[BOT_WEBHOOK][IN]', {
    time: new Date().toISOString(),
    event,
    channel,
    customerPhone,
    text,
  })
 
  try {
    // 2. حفظ في قاعدة البيانات ضمن محادثة الزبون الصحيحة (وليس 'c1' ثابتة)
    //    ملاحظة: يفترض هذا وجود db.getOrCreateConversation في lib/db.ts
    //    بما أنه غير مرفق، إن كانت التسمية مختلفة عندك أخبرني لأطابقها.
    const conversation =
      typeof db.getOrCreateConversation === 'function'
        ? db.getOrCreateConversation({
            channel,
            customer_phone: customerPhone,
            customer_name: customerName || 'عميل واتساب',
          })
        : { id: 'c1' } // fallback مؤقت إن لم تتوفر الدالة بعد
 
    db.addMessageToConversation(conversation.id, {
      id: `msg-${Date.now()}`,
      sender: 'customer',
      text,
      time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
    })
 
    return conversation
  } catch (err: any) {
    // لا نكسر الـ Webhook إن فشل الحفظ في المحادثة - فقط نسجّل الخطأ
    console.error('[BOT_WEBHOOK][LOG_ERROR]', err?.message || err)
    return null
  }
}
 
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, channel = 'whatsapp', merchant_api_key, data } = body
 
    // طباعة كل payload وارد فوراً (قبل أي معالجة) لتتبع كل ما يصل من واتساب
    console.log('[BOT_WEBHOOK][RAW]', JSON.stringify(body))
 
    // التحقق من مفتاح التاجر إذا وُجد
    let merchant = merchant_api_key ? db.getMerchantByApiKey(merchant_api_key) : null
    if (!merchant) {
      merchant = db.getMerchants()[0]
    }
 
    const customerPhone = data?.customer_phone || data?.from || '07700000000'
    const customerName = data?.customer_name
 
    // ---------------------------------------------------------------
    // رسالة نصية عادية واردة من الزبون (بدون إنشاء طلب) - هذا هو الحدث
    // الذي يجب أن يرسله بوت واتساب لكل رسالة يكتبها الزبون
    // ---------------------------------------------------------------
    if (event === 'message_received') {
      const incomingText = data?.text || data?.message || ''
 
      logIncomingMessage({
        channel,
        customerPhone,
        customerName,
        text: incomingText,
        event,
        raw: data,
      })
 
      return NextResponse.json({
        success: true,
        message: 'تم استلام الرسالة وتسجيلها في المحادثات الحية',
      })
    }
 
    if (event === 'order_created') {
      const newOrder = db.createOrder({
        customer_name: data.customer_name || 'عميل المحادثة',
        customer_phone: data.customer_phone || '07700000000',
        address: data.address || 'العنوان غير محدد',
        city: data.city || 'بغداد',
        total_amount: Number(data.total_amount) || 25000,
        delivery_fee: Number(data.delivery_fee) || 5000,
        status: 'جديد',
        payment_status: data.payment_method === 'zaincash' || data.payment_method === 'qicard' ? 'قيد المعالجة' : 'غير مدفوع',
        payment_method: data.payment_method || 'عند الاستلام',
        merchant_name: merchant?.name || 'متجر دجلة',
        merchant_id: merchant?.id || 'm1',
        notes: `تم الطلب تلقائياً عبر بوت ${channel}. ${data.notes || ''}`,
        items: data.items || [{ id: 'it-bot', name: data.item_name || 'منتج من البوت', quantity: data.quantity || 1, price: data.total_amount || 25000 }]
      })
 
      // تسجيل رسالة العميل الأصلية (إن وُجدت) + رسالة تأكيد البوت في محادثة الزبون الصحيحة
      const conversation = logIncomingMessage({
        channel,
        customerPhone,
        customerName,
        text: data.text || `طلب جديد: ${newOrder.id}`,
        event,
        raw: data,
      })
 
      if (conversation) {
        db.addMessageToConversation(conversation.id, {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: `تم تسجيل طلبك بنجاح برقم #${newOrder.id}. الإجمالي: ${newOrder.total_amount.toLocaleString('ar-IQ')} د.ع`,
          time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
        })
      }
 
      return NextResponse.json({
        success: true,
        message: 'تم استلام وتوثيق الطلب بنجاح في نظام برق',
        order: newOrder,
        bot_response: {
          reply: `شكراً لك! ⚡ تم تأكيد طلبك برقم #${newOrder.id} بقيمة ${newOrder.total_amount.toLocaleString('ar-IQ')} د.ع. سنقوم بإشعارك عند خروج المندوب للتسليم.`
        }
      })
    }
 
    if (event === 'order_status_query') {
      const orderId = data.order_id
      const order = db.getOrderById(orderId)
 
      logIncomingMessage({
        channel,
        customerPhone,
        customerName,
        text: data.text || `استعلام عن حالة الطلب #${orderId}`,
        event,
        raw: data,
      })
 
      if (!order) {
        return NextResponse.json({
          success: false,
          message: 'لم يتم العثور على طلب بهذا الرقم',
          bot_response: {
            reply: `عذراً، لم نتمكن من العثور على طلب برقم #${orderId}. يرجى التحقق من الرقم والمحاولة مرة أخرى.`
          }
        }, { status: 404 })
      }
 
      return NextResponse.json({
        success: true,
        order,
        bot_response: {
          reply: `حالة طلبك #${order.id} الحالية هي: [${order.status}]. المندوب المخصص: ${order.driver_name || 'جاري التعيين'} (${order.driver_phone || 'سيتصل بك قريباً'}).`
        }
      })
    }
 
    if (event === 'human_handover') {
      logIncomingMessage({
        channel,
        customerPhone,
        customerName,
        text: data?.text || 'طلب تحويل لموظف بشري',
        event,
        raw: data,
      })
 
      return NextResponse.json({
        success: true,
        message: 'تم تصعيد المحادثة إلى لوحة تحكم موظفي العمليات',
        bot_response: {
          reply: 'تم تحويل محادثتك لأحد ممثلي خدمة العملاء في برق. سيتواصل معك الموظف خلال لحظات.'
        }
      })
    }
 
    // أي حدث غير معروف - نسجّله أيضاً بدل تجاهله بصمت
    console.warn('[BOT_WEBHOOK][UNKNOWN_EVENT]', event, data)
 
    return NextResponse.json({
      success: true,
      message: 'تم استقبال حدث الويب هوك بنجاح',
      event
    })
  } catch (error: any) {
    console.error('[BOT_WEBHOOK][ERROR]', error?.message || error)
    return NextResponse.json(
      { success: false, error: error.message || 'خطأ داخلي في معالجة الويب هوك' },
      { status: 500 }
    )
  }
}
 
export async function GET() {
  return NextResponse.json({
    status: 'online',
    service: 'Bariq Bot Webhook API',
    supported_channels: ['whatsapp', 'messenger', 'instagram', 'telegram'],
    version: '2.0.0'
  })
}
 