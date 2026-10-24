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

export type DashboardReplyResult =
  | { sent: true; messageId: string | null }
  | { sent: false; error: string }

/** واتساب يرد في ثانية عادةً. المهلة تمنع تعليق الدالة إن انقطع جهاز n8n. */
const TIMEOUT_MS = 15_000

export async function sendDashboardReply(
  payload: DashboardReplyPayload
): Promise<DashboardReplyResult> {
  const url = process.env.N8N_WEBHOOK_URL
  const secret = process.env.BARIQ_N8N_OUTBOUND_SECRET

  if (!url) return { sent: false, error: 'N8N_WEBHOOK_URL غير مضبوط في متغيرات البيئة' }
  if (!secret) {
    return { sent: false, error: 'BARIQ_N8N_OUTBOUND_SECRET غير مضبوط في متغيرات البيئة' }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const body = (await res.json().catch(() => null)) as {
      message_id?: unknown
      error?: unknown
    } | null

    if (res.ok) {
      return { sent: true, messageId: typeof body?.message_id === 'string' ? body.message_id : null }
    }

    // رمز السبب من n8n (unauthorized، outside_24h_window، …) أنفع للفريق من رقم الحالة وحده
    const code = typeof body?.error === 'string' ? body.error : null
    return {
      sent: false,
      error: code ? `n8n ${res.status}: ${code}` : `n8n responded with status ${res.status}`,
    }
  } catch (err: unknown) {
    return { sent: false, error: err instanceof Error ? err.message : 'فشل الاتصال بـ n8n' }
  }
}
