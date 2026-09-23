import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Server,
  LayoutDashboard,
  Database,
  MessageCircle,
  Workflow,
} from 'lucide-react'
import { getPlatformStatus, type StatusComponent } from '@/lib/status'
import { localizeDigits } from '@/lib/formatters'
import { getTranslations } from '@/lib/i18n/server'
import { fill } from '@/lib/i18n'
import { LOCALE_DIR } from '@/lib/i18n/config'
import InterfaceControls from '@/components/InterfaceControls'

// فحص حي في كل زيارة — لا تخزين مؤقت لحالة قد تتغيّر خلال ثوانٍ
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return { title: t.status.metaTitle }
}

const COMPONENT_ICONS: Record<StatusComponent['key'], React.ComponentType<{ size?: number; className?: string }>> = {
  api: Server,
  dashboard: LayoutDashboard,
  database: Database,
  metaWebhooks: MessageCircle,
  aiBrain: Workflow,
}

const HEALTHY_STATES = new Set<StatusComponent['state']>(['operational', 'configured'])

export default async function StatusPage() {
  const { locale, t } = await getTranslations()
  const status = await getPlatformStatus()

  const Back = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight
  const timeLocale = locale === 'en' ? 'en-US' : 'ar-IQ'
  const checkedAtLabel = localizeDigits(
    new Date(status.checkedAt).toLocaleString(timeLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    locale
  )

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col font-sans">
      <header className="border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-on-brand font-black shadow-md">
              ⚡
            </div>
            <span className="text-base font-black tracking-tight text-brand-text">{t.footer.brandLine}</span>
          </div>
          <div className="flex items-center gap-4">
            <InterfaceControls locale={locale} t={t} />
            <Link
              href="/platform"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-brand-text transition"
            >
              <Back size={14} />
              <span>{t.status.backToPlatform}</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-ink">{t.status.title}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t.status.subtitle}</p>

        <div
          className={`mt-8 rounded-2xl border p-5 flex items-center gap-3 ${
            status.overall === 'operational'
              ? 'bg-success-bg border-success-line text-success-ink'
              : 'bg-warn-bg border-warn-line text-warn-ink'
          }`}
        >
          {status.overall === 'operational' ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
          <div>
            <p className="font-black text-sm">
              {status.overall === 'operational' ? t.status.overallOperational : t.status.overallDegraded}
            </p>
            <p className="text-[11px] font-semibold opacity-80 mt-0.5">
              {fill(t.status.lastChecked, { time: checkedAtLabel })}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-surface border border-line divide-y divide-line overflow-hidden">
          {status.components.map((c) => {
            const Icon = COMPONENT_ICONS[c.key]
            const healthy = HEALTHY_STATES.has(c.state)
            const StateIcon = healthy ? CheckCircle2 : c.state === 'down' ? XCircle : AlertTriangle
            const toneClass = healthy
              ? 'text-success-ink'
              : c.state === 'down'
              ? 'text-danger-ink'
              : 'text-warn-ink'
            return (
              <div key={c.key} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <Icon size={16} className="text-ink-muted" />
                  <span className="text-sm font-bold text-ink">{t.status.components[c.key]}</span>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${toneClass}`}>
                  <StateIcon size={14} />
                  {t.status.states[c.state]}
                </span>
              </div>
            )
          })}
        </div>

        <p className="mt-6 text-[11px] text-ink-muted leading-relaxed">{t.status.legendNote}</p>
      </main>
    </div>
  )
}
