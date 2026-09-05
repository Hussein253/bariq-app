import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { setBotActiveByPhone } from '@/lib/conversations-server'

/**
 * API Route لتفعيل البوت لرقم هاتف معين
 * --------------------------------------
 * يستقبل POST مع phone_number ويجعل bot_active = true
 * و human_takeover = false في جدول customer_sessions
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phone_number } = body

    // التحقق من البيانات المطلوبة
    if (!phone_number) {
      return NextResponse.json(
        { success: false, error: 'رقم الهاتف مطلوب' },
        { status: 400 }
      )
    }

    // 1) تفعيل البوت في نموذج المحادثات (مصدر الحقيقة)
    const conversation = await setBotActiveByPhone({
      customerPhone: phone_number,
      botActive: true,
      platform: 'whatsapp',
    })

    // 2) مزامنة customer_sessions
    let botActivated = conversation?.bot_active === true
    let botActivateError: string | null = null

    try {
      // محاولة تحديث جدول customer_sessions
      const { error: sessionError } = await supabaseServer
        .from('customer_sessions')
        .upsert(
          {
            phone_number,
            bot_active: true,
            human_takeover: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'phone_number' }
        )

      if (sessionError) {
        // إذا فشل بسبب عدم وجود عمود bot_active، نحاول فقط تحديث human_takeover
        console.warn('[ACTIVATE_BOT][SESSION_UPSERT_WARNING]', sessionError.message)
        const { error: fallbackError } = await supabaseServer
          .from('customer_sessions')
          .upsert(
            {
              phone_number,
              human_takeover: false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'phone_number' }
          )
        if (fallbackError) {
          botActivateError = fallbackError.message
          console.error('[ACTIVATE_BOT][SESSION_FALLBACK_ERROR]', fallbackError.message)
        } else {
          botActivated = true
        }
      } else {
        botActivated = true
      }
    } catch (sessionErr: unknown) {
      botActivateError = sessionErr instanceof Error ? sessionErr.message : 'خطأ في تفعيل البوت'
      console.error('[ACTIVATE_BOT][SESSION_EXCEPTION]', botActivateError)
    }

    return NextResponse.json({
      success: botActivated,
      message: botActivated
        ? 'تم تفعيل البوت لهذا الرقم بنجاح'
        : 'تعذر تفعيل البوت',
      bot_active: botActivated,
      conversation,
      error: botActivateError,
    })
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'خطأ داخلي في تفعيل البوت'
    console.error('[ACTIVATE_BOT][ERROR]', errorMessage)
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}