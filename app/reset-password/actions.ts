'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { log } from '@/lib/log'

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

  if (password.length < MIN_LENGTH) {
    return { error: `كلمة المرور يجب أن تكون ${MIN_LENGTH} محارف على الأقل` }
  }
  if (password !== confirm) {
    return { error: 'الكلمتان غير متطابقتين' }
  }

  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'انتهت صلاحية الرابط. اطلب رابطاً جديداً من صفحة تغيير كلمة المرور.' }
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    log.warn('PASSWORD_UPDATE_FAILED', { reason: error.message })
    return { error: 'تعذّر تغيير كلمة المرور. جرّب كلمة أخرى أو اطلب رابطاً جديداً.' }
  }

  log.info('PASSWORD_UPDATED', { user_id: user.id })
  revalidatePath('/', 'layout')

  // الجذر يوزّعه على واجهته حسب دوره — أو يُنهي جلسته إن كان بلا دور
  redirect('/')
}
