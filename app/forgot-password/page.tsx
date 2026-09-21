import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound } from 'lucide-react'
import ForgotPasswordForm from './ForgotPasswordForm'
import InterfaceControls from '@/components/InterfaceControls'
import { getTranslations } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return {
    title: t.forgot.metaTitle,
    robots: { index: false, follow: false },
  }
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
  const { locale, t } = await getTranslations()

  return (
    <main className="min-h-screen flex flex-col px-4 py-6 bg-page">
      <div className="w-full max-w-sm mx-auto flex justify-end">
        <InterfaceControls locale={locale} t={t} />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center">
              <KeyRound size={24} />
            </div>
            <h1 className="text-lg font-black text-ink">{t.forgot.title}</h1>
            <p className="text-xs text-ink-muted text-center leading-relaxed">
              {t.forgot.subtitle}
            </p>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-5">
            <ForgotPasswordForm email={email ?? null} t={t.forgot} />
          </div>

          <p className="text-center mt-5">
            <Link href="/login" className="text-xs text-brand-text font-bold hover:underline">
              {t.forgot.backToLogin}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
