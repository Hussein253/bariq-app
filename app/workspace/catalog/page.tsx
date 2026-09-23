import { AlertCircle, Boxes } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import CatalogManager from '@/components/CatalogManager'
import {
  CouponsSection,
  BusinessAndDeliverySections,
  OrderBooksSection,
} from '@/components/MerchantSettingsSections'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { formatNumberFor } from '@/lib/formatters'
import { loadWorkspaceContext } from '@/lib/workspace-context'
import { getTranslations } from '@/lib/i18n/server'
import { fill } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams

  const ctx = await loadWorkspaceContext(requestedId)
  const { locale, t } = await getTranslations()
  const merchants = ctx.merchants
  let ent = null
  let loadError: string | null = null

  try {
    if (ctx.merchantId) ent = await loadMerchantEntitlements(ctx.merchantId)
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : t.app.pages.loadErrorMerchant
    console.error('[CATALOG_PAGE][LOAD_ERROR]', loadError)
  }

  const body = loadError ? (
    <div className="p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{loadError}</span>
    </div>
  ) : !ent ? (
    <div className="p-8 rounded-2xl bg-surface border border-warn-line text-center">
      <AlertCircle size={28} className="mx-auto text-warn-ink mb-3" />
      <p className="text-sm font-bold text-ink">{t.app.pages.noSubscription}</p>
      <p className="text-xs text-ink-muted mt-1">{t.app.pages.noSubscriptionCatalog}</p>
    </div>
  ) : (
    <div className="space-y-5">
      {/* عدّاد سعة الباقة */}
      <div className="rounded-2xl bg-surface border border-line p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-text flex items-center justify-center shrink-0">
              <Boxes size={19} />
            </div>
            <div>
              <h2 className="font-black text-sm text-ink">{t.app.catalogPage.capacityTitle}</h2>
              <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed max-w-xl">
                {t.app.catalogPage.capacityHint}
              </p>
            </div>
          </div>
          <div className="text-end shrink-0">
            <p className="text-2xl font-black text-ink font-mono">
              {formatNumberFor(locale, ent.usage.products.used ?? 0)}
              <span className="text-sm text-ink-faint">
                {' / '}
                {formatNumberFor(locale, ent.plan.max_products)}
              </span>
            </p>
            <p className="text-[10px] text-ink-muted mt-0.5">
              {fill(t.app.catalogPage.remaining, {
                n: formatNumberFor(
                  locale,
                  Math.max(ent.plan.max_products - (ent.usage.products.used ?? 0), 0)
                ),
                plan: ent.plan.name_en,
              })}
            </p>
          </div>
        </div>
      </div>

      <CatalogManager
        merchantId={ent.merchant.id}
        planName={ent.plan.name_en}
        productLimit={ent.plan.max_products}
        locale={locale}
        currency={t.pricing.price.currency}
        t={t.app.catalog}
      />

      <OrderBooksSection
        merchantId={ent.merchant.id}
        limit={ent.plan.max_order_books}
        locale={locale}
        t={t.app.settings}
      />
      <CouponsSection
        merchantId={ent.merchant.id}
        locale={locale}
        currency={t.pricing.price.currency}
        t={t.app.settings}
      />
      <BusinessAndDeliverySections
        merchantId={ent.merchant.id}
        locale={locale}
        currency={t.pricing.price.currency}
        t={t.app.settings}
        governorates={t.app.booking.governorates}
      />
    </div>
  )

  return (
    <WorkspaceShell
      merchantId={ent?.merchant.id ?? ''}
      merchantName={ent?.merchant.name ?? t.app.workspace.merchantFallback}
      planName={ent?.plan.name_en ?? null}
      merchants={merchants}
      impersonating={ctx.impersonating}
      t={{ ...t.app.nav, soon: t.app.common.soon }}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">
            {t.app.catalogPage.title}
          </h1>
          <p className="text-xs text-ink-muted mt-1">{t.app.catalogPage.subtitle}</p>
        </div>
        {body}
      </div>
    </WorkspaceShell>
  )
}
