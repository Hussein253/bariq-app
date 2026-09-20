'use server'

import { headers } from 'next/headers'
import { createEmailLinkClient } from '@/lib/supabase/email-link'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { classifyResetError } from '@/lib/auth-errors'

/**
 * طلب رابط استعادة كلمة المرور
 * ==============================
 * ⚠️ لا يُفرَّق بين «بريد مسجَّل» و«غير مسجَّل» في الرد: التفريق يحوّل الصفحة
 * إلى أداة تعداد حسابات — يجرّب المهاجم عناوين ويعرف أيّها قائم في المنصة.
 *
 * لكن هذا الكتمان كان شاملاً فابتلع معه أعطال الإعداد. في ٢٠٢٦-٠٩-٢٠ كان
 * مفتاح anon في الإنتاج مفتاحَ مشروع آخر، فكان Supabase يردّ «Invalid API
 * key» ويرى المستخدم «تفقّد بريدك» وينتظر رسالة لن تأتي أبداً. أُخفي العطل
 * ساعات ولم يُكشف إلا من سجلّ الخادم.
 *
 * والتفرقة ممكنة بلا ثمن، لأن Supabase نفسه يحجب وجود الحساب: `/recover`
 * يردّ **بالنجاح** لبريد غير مسجَّل. فكل خطأ يرجع منه عطل عندنا لا عند
 * صاحب البريد — مفتاح خاطئ، أو SMTP معطّل، أو حدّ إرسال — ولا يكشف أيٌّ منها
 * حساباً. فيُعرض، ويبقى الكتمان على ما يكتمه Supabase أصلاً.
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

  // العنوان يُشتق من الطلب لا من ثابت: يعمل محلياً وعلى النشر بلا تبديل.
  // ⚠️ ويُتجاهل تماماً إن كان قالب البريد على صيغة {{ .TokenHash }}، فالقالب
  // حينها يبني الرابط من {{ .SiteURL }} ويقصد /auth/confirm مباشرة. يبقى هنا
  // ليظلّ القالب القديم ({{ .ConfirmationURL }}) عاملاً — فلا يتوقّف النشر
  // على ترتيب تبديل القالب.
  const origin =
    headerList.get('origin') ||
    `${headerList.get('x-forwarded-proto') ?? 'https'}://${headerList.get('host')}`

  const supabase = createEmailLinkClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  })

  if (error) {
    log.warn('RESET_REQUEST_FAILED', { reason: error.message, status: error.status })

    switch (classifyResetError(error.status, error.message)) {
      // حدّ الإرسال ليس سرّاً ولا يخصّ حساباً بعينه. كتمانه يُجلس المستخدم
      // ينتظر بريداً لن يصل، وإظهاره يقول له أن ينتظر لا أن يعيد المحاولة.
      case 'rate_limited':
        return {
          sent: false,
          error: 'طُلبت رسائل كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.',
        }

      // نصّ قد يكشف وجود الحساب — يُكتم كما لو أُرسل.
      case 'account_probe':
        return { sent: true, error: null }

      // عطل عندنا: مفتاح، أو SMTP، أو خدمة متوقفة. يُقال صراحةً إنه ليس من
      // المستخدم — وإلا راجع بريده وجرّب عناوين أخرى بحثاً عن خطأ ليس عنده.
      case 'service':
        return {
          sent: false,
          error:
            'تعذّر إرسال الرابط الآن — عطل مؤقّت في خدمة البريد لدينا، لا في بريدك. أعد المحاولة بعد قليل.',
        }
    }
  }

  return { sent: true, error: null }
}
