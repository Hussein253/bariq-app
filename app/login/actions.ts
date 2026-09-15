'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
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
    // حساب في auth.users بلا صف في profiles: الدخول نجح لكن لا صلاحية له.
    // تُنهى الجلسة فوراً بدل تركه يتجوّل بلا دور.
    await supabase.auth.signOut()
    log.warn('LOGIN_REJECTED_NO_PROFILE', {})
    return { error: 'حسابك غير مربوط بصلاحية بعد — راجع مالك المنصة' }
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
