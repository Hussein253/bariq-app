import { NextResponse } from 'next/server'
import { loadConversationsOverview } from '@/lib/conversations-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations
 * ----------------------
 * يُرجع كل المحادثات مُثراة بآخر رسالة وعدد الرسائل واسم التاجر.
 * يُستخدم كنسخة احتياطية لتحديث القائمة عند انقطاع Realtime.
 */
export async function GET() {
  try {
    const conversations = await loadConversationsOverview()
    return NextResponse.json({ success: true, conversations })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذر تحميل المحادثات'
    console.error('[CONVERSATIONS][GET_ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
