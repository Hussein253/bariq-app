import { AlertCircle, Banknote, ChevronDown, Receipt, Truck, Wallet } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import { PrintStickerButton } from '@/components/ShipmentSticker'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { loadMerchantShipments } from '@/lib/shipments-server'
import {
  type MerchantShipment,
  type SettlementStatus,
  type ShipmentStatus,
  TIMELINE_STEPS,
  summarizeMerchantSettlement,
} from '@/lib/shipments'
import { formatDateTimeFor, formatNumberFor, localizeDigits } from '@/lib/formatters'
import { loadWorkspaceContext } from '@/lib/workspace-context'
import { getTranslations } from '@/lib/i18n/server'
import { fill } from '@/lib/i18n'
import { log } from '@/lib/log'

/**
 * شحنات التاجر — /workspace/shipments
 * ====================================
 * قبلها كان رابط «الشحنات» في قائمة التاجر يفتح /dashboard، وهي لفريق برق
 * وحده، فيُعاد التاجر إلى صفحته الرئيسية بلا أن يرى شحنة واحدة من شحناته.
 *
 * للعرض فقط: حالة الشحنة وتسويتها يغيّرهما فريق برق، والتاجر يطبع ملصقه.
 * والمجاميع من summarizeMerchantSettlement — الدالة نفسها في لوحة الفريق.
 */

export const dynamic = 'force-dynamic'

/** ألوان الحالات بالمتغيّرات الدلالية، فتعمل في الوضعين بلا طبقة المعادلة. */
const STATUS_TONE: Record<ShipmentStatus, string> = {
  ORDER_RECEIVED: 'bg-info-bg border-info-line text-info-ink',
  PICKED_UP_SAME_DAY: 'bg-info-bg border-info-line text-info-ink',
  IN_TRANSIT_HUB: 'bg-info-bg border-info-line text-info-ink',
  OUT_FOR_DELIVERY: 'bg-warn-bg border-warn-line text-warn-ink',
  DELIVERED: 'bg-success-bg border-success-line text-success-ink',
  POSTPONED: 'bg-warn-bg border-warn-line text-warn-ink',
  RETURNED: 'bg-danger-bg border-danger-line text-danger-ink',
  SETTLED_FINANCIALLY: 'bg-success-bg border-success-line text-success-ink',
}

const SETTLEMENT_TONE: Record<SettlementStatus, string> = {
  PENDING: 'bg-warn-bg border-warn-line text-warn-ink',
  DEPOSITED: 'bg-success-bg border-success-line text-success-ink',
  DEFERRED: 'bg-surface-3 border-line text-ink-muted',
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${tone}`}>
      {children}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-ink-faint">{label}</dt>
      <dd className="text-xs text-ink mt-0.5 leading-relaxed">{children}</dd>
    </div>
  )
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams

  const ctx = await loadWorkspaceContext(requestedId)
  const { locale, t } = await getTranslations()
  const p = t.app.shipmentsPage
  const w = t.app.workspace
  // numeric قد يصل من PostgREST نصاً (lib/orders.ts) — يُحوَّل قبل التنسيق
  const money = (value: number | string) =>
    `${formatNumberFor(locale, Number(value))} ${t.pricing.price.currency}`

  let ent: Awaited<ReturnType<typeof loadMerchantEntitlements>> = null
  let shipments: MerchantShipment[] = []
  let loadFailed = false

  if (ctx.merchantId) {
    try {
      const [loadedEnt, loadedShipments] = await Promise.all([
        loadMerchantEntitlements(ctx.merchantId),
        loadMerchantShipments(ctx.merchantId),
      ])
      ent = loadedEnt
      shipments = loadedShipments
    } catch (err: unknown) {
      loadFailed = true
      log.error('MERCHANT_SHIPMENTS_LOAD_FAILED', {
        merchant_id: ctx.merchantId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const merchantName = ent?.merchant.name ?? w.merchantFallback
  const summary = summarizeMerchantSettlement(shipments)

  let body: React.ReactNode
  if (!ctx.merchantId) {
    const owner = ctx.profile.role === 'platform_owner'
    body = (
      <div className="p-8 rounded-2xl bg-surface border border-line text-center">
        <AlertCircle size={28} className="mx-auto text-ink-faint mb-3" />
        <p className="text-sm font-bold text-ink">{owner ? w.noMerchantOwnerTitle : w.noMerchantUserTitle}</p>
        <p className="text-xs text-ink-muted mt-1">{owner ? w.noMerchantOwnerBody : w.noMerchantUserBody}</p>
      </div>
    )
  } else if (loadFailed) {
    body = (
      <div className="p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>{p.loadError}</span>
      </div>
    )
  } else if (shipments.length === 0) {
    body = (
      <div className="p-10 rounded-2xl bg-surface border border-line text-center">
        <Truck size={30} className="mx-auto text-ink-faint mb-3" />
        <p className="text-sm font-bold text-ink">{p.emptyTitle}</p>
        <p className="text-xs text-ink-muted mt-1">{p.emptyBody}</p>
      </div>
    )
  } else {
    body = (
      <div className="space-y-5">
        {/* المال — بقاعدة لوحة فريق برق نفسها */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-brand text-on-brand p-5 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold opacity-90">
              <Wallet size={15} />
              {p.pendingPayout}
            </div>
            <p className="mt-2 text-2xl font-black font-mono">{money(summary.pendingPayoutIqd)}</p>
            <p className="mt-1 text-[10px] opacity-80">{p.pendingPayoutHint}</p>
          </div>
          <div className="rounded-2xl bg-surface border border-line p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink-muted">
              <Banknote size={15} />
              {p.codCollected}
            </div>
            <p className="mt-2 text-xl font-black font-mono text-ink">{money(summary.codCollectedIqd)}</p>
          </div>
          <div className="rounded-2xl bg-surface border border-line p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink-muted">
              <Receipt size={15} />
              {p.deliveryFees}
            </div>
            <p className="mt-2 text-xl font-black font-mono text-ink">{money(summary.deliveryFeesIqd)}</p>
          </div>
          <p className="sm:col-span-3 text-[11px] text-ink-muted">
            {fill(p.summaryBasis, { n: localizeDigits(summary.deliveredCount, locale) })}
          </p>
        </section>

        <p className="text-xs font-bold text-ink-muted">
          {fill(p.count, { n: localizeDigits(shipments.length, locale) })}
        </p>

        <ul className="space-y-3">
          {shipments.map((s) => (
            // المعرّف يربط زرّ «عرض الشحنة» في صفحة الطلبات بهذه البطاقة
            <li key={s.id} id={`shipment-${s.id}`} className="scroll-mt-4">
              <details className="group rounded-2xl bg-surface border border-line [&_summary::-webkit-details-marker]:hidden">
                <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="font-mono font-black text-sm text-ink" dir="ltr">
                    {s.tracking_number}
                  </span>
                  <Badge tone={STATUS_TONE[s.status]}>{t.app.shipmentStatus[s.status]}</Badge>
                  <span className="text-xs text-ink-muted min-w-0 truncate">
                    {s.recipient_name} · {s.governorate}
                  </span>
                  <span className="ms-auto flex items-center gap-3">
                    <span className="text-sm font-black font-mono text-ink">{money(s.merchant_net_amount_iqd)}</span>
                    <Badge tone={SETTLEMENT_TONE[s.settlement_status]}>
                      {t.app.settlementStatus[s.settlement_status]}
                    </Badge>
                    <ChevronDown size={16} className="text-ink-faint transition group-open:rotate-180" />
                  </span>
                </summary>

                <div className="border-t border-line p-4 grid gap-5 lg:grid-cols-3">
                  <dl className="space-y-3">
                    <Field label={p.recipient}>{s.recipient_name}</Field>
                    <Field label={p.phone}>
                      <span dir="ltr">{localizeDigits(s.recipient_phone, locale)}</span>
                    </Field>
                    <Field label={p.address}>
                      {[s.governorate, s.district, s.full_address].filter(Boolean).join(' — ')}
                    </Field>
                    {s.nearest_landmark && <Field label={p.landmark}>{s.nearest_landmark}</Field>}
                    {s.order_content && <Field label={p.orderContent}>{s.order_content}</Field>}
                    {s.notes && <Field label={p.notes}>{s.notes}</Field>}
                  </dl>

                  <dl className="space-y-3">
                    <Field label={fill(p.order, { n: localizeDigits(s.order_id, locale) })}>
                      {formatDateTimeFor(locale, s.created_at)}
                    </Field>
                    <Field label={p.cod}>
                      <span className="font-mono">{money(s.cod_amount_iqd)}</span>
                    </Field>
                    <Field label={p.fee}>
                      <span className="font-mono">{money(s.delivery_fee_iqd)}</span>
                    </Field>
                    <Field label={p.net}>
                      <span className="font-mono font-black">{money(s.merchant_net_amount_iqd)}</span>
                    </Field>
                    <Field label={p.settlement}>
                      {t.app.settlementStatus[s.settlement_status]}
                      {s.settled_at && ` · ${p.settledAt}: ${formatDateTimeFor(locale, s.settled_at)}`}
                    </Field>
                  </dl>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-ink-faint mb-2">{p.timeline}</p>
                      <ol className="space-y-1.5">
                        {TIMELINE_STEPS.map((step) => {
                          const at = s[step.atField]
                          return (
                            <li
                              key={step.status}
                              className={`flex items-center justify-between gap-3 text-[11px] ${at ? 'text-ink' : 'text-ink-faint'}`}
                            >
                              <span className="flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${at ? 'bg-success-ink' : 'bg-line-strong'}`} />
                                {t.app.shipmentStatus[step.status]}
                              </span>
                              {at && <span>{formatDateTimeFor(locale, at)}</span>}
                            </li>
                          )
                        })}
                      </ol>
                    </div>

                    {(s.postponed_at || s.postponed_reason) && (
                      <p className="text-[11px] text-warn-ink">
                        {t.app.shipmentStatus.POSTPONED}
                        {s.postponed_at && ` · ${formatDateTimeFor(locale, s.postponed_at)}`}
                        {s.postponed_reason && ` — ${p.postponedReason}: ${s.postponed_reason}`}
                      </p>
                    )}
                    {(s.returned_at || s.returned_reason) && (
                      <p className="text-[11px] text-danger-ink">
                        {t.app.shipmentStatus.RETURNED}
                        {s.returned_at && ` · ${formatDateTimeFor(locale, s.returned_at)}`}
                        {s.returned_reason && ` — ${p.returnedReason}: ${s.returned_reason}`}
                      </p>
                    )}

                    <PrintStickerButton
                      shipment={s}
                      merchantName={ent?.merchant.name ?? null}
                      orderContent={s.order_content}
                      label={p.printLabel}
                    />
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <WorkspaceShell
      merchantId={ctx.merchantId ?? ''}
      merchantName={merchantName}
      planName={ent?.plan.name_en ?? null}
      merchants={ctx.merchants}
      impersonating={ctx.impersonating}
      t={{ ...t.app.nav, soon: t.app.common.soon }}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">{p.title}</h1>
          <p className="text-xs text-ink-muted mt-1">{p.subtitle}</p>
        </div>
        {body}
      </div>
    </WorkspaceShell>
  )
}
