import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound, LinkIcon } from 'lucide-react'
import { createSessionClient } from '@/lib/supabase/session'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'كلمة مرور جديدة | برق',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  // الجلسة أنشأها /auth/callback بتبادل رمز الرابط. غيابها = رابط منتهٍ أو
  // مُستعمَل، أو وصول مباشر للصفحة بلا رابط أصلاً.
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
          <h1 className="text-lg font-black text-[#0F172A]">كلمة مرور جديدة</h1>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          {user ? (
            <ResetPasswordForm email={user.email ?? null} />
          ) : (
            <div className="text-center">
              <LinkIcon size={24} className="mx-auto text-amber-600 mb-2" />
              <p className="font-black text-sm text-[#0F172A]">الرابط لم يعد صالحاً</p>
              <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5">
                روابط تغيير كلمة المرور تُستعمل مرة واحدة وتنتهي بعد مدة قصيرة.
                اطلب رابطاً جديداً.
              </p>
              <Link
                href="/forgot-password"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-[#253765] hover:bg-[#1D2B50] text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
              >
                اطلب رابطاً جديداً
              </Link>
            </div>
          )}
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
