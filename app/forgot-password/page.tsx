import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata: Metadata = {
  title: 'تغيير كلمة المرور | برق',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  // البريد يُمرَّر من صفحة الدخول ليُملأ سلفاً — راحة لا أكثر، والإجراء
  // يتحقق منه مستقلاً لأن ما يأتي من الرابط لا يُوثَق.
  const { email } = await searchParams

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#F8F9FA]"
      dir="rtl"
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#253765] text-white flex items-center justify-center">
            <KeyRound size={24} />
          </div>
          <h1 className="text-lg font-black text-[#0F172A]">تغيير كلمة المرور</h1>
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            اكتب بريدك ونرسل لك رابطاً تختار به كلمة مرور جديدة
          </p>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <ForgotPasswordForm email={email ?? null} />
        </div>

        <p className="text-center mt-5">
          <Link href="/login" className="text-xs text-[#253765] font-bold hover:underline">
            العودة لتسجيل الدخول
          </Link>
        </p>
      </div>
    </main>
  )
}
