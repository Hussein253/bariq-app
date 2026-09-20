'use server'

import { headers } from 'next/headers'
import { createEmailLinkClient } from '@/lib/supabase/email-link'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'

/**
 * طلب رابط استعادة كلمة المرور
 * ==============================
 * ⚠️ يردّ "أُرسلت" دائماً — حتى لو لم يكن البريد مسجَّلاً. التمييز بين
 * "أُرسلت" و"بريد غير موجود" يحوّل الصفحة إلى أداة تعداد حسابات: يجرّب
 * المهاجم عناوين ويعرف أيّها قائم في المنصة. نفس مبدأ رسالة الدخول الموحّدة.
 */

// ⚠️ ملف 'use server' لا يصدّر إلا دوالّ غير متزامنة. الأنواع تُمحى عند
// الترجمة فيجوز تصديرها، أما الحالة الأولية فثابت وقت تشغيل — مكانها مكوّن
// العميل. تصديرها من هنا يُسقط الصفحة بخطأ invalid-use-server-value.
export interface ForgotState {
  sent: boolean
  error: string | null
}

/** ثلاث محاولات لكل عنوان كل ربع ساعة — إرسال البريد مورد محدود ومكلف. */
const LIMIT = 3
const WINDOW_MS = 15 * 60_000

export async function requestResetAction(
  _prev: ForgotState,
  formData: FormData
): Promise<ForgotState> {
  const email = String(formData.get('email') || '').trim().toLowerCase()

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { sent: false, error: 'اكتب بريداً إلكترونياً صالحاً' }
  }

  const headerList = await headers()
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headerList.get('x-real-ip')?.trim() ||
    'unknown'

  const limit = rateLimit(`reset:${ip}`, LIMIT, WINDOW_MS)
  if (!limit.allowed) {
    return {
      sent: false,
      error: `محاولات كثيرة. انتظر ${Math.ceil(limit.retryAfterSeconds / 60)} دقيقة ثم أعد المحاولة.`,
    }
  }

  // العنوان يُشتق من الطلب لا من ثابت: يعمل محلياً وعلى النشر بلا تبديل
  const origin =
    headerList.get('origin') ||
    `${headerList.get('x-forwarded-proto') ?? 'https'}://${headerList.get('host')}`

  // نفس سبب رابط الدخول: عميل الجلسة يفرض PKCE فيصل الرابط بـ ?code= ويفشل
  // على أي جهاز غير الذي طلبه. انظر lib/supabase/email-link.ts.
  const supabase = createEmailLinkClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    // الفشل يُسجَّل عندنا ولا يُعرض: عرضه يكشف أي العناوين مسجَّل
    log.warn('RESET_REQUEST_FAILED', { reason: error.message })
  }

  return { sent: true, error: null }
}
