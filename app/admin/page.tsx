import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  ClipboardList,
  CreditCard,
  MessageCircle,
  Store,
  Truck,
  UserCog,
  Wallet,
} from 'lucide-react'
import { loadPlatformOverview, type MerchantRow, type PlatformOverview } from '@/lib/admin-server'
import { STATUS_COLORS, type ShipmentStatus } from '@/lib/shipments'
import { formatNumberFor, localizeDigits } from '@/lib/formatters'
import { requireRole } from '@/lib/auth'
import { getTranslations } from '@/lib/i18n/server'
import { fill, type Dictionary } from '@/lib/i18n'
import { LOCALE_DIR, type Locale } from '@/lib/i18n/config'

export const dynamic = 'force-dynamic'

type AdminCopy = Dictionary['app']['admin']
type AppCopy = Dictionary['app']

const CHANNEL_DOTS: Record<string, string> = {
  whatsapp: 'bg-[#25D366]',
  instagram: 'bg-gradient-to-r from-pink-500 to-purple-600',
  messenger: 'bg-[#0084FF]',
  telegram: 'bg-sky-500',
}

/** المبلغ بالدينار — الرمز يتبع اللغة، والرقم يتبع أرقامها. */
function money(locale: Locale, currency: string, value: number): string {
  return `${formatNumberFor(locale, value)} ${currency}`
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
  sub?: string
  accent: string
}) {
  return (
    <div className="relative rounded-2xl bg-surface border border-line p-4 overflow-hidden">
      <div className={`absolute top-0 inset-x-0 h-[3px] ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-ink-muted font-semibold leading-tight">{label}</p>
        <Icon size={15} className="text-brand-text shrink-0" />
      </div>
      <p className="text-xl sm:text-2xl font-black text-ink mt-2 font-mono break-all">{value}</p>
      {sub && <p className="mt-1.5 text-[10px] text-ink-muted leading-relaxed">{sub}</p>}
    </div>
  )
}

function PlanBadge({ row, t }: { row: MerchantRow; t: AdminCopy }) {
  if (!row.planName) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border bg-surface-3 text-ink-muted border-line">
        {t.noSubscriptionBadge}
      </span>
    )
  }
  const live = row.subscriptionStatus === 'active'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
        live
          ? 'bg-success-bg text-success-ink border-success-line'
          : 'bg-info-bg text-info-ink border-info-line'
      }`}
    >
      {row.planName}
      <span className="font-normal opacity-70">
        {row.subscriptionStatus === 'trialing'
          ? t.trialSuffix
          : row.subscriptionStatus === 'past_due'
          ? t.pastDueSuffix
          : ''}
      </span>
    </span>
  )
}

/** بطاقة تاجر — تُعرض على الهاتف بدل صفوف الجدول التي تتكدّس. */
function MerchantCard({
  row,
  locale,
  t,
  currency,
}: {
  row: MerchantRow
  locale: Locale
  t: AdminCopy
  currency: string
}) {
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight

  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-sm text-ink truncate">{row.name}</p>
          {row.phone && (
            <p className="text-[11px] text-ink-muted font-mono">{localizeDigits(row.phone, locale)}</p>
          )}
        </div>
        <PlanBadge row={row} t={t} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: t.table.products, value: localizeDigits(row.products, locale) },
          { label: t.table.shipments, value: localizeDigits(row.shipments, locale) },
          { label: t.table.conversations, value: localizeDigits(row.conversations, locale) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-surface-2 border border-line py-2">
            <dd className="font-black text-sm text-ink font-mono">{s.value}</dd>
            <dt className="text-[10px] text-ink-muted mt-0.5">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-ink-muted">{t.table.cod}</p>
          <p className="font-bold font-mono text-ink">{money(locale, currency, row.codCollected)}</p>
        </div>
        <div>
          <p className="text-ink-muted">{t.table.pending}</p>
          <p className="font-bold font-mono text-warn-ink">
            {money(locale, currency, row.pendingSettlement)}
          </p>
        </div>
      </div>

      <Link
        href={`/workspace?merchant=${row.id}`}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-brand/30 text-brand-text font-bold text-[11px] hover:bg-brand-soft transition"
      >
        <span>{t.openWorkspace}</span>
        <Forward size={13} />
      </Link>
    </div>
  )
}

function Overview({
  data,
  locale,
  t,
  currency,
}: {
  data: PlatformOverview
  locale: Locale
  t: AppCopy
  currency: string
}) {
  const { totals } = data
  const a = t.admin
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight
  const n = (value: number) => localizeDigits(value, locale)

  return (
    <>
      {/* مؤشرات المنصة */}
      <section className="mb-8">
        <h2 className="text-sm font-black text-ink mb-3">{a.kpisTitle}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            icon={Store}
            label={a.kpi.merchants}
            value={n(totals.merchants)}
            sub={fill(a.kpi.merchantsSub, { n: n(totals.activeSubscriptions) })}
            accent="bg-brand"
          />
          <Kpi
            icon={Wallet}
            label={a.kpi.cod}
            value={money(locale, currency, totals.codCollected)}
            sub={fill(a.kpi.codSub, { amount: money(locale, currency, totals.deliveryFeesEarned) })}
            accent="bg-emerald-600"
          />
          <Kpi
            icon={CreditCard}
            label={a.kpi.pending}
            value={money(locale, currency, totals.pendingSettlement)}
            sub={a.kpi.pendingSub}
            accent="bg-amber-500"
          />
          <Kpi
            icon={Truck}
            label={a.kpi.shipments}
            value={n(totals.shipments)}
            sub={fill(a.kpi.shipmentsSub, { n: n(totals.orders) })}
            accent="bg-sky-600"
          />
          <Kpi
            icon={MessageCircle}
            label={a.kpi.conversations}
            value={n(totals.conversations)}
            sub={fill(a.kpi.conversationsSub, { n: formatNumberFor(locale, totals.botMessages) })}
            accent="bg-purple-600"
          />
          <Kpi
            icon={Boxes}
            label={a.kpi.products}
            value={n(totals.products)}
            sub={fill(a.kpi.productsSub, { n: n(totals.deliveryAreas) })}
            accent="bg-rose-500"
          />
        </div>
      </section>

      {/* التوزيعات */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-surface border border-line p-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <Truck size={15} className="text-brand-text" />
            {a.shipmentsByStatus}
          </h3>
          {data.shipmentsByStatus.length === 0 ? (
            <p className="text-xs text-ink-faint py-3">{a.noShipments}</p>
          ) : (
            <ul className="space-y-2">
              {data.shipmentsByStatus.map(({ status, count }) => {
                const c = STATUS_COLORS[status as ShipmentStatus]
                const label = t.shipmentStatus[status as ShipmentStatus] ?? status
                return (
                  <li key={status} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c?.dot || 'bg-slate-300'}`} />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="font-black font-mono shrink-0">{n(count)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-surface border border-line p-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <MessageCircle size={15} className="text-brand-text" />
            {a.conversationsByChannel}
          </h3>
          {data.conversationsByPlatform.length === 0 ? (
            <p className="text-xs text-ink-faint py-3">{a.noConversations}</p>
          ) : (
            <ul className="space-y-2">
              {data.conversationsByPlatform.map(({ platform, count }) => {
                const label = t.channels[platform as keyof typeof t.channels] ?? platform
                return (
                  <li key={platform} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          CHANNEL_DOTS[platform] || 'bg-slate-300'
                        }`}
                      />
                      <span className="truncate">{label}</span>
                    </span>
                    <span className="font-black font-mono shrink-0">{n(count)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-surface border border-line p-5">
          <h3 className="font-bold text-sm text-ink mb-3 flex items-center gap-2">
            <ClipboardList size={15} className="text-brand-text" />
            {a.planDistribution}
          </h3>
          <ul className="space-y-2">
            {data.planDistribution.map(({ planName, merchants }) => (
              <li key={planName} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold">{planName}</span>
                <span className="font-black font-mono shrink-0">{n(merchants)}</span>
              </li>
            ))}
          </ul>
          {totals.couriers === 0 && (
            <p className="mt-4 pt-3 border-t border-line text-[10px] text-warn-ink flex items-start gap-1.5 leading-relaxed">
              <UserCog size={12} className="shrink-0 mt-0.5" />
              {a.noCouriers}
            </p>
          )}
        </div>
      </section>

      {/* التجار */}
      <section>
        <h2 className="text-sm font-black text-ink mb-3">
          {fill(a.merchantsTitle, { n: n(data.merchants.length) })}
        </h2>

        {data.merchants.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-line py-14 text-center">
            <Store size={28} className="mx-auto text-ink-faint mb-3" />
            <p className="text-sm font-bold text-ink">{a.noMerchants}</p>
          </div>
        ) : (
          <>
            {/* الهاتف: بطاقات */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
              {data.merchants.map((row) => (
                <MerchantCard key={row.id} row={row} locale={locale} t={a} currency={currency} />
              ))}
            </div>

            {/* الشاشات الكبيرة: جدول */}
            <div className="hidden lg:block rounded-2xl bg-surface border border-line overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="text-ink-muted bg-surface-2 border-b border-line font-semibold text-start">
                      <th className="p-3.5 text-start">{a.table.merchant}</th>
                      <th className="p-3.5 text-start">{a.table.plan}</th>
                      <th className="p-3.5 text-start">{a.table.products}</th>
                      <th className="p-3.5 text-start">{a.table.shipments}</th>
                      <th className="p-3.5 text-start">{a.table.conversations}</th>
                      <th className="p-3.5 text-start">{a.table.cod}</th>
                      <th className="p-3.5 text-start">{a.table.pending}</th>
                      <th className="p-3.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.merchants.map((row) => (
                      <tr key={row.id} className="border-b border-line hover:bg-surface-2">
                        <td className="p-3.5">
                          <div className="font-bold text-ink">{row.name}</div>
                          {row.phone && (
                            <div className="text-[10px] text-ink-muted font-mono">
                              {localizeDigits(row.phone, locale)}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <PlanBadge row={row} t={a} />
                        </td>
                        <td className="p-3.5 font-mono">{n(row.products)}</td>
                        <td className="p-3.5 font-mono">{n(row.shipments)}</td>
                        <td className="p-3.5 font-mono">{n(row.conversations)}</td>
                        <td className="p-3.5 font-mono">{money(locale, currency, row.codCollected)}</td>
                        <td className="p-3.5 font-mono text-warn-ink font-bold">
                          {money(locale, currency, row.pendingSettlement)}
                        </td>
                        <td className="p-3.5 text-end">
                          <Link
                            href={`/workspace?merchant=${row.id}`}
                            className="inline-flex items-center gap-1 text-brand-text font-bold hover:underline whitespace-nowrap"
                          >
                            {a.workspaceShort}
                            <Forward size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  )
}

export default async function AdminPage() {
  // لوحة مالك المنصة: أرصدة كل التجار والإيرادات والعمولات — لمالكها وحده
  await requireRole(['platform_owner'])

  const { locale, t } = await getTranslations()
  const a = t.app.admin
  const Back = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight

  let data: PlatformOverview | null = null
  let loadError: string | null = null

  try {
    data = await loadPlatformOverview()
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : a.loadError
    console.error('[ADMIN][LOAD_ERROR]', loadError)
  }

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-brand text-on-brand">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5">
          <Link
            href="/platform"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-on-brand/70 hover:text-on-brand transition mb-2"
          >
            <Back size={13} />
            {a.backToPlatform}
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight">{a.title}</h1>
              <p className="text-[11px] sm:text-xs text-on-brand/70 mt-1">{a.subtitle}</p>
            </div>
            <nav className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              {[
                { href: '/admin/users', label: a.navAccounts },
                { href: '/operations', label: a.navOperations },
                { href: '/operations/chats', label: a.navSupport },
                { href: '/dashboard', label: a.navShipments },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 transition whitespace-nowrap"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
        {loadError ? (
          <div className="p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{fill(a.loadErrorWith, { reason: loadError })}</span>
          </div>
        ) : (
          data && (
            <Overview
              data={data}
              locale={locale}
              t={t.app}
              currency={t.pricing.price.currency}
            />
          )
        )}
      </main>
    </div>
  )
}
