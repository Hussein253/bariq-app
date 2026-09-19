import type { Metadata } from 'next'
import { KeyRound } from 'lucide-react'
import { safeInternalPath } from '@/lib/safe-redirect'
import CallbackClient from './CallbackClient'

export const metadata: Metadata = {
  title: 'جارٍ التحقق | برق',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  // الوجهة تصل من رابط بريد — قبولها كما هي يحوّل نطاق برق إلى أداة تصيّد
  const target = safeInternalPath(next) ?? '/reset-password'

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
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5">
          <CallbackClient next={target} />
        </div>
      </div>
    </main>
  )
}
