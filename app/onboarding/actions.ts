'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { homeForRole } from '@/lib/roles'
import { provisionSelfServeMerchant } from '@/lib/merchant-onboarding'
import { log } from '@/lib/log'

// ⚠️ ملف 'use server' لا يصدّر إلا دوالّ غير متزامنة — الحالة الأولية في
// مكوّن العميل، والأنواع وحدها تُصدَّر من هنا لأنها تُمحى عند الترجمة.
export interface OnboardState {
  error: string | null
}

export async function completeOnboardingAction(
  _prev: OnboardState,
  formData: FormData
): Promise<OnboardState> {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // الرابط انتهى بين تحميل الصفحة وإرسال النموذج — لا صلاحية بلا جلسة
    redirect('/login')
  }

  // الاسم اختياري: تركه فارغاً يُنشئ اسماً افتراضياً يغيّره صاحبه لاحقاً من
  // إعدادات متجره. رفض الإنشاء لأجله يوقف التسجيل عند حقل تجميلي.
  const storeName = String(formData.get('store_name') || '').trim()

  const result = await provisionSelfServeMerchant(user.id, user.email ?? null, storeName)

  if (!result.ok) {
    return { error: result.error }
  }

  log.info('ONBOARDING_COMPLETED', { user_id: user.id, role: result.profile.role })
  revalidatePath('/', 'layout')
  redirect(homeForRole(result.profile.role))
}
