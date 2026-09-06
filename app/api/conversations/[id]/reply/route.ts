import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { recordMessage, setBotActiveByPhone } from '@/lib/conversations-server'
import type { Conversation } from '@/lib/conversations'

/**
 * POST /api/conversations/:id/reply — رد الموظف على محادثة واحدة (أي قناة)
 * ===========================================================================
 * يعمّم /api/send-whatsapp ليعمل بشكل صحيح على القناة الفعلية للمحادثة
 * (whatsapp / instagram / messenger) بدل افتراض واتساب دوماً — ضروري لتبويبات
 * إنستغرام وماسنجر حتى لا يُسجَّل الرد في محادثة واتساب خاطئة لنفس الرقم.
 *
 * ⚠️ الإرسال الفعلي للعميل عبر Meta Graph API غير موصول بعد إلا لواتساب
 * (n8n webhook). لإنستغرام وماسنجر: الرد يُسجَّل في قاعدة البيانات ويوقف
 * البوت فوراً، لكن channel_send_supported=false — لا تخمين لتكامل غير موجود.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await req.json().catch(() => ({}))
    const text = String(body?.text || '').trim()

    if (!text) {
      return NextResponse.json({ success: false, error: 'نص الرد مطلوب' }, { status: 400 })
    }

    const { data: conversation, error: convError } = await supabaseServer
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (convError) {
      return NextResponse.json({ success: false, error: convError.message }, { status: 500 })
    }
    if (!conversation) {
      return NextResponse.json({ success: false, error: 'المحادثة غير موجودة' }, { status: 404 })
    }

    const conv = conversation as Conversation
    const platform = conv.platform || 'whatsapp'

    // 1) تسجيل رد الموظف في نفس المحادثة (نفس رقم الزبون + نفس القناة)
    const { message: liveMessage } = await recordMessage({
      customerPhone: conv.customer_phone,
      content: text,
      senderType: 'agent',
      platform,
    })

    if (!liveMessage) {
      console.error('[CONVERSATION_REPLY][RECORD_MESSAGE_FAILED]', { conversationId: id })
      return NextResponse.json(
        { success: false, error: 'تعذر تسجيل الرسالة في قاعدة البيانات' },
        { status: 500 }
      )
    }

    // 2) الإرسال الفعلي للزبون — واتساب فقط حالياً عبر n8n webhook
    let channelSendSupported = false
    let n8nSent = false
    let n8nError: string | null = null

    if (platform === 'whatsapp') {
      channelSendSupported = true
      const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL

      if (n8nWebhookUrl) {
        try {
          const n8nResponse = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone_number: conv.customer_phone,
              message_text: text,
              channel: 'whatsapp',
              source: 'bariq-dashboard',
            }),
          })

          if (n8nResponse.ok) {
            n8nSent = true
          } else {
            n8nError = `n8n responded with status ${n8nResponse.status}`
            console.error('[CONVERSATION_REPLY][N8N_ERROR]', n8nError)
          }
        } catch (err: unknown) {
          n8nError = err instanceof Error ? err.message : 'فشل الاتصال بـ n8n'
          console.error('[CONVERSATION_REPLY][N8N_EXCEPTION]', n8nError)
        }
      } else {
        n8nError = 'N8N_WEBHOOK_URL غير مضبوط في متغيرات البيئة'
        console.warn('[CONVERSATION_REPLY][N8N_NOT_CONFIGURED]', n8nError)
      }
    }

    // 3) إيقاف البوت لهذه المحادثة عند الرد اليدوي
    const updatedConversation = await setBotActiveByPhone({
      customerPhone: conv.customer_phone,
      botActive: false,
      platform,
    })

    // 4) مزامنة customer_sessions (لا تُفشل الطلب إن تعذّرت)
    let sessionError: string | null = null
    const { error: sessionUpsertError } = await supabaseServer
      .from('customer_sessions')
      .upsert(
        {
          phone_number: conv.customer_phone,
          bot_active: false,
          human_takeover: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone_number' }
      )

    if (sessionUpsertError) {
      sessionError = sessionUpsertError.message
      console.warn('[CONVERSATION_REPLY][SESSION_SYNC_WARNING]', sessionUpsertError.message)
    }

    return NextResponse.json({
      success: true,
      message: channelSendSupported
        ? n8nSent
          ? 'تم إرسال الرسالة إلى العميل وحفظها في قاعدة البيانات'
          : 'تم حفظ الرسالة في قاعدة البيانات، لكن فشل الإرسال عبر n8n'
        : 'تم حفظ الرد داخلياً — لا يوجد تكامل فعلي لإرسال الرسائل عبر هذه القناة بعد',
      channel_send_supported: channelSendSupported,
      n8n_sent: n8nSent,
      n8n_error: n8nError,
      session_error: sessionError,
      live_message: liveMessage,
      conversation: updatedConversation || conv,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ داخلي في إرسال الرد'
    console.error('[CONVERSATION_REPLY][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
