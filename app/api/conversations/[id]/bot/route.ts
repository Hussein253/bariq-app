import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { Conversation } from '@/lib/conversations'

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
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const body = await req.json().catch(() => ({}))
    const botActive = body?.bot_active

    if (typeof botActive !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'الحقل bot_active مطلوب ويجب أن يكون قيمة منطقية (true/false)' },
        { status: 400 }
      )
    }

    // 1) تحديث حالة البوت في جدول المحادثات (مصدر الحقيقة)
    const { data, error } = await supabaseServer
      .from('conversations')
      .update({ bot_active: botActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[CONVERSATION_BOT][UPDATE_ERROR]', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json(
        { success: false, error: 'المحادثة غير موجودة' },
        { status: 404 }
      )
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

    console.log('[CONVERSATION_BOT][UPDATED]', {
      conversation_id: id,
      phone: conversation.customer_phone,
      bot_active: botActive,
      session_synced: sessionSynced,
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
    const message = error instanceof Error ? error.message : 'خطأ داخلي في تحديث حالة البوت'
    console.error('[CONVERSATION_BOT][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
