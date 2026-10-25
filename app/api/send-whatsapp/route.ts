import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { recordMessage, setBotActive } from '@/lib/conversations-server'
import { requireSession } from '@/lib/api-session'
import { maskPhone, maskText } from '@/lib/log'
import { deliverAgentReply, saveDeliveryOutcome } from '@/lib/message-delivery-server'

/**
 * API Route لإرسال رسالة واتساب يدوياً من لوحة التحكم
 * ---------------------------------------------------
 * 1. يستقبل طلب POST (الواجهة الحالية تستعمل /api/conversations/:id/reply)
 * 2. يسجّل الرسالة في نموذج المحادثات (conversations / messages) بحالة pending
 * 3. يفحص نافذة 24 ساعة ويرسلها عبر n8n، ويكتب حالة التوصيل عليها (الترحيل ٠٣٠)
 */

export async function POST(req: NextRequest) {
  const guard = await requireSession(['platform_owner', 'staff'])
  if (!guard.ok) return guard.response
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

    // تسجيل الرد أولاً (pending) في نموذج المحادثات — المصدر الوحيد — حتى ما ينرسل للزبون رد بلا أثر بالنظام.
    // sender_type = 'agent' لأن الرد صادر من موظف عبر لوحة التحكم.
    // ⚠️ بالرقم وحده بلا حساب أعمال: يمرّ بالقاعدة القديمة (الترحيل ٠١٩).
    // الرد على محادثة بعينها مساره /api/conversations/:id/reply
    const { message: recorded, conversation } = await recordMessage({
      customerPhone: phone_number,
      content: message_text,
      senderType: 'agent',
      platform: 'whatsapp',
      deliveryStatus: 'pending',
    })

    if (!recorded) {
      console.error('[SEND_WHATSAPP][RECORD_MESSAGE_FAILED]', { phone: maskPhone(phone_number) })
      return NextResponse.json(
        { success: false, error: 'تعذر تسجيل الرسالة في قاعدة البيانات', n8n_sent: false },
        { status: 500 }
      )
    }

    // نافذة 24 ساعة ثم n8n، والنتيجة تنكتب على الرسالة
    const outcome = await deliverAgentReply({
      phone: phone_number,
      channel: 'whatsapp',
      accountExternalId: null, // الرقم القديم، كما كان هذا المسار يرسل دوماً
      text: message_text,
    })
    const n8nSent = outcome.status === 'sent'
    const n8nError = outcome.error

    if (n8nSent) {
      // مُقنَّعان: سجلات Vercel بلا RLS، وسياسة الخصوصية تَعِد بذلك (lib/log.ts)
      console.log('[SEND_WHATSAPP][N8N_SUCCESS]', {
        phone: maskPhone(phone_number),
        text: maskText(message_text),
      })
    } else {
      console.error('[SEND_WHATSAPP][DELIVERY]', outcome.status, n8nError)
    }

    const liveMessage = (await saveDeliveryOutcome(recorded.id, outcome)) ?? recorded

    // تعطيل البوت لهذه المحادثة (bot_active = false) عند الرد اليدوي
    // حتى لا يستمر البوت بالرد تلقائياً أثناء تدخل الموظف
    let botDisabled = false
    let botDisableError: string | null = null

    const updatedConversation = await setBotActive({
      customerPhone: phone_number,
      platform: 'whatsapp',
      botActive: false,
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