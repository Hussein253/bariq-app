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
 *   • جلسة بلا دور    → /onboarding — تسجيل ذاتي كتاجر، لا رفض
 *   • جلسة بدور       → واجهته حسب دوره
 *
 * ⚠️ الحالة الوسطى تغيّر معناها جذرياً هنا. قبل التسجيل الذاتي كانت تعني
 * حصراً حساباً شاذاً (بلا صفّ صلاحية رغم أن كل مسارات الإنشاء تُنشئه معه
 * ذرّياً) فكان الرد الصحيح إنهاء الجلسة. الآن الطريق الوحيد لجلسة صالحة بلا
 * صفّ هو /login → رابط بريد → هنا — أي تاجر جديد أثبت ملكية بريده لتوّه.
 * /onboarding نفسها تُعيد التوجيه فوراً لمن له صفّ صلاحية فعلاً، فلا خطر من
 * توجيه عائد بالخطأ إليها. مسار الخروج القديم (/auth/signout?reason=no_profile)
 * باقٍ كأداة يدوية، غير مُستعمَل من هنا بعد اليوم.
 *
 * الحالة الوسطى ليست الوحيدة التي يمنحها رابط بريد بلا كلمة مرور: رابط
 * الدخول ورابط استعادة كلمة المرور كلاهما يمنحان جلسةً دون المرور بإجراء
 * الدخول. ولو أُرسل صاحب جلسة كهذه إلى /login مباشرةً لدارت حلقة لانهائية —
 * proxy.ts يعيد كل من له جلسة من /login إلى الجذر، والجذر يعيده إلى /login.
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
  if (!profile) redirect('/onboarding')

  redirect(homeForRole(profile.role))
}
