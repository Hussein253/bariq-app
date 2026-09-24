import Link from 'next/link'
import { AlertCircle, ChevronDown, Package, Truck } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { loadMerchantOrders } from '@/lib/orders-server'
import {
  type MerchantOrder,
  itemLabel,
  itemLineTotal,
  orderDisplayName,
  orderDisplayPhone,
  toNumber,
} from '@/lib/orders'
import { formatDateTimeFor, formatNumberFor, localizeDigits } from '@/lib/formatters'
import { loadWorkspaceContext } from '@/lib/workspace-context'
import { getTranslations } from '@/lib/i18n/server'
import { fill } from '@/lib/i18n'
import { log } from '@/lib/log'

/**
 * طلبات التاجر — /workspace/orders
 * =================================
 * قبلها كان رابط «الطلبات» في قائمة التاجر يفتح /operations، وهي لفريق برق
 * وحده، فيُعاد التاجر إلى صفحته الرئيسية بلا أن يرى طلباً واحداً.
 *
 * للعرض فقط، بقرار المالك: إرسال الطلب المؤكَّد للشحن يبقى لفريق برق.
 */

export const dynamic = 'force-dynamic'

/**
 * قيم orders.current_state الحيّة لها اسم مترجم ولون. العمود نصّي بلا قيد
 * في القاعدة وتكتبه n8n أيضاً، فأي قيمة أخرى تُعرض كما هي — لا تُخمَّن ترجمتها.
 */
const KNOWN_STATES = ['confirmed', 'pending_delivery', 'cancelled'] as const
type KnownState = (typeof KNOWN_STATES)[number]

function isKnownState(value: string | null | undefined): value is KnownState {
  return typeof value === 'string' && (KNOWN_STATES as readonly string[]).includes(value)
}

const STATE_TONE: Record<KnownState, string> = {
  confirmed: 'bg-info-bg border-info-line text-info-ink',
  pending_delivery: 'bg-warn-bg border-warn-line text-warn-ink',
  cancelled: 'bg-danger-bg border-danger-line text-danger-ink',
}

const UNKNOWN_TONE = 'bg-surface-3 border-line text-ink-muted'

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black ${tone}`}>
      {children}
    </span>
  )
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; state?: string }>
}) {
  const { merchant: requestedId, state: requestedState } = await searchParams
  const activeState: KnownState | null = isKnownState(requestedState) ? requestedState : null

  const ctx = await loadWorkspaceContext(requestedId)
  const { locale, t } = await getTranslations()
  const p = t.app.ordersPage
  const w = t.app.workspace
  const money = (value: number | string | null) =>
    `${formatNumberFor(locale, toNumber(value))} ${t.pricing.price.currency}`

  let ent: Awaited<ReturnType<typeof loadMerchantEntitlements>> = null
  let orders: MerchantOrder[] = []
  let loadFailed = false

  if (ctx.merchantId) {
    try {
      const [loadedEnt, loadedOrders] = await Promise.all([
        loadMerchantEntitlements(ctx.merchantId),
        loadMerchantOrders(ctx.merchantId),
      ])
      ent = loadedEnt
      orders = loadedOrders
    } catch (err: unknown) {
      loadFailed = true
      log.error('MERCHANT_ORDERS_LOAD_FAILED', {
        merchant_id: ctx.merchantId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // روابط الصفحة تحمل التاجر لمالك المنصة، ويتجاهلها التاجر نفسه (loadWorkspaceContext)
  const hrefFor = (state: KnownState | null) => {
    const params = new URLSearchParams()
    if (ctx.merchantId) params.set('merchant', ctx.merchantId)
    if (state) params.set('state', state)
    const query = params.toString()
    return `/workspace/orders${query ? `?${query}` : ''}`
  }
  const shipmentHref = (shipmentId: string) =>
    `/workspace/shipments${ctx.merchantId ? `?merchant=${ctx.merchantId}` : ''}#shipment-${shipmentId}`

  const shipmentStatusLabel = (status: string) =>
    Object.prototype.hasOwnProperty.call(t.app.shipmentStatus, status)
      ? t.app.shipmentStatus[status as keyof typeof t.app.shipmentStatus]
      : status

  const visible = activeState ? orders.filter((o) => o.current_state === activeState) : orders

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
  } else if (orders.length === 0) {
    body = (
      <div className="p-10 rounded-2xl bg-surface border border-line text-center">
        <Package size={30} className="mx-auto text-ink-faint mb-3" />
        <p className="text-sm font-bold text-ink">{p.emptyTitle}</p>
        <p className="text-xs text-ink-muted mt-1">{p.emptyBody}</p>
      </div>
    )
  } else {
    body = (
      <div className="space-y-4">
        {/* تصفية بالحالة — روابط لا حالة عميل، فالصفحة كلها تُرسم في الخادم */}
        <nav className="flex flex-wrap gap-2">
          {[null, ...KNOWN_STATES].map((state) => {
            const active = state === activeState
            const n = state ? orders.filter((o) => o.current_state === state).length : orders.length
            return (
              <Link
                key={state ?? 'all'}
                href={hrefFor(state)}
                aria-current={active ? 'page' : undefined}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                  active
                    ? 'bg-brand border-brand text-on-brand'
                    : 'bg-surface border-line text-ink-muted hover:text-ink'
                }`}
              >
                {state ? p.states[state] : p.filterAll}
                <span className="ms-1.5 opacity-75">{localizeDigits(n, locale)}</span>
              </Link>
            )
          })}
        </nav>

        <p className="text-xs font-bold text-ink-muted">
          {fill(p.count, { n: localizeDigits(visible.length, locale) })}
        </p>

        {visible.length === 0 ? (
          <p className="p-8 rounded-2xl bg-surface border border-line text-center text-xs text-ink-muted">
            {p.emptyFiltered}
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((o) => {
              const total = o.grand_total_iqd ?? o.items_total_iqd
              return (
                <li key={o.order_id}>
                  <details className="group rounded-2xl bg-surface border border-line [&_summary::-webkit-details-marker]:hidden">
                    <summary className="cursor-pointer list-none p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="font-black text-sm text-ink">
                        {fill(p.order, { n: localizeDigits(o.order_id, locale) })}
                      </span>
                      {isKnownState(o.current_state) ? (
                        <Badge tone={STATE_TONE[o.current_state]}>{p.states[o.current_state]}</Badge>
                      ) : o.current_state ? (
                        <Badge tone={UNKNOWN_TONE}>{o.current_state}</Badge>
                      ) : null}
                      <span className="text-xs text-ink-muted min-w-0 truncate">
                        {orderDisplayName(o, p.noName)}
                        {o.governorate && ` · ${o.governorate}`}
                      </span>
                      <span className="ms-auto flex items-center gap-3">
                        {total !== null && <span className="text-sm font-black font-mono text-ink">{money(total)}</span>}
                        <span className="text-[11px] text-ink-faint">{formatDateTimeFor(locale, o.created_at)}</span>
                        <ChevronDown size={16} className="text-ink-faint transition group-open:rotate-180" />
                      </span>
                    </summary>

                    <div className="border-t border-line p-4 grid gap-5 lg:grid-cols-3">
                      <dl className="space-y-3 text-xs">
                        <div>
                          <dt className="text-[10px] font-bold text-ink-faint">{p.customer}</dt>
                          <dd className="text-ink mt-0.5">{orderDisplayName(o, p.noName)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-bold text-ink-faint">{p.phone}</dt>
                          <dd className="text-ink mt-0.5" dir="ltr">
                            {localizeDigits(orderDisplayPhone(o), locale)}
                          </dd>
                        </div>
                        {(o.governorate || o.district || o.address || o.address_details) && (
                          <div>
                            <dt className="text-[10px] font-bold text-ink-faint">{p.address}</dt>
                            <dd className="text-ink mt-0.5 leading-relaxed">
                              {[o.governorate, o.district, o.address, o.address_details].filter(Boolean).join(' — ')}
                            </dd>
                          </div>
                        )}
                        {o.order_content && (
                          <div>
                            <dt className="text-[10px] font-bold text-ink-faint">{p.content}</dt>
                            <dd className="text-ink mt-0.5">{o.order_content}</dd>
                          </div>
                        )}
                      </dl>

                      <div className="text-xs">
                        <p className="text-[10px] font-bold text-ink-faint mb-2">{p.items}</p>
                        {o.items.length === 0 ? (
                          <p className="text-ink-faint">—</p>
                        ) : (
                          <ul className="space-y-2">
                            {o.items.map((item) => (
                              <li key={item.id} className="flex items-start justify-between gap-3">
                                <span className="text-ink leading-relaxed">
                                  {itemLabel(item, p.unnamedProduct)}
                                  <span className="block text-[10px] text-ink-faint">
                                    {fill(p.quantity, { n: localizeDigits(toNumber(item.quantity), locale) })}
                                    {' × '}
                                    {money(item.unit_price_iqd)}
                                  </span>
                                </span>
                                <span className="font-mono text-ink shrink-0">{money(itemLineTotal(item))}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="space-y-3 text-xs">
                        <dl className="space-y-1.5">
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-muted">{p.itemsTotal}</dt>
                            <dd className="font-mono text-ink">{o.items_total_iqd !== null ? money(o.items_total_iqd) : '—'}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-muted">{p.deliveryFee}</dt>
                            <dd className="font-mono text-ink">{o.delivery_fee_iqd !== null ? money(o.delivery_fee_iqd) : '—'}</dd>
                          </div>
                          <div className="flex justify-between gap-3 pt-1.5 border-t border-line">
                            <dt className="font-bold text-ink">{p.grandTotal}</dt>
                            <dd className="font-mono font-black text-ink">
                              {o.grand_total_iqd !== null ? money(o.grand_total_iqd) : '—'}
                            </dd>
                          </div>
                        </dl>

                        <div className="rounded-xl bg-surface-2 border border-line p-3">
                          <p className="text-[10px] font-bold text-ink-faint mb-1 flex items-center gap-1.5">
                            <Truck size={12} />
                            {p.shipment}
                          </p>
                          {o.shipment ? (
                            <div className="flex items-center justify-between gap-3">
                              <span>
                                <span className="font-mono font-black text-ink" dir="ltr">
                                  {o.shipment.tracking_number}
                                </span>
                                <span className="text-ink-muted"> · {shipmentStatusLabel(o.shipment.status)}</span>
                              </span>
                              <Link href={shipmentHref(o.shipment.id)} className="font-bold text-brand-text hover:underline shrink-0">
                                {p.viewShipment}
                              </Link>
                            </div>
                          ) : (
                            <p className="text-ink-muted">{p.noShipment}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    )
  }

  return (
    <WorkspaceShell
      merchantId={ctx.merchantId ?? ''}
      merchantName={ent?.merchant.name ?? w.merchantFallback}
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
