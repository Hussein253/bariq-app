import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { canActOnConversation, type Conversation, type Message } from '@/lib/conversations'
import { requireSession } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'
import { dashboardReplyChannel } from '@/lib/n8n-outbound'
import { canResendMessage } from '@/lib/message-delivery'
import { claimForResend, deliverAgentReply, saveDeliveryOutcome } from '@/lib/message-delivery-server'

// نفس ميزانية مسار الرد: فحص النافذة (≤3 ث) + n8n (≤15 ث)
export const maxDuration = 30

/**
 * POST /api/conversations/:id/messages/:messageId/resend — إعادة إرسال رد موظف لم يصل
 * ======================================================================================
 * يقبل بس رد موظف حالته failed أو unknown (أو pending عالقة أكثر من دقيقتين —
 * الترحيل ٠٣٠). unknown يعني ممكن وصل: الواجهة تطلب تأكيد الموظف قبل ما تستدعي هذا المسار.
 *
 * الحجز تحديث مشروط واحد (claimForResend): ضغطتان أو لوحتان على نفس الرسالة
 * تكسب وحدة بس، والثانية ترجع 409 بدل ما توصل الرسالة للزبون مرتين.
 * نفس قيد صاحب المحادثة بمسار الرد: التاجر ما يعيد رسالة تاجر آخر، والرفض ٤٠٤.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const guard = await requireSession(['platform_owner', 'staff', 'merchant'])
  if (!guard.ok) return guard.response
  const { id, messageId } = await params
  const t = await apiMessages()

  try {
    const { data: conversation, error: convError } = await supabaseServer
      .from('conversations')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (convError) {
      console.error('[MESSAGE_RESEND][READ_CONVERSATION_ERROR]', convError.message)
      return NextResponse.json({ success: false, error: t.conversations.replyFailed }, { status: 500 })
    }

    const conv = conversation as Conversation | null
    if (!conv || !canActOnConversation(guard.profile.role, guard.profile.merchantId, conv.merchant_id)) {
      return NextResponse.json({ success: false, error: t.conversations.notFound }, { status: 404 })
    }

    const { data: row, error: msgError } = await supabaseServer
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .eq('conversation_id', conv.id)
      .maybeSingle()

    if (msgError) {
      console.error('[MESSAGE_RESEND][READ_MESSAGE_ERROR]', msgError.message)
      return NextResponse.json({ success: false, error: t.conversations.replyFailed }, { status: 500 })
    }

    const message = row as Message | null
    if (!message) {
      return NextResponse.json({ success: false, error: t.conversations.notFound }, { status: 404 })
    }

    const channel = dashboardReplyChannel(conv.platform || 'whatsapp')
    if (!channel || !canResendMessage(message)) {
      return NextResponse.json({ success: false, error: t.conversations.resendNotAllowed }, { status: 409 })
    }

    const claimed = await claimForResend(message)
    if (!claimed) {
      return NextResponse.json({ success: false, error: t.conversations.resendNotAllowed }, { status: 409 })
    }

    const outcome = await deliverAgentReply({
      phone: conv.customer_phone,
      channel,
      accountExternalId: conv.account_external_id,
      text: message.content,
    })
    if (outcome.status !== 'sent') console.error('[MESSAGE_RESEND][DELIVERY]', outcome.status, outcome.error)

    const saved = (await saveDeliveryOutcome(claimed.id, outcome)) ?? claimed

    return NextResponse.json({
      success: true,
      delivery_status: outcome.status,
      delivery_error: outcome.error,
      live_message: saved,
    })
  } catch (error: unknown) {
    console.error('[MESSAGE_RESEND][ERROR]', error instanceof Error ? error.message : error)
    return NextResponse.json({ success: false, error: t.conversations.replyFailed }, { status: 500 })
  }
}
