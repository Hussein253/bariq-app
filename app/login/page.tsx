import type { Metadata } from 'next'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import LoginForm from './LoginForm'
import { safeInternalPath } from '@/lib/safe-redirect'

export const metadata: Metadata = {
  title: 'تسجيل الدخول | برق',
  // صفحة دخول مفهرسة تُظهر لوحة تشغيل الشركة في نتائج البحث بلا فائدة
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // التحقق يتكرّر في الإجراء نفسه: ما يصل من الرابط لا يُوثَق لأنه مُرِّر
  // عبر المتصفح ويمكن تعديله بين عرض الصفحة وإرسال النموذج.
  const safeNext = safeInternalPath(next)

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#F8F9FA]" dir="rtl">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#253765] text-white flex items-center justify-center">
            <Zap size={24} />
          </div>
          <h1 className="text-lg font-black text-[#0F172A]">برق</h1>
          <p className="text-xs text-slate-500">منصة الأتمتة والربط اللوجستي</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <LoginForm next={safeNext} />
        </div>

        <p className="text-[11px] text-slate-500 text-center mt-5 leading-relaxed">
          الحسابات يُنشئها مالك المنصة. إن لم يكن لديك حساب أو نسيت كلمة المرور،
          تواصل معه مباشرة.
        </p>

        <p className="text-center mt-4">
          <Link href="/" className="text-xs text-[#253765] font-bold hover:underline">
            العودة لصفحة المنصة
          </Link>
        </p>
      </div>
    </main>
  )
}
