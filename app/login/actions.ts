'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { createEmailLinkClient } from '@/lib/supabase/email-link'
import { getSessionProfile, homeForRole } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { safeInternalPath } from '@/lib/safe-redirect'
import { headers } from 'next/headers'

/**
 * إجراءات الدخول والخروج (Server Actions)
 * =========================================
 * كلمة المرور لا تمرّ بأي مسار API خاص بنا ولا تُسجَّل: تصل إلى هذا الإجراء
 * ثم إلى Supabase مباشرة. لا يُطبع البريد كاملاً في السجل أيضاً.
 */

export interface LoginState {
  error: string | null
}

/** خمس محاولات لكل عنوان خلال خمس دقائق — يبطئ التخمين بلا إزعاج مستخدم ناسٍ. */
const ATTEMPT_LIMIT = 5
const ATTEMPT_WINDOW_MS = 5 * 60_000

// ⚠️ ملف 'use server' لا يصدّر إلا دوالّ غير متزامنة — الحالة الأولية في
// مكوّن العميل، والنوع وحده يُصدَّر من هنا لأنه يُمحى عند الترجمة.
export interface MagicLinkState {
  sent: boolean
  error: string | null
}

/** ثلاث محاولات كل ربع ساعة — نفس حدّ /forgot-password، لنفس السبب: إرسال البريد مورد محدود. */
const MAGIC_LINK_LIMIT = 3
const MAGIC_LINK_WINDOW_MS = 15 * 60_000

/**
 * التسجيل والدخول معاً — رابط واحد بلا كلمة مرور
 * =================================================
 * shouldCreateUser: true يعني أن أي بريد غير مسجَّل يُنشأ له حساب في
 * auth.users فوراً — هذا هو "التسجيل الذاتي" نفسه، لا خطوة منفصلة قبله.
 * البريد المسجَّل أصلاً (تاجر عائد، أو حتى حساب بكلمة مرور) يحصل على نفس
 * الرابط ليدخل به بدل كتابة كلمة المرور.
 *
 * الرد "أُرسلت" ثابت دائماً — نفس مبدأ /forgot-password: لا فرق ظاهر بين
 * "أُنشئ حساب جديد" و"بريد موجود أصلاً" و"فشل الإرسال"، وإلا صارت الصفحة
 * أداة تعداد حسابات.
 */
export async function requestMagicLinkAction(
  _prev: MagicLinkState,
  formData: FormData
): Promise<MagicLinkState> {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const next = safeInternalPath(formData.get('next'))

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { sent: false, error: 'اكتب بريداً إلكترونياً صالحاً' }
  }

  const headerList = await headers()
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headerList.get('x-real-ip')?.trim() ||
    'unknown'

  const limit = rateLimit(`magiclink:${ip}`, MAGIC_LINK_LIMIT, MAGIC_LINK_WINDOW_MS)
  if (!limit.allowed) {
    return {
      sent: false,
      error: `محاولات كثيرة. انتظر ${Math.ceil(limit.retryAfterSeconds / 60)} دقيقة ثم أعد المحاولة.`,
    }
  }

  const origin =
    headerList.get('origin') ||
    `${headerList.get('x-forwarded-proto') ?? 'https'}://${headerList.get('host')}`

  // حساب جديد يُكمل اسم متجره في /onboarding. حساب له صفّ صلاحية بالفعل
  // يمرّ بـ /onboarding أيضاً لكنها تُحوّله فوراً لواجهته — لا تكرار إدخال.
  const redirectPath = next ? `/auth/callback?next=${encodeURIComponent(next)}` : '/auth/callback?next=/onboarding'

  // عميل الإرسال لا عميل الجلسة: الثاني يفرض PKCE فيُرجِع الرابط بـ ?code=
  // بدل الشظية، و/auth/callback تبني الجلسة من الشظية. انظر التعليل الكامل
  // في lib/supabase/email-link.ts.
  const supabase = createEmailLinkClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}${redirectPath}`,
    },
  })

  if (error) {
    log.warn('MAGIC_LINK_REQUEST_FAILED', { reason: error.message })
  }

  return { sent: true, error: null }
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const next = safeInternalPath(formData.get('next'))

  if (!email || !password) {
    return { error: 'البريد وكلمة المرور مطلوبان' }
  }

  const headerList = await headers()
  const ip =
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headerList.get('x-real-ip')?.trim() ||
    'unknown'

  const limit = rateLimit(`login:${ip}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS)
  if (!limit.allowed) {
    return {
      error: `محاولات كثيرة. انتظر ${Math.ceil(limit.retryAfterSeconds / 60)} دقيقة ثم أعد المحاولة.`,
    }
  }

  const supabase = await createSessionClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // رسالة واحدة لكل أسباب الفشل: التمييز بين "بريد غير مسجَّل" و"كلمة مرور
    // خاطئة" يكشف للمهاجم أي الحسابات قائمة فعلاً.
    log.warn('LOGIN_FAILED', { reason: error.message })
    return { error: 'البريد أو كلمة المرور غير صحيحة' }
  }

  const profile = await getSessionProfile()

  if (!profile) {
    // حساب في auth.users بلا صفّ في profiles. كان يُطرد هنا بإنهاء جلسته،
    // وهو طريق مسدود اليوم بلا سبب: /onboarding تمنحه دوره فوراً — مالكاً
    // إن كان بريده بريد المالك، ومشتركاً فيما عدا ذلك. نفس ما يفعله الجذر
    // بجلسة رابط البريد، فلا معنى لأن يختلف الطريقان.
    log.info('LOGIN_PENDING_PROVISION', {})
    revalidatePath('/', 'layout')
    redirect('/onboarding')
  }

  log.info('LOGIN_SUCCEEDED', { user_id: profile.userId, role: profile.role })

  revalidatePath('/', 'layout')
  redirect(next ?? homeForRole(profile.role))
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
