import type { Metadata } from 'next'
import Link from 'next/link'
import { Zap } from 'lucide-react'
import LoginPanels from './LoginPanels'
import InterfaceControls from '@/components/InterfaceControls'
import { safeInternalPath } from '@/lib/safe-redirect'
import { getTranslations } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return {
    title: t.login.metaTitle,
    // صفحة دخول مفهرسة تُظهر لوحة تشغيل الشركة في نتائج البحث بلا فائدة
    robots: { index: false, follow: false },
  }
}

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  const { locale, t } = await getTranslations()

  // التحقق يتكرّر في الإجراء نفسه: ما يصل من الرابط لا يُوثَق لأنه مُرِّر
  // عبر المتصفح ويمكن تعديله بين عرض الصفحة وإرسال النموذج.
  const safeNext = safeInternalPath(next)

  // ⚠️ نصّ رسالة الرابط من القاموس لا من الرابط — وإلا حقن أحدهم نصاً يقول
  // للزائر شيئاً باسم برق. والمفتاح وحده هو ما يُقرأ من الاستعلام.
  const linkError =
    error && error in t.login.linkErrors
      ? t.login.linkErrors[error as keyof typeof t.login.linkErrors]
      : null

  return (
    <main className="min-h-screen flex flex-col px-4 py-6 bg-page">
      {/* ⚠️ الضابطان فوق النموذج لا تحته: من لا يقرأ العربية يجب أن يبدّل
          لغته قبل أن يقرأ حقول التسجيل، لا بعد أن يخمّن ما يُطلب منه. */}
      <div className="w-full max-w-sm mx-auto flex justify-end">
        <InterfaceControls locale={locale} t={t} />
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center">
              <Zap size={24} />
            </div>
            <h1 className="text-lg font-black text-ink">{t.brand.name}</h1>
            <p className="text-xs text-ink-muted">{t.brand.tagline}</p>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
            <LoginPanels
              next={safeNext}
              initialError={linkError}
              t={{ login: t.login, signup: t.signup }}
            />
          </div>

          <p className="text-[11px] text-ink-muted text-center mt-5 leading-relaxed">
            {t.login.signupNote}
          </p>

          <p className="text-center mt-4">
            <Link href="/platform" className="text-xs text-brand-text font-bold hover:underline">
              {t.login.backToPlatform}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
