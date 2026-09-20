import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { getSessionProfile } from '@/lib/auth'

/**
 * الجذر — موزِّع لا صفحة
 * =======================
 * من يفتح الرابط بلا جلسة يريد الدخول، لا قراءة تعريف ثم البحث عن زر دخول.
 * فالجذر يوزّع:
 *
 *   • بلا جلسة        → /login
 *   • جلسة بلا دور    → /onboarding — تسجيل ذاتي كتاجر، لا رفض
 *   • جلسة بدور       → /platform — الواجهة التعريفية
 *
 * ⚠️ الحالة الأخيرة كانت تذهب إلى واجهة الدور مباشرة (homeForRole). صارت
 * تمرّ بالتعريفية عمداً: التاجر يرى باقته وحدودها وخيارات الترقية في كل
 * زيارة بدل أن يقفز فوقها ولا يراها إلا إن بحث عنها. ومساحته على بعد ضغطة
 * واحدة من شريط الجلسة أعلى الصفحة (components/SessionBar).
 *
 * ولا يسري هذا على من جاء بوجهة مقصودة: /login?next=… يحترم وجهته بعد
 * الدخول، فمن ضُغط له رابط صفحة بعينها يصلها لا التعريفية.
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

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_code?: string }>
}) {
  // رابط بريد فاشل يعود إلى **الجذر** لا إلى /auth/callback: Supabase يردّ
  // على تحقّق فاشل بتحويل إلى Site URL حاملاً الخطأ في الاستعلام والشظية
  // معاً (‏?error=access_denied&error_code=otp_expired#…). وهذا الجذر كان
  // يتجاهل الاستعلام تماماً فيبتلع السبب ويرسل صاحبه إلى /login بلا كلمة —
  // يعيد الطلب، يفشل من جديد، ولا يعرف لماذا. الرسالة نصّها من عندنا لا من
  // الرابط (LINK_ERRORS في صفحة الدخول)، فلا يُحقن نصّ باسم برق.
  const { error, error_code } = await searchParams
  if (error || error_code) {
    redirect('/login?error=expired_link')
  }

  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getSessionProfile()
  if (!profile) redirect('/onboarding')

  redirect('/platform')
}
