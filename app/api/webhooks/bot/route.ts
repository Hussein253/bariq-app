import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordMessage } from '@/lib/conversations-server'
import type { SenderType } from '@/lib/conversations'

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

type BotChannel = 'whatsapp' | 'messenger' | 'instagram' | 'telegram'

// معرّف فريد للمحادثة بناءً على القناة ورقم هاتف الزبون
function getConversationKey(channel: string, customerPhone: string) {
  return `${channel}:${customerPhone}`
}

// تسجيل رسالة في نموذج المحادثات (conversations / messages) — المصدر الوحيد
// يتكفّل recordMessage بإنشاء المحادثة إن لم تكن موجودة (Idempotent)
async function saveMessageToSupabase(params: {
  phoneNumber: string
  text: string
  direction: 'inbound' | 'outbound'
  channel?: string
  senderType?: SenderType
}): Promise<boolean> {
  const { phoneNumber, text, direction } = params

  const { message } = await recordMessage({
    customerPhone: phoneNumber,
    content: text,
    senderType: params.senderType || (direction === 'inbound' ? 'customer' : 'bot'),
    platform: params.channel || 'whatsapp',
  })

  if (!message) {
    console.error(`[BOT_WEBHOOK][RECORD_MESSAGE_FAILED][${direction}]`, { phoneNumber })
    return false
  }

  console.log(`[BOT_WEBHOOK][MESSAGE_SAVED][${direction}]`, {
    phoneNumber,
    conversationId: message.conversation_id,
    messageId: message.id,
    time: new Date().toISOString(),
  })
  return true
}

// تسجّل الرسالة الواردة في محادثة الزبون الصحيحة + طباعة تتبعية
function logIncomingMessage(params: {
  channel: BotChannel
  customerPhone: string
  customerName?: string
  text: string
  event: string
  raw?: unknown
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
    // 2. حفظ في قاعدة البيانات ضمن محادثة الزبون الصحيحة
    const conversation = db.getOrCreateConversation({
      channel,
      customer_phone: customerPhone,
      customer_name: customerName || 'عميل واتساب',
    })

    db.addMessageToConversation(conversation.id, {
      id: `msg-${Date.now()}`,
      sender: 'customer',
      text,
      time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
    })

    return conversation
  } catch (err: unknown) {
    // لا نكسر الـ Webhook إن فشل الحفظ في المحادثة - فقط نسجّل الخطأ
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error('[BOT_WEBHOOK][LOG_ERROR]', errorMessage)
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
    const botChannel = (channel as BotChannel) || 'whatsapp'

    // ---------------------------------------------------------------
    // رسالة نصية عادية واردة من الزبون (بدون إنشاء طلب) - هذا هو الحدث
    // الذي يجب أن يرسله بوت واتساب لكل رسالة يكتبها الزبون
    // ---------------------------------------------------------------
     if (event === 'message_received' || event === 'message_sent') {
       const incomingText = data?.text || data?.message || ''
       const isInbound = event === 'message_received'

       logIncomingMessage({
         channel: botChannel,
         customerPhone,
         customerName,
         text: incomingText,
         event,
         raw: data,
       })

       // تسجيل الرسالة في نموذج المحادثات لتظهر فوراً في لوحة التحكم عبر Realtime
       await saveMessageToSupabase({
         phoneNumber: customerPhone,
         text: incomingText,
         direction: isInbound ? 'inbound' : 'outbound',
         channel: botChannel,
       })

       return NextResponse.json({
         success: true,
         message: isInbound
           ? 'تم استلام الرسالة وتسجيلاتها في المحادثات الحية وواتساب'
           : 'تم تسجيل رد البوت في المحادثات الحية وواتساب',
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
        channel: botChannel,
        customerPhone,
        customerName,
        text: data.text || `طلب جديد: ${newOrder.id}`,
        event,
        raw: data,
      })

      // حفظ رسالة العميل في Supabase
      await saveMessageToSupabase({
        phoneNumber: customerPhone,
        text: data.text || `طلب جديد: ${newOrder.id}`,
        direction: 'inbound',
        channel: botChannel,
      })

      const botReply = `تم تسجيل طلبك بنجاح برقم #${newOrder.id}. الإجمالي: ${newOrder.total_amount.toLocaleString('ar-IQ')} د.ع`

      if (conversation) {
        db.addMessageToConversation(conversation.id, {
          id: `msg-${Date.now() + 1}`,
          sender: 'bot',
          text: botReply,
          time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
        })
      }

      // حفظ رد البوت في Supabase أيضاً ليظهر فوراً في الواجهة
      await saveMessageToSupabase({
        phoneNumber: customerPhone,
        text: botReply,
        direction: 'outbound',
        channel: botChannel,
      })

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
        channel: botChannel,
        customerPhone,
        customerName,
        text: data.text || `استعلام عن حالة الطلب #${orderId}`,
        event,
        raw: data,
      })

      // حفظ رسالة العميل في Supabase
      await saveMessageToSupabase({
        phoneNumber: customerPhone,
        text: data.text || `استعلام عن حالة الطلب #${orderId}`,
        direction: 'inbound',
        channel: botChannel,
      })

      if (!order) {
        const notFoundReply = `عذراً، لم نتمكن من العثور على طلب برقم #${orderId}. يرجى التحقق من الرقم والمحاولة مرة أخرى.`
        await saveMessageToSupabase({
          phoneNumber: customerPhone,
          text: notFoundReply,
          direction: 'outbound',
          channel: botChannel,
        })
        return NextResponse.json({
          success: false,
          message: 'لم يتم العثور على طلب بهذا الرقم',
          bot_response: {
            reply: notFoundReply
          }
        }, { status: 404 })
      }

      const statusReply = `حالة طلبك #${order.id} الحالية هي: [${order.status}]. المندوب المخصص: ${order.driver_name || 'جاري التعيين'} (${order.driver_phone || 'سيتصل بك قريباً'}).`
      await saveMessageToSupabase({
        phoneNumber: customerPhone,
        text: statusReply,
        direction: 'outbound',
        channel: botChannel,
      })

      return NextResponse.json({
        success: true,
        order,
        bot_response: {
          reply: statusReply
        }
      })
    }

    if (event === 'human_handover') {
      const handoverText = data?.text || 'طلب تحويل لموظف بشري'
      logIncomingMessage({
        channel: botChannel,
        customerPhone,
        customerName,
        text: handoverText,
        event,
        raw: data,
      })

      // حفظ رسالة العميل في Supabase
      await saveMessageToSupabase({
        phoneNumber: customerPhone,
        text: handoverText,
        direction: 'inbound',
        channel: botChannel,
      })

      const handoverReply = 'تم تحويل محادثتك لأحد ممثلي خدمة العملاء في برق. سيتواصل معك الموظف خلال لحظات.'
      await saveMessageToSupabase({
        phoneNumber: customerPhone,
        text: handoverReply,
        direction: 'outbound',
        channel: botChannel,
      })

      return NextResponse.json({
        success: true,
        message: 'تم تصعيد المحادثة إلى لوحة تحكم موظفي العمليات',
        bot_response: {
          reply: handoverReply
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'خطأ داخلي في معالجة الويب هوك'
    console.error('[BOT_WEBHOOK][ERROR]', errorMessage)
    return NextResponse.json(
      { success: false, error: errorMessage },
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