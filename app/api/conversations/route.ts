import { NextRequest, NextResponse } from 'next/server'
import { loadConversationsOverview } from '@/lib/conversations-server'
import { requireMerchantScope, requireSession } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'

export const dynamic = 'force-dynamic'

/**
 * GET /api/conversations[?merchant=<id>]
 * --------------------------------------
 * يُرجع المحادثات مُثراة بآخر رسالة وعدد الرسائل واسم التاجر.
 * يُستخدم كنسخة احتياطية لتحديث القائمة عند انقطاع Realtime.
 *
 * النطاق بحسب الدور:
 *   merchant       → محادثات تاجره وحده دائماً، طلب ?merchant أم لم يطلب
 *   platform_owner → كلها، أو تاجراً واحداً بـ ?merchant (صفحة /workspace/chats)
 *                    يُقيَّد في سجل التدقيق عبر requireMerchantScope
 *   staff          → كلها (لوحة /operations/chats)
 */
export async function GET(req: NextRequest) {
  const guard = await requireSession(['platform_owner', 'staff', 'merchant'])
  if (!guard.ok) return guard.response

  const requested = req.nextUrl.searchParams.get('merchant')
  let merchantId: string | undefined

  if (guard.profile.role === 'merchant') {
    // حساب تاجر بلا تاجر مربوط لا يرى شيئاً — لا يسقط إلى القائمة الكاملة
    if (!guard.profile.merchantId) return NextResponse.json({ success: true, conversations: [] })
    merchantId = guard.profile.merchantId
  } else if (requested && guard.profile.role === 'platform_owner') {
    const scope = await requireMerchantScope(requested)
    if (!scope.ok) return scope.response
    merchantId = scope.merchantId
  }

  try {
    const conversations = await loadConversationsOverview(merchantId)
    return NextResponse.json({ success: true, conversations })
  } catch (error: unknown) {
    console.error('[CONVERSATIONS][GET_ERROR]', error instanceof Error ? error.message : error)
    const t = await apiMessages()
    return NextResponse.json({ success: false, error: t.conversations.loadFailed }, { status: 500 })
  }
}
