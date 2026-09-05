import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { recordMessage, setBotActiveByPhone } from '@/lib/conversations-server'

/**
 * API Route لإرسال رسالة واتساب يدوياً من لوحة التحكم
 * ---------------------------------------------------
 * 1. يستقبل طلب POST من الواجهة (LiveConversations.tsx)
 * 2. يرسل الرسالة إلى n8n Webhook لإرسالها فعلياً إلى هاتف العميل
 * 3. يسجّل الرسالة في نموذج المحادثات (conversations / messages) — المصدر الوحيد
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone_number, message_text } = body

    // التحقق من البيانات المطلوبة
    if (!phone_number || !message_text) {
      return NextResponse.json(
        { success: false, error: 'رقم الهاتف ونص الرسالة مطلوبان' },
        { status: 400 }
      )
    }

    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL

    // إرسال الرسالة إلى n8n Webhook
    let n8nSent = false
    let n8nError: string | null = null

    if (n8nWebhookUrl) {
      try {
        const n8nResponse = await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phone_number,
            message_text,
            channel: 'whatsapp',
            source: 'bariq-dashboard',
          }),
        })

        if (n8nResponse.ok) {
          n8nSent = true
          console.log('[SEND_WHATSAPP][N8N_SUCCESS]', { phone_number, message_text })
        } else {
          n8nError = `n8n responded with status ${n8nResponse.status}`
          console.error('[SEND_WHATSAPP][N8N_ERROR]', n8nError)
        }
      } catch (err: unknown) {
        n8nError = err instanceof Error ? err.message : 'فشل الاتصال بـ n8n'
        console.error('[SEND_WHATSAPP][N8N_EXCEPTION]', n8nError)
      }
    } else {
      n8nError = 'N8N_WEBHOOK_URL غير مضبوط في متغيرات البيئة'
      console.warn('[SEND_WHATSAPP][N8N_NOT_CONFIGURED]', n8nError)
    }

    // تسجيل الرد في نموذج المحادثات (conversations / messages) — المصدر الوحيد
    // sender_type = 'agent' لأن الرد صادر من موظف عبر لوحة التحكم
    const { message: liveMessage, conversation } = await recordMessage({
      customerPhone: phone_number,
      content: message_text,
      senderType: 'agent',
      platform: 'whatsapp',
    })

    // فشل التسجيل خطأ فعلي: الرسالة قد تكون أُرسلت للزبون دون أثر في النظام
    if (!liveMessage) {
      console.error('[SEND_WHATSAPP][RECORD_MESSAGE_FAILED]', { phone_number, n8n_sent: n8nSent })
      return NextResponse.json(
        {
          success: false,
          error: 'تعذر تسجيل الرسالة في قاعدة البيانات',
          n8n_sent: n8nSent,
        },
        { status: 500 }
      )
    }

    // تعطيل البوت لهذه المحادثة (bot_active = false) عند الرد اليدوي
    // حتى لا يستمر البوت بالرد تلقائياً أثناء تدخل الموظف
    let botDisabled = false
    let botDisableError: string | null = null

    const updatedConversation = await setBotActiveByPhone({
      customerPhone: phone_number,
      botActive: false,
      platform: 'whatsapp',
    })
    botDisabled = updatedConversation?.bot_active === false

    // مزامنة customer_sessions (يقرأها n8n لمعرفة التسليم البشري)
    try {
      const { error: sessionError } = await supabaseServer
        .from('customer_sessions')
        .upsert(
          {
            phone_number,
            bot_active: false,
            human_takeover: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'phone_number' }
        )

      if (sessionError) {
        botDisableError = sessionError.message
        console.warn('[SEND_WHATSAPP][SESSION_SYNC_WARNING]', sessionError.message)
      }
    } catch (sessionErr: unknown) {
      botDisableError = sessionErr instanceof Error ? sessionErr.message : 'خطأ في مزامنة الجلسة'
      console.error('[SEND_WHATSAPP][SESSION_EXCEPTION]', botDisableError)
    }

    return NextResponse.json({
      success: true,
      message: n8nSent
        ? 'تم إرسال الرسالة إلى العميل وحفظها في قاعدة البيانات'
        : 'تم حفظ الرسالة في قاعدة البيانات، لكن فشل الإرسال عبر n8n',
      n8n_sent: n8nSent,
      n8n_error: n8nError,
      bot_disabled: botDisabled,
      bot_disable_error: botDisableError,
      live_message: liveMessage,
      conversation: updatedConversation || conversation,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'خطأ داخلي في إرسال الرسالة'
    console.error('[SEND_WHATSAPP][ERROR]', errorMessage)
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}