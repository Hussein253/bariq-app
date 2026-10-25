import type { Message, MessageDeliveryStatus } from '@/lib/conversations'
import type { DashboardReplyResult } from '@/lib/n8n-outbound'

/**
 * حالة توصيل رد الموظف (الترحيل ٠٣٠) — منطق نقي يشترك به الخادم والمتصفح
 * =========================================================================
 * رد موظف ماسنجر (2026-10-25، تنفيذ n8n 1946) انحفظ وظهر باللوحة بلا أي أثر
 * للفشل، والزبون ما استلمه. هسه كل رد يحمل حالته:
 *
 *   pending ──► sent           Meta قبلته
 *           ├─► failed         أكيد ما وصل ← «إعادة إرسال»
 *           └─► unknown        ممكن وصل ← «تأكد قبل الإعادة»
 *   failed / unknown ──(إعادة)──► pending
 *   not_supported              قناة بلا إرسال (إنستغرام) — نهائية
 *
 * failed و unknown منفصلتان عمداً: إعادة رسالة وصلت فعلاً تكررها للزبون.
 * ⚠️ بلا استيراد خادم: الواجهة تستعمل canResendMessage.
 */

/** pending أقدم من هذا = الدالة انقطعت قبل ما تحدّث الحالة، فتُعامل كـ unknown */
export const STALE_PENDING_MS = 2 * 60_000

/** نافذة خدمة العملاء عند Meta: رد حر (RESPONSE) بس خلال 24 ساعة من آخر رسالة للزبون */
export const CUSTOMER_WINDOW_MS = 24 * 60 * 60_000

export type DeliveryOutcome = {
  status: Extract<MessageDeliveryStatus, 'sent' | 'failed' | 'unknown'>
  error: string | null
  externalMessageId: string | null
}

/** n8n ← Meta انقطع (مهلة axios، اتصال مقطوع): Meta ممكن استلمت الطلب */
const AMBIGUOUS_DETAIL = /timeout|timed out|aborted|ETIMEDOUT|ECONNRESET|socket hang up/i

/** نتيجة n8n ← حالة الرسالة. الشك يروح لـ unknown، مو failed: التكرار أسوأ من التنبيه */
export function classifyReplyResult(result: DashboardReplyResult): DeliveryOutcome {
  if (result.sent) return { status: 'sent', error: null, externalMessageId: result.messageId }

  const ambiguous =
    result.kind === 'timeout' ||
    result.kind === 'network' ||
    (result.kind === 'rejected' && AMBIGUOUS_DETAIL.test(result.detail ?? ''))

  const error = result.detail ? `${result.error} — ${result.detail}` : result.error
  return { status: ambiguous ? 'unknown' : 'failed', error, externalMessageId: null }
}

/**
 * آخر رسالة واردة من الزبون ← داخل النافذة؟ null = ما نعرف (فشل الفحص)، فنرسل على أي حال:
 * عطل بالقاعدة ما يوقف ردود الموظفين (نفس سلوك n8n السابق).
 */
export function isWithinCustomerWindow(lastIncomingAt: string | null, now: Date = new Date()): boolean {
  if (!lastIncomingAt) return false
  const at = Date.parse(lastIncomingAt)
  return Number.isFinite(at) && now.getTime() - at < CUSTOMER_WINDOW_MS
}

/** pending عالقة؟ (الدالة انقطعت بين الحفظ والتحديث) */
export function isStalePending(message: Pick<Message, 'delivery_status' | 'delivery_updated_at'>, now: Date = new Date()): boolean {
  if (message.delivery_status !== 'pending') return false
  const at = Date.parse(message.delivery_updated_at ?? '')
  return !Number.isFinite(at) || now.getTime() - at > STALE_PENDING_MS
}

/** الحالة كما تُعرض: pending العالقة = unknown */
export function effectiveDeliveryStatus(
  message: Pick<Message, 'delivery_status' | 'delivery_updated_at'>,
  now: Date = new Date()
): MessageDeliveryStatus | null {
  return isStalePending(message, now) ? 'unknown' : (message.delivery_status ?? null)
}

/** رد موظف فشل أو حالته مجهولة — يجوز إعادته */
export function canResendMessage(
  message: Pick<Message, 'sender_type' | 'delivery_status' | 'delivery_updated_at'>,
  now: Date = new Date()
): boolean {
  if (message.sender_type !== 'agent') return false
  const status = effectiveDeliveryStatus(message, now)
  return status === 'failed' || status === 'unknown'
}
