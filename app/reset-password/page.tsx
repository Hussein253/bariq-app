import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyRound, LinkIcon } from 'lucide-react'
import { createSessionClient } from '@/lib/supabase/session'
import ResetPasswordForm from './ResetPasswordForm'
import InterfaceControls from '@/components/InterfaceControls'
import { getTranslations } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return {
    title: t.reset.metaTitle,
    robots: { index: false, follow: false },
  }
}

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  // الجلسة أنشأها /auth/callback بتبادل رمز الرابط. غيابها = رابط منتهٍ أو
  // مُستعمَل، أو وصول مباشر للصفحة بلا رابط أصلاً.
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
            <h1 className="text-lg font-black text-ink">{t.reset.title}</h1>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-5">
            {user ? (
              <ResetPasswordForm email={user.email ?? null} t={t.reset} />
            ) : (
              <div className="text-center">
                <LinkIcon size={24} className="mx-auto text-warn-ink mb-2" />
                <p className="font-black text-sm text-ink">{t.reset.expiredTitle}</p>
                <p className="text-[11px] text-ink-muted leading-relaxed mt-1.5">
                  {t.reset.expiredBody}
                </p>
                <Link
                  href="/forgot-password"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover text-on-brand text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
                >
                  {t.reset.requestNew}
                </Link>
              </div>
            )}
          </div>

          <p className="text-center mt-5">
            <Link href="/login" className="text-xs text-brand-text font-bold hover:underline">
              {t.reset.backToLogin}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
