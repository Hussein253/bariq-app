/**
 * إرسال ردود اللوحة إلى n8n (مسار «رد اللوحة → واتساب وماسنجر»)
 * ==============================================================
 * العقد كاملاً في docs/n8n-dashboard-reply.md.
 *
 * المسار في n8n عام على الإنترنت ويرسل واتساب باسم المنصة، فهو يرفض بـ 401
 * كل طلب لا يحمل السرّ. لذلك نفشل هنا فشلاً مغلقاً إن غاب السرّ أو الرابط:
 * طلب نعرف مسبقاً أنه سيُرفض لا يُرسل أصلاً، والسبب يصل للوحة واضحاً.
 */

/** القنوات الي يرسل لها مسار n8n فعلاً. إنستغرام ما إله مسار إرسال بعد: رده ينحفظ باللوحة بس. */
export type DashboardReplyChannel = 'whatsapp' | 'messenger'

export type DashboardReplyPayload = {
  /** واتساب: رقم الزبون دولياً أرقاماً فقط (964…). ماسنجر: معرّف الزبون عند الصفحة (PSID) */
  phone_number: string
  message_text: string
  channel: DashboardReplyChannel
  source: 'bariq-dashboard'
  /**
   * واتساب: phone_number_id الذي تدور عليه المحادثة، و null = الرقم القديم (الترحيل ٠١٩).
   * ماسنجر: معرّف الصفحة، وإلزامي — n8n يرفض الناقص أو المجهول (ما نخمّن أي صفحة نرسل منها).
   */
  account_external_id?: string | null
}

/**
 * منصة المحادثة ← قناة مسار n8n. null = ما في إرسال فعلي لهالقناة (إنستغرام): الرد ينحفظ بس ويطلع تنبيه «حُفظ داخلياً».
 * محادثة بلا منصة محفوظة تعتبر واتساب (المسار القديم).
 */
export function dashboardReplyChannel(platform: string | null | undefined): DashboardReplyChannel | null {
  if (!platform || platform === 'whatsapp') return 'whatsapp'
  if (platform === 'messenger') return 'messenger'
  return null
}

/**
 * نوع الفشل — يحدد هل الرسالة أكيد ما وصلت (failed) أو ممكن وصلت (unknown) — lib/message-delivery.ts:
 *   config      رابط أو سرّ ناقص: ما انرسل طلب أصلاً
 *   rejected    n8n رد بحالة غير 2xx (رفض، أو Meta رفضت، أو انقطع اتصاله بـ Meta)
 *   unreachable ما انفتح اتصال بـ n8n (جهاز طافي، DNS، رفض اتصال): الطلب ما وصله
 *   timeout     انتهت مهلتنا وn8n ممكن بعده يرسل
 *   network     انقطع الاتصال بعد ما انفتح: ممكن n8n استلم الطلب
 */
export type DashboardReplyFailureKind = 'config' | 'rejected' | 'unreachable' | 'timeout' | 'network'

export type DashboardReplyResult =
  | { sent: true; messageId: string | null }
  | { sent: false; error: string; kind: DashboardReplyFailureKind; detail?: string }

/**
 * ميزانية المهلات: n8n يرسل لـ Meta بمهلة 10 ثواني وما بقى عنده فحص قاعدة بيانات
 * (فحص نافذة 24 ساعة صار بالتطبيق — n8n/dashboard-reply-app-window.mjs)، فـ 15 ثانية
 * تكفي حتى يوصلنا سبب فشله بدل ما نقطع قبله (التنفيذ 1946: 21 ثانية فحص + 10 إرسال = 31).
 */
export const DASHBOARD_REPLY_TIMEOUT_MS = 15_000

/** رموز Node/undici تعني إن الاتصال ما انفتح أصلاً، فالطلب أكيد ما وصل n8n */
const NOT_CONNECTED_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT'])

function networkFailure(err: unknown): DashboardReplyResult {
  if (err instanceof Error && err.name === 'TimeoutError') {
    return { sent: false, kind: 'timeout', error: `timeout ${DASHBOARD_REPLY_TIMEOUT_MS / 1000}s` }
  }
  const code = err instanceof Error ? (err.cause as { code?: unknown } | undefined)?.code : undefined
  const message = err instanceof Error ? err.message : 'فشل الاتصال بـ n8n'
  if (typeof code === 'string' && NOT_CONNECTED_CODES.has(code)) {
    return { sent: false, kind: 'unreachable', error: `${message} (${code})` }
  }
  return { sent: false, kind: 'network', error: message }
}

export async function sendDashboardReply(
  payload: DashboardReplyPayload
): Promise<DashboardReplyResult> {
  const url = process.env.N8N_WEBHOOK_URL
  const secret = process.env.BARIQ_N8N_OUTBOUND_SECRET

  if (!url) return { sent: false, kind: 'config', error: 'N8N_WEBHOOK_URL غير مضبوط في متغيرات البيئة' }
  if (!secret) {
    return { sent: false, kind: 'config', error: 'BARIQ_N8N_OUTBOUND_SECRET غير مضبوط في متغيرات البيئة' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(DASHBOARD_REPLY_TIMEOUT_MS),
    })

    const body = (await res.json().catch(() => null)) as {
      message_id?: unknown
      error?: unknown
      detail?: unknown
    } | null

    if (res.ok) {
      return { sent: true, messageId: typeof body?.message_id === 'string' ? body.message_id : null }
    }

    // رمز السبب من n8n (unauthorized، outside_24h_window، …) أنفع للفريق من رقم الحالة وحده
    // detail (502): رسالة خطأ اتصال n8n بـ Meta — تفرّق «رفضت» عن «انقطع الاتصال وممكن وصلت»
    const code = typeof body?.error === 'string' ? body.error : null
    return {
      sent: false,
      kind: 'rejected',
      error: code ? `n8n ${res.status}: ${code}` : `n8n responded with status ${res.status}`,
      ...(typeof body?.detail === 'string' ? { detail: body.detail } : {}),
    }
  } catch (err: unknown) {
    return networkFailure(err)
  }
}
