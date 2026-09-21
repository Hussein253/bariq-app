import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Check,
  Headphones,
  Lock,
  MessageCircle,
  Package,
  Terminal,
  Truck,
  Users,
} from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import {
  loadMerchantEntitlements,
  usageRatio,
  isOverLimit,
  type MerchantEntitlements,
  type UsageMetric,
} from '@/lib/entitlements'
import { formatNumberFor, localizeDigits } from '@/lib/formatters'
import { loadWorkspaceContext } from '@/lib/workspace-context'
import { getTranslations } from '@/lib/i18n/server'
import { fill, type Dictionary } from '@/lib/i18n'
import { LOCALE_DIR, type Locale } from '@/lib/i18n/config'

export const dynamic = 'force-dynamic'

type WorkspaceCopy = Dictionary['app']['workspace']

const STATUS_STYLES: Record<string, string> = {
  trialing: 'bg-info-bg text-info-ink border-info-line',
  active: 'bg-success-bg text-success-ink border-success-line',
  past_due: 'bg-warn-bg text-warn-ink border-warn-line',
  canceled: 'bg-danger-bg text-danger-ink border-danger-line',
}

function UsageMeter({
  metric,
  label,
  locale,
  t,
}: {
  metric: UsageMetric
  label: string
  locale: Locale
  t: WorkspaceCopy
}) {
  const ratio = usageRatio(metric)
  const over = isOverLimit(metric)

  return (
    <div className="p-4 rounded-2xl bg-surface border border-line shadow-sm">
      <p className="text-xs text-ink-muted font-semibold">{label}</p>

      {metric.used === null ? (
        <>
          <p className="text-lg font-black text-ink-faint mt-2">{t.unavailable}</p>
          {metric.unavailableReason && (
            <p className="text-[10px] text-ink-muted mt-1.5 leading-relaxed">
              {metric.unavailableReason}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-2xl font-black text-ink mt-2 font-mono">
            {formatNumberFor(locale, metric.used)}
            <span className="text-sm font-bold text-ink-faint">
              {' / '}
              {formatNumberFor(locale, metric.limit)}
            </span>
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                over ? 'bg-rose-600' : ratio !== null && ratio > 0.8 ? 'bg-amber-500' : 'bg-brand'
              }`}
              style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }}
            />
          </div>
          {over && (
            <p className="text-[10px] text-danger-ink font-bold mt-1.5">{t.overLimit}</p>
          )}
        </>
      )}
    </div>
  )
}

function FeatureRow({
  icon: Icon,
  title,
  detail,
  included,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  detail: string
  included: boolean
}) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-2xl border ${
        included ? 'bg-surface border-line' : 'bg-surface-2 border-dashed border-line'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          included ? 'bg-brand-soft text-brand-text' : 'bg-surface-3 text-ink-faint'
        }`}
      >
        <Icon size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-bold text-sm ${included ? 'text-ink' : 'text-ink-faint'}`}>
            {title}
          </h3>
          {included ? (
            <Check size={13} className="text-success-ink shrink-0" />
          ) : (
            <Lock size={12} className="text-ink-faint shrink-0" />
          )}
        </div>
        <p className={`text-[11px] mt-1 leading-relaxed ${included ? 'text-ink-muted' : 'text-ink-faint'}`}>
          {detail}
        </p>
      </div>
    </div>
  )
}

function Workspace({
  ent,
  locale,
  t,
  plansT,
}: {
  ent: MerchantEntitlements
  locale: Locale
  t: Dictionary['app']
  plansT: Dictionary['pricing']['specs']
}) {
  const { plan, subscription, usage } = ent
  const w = t.workspace
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight
  const statusKey = (subscription.status in t.subscriptionStatus
    ? subscription.status
    : 'trialing') as keyof typeof t.subscriptionStatus

  return (
    <>
      {/* الباقة الحالية */}
      <section className="mb-8 rounded-2xl bg-brand text-on-brand p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-on-brand/70 font-semibold mb-1">{w.currentPlan}</p>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black tracking-tight">{plan.name_en}</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${STATUS_STYLES[statusKey]}`}
              >
                {t.subscriptionStatus[statusKey]}
              </span>
            </div>
            <p className="text-xs text-on-brand/70 mt-2 max-w-md leading-relaxed">{plan.tagline_ar}</p>
          </div>

          <Link
            href="/platform#pricing"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-surface text-brand-text font-bold text-xs shadow-md transition active:scale-95 shrink-0"
          >
            <span>{w.upgrade}</span>
            <Forward size={15} />
          </Link>
        </div>
      </section>

      {/* الاستهلاك */}
      <section className="mb-8">
        <h2 className="text-sm font-black text-ink mb-3">{w.usageTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(
            [
              ['actions', usage.actions],
              ['aiAgents', usage.aiAgents],
              ['socialAccounts', usage.socialAccounts],
              ['products', usage.products],
              ['catalogs', usage.catalogs],
              ['orderBooks', usage.orderBooks],
              ['teamSeats', usage.teamSeats],
            ] as const
          ).map(([key, metric]) => (
            <UsageMeter key={key} metric={metric} label={w.usage[key]} locale={locale} t={w} />
          ))}
        </div>
      </section>

      {/* ما تشمله الباقة */}
      <section className="mb-8">
        <h2 className="text-sm font-black text-ink mb-3">{w.includedTitle}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureRow
            icon={Bot}
            title={w.features.agents}
            detail={fill(w.features.agentsDetail, {
              agents: localizeDigits(plan.max_ai_agents, locale),
              accounts: localizeDigits(plan.max_social_accounts, locale),
            })}
            included
          />
          <FeatureRow
            icon={Package}
            title={w.features.catalogs}
            detail={fill(w.features.catalogsDetail, {
              catalogs: localizeDigits(plan.max_catalogs, locale),
              products: formatNumberFor(locale, plan.max_products),
            })}
            included
          />
          <FeatureRow
            icon={BarChart3}
            title={
              plan.analytics_tier === 'advanced' ? plansT.analyticsAdvanced : plansT.analyticsBasic
            }
            detail={
              plan.analytics_tier === 'advanced'
                ? w.features.analyticsAdvancedDetail
                : w.features.analyticsBasicDetail
            }
            included={plan.analytics_tier === 'advanced'}
          />
          <FeatureRow
            icon={Headphones}
            title={
              plan.support_tier === 'vip'
                ? plansT.supportVip
                : plan.support_tier === 'priority'
                ? plansT.supportPriority
                : w.features.supportStandard
            }
            detail={
              plan.support_tier === 'vip'
                ? w.features.supportVipDetail
                : plan.support_tier === 'priority'
                ? w.features.supportPriorityDetail
                : w.features.supportStandardDetail
            }
            included={plan.support_tier !== 'standard'}
          />
          <FeatureRow
            icon={Terminal}
            title={w.features.api}
            detail={
              plan.has_api_access ? w.features.apiIncludedDetail : w.features.apiLockedDetail
            }
            included={plan.has_api_access}
          />
          <FeatureRow
            icon={Truck}
            title={w.features.bridge}
            detail={w.features.bridgeDetail}
            included
          />
        </div>
      </section>

      {/* روابط التشغيل */}
      <section>
        <h2 className="text-sm font-black text-ink mb-3">{w.startTitle}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              href: `/workspace/catalog?merchant=${ent.merchant.id}`,
              icon: Brain,
              label: w.shortcuts.knowledge,
              sub: fill(w.shortcuts.knowledgeSub, {
                n: localizeDigits(usage.products.used ?? 0, locale),
              }),
            },
            {
              href: '/operations/chats',
              icon: MessageCircle,
              label: w.shortcuts.support,
              sub: w.shortcuts.supportSub,
            },
            {
              href: '/operations',
              icon: Package,
              label: w.shortcuts.orders,
              sub: w.shortcuts.ordersSub,
            },
            {
              href: '/dashboard',
              icon: Truck,
              label: w.shortcuts.tracking,
              sub: w.shortcuts.trackingSub,
            },
          ].map(({ href, icon: Icon, label, sub }) => (
            <Link
              key={href}
              href={href}
              className="p-4 rounded-2xl bg-surface border border-line shadow-sm hover:border-brand transition flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-text flex items-center justify-center shrink-0">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-ink">{label}</p>
                <p className="text-[11px] text-ink-muted">{sub}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams
  const ctx = await loadWorkspaceContext(requestedId)
  const { locale, t } = await getTranslations()
  const w = t.app.workspace
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight

  const merchants = ctx.merchants
  let ent: MerchantEntitlements | null = null
  let loadError: string | null = null

  try {
    if (ctx.merchantId) ent = await loadMerchantEntitlements(ctx.merchantId)
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : w.loadError
    console.error('[WORKSPACE][LOAD_ERROR]', loadError)
  }

  const activeId = ent?.merchant.id ?? merchants[0]?.id ?? ''

  return (
    <WorkspaceShell
      merchantId={activeId}
      merchantName={ent?.merchant.name ?? w.merchantFallback}
      planName={ent?.plan.name_en ?? null}
      merchants={merchants}
      impersonating={ctx.impersonating}
      t={{ ...t.app.nav, soon: t.app.common.soon }}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-6xl">
        <div className="mb-7">
          <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
            {ent ? fill(w.title, { name: ent.merchant.name }) : w.titleFallback}
          </h1>
          <p className="text-xs sm:text-sm text-ink-muted mt-1">{w.subtitle}</p>
        </div>

        {loadError && (
          <div className="mb-6 p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{fill(w.loadErrorWith, { reason: loadError })}</span>
          </div>
        )}

        {/* ⚠️ الشرط على ctx.merchantId لا على merchants.length: القائمة الثانية
            هي خيارات مُبدِّل التاجر، ويُرجعها loadWorkspaceContext **فارغة
            للتاجر عمداً** كي لا تتسرّب أسماء بقية التجار. فاستعمالها اختباراً
            للفراغ كان يقلب الرسالتين معاً على كل تاجر: يرى «لا يوجد تاجر
            مسجّل» فوق مساحته العاملة وباقته النشطة، ولا يرى «لا اشتراك فعّال»
            أبداً حين ينقطع اشتراكه فعلاً. */}
        {!loadError && !ctx.merchantId && (
          <div className="p-8 rounded-2xl bg-surface border border-line text-center">
            {ctx.profile.role === 'platform_owner' ? (
              <>
                <Users size={28} className="mx-auto text-ink-faint mb-3" />
                <p className="text-sm font-bold text-ink">{w.noMerchantOwnerTitle}</p>
                <p className="text-xs text-ink-muted mt-1">{w.noMerchantOwnerBody}</p>
              </>
            ) : (
              // التاجر لا يملك وصولاً إلى لوحة الإدارة، فإرشاده إليها طريق
              // مسدود. وهذه حالة شاذة أصلاً — /onboarding يربط كل حساب بمتجره.
              <>
                <AlertCircle size={28} className="mx-auto text-warn-ink mb-3" />
                <p className="text-sm font-bold text-ink">{w.noMerchantUserTitle}</p>
                <p className="text-xs text-ink-muted mt-1">{w.noMerchantUserBody}</p>
              </>
            )}
          </div>
        )}

        {!loadError && ctx.merchantId && !ent && (
          <div className="p-8 rounded-2xl bg-warn-bg border border-warn-line text-center">
            <AlertCircle size={28} className="mx-auto text-warn-ink mb-3" />
            <p className="text-sm font-bold text-ink">{w.noSubscriptionTitle}</p>
            <p className="text-xs text-ink-muted mt-1 mb-4">{w.noSubscriptionBody}</p>
            <Link
              href="/platform#pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-bold text-xs transition"
            >
              <span>{w.browsePlans}</span>
              <Forward size={15} />
            </Link>
          </div>
        )}

        {ent && <Workspace ent={ent} locale={locale} t={t.app} plansT={t.pricing.specs} />}
      </div>
    </WorkspaceShell>
  )
}
