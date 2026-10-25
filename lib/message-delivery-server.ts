import { supabaseServer } from '@/lib/supabase-server'
import type { Message } from '@/lib/conversations'
import { sendDashboardReply, type DashboardReplyChannel } from '@/lib/n8n-outbound'
import {
  STALE_PENDING_MS,
  classifyReplyResult,
  isWithinCustomerWindow,
  type DeliveryOutcome,
} from '@/lib/message-delivery'

/**
 * إرسال رد الموظف وتسجيل حالة توصيله (الترحيل ٠٣٠)
 * =================================================
 * ⚠️ تستخدم service_role — لا تُستورد أبداً في كود المتصفح.
 *
 * فحص نافذة 24 ساعة صار هنا بعد ما كان عقدة Postgres داخل n8n: n8n على جهاز
 * يتقطع اتصاله بـ Supabase (سيدني)، والفحص أخذ 21 ثانية في التنفيذ 1946 فتجاوز
 * مهلة التطبيق كلها قبل ما يبدي الإرسال. Vercel يوصل Supabase بثوانٍ قليلة.
 */

/** فحص النافذة ما يستاهل أكثر من هذا: فشله = نرسل على أي حال */
const WINDOW_CHECK_TIMEOUT_MS = 3_000

/**
 * آخر رسالة واردة من الزبون على منصة القناة — نفس استعلام عقدة n8n السابقة حرفياً
 * (conversation_log، الرقم + المنصة، direction incoming/in، المنصة الفارغة = واتساب).
 */
export async function lastCustomerMessageAt(
  phone: string,
  channel: DashboardReplyChannel
): Promise<{ ok: true; at: string | null } | { ok: false; error: string }> {
  try {
    let query = supabaseServer
      .from('conversation_log')
      .select('created_at')
      .eq('phone_number', phone)
      .in('direction', ['incoming', 'in'])

    query = channel === 'whatsapp' ? query.or('platform.eq.whatsapp,platform.is.null') : query.eq('platform', channel)

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .abortSignal(AbortSignal.timeout(WINDOW_CHECK_TIMEOUT_MS))
      .maybeSingle()

    if (error) return { ok: false, error: error.message }
    return { ok: true, at: (data as { created_at: string | null } | null)?.created_at ?? null }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'window check failed' }
  }
}

/** نافذة 24 ساعة ثم n8n ← نتيجة مصنّفة (sent / failed / unknown) */
export async function deliverAgentReply(params: {
  phone: string
  channel: DashboardReplyChannel
  accountExternalId: string | null | undefined
  text: string
}): Promise<DeliveryOutcome> {
  const window = await lastCustomerMessageAt(params.phone, params.channel)

  if (window.ok && !isWithinCustomerWindow(window.at)) {
    // Meta ترفض رد ماسنجر خارجها، وواتساب يقبله ثم يسقطه بصمت — فما نرسل أصلاً
    return { status: 'failed', error: 'outside_24h_window', externalMessageId: null }
  }
  if (!window.ok) console.warn('[MESSAGE_DELIVERY][WINDOW_CHECK_FAILED]', window.error)

  const result = await sendDashboardReply({
    phone_number: params.phone,
    message_text: params.text,
    channel: params.channel,
    source: 'bariq-dashboard',
    // واتساب: الرقم الذي تدور عليه المحادثة (null = المسار القديم). ماسنجر: معرّف الصفحة، إلزامي.
    account_external_id: params.accountExternalId ?? null,
  })

  return classifyReplyResult(result)
}

/** يكتب نتيجة الإرسال على الرسالة. حدث UPDATE يوصلها للوحات المفتوحة عبر Realtime */
export async function saveDeliveryOutcome(messageId: string, outcome: DeliveryOutcome): Promise<Message | null> {
  const { data, error } = await supabaseServer
    .from('messages')
    .update({
      delivery_status: outcome.status,
      delivery_error: outcome.error,
      external_message_id: outcome.externalMessageId,
      delivery_updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select()
    .maybeSingle()

  if (error) {
    console.error('[MESSAGE_DELIVERY][SAVE_OUTCOME_ERROR]', error.message)
    return null
  }
  return data as Message | null
}

/**
 * يحجز الرسالة لإعادة الإرسال: يقلبها pending ويزيد المحاولات بتحديث مشروط واحد.
 * الشرط على delivery_attempts نفسه قفل تفاؤلي: ضغطتان متتاليتان (أو لوحتان) تكسب
 * وحدة بس، والثانية ترجع null بدل ما ترسل الرسالة مرتين.
 */
export async function claimForResend(message: Message): Promise<Message | null> {
  const attempts = message.delivery_attempts ?? 0
  const staleBefore = new Date(Date.now() - STALE_PENDING_MS).toISOString()

  const { data, error } = await supabaseServer
    .from('messages')
    .update({
      delivery_status: 'pending',
      delivery_error: null,
      delivery_attempts: attempts + 1,
      delivery_updated_at: new Date().toISOString(),
    })
    .eq('id', message.id)
    .eq('sender_type', 'agent')
    .eq('delivery_attempts', attempts)
    .or(`delivery_status.in.(failed,unknown),and(delivery_status.eq.pending,delivery_updated_at.lt."${staleBefore}")`)
    .select()
    .maybeSingle()

  if (error) {
    console.error('[MESSAGE_DELIVERY][CLAIM_ERROR]', error.message)
    return null
  }
  return data as Message | null
}
