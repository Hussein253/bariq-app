import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { canActOnConversation, type Conversation } from '@/lib/conversations'
import { requireSession } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'
import { log, maskPhone } from '@/lib/log'

/**
 * PATCH /api/conversations/:id/bot
 * --------------------------------
 * زر التحكم بالبوت: يشغّل أو يوقف الرد التلقائي لمحادثة واحدة.
 *
 * Body: { "bot_active": boolean }
 *
 * مصدر الحقيقة هو conversations.bot_active، ويُزامَن معه جدول
 * customer_sessions (bot_active / human_takeover) لأن مسارات n8n
 * الحالية تقرأ حالة التسليم البشري من هناك.
 *
 * يخدم لوحة الفريق (/operations/chats) وصفحة التاجر (/workspace/chats).
 * ⚠️ صاحب المحادثة يُقرأ ويُفحص قبل أي كتابة: التاجر لا يمسّ محادثة تاجر آخر،
 * والرفض ٤٠٤ لا ٤٠٣ فلا يُكشف وجودها (canActOnConversation).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSession(['platform_owner', 'staff', 'merchant'])
  if (!guard.ok) return guard.response
  const { id } = await params
  const t = await apiMessages()

  try {
    const body = await req.json().catch(() => ({}))
    const botActive = body?.bot_active

    if (typeof botActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: t.conversations.botActiveInvalid },
        { status: 400 }
      )
    }

    // 0) المحادثة وصاحبها قبل أي كتابة
    const { data: existing, error: readError } = await supabaseServer
      .from('conversations')
      .select('id, merchant_id')
      .eq('id', id)
      .maybeSingle()

    if (readError) {
      console.error('[CONVERSATION_BOT][READ_ERROR]', readError.message)
      return NextResponse.json({ success: false, error: t.conversations.updateFailed }, { status: 500 })
    }

    const owner = existing as Pick<Conversation, 'id' | 'merchant_id'> | null
    if (!owner || !canActOnConversation(guard.profile.role, guard.profile.merchantId, owner.merchant_id)) {
      return NextResponse.json({ success: false, error: t.conversations.notFound }, { status: 404 })
    }

    // 1) تحديث حالة البوت في جدول المحادثات (مصدر الحقيقة)
    const { data, error } = await supabaseServer
      .from('conversations')
      .update({ bot_active: botActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      console.error('[CONVERSATION_BOT][UPDATE_ERROR]', error?.message)
      return NextResponse.json({ success: false, error: t.conversations.updateFailed }, { status: 500 })
    }

    const conversation = data as Conversation

    // 2) مزامنة customer_sessions (لا تُفشل الطلب إن تعذّرت)
    let sessionSynced = false
    let sessionError: string | null = null

    const { error: upsertError } = await supabaseServer
      .from('customer_sessions')
      .upsert(
        {
          phone_number: conversation.customer_phone,
          bot_active: botActive,
          human_takeover: !botActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'phone_number' }
      )

    if (upsertError) {
      sessionError = upsertError.message
      console.warn('[CONVERSATION_BOT][SESSION_SYNC_WARNING]', upsertError.message)
    } else {
      sessionSynced = true
    }

    // الهاتف مُقنَّع: سجلات Vercel بلا RLS، وسياسة الخصوصية تَعِد بذلك (lib/log.ts)
    log.info('CONVERSATION_BOT_UPDATED', {
      conversation_id: id,
      phone: maskPhone(conversation.customer_phone),
      bot_active: botActive,
      session_synced: sessionSynced,
      by_role: guard.profile.role,
    })

    return NextResponse.json({
      success: true,
      message: botActive
        ? 'تم تشغيل الرد التلقائي للبوت في هذه المحادثة'
        : 'تم إيقاف البوت — المحادثة الآن بإدارة الموظف',
      conversation,
      session_synced: sessionSynced,
      session_error: sessionError,
    })
  } catch (error: unknown) {
    console.error('[CONVERSATION_BOT][ERROR]', error instanceof Error ? error.message : error)
    return NextResponse.json({ success: false, error: t.conversations.updateFailed }, { status: 500 })
  }
}
