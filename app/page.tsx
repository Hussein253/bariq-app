import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { getSessionProfile, homeForRole } from '@/lib/auth'

/**
 * الجذر — موزِّع لا صفحة
 * =======================
 * برق أداة تشغيل لا موقع تسويقي: من يفتح الرابط يريد الدخول، لا قراءة تعريف
 * بالمنصة ثم البحث عن زر الدخول. فالجذر يوزّع:
 *
 *   • بلا جلسة        → /login
 *   • جلسة بلا دور    → /auth/signout — تُنهى الجلسة ثم يُعاد للدخول
 *   • جلسة بدور       → واجهته حسب دوره
 *
 * الحالة الوسطى ليست نظرية: رابط استعادة كلمة المرور يمنح جلسةً دون المرور
 * بإجراء الدخول الذي يُنهي جلسة من لا دور له. ولو أُرسل صاحبها إلى /login
 * مباشرةً لدارت حلقة لانهائية — proxy.ts يعيد كل من له جلسة من /login إلى
 * الجذر، والجذر يعيده إلى /login.
 *
 * الصفحة التعريفية باقية على /platform، ورابطها أسفل نموذج الدخول.
 */
export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getSessionProfile()
  if (!profile) redirect('/auth/signout?reason=no_profile')

  redirect(homeForRole(profile.role))
}
