import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { requireSession } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

/**
 * POST /api/social-accounts/:id/verify — اعتماد مالك المنصة لحساب أعمال
 * ======================================================================
 * التاجر يربط حسابه بكتابة معرّفه يدوياً، فيستطيع أن يدّعي رقم متجر آخر.
 * لذلك لا تُوجَّه إلى الحساب أي محادثة حتى يعتمده مالك المنصة بعد التأكد من
 * الملكية (الترحيل ٠١٩). والاعتماد وإلحاق المحادثات التي وصلت قبله عملية
 * واحدة في القاعدة (verify_social_account)، فلا يبقى نصفها معلّقاً.
 *
 * لمالك المنصة وحده: الاعتماد يوجّه محادثات زبائن إلى تاجر، وهو قرار ملكية.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireSession(['platform_owner'])
  if (!guard.ok) return guard.response
  const { id } = await params
  const t = await apiMessages()

  const { data: attached, error } = await supabaseServer.rpc('verify_social_account', {
    p_account_id: id,
    p_actor: guard.profile.userId,
  })

  if (error) {
    // BQ003 من الدالة، و 22P02 لمعرّف ليس UUID أصلاً — كلاهما «غير موجود»
    if (error.code === 'BQ003' || error.code === '22P02') {
      return NextResponse.json({ success: false, error: t.accounts.notFound }, { status: 404 })
    }
    log.error('SOCIAL_ACCOUNT_VERIFY_FAILED', { account_id: id, reason: error.message })
    return NextResponse.json({ success: false, error: t.accounts.verifyFailed }, { status: 500 })
  }

  const attachedConversations = typeof attached === 'number' ? attached : 0
  log.info('SOCIAL_ACCOUNT_VERIFIED', {
    account_id: id,
    by_user: guard.profile.userId,
    attached_conversations: attachedConversations,
  })

  return NextResponse.json({ success: true, attached_conversations: attachedConversations })
}
