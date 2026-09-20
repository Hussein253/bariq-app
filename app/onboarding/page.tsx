import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Rocket } from 'lucide-react'
import { createSessionClient } from '@/lib/supabase/session'
import { getSessionProfile, homeForRole } from '@/lib/auth'
import { isPlatformOwnerEmail } from '@/lib/platform-owner'
import { provisionSelfServeMerchant } from '@/lib/merchant-onboarding'
import OnboardingForm from './OnboardingForm'

export const metadata: Metadata = {
  title: 'إكمال إعداد المتجر | برق',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * إتمام التسجيل الذاتي — الخطوة الوحيدة بين إنشاء الحساب ومساحة المشترك
 * =====================================================================
 * الوصول هنا يعني جلسة صالحة بلا صفّ صلاحية بعد: حساباً أُنشئ لتوّه بكلمة
 * مرور (signUpWithPassword)، أو عائداً بحساب قديم لم يُمنح دوره قطّ.
 *
 * مالك المنصة لا يرى هذه الصفحة إطلاقاً: صفّه يُنشأ هنا فوراً ويُحوَّل إلى
 * /admin — لا متجر له ولا اسم متجر يُسأل عنه.
 *
 * والمشترك يرى حقلاً واحداً اختيارياً (اسم متجره)، لأن أي حقل إلزامي إضافي
 * هنا حاجز أمام من يريد الدخول أولاً ثم اختيار اشتراكه.
 */
export default async function OnboardingPage() {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // صفّ صلاحية موجود فعلاً؟ لا شيء لإكماله — يحدث لعائد سجّل دخوله بكلمة
  // مروره، أو لمن مُنح دوره من /admin/users قبل أن يصل إلى هنا.
  const profile = await getSessionProfile()
  if (profile) redirect(homeForRole(profile.role))

  // مالك المنصة: لا شيء يُسأل عنه — يُنشأ صفّه ويُفتح له /admin مباشرة.
  // الفشل هنا لا يُخفى بصفحة نموذج لا تخصّه: تُعرض رسالته صراحةً.
  if (isPlatformOwnerEmail(user.email)) {
    const result = await provisionSelfServeMerchant(user.id, user.email ?? null, '')
    if (result.ok) redirect(homeForRole(result.profile.role))

    return (
      <main
        className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#F8F9FA]"
        dir="rtl"
      >
        <div className="w-full max-w-sm bg-white border border-[#E2E8F0] rounded-2xl p-5 text-center">
          <p className="font-black text-sm text-[#0F172A]">تعذّر تجهيز حساب المالك</p>
          <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5">{result.error}</p>
        </div>
      </main>
    )
  }

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
            أُنشئ حسابك. أخبرنا باسم متجرك لننشئ مساحتك
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <OnboardingForm email={user.email ?? null} />
        </div>
      </div>
    </main>
  )
}
