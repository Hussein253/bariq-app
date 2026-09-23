'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { log } from '@/lib/log'
import { getTranslations } from '@/lib/i18n/server'
import { fill } from '@/lib/i18n'
import { localizeDigits } from '@/lib/formatters'

/**
 * تعيين كلمة مرور جديدة بعد الوصول من رابط البريد
 * ================================================
 * الجلسة هنا أنشأها /auth/callback بتبادل رمز الرابط. غيابها يعني رابطاً
 * منتهياً أو مُستعمَلاً — ولا تُقبل كلمة مرور بلا جلسة بأي حال، وإلا صار
 * المسار بوابة لتغيير كلمة مرور أي أحد.
 */

// ⚠️ ملف 'use server' لا يصدّر إلا دوالّ غير متزامنة — الحالة الأولية في
// مكوّن العميل، والأنواع وحدها تُصدَّر من هنا لأنها تُمحى عند الترجمة.
export interface ResetState {
  error: string | null
}

/** ثمانية محارف هو حدّ Supabase الافتراضي — نرفض قبله برسالة مفهومة. */
const MIN_LENGTH = 8

export async function updatePasswordAction(
  _prev: ResetState,
  formData: FormData
): Promise<ResetState> {
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')
  const { locale, t } = await getTranslations()

  if (password.length < MIN_LENGTH) {
    return {
      error: fill(t.reset.errors.shortPassword, { n: localizeDigits(MIN_LENGTH, locale) }),
    }
  }
  if (password !== confirm) {
    return { error: t.reset.errors.mismatch }
  }

  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: t.reset.errors.expired }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    log.warn('PASSWORD_UPDATE_FAILED', { reason: error.message })
    return { error: t.reset.errors.failed }
  }

  log.info('PASSWORD_UPDATED', { user_id: user.id })
  revalidatePath('/', 'layout')

  // الجذر يوزّعه على واجهته حسب دوره — أو يُنهي جلسته إن كان بلا دور
  redirect('/')
}
