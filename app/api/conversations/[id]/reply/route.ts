import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { recordMessage, setBotActive } from '@/lib/conversations-server'
import { canActOnConversation, type Conversation } from '@/lib/conversations'
import { requireSession } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'
import { dashboardReplyChannel } from '@/lib/n8n-outbound'
import { deliverAgentReply, saveDeliveryOutcome } from '@/lib/message-delivery-server'

// فحص النافذة (≤3 ث) + n8n (≤15 ث) — أعلى من الافتراضي حتى ما تنقطع الدالة قبل ما تكتب حالة التوصيل
export const maxDuration = 30

/**
 * POST /api/conversations/:id/reply — رد الموظف على محادثة واحدة (أي قناة)
 * ===========================================================================
 * يعمّم /api/send-whatsapp ليعمل بشكل صحيح على القناة الفعلية للمحادثة
 * (whatsapp / instagram / messenger) بدل افتراض واتساب دوماً — ضروري لتبويبات
 * إنستغرام وماسنجر حتى لا يُسجَّل الرد في محادثة واتساب خاطئة لنفس الرقم.
 *
 * الإرسال الفعلي للعميل يمرّ عبر مسار n8n «رد اللوحة» لواتساب وماسنجر
 * (docs/n8n-dashboard-reply.md). إنستغرام: الرد يُسجَّل في قاعدة البيانات
 * ويوقف البوت فوراً، لكن channel_send_supported=false — لا تخمين لتكامل غير موجود.
 * (قبل هذا التعديل كان ماسنجر يُحفظ بلا إرسال: الموظف يشوف رده باللوحة والزبون ما يستلم شي.)
 *
 * كل رد يحمل حالة توصيله (الترحيل ٠٣٠): pending قبل الإرسال، ثم sent/failed/unknown،
 * و not_supported لإنستغرام. الفشل يبقى على الفقاعة ويعاد من
 * /api/conversations/:id/messages/:messageId/resend — مو تنبيه مؤقت ينمسح.
 *
 * يخدم لوحة الفريق (/operations/chats) وصفحة التاجر (/workspace/chats).
 * ⚠️ صاحب المحادثة يُفحص قبل تسجيل أي رسالة: التاجر لا يردّ في محادثة تاجر
 * آخر، والرفض ٤٠٤ لا ٤٠٣ فلا يُكشف وجودها (canActOnConversation).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSession(['platform_owner', 'staff', 'merchant'])
  if (!guard.ok) return guard.response
  const { id } = await params
  const t = await apiMessages()

  try {
    const body = await req.json().catch(() => ({}))
    const text = String(body?.text || '').trim()

    if (!text) {
      return NextResponse.json({ success: false, error: t.conversations.replyRequired }, { status: 400 })
    }

    const { data: conversation, error: convError } = await supabaseServer
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (convError) {
      console.error('[CONVERSATION_REPLY][READ_ERROR]', convError.message)
      return NextResponse.json({ success: false, error: t.conversations.replyFailed }, { status: 500 })
    }

    const conv = conversation as Conversation | null
    if (!conv || !canActOnConversation(guard.profile.role, guard.profile.merchantId, conv.merchant_id)) {
      return NextResponse.json({ success: false, error: t.conversations.notFound }, { status: 404 })
    }
    const platform = conv.platform || 'whatsapp'
    const channel = dashboardReplyChannel(platform)

    // 1) تسجيل رد الموظف في المحادثة نفسها بمعرّفها — لا بالرقم والقناة: زبون
    //    يراسل متجرين له محادثتان على القناة نفسها (الترحيل ٠١٩)
    const { message: recorded } = await recordMessage({
      conversation: conv,
      content: text,
      senderType: 'agent',
      deliveryStatus: channel ? 'pending' : 'not_supported',
    })
    let liveMessage = recorded

    if (!liveMessage) {
      console.error('[CONVERSATION_REPLY][RECORD_MESSAGE_FAILED]', { conversationId: id })
      return NextResponse.json(
        { success: false, error: t.conversations.recordFailed },
        { status: 500 }
      )
    }

    // 2) الإرسال الفعلي للزبون — نافذة 24 ساعة بالتطبيق ثم n8n (واتساب وماسنجر)، والنتيجة تنكتب على الرسالة
    const channelSendSupported = channel !== null
    let n8nSent = false
    let n8nError: string | null = null

    if (channel) {
      const outcome = await deliverAgentReply({
        phone: conv.customer_phone,
        channel,
        accountExternalId: conv.account_external_id,
        text,
      })
      n8nSent = outcome.status === 'sent'
      n8nError = outcome.error
      if (!n8nSent) console.error('[CONVERSATION_REPLY][DELIVERY]', outcome.status, n8nError)

      // فشل كتابة الحالة ما يفشل الطلب: الرسالة محفوظة، وpending العالقة تنعرض unknown بعد دقيقتين
      liveMessage = (await saveDeliveryOutcome(liveMessage.id, outcome)) ?? liveMessage
    }

    // 3) إيقاف البوت لهذه المحادثة عند الرد اليدوي
    const updatedConversation = await setBotActive({ conversation: conv, botActive: false })

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
    console.error('[CONVERSATION_REPLY][ERROR]', error instanceof Error ? error.message : error)
    return NextResponse.json({ success: false, error: t.conversations.replyFailed }, { status: 500 })
  }
}
