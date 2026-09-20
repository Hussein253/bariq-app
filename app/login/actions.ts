'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { getSessionProfile } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { safeInternalPath } from '@/lib/safe-redirect'
import { headers } from 'next/headers'

/**
 * إجراءات الدخول والتسجيل والخروج (Server Actions)
 * ==================================================
 * كلمة المرور لا تمرّ بأي مسار API خاص بنا ولا تُسجَّل: تصل إلى هذا الإجراء
 * ثم إلى Supabase مباشرة. لا يُطبع البريد كاملاً في السجل أيضاً.
 *
 * ⚠️ رابط الدخول بلا كلمة مرور (magic link) أُزيل من هنا عمداً. علّته ليست
 * في تنفيذه بل في اعتماده على البريد نفسه: خادم Supabase المدمج يسمح
 * برسالتين في الساعة، فثالث تاجر يسجّل في الساعة لا يصله شيء ويرى رسالة
 * نجاح. والاستعادة وحدها تبقى على البريد — لأنها بطبيعتها كذلك، ولأنها
 * نادرة لا تُطلب في كل دخول.
 */

export interface LoginState {
  error: string | null
}

export interface SignUpState {
  error: string | null
}

/** خمس محاولات لكل عنوان خلال خمس دقائق — يبطئ التخمين بلا إزعاج مستخدم ناسٍ. */
const ATTEMPT_LIMIT = 5
const ATTEMPT_WINDOW_MS = 5 * 60_000

/** نفس حدّ /reset-password: الرفض هنا برسالة مفهومة قبل أن يردّه Supabase بأعجمية. */
const MIN_PASSWORD_LENGTH = 8

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** عنوان الطالب — للحدّ من المحاولات. يُقرأ من ترويسات الوكيل لا من الجسم. */
async function requestIp(): Promise<string> {
  const headerList = await headers()
  return (
    headerList.get('x-forwarded-for')?.split(',')[0].trim() ||
    headerList.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

/**
 * إنشاء حساب بكلمة مرور — التسجيل الذاتي للتجّار
 * ================================================
 * شاشة الدخول تعرض هذا النموذج خلف رابط صريح لا بالتبديل التلقائي. والسبب
 * أن النموذج الموحّد (يُنشئ إن لم يجد الحساب) يحوّل **خطأً مطبعياً واحداً**
 * في البريد إلى متجر جديد فارغ بدل رسالة «كلمة المرور خاطئة» — فيظنّ تاجرٌ
 * له شحنات وطلبات أن بياناته ضاعت. والشحنات تُعامل معاملة الأنظمة المالية
 * (بند ٤ في CLAUDE.md)، فالوضوح هنا مقدَّم على اختصار ضغطة.
 *
 * ⚠️ الجلسة تُمنح فوراً فقط إن كان «Confirm email» مُطفأً في لوحة Supabase.
 * وإن كان مُفعّلاً يرجع signUp بمستخدم بلا جلسة — وتلك حالة تُعالَج صراحةً
 * أدناه بدل أن تُترك تسقط في فراغ.
 */
export async function signUpWithPassword(
  _prev: SignUpState,
  formData: FormData
): Promise<SignUpState> {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { error: 'اكتب بريداً إلكترونياً صالحاً' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LENGTH} محارف على الأقل` }
  }
  if (password !== confirm) {
    return { error: 'الكلمتان غير متطابقتين' }
  }

  const limit = rateLimit(`signup:${await requestIp()}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS)
  if (!limit.allowed) {
    return {
      error: `محاولات كثيرة. انتظر ${Math.ceil(limit.retryAfterSeconds / 60)} دقيقة ثم أعد المحاولة.`,
    }
  }

  const supabase = await createSessionClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    log.warn('SIGNUP_FAILED', { reason: error.message })

    // ⚠️ هنا وحدها نكشف أن البريد مسجَّل. في /login و/forgot-password تُكتم
    // هذه الحقيقة لأن كتمانها يمنع تعداد الحسابات. أما في نموذج إنشاء حساب
    // فكتمانها يترك صاحب الحساب أمام فشل لا يفهمه ولا يعرف ماذا يفعل بعده —
    // وهو يعرف بريده أصلاً. الإفصاح هنا يفيده ولا يعطي مهاجماً ما لا يملكه.
    if (/already registered|already been registered|user already exists/i.test(error.message)) {
      return { error: 'لهذا البريد حساب بالفعل — سجّل الدخول، أو اطلب تغيير كلمة المرور إن نسيتها.' }
    }
    return { error: 'تعذّر إنشاء الحساب. جرّب كلمة مرور أخرى أو أعد المحاولة بعد قليل.' }
  }

  // «Confirm email» مُفعّل في اللوحة: الحساب أُنشئ ولا جلسة له حتى يُؤكَّد
  // البريد. لا يُترك المستخدم أمام شاشة صامتة — يُقال له ما ينتظره بالضبط.
  if (!data.session) {
    log.info('SIGNUP_AWAITING_EMAIL_CONFIRMATION', {})
    return {
      error: 'أنشأنا حسابك، وبقي تأكيد بريدك. افتح الرسالة التي وصلتك واضغط الرابط، ثم سجّل الدخول.',
    }
  }

  log.info('SIGNUP_SUCCEEDED', { user_id: data.session.user.id })
  revalidatePath('/', 'layout')

  // /onboarding يمنح الدور حسب البريد ثم يوزّع. ولا يُمرَّر next هنا: حساب
  // جديد بلا صفّ صلاحية سيُردّ من أي وجهة أخرى إلى هنا على كل حال.
  redirect('/onboarding')
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')
  const next = safeInternalPath(formData.get('next'))

  if (!email || !password) {
    return { error: 'البريد وكلمة المرور مطلوبان' }
  }

  const limit = rateLimit(`login:${await requestIp()}`, ATTEMPT_LIMIT, ATTEMPT_WINDOW_MS)
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
    // إن كان بريده بريد المالك، ومشتركاً فيما عدا ذلك.
    log.info('LOGIN_PENDING_PROVISION', {})
    revalidatePath('/', 'layout')
    redirect('/onboarding')
  }

  log.info('LOGIN_SUCCEEDED', { user_id: profile.userId, role: profile.role })

  revalidatePath('/', 'layout')

  // الوجهة الافتراضية هي التعريفية لا واجهة الدور: التاجر يرى باقته وحدوده
  // وخيارات الترقية أولاً بدل أن يقفز فوقها. ومساحته بضغطة من شريط الجلسة.
  // و next يسبقها دائماً — من ضُغط له رابط صفحة بعينها يصلها لا التعريفية.
  redirect(next ?? '/platform')
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
