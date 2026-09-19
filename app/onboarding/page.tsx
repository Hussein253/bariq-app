import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Rocket } from 'lucide-react'
import { createSessionClient } from '@/lib/supabase/session'
import { getSessionProfile, homeForRole } from '@/lib/auth'
import OnboardingForm from './OnboardingForm'

export const metadata: Metadata = {
  title: 'إكمال إعداد المتجر | برق',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * إتمام التسجيل الذاتي — الخطوة الوحيدة بين رابط البريد ومساحة التاجر
 * =====================================================================
 * الوصول هنا يعني أن صاحب هذا البريد أثبت ملكيته بالضغط على الرابط
 * (/auth/callback أنشأ الجلسة)، ولم يُمنح دوراً بعد. اسم المتجر هو الحقل
 * الوحيد الناقص لإنشاء تاجر حقيقي — لا يُخمَّن ولا يُشتق من البريد.
 */
export default async function OnboardingPage() {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // صفّ صلاحية موجود فعلاً؟ لا شيء لإكماله — يحدث لعائد بحساب قائم استعمل
  // رابط الدخول السريع بدل كلمة المرور، أو لمن أُنشئ له دور بعد إرسال الرابط.
  const profile = await getSessionProfile()
  if (profile) redirect(homeForRole(profile.role))

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#F8F9FA]"
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#253765] text-white flex items-center justify-center">
            <Rocket size={22} />
          </div>
          <h1 className="text-lg font-black text-[#0F172A]">خطوة أخيرة</h1>
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            بريدك مؤكَّد. أخبرنا باسم متجرك لننشئ مساحتك
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <OnboardingForm email={user.email ?? null} />
        </div>
      </div>
    </main>
  )
}
