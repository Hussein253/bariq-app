import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function getConversationKey(channel: string, customerPhone: string) {
  return `${channel}:${customerPhone}`
}

function logIncomingMessage(params: {
  channel: string
  customerPhone: string
  customerName?: string
  text: string
  event: string
  raw?: any
}) {
  const { channel, customerPhone, customerName, text, event } = params
  const conversationKey = getConversationKey(channel, customerPhone)

  console.log('[BOT_WEBHOOK][IN]', {
    time: new Date().toISOString(),
    event,
    channel,
    customerPhone,
    text,
  })

  try {
    const conversation =
      typeof db.getOrCreateConversation === 'function'
        ? db.getOrCreateConversation({
            channel,
            customer_phone: customerPhone,
            customer_name: customerName || 'عميل واتساب',
          })
        : { id: 'c1' }

    db.addMessageToConversation(conversation.id, {
      id: `msg-${Date.now()}`,
      sender: 'customer',
      text,
      time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
    })

    return conversation
  } catch (err: any) {
    console.error('[BOT_WEBHOOK][LOG_ERROR]', err?.message || err)
    return null
  }
}

// 1. دالة الـ GET: هذه المسؤولة عن الرد على طلب التحقق من منصة ميتا
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // الرمز المخزن في متغيرات البيئة على Vercel
  const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'bariq123'

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK_VERIFIED] Webhook verified successfully!')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Unauthorized, token mismatch' }, { status: 403 })
}

// 2. دالة الـ POST: لاستقبال رسائل وأحداث الواتساب والطلبات
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, channel = 'whatsapp', merchant_api_key, data } = body

    console.log('[BOT_WEBHOOK][RAW]', JSON.stringify(body))

    let merchant = merchant_api_key ? db.getMerchantByApiKey(merchant_api_key) : null
    if (!merchant) {
      merchant = db.getMerchants()[0]
    }

    const customerPhone = data?.customer_phone || data?.from || '07700000000'
    const customerName = data?.customer_name

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

    return NextResponse.json({ success: true, message: 'تم استلام الحدث بنجاح' })
  } catch (error: any) {
    console.error('[BOT_WEBHOOK][ERROR]', error?.message || error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}