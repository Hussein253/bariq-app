'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, Loader, MapPin,
  MessageSquare, Package, PackageCheck, Phone, Receipt, RefreshCw, Truck, User,
} from 'lucide-react'
import { toArabicDigits, formatArabicCurrency, formatDateTime } from '@/lib/formatters'
import {
  itemLabel, itemLineTotal, orderDisplayName, orderDisplayPhone, toNumber,
  type ConfirmedOrder,
} from '@/lib/orders'

/**
 * قسم "الطلبات المؤكدة" — أسفل المحادثات
 * =========================================
 * المصدر: public.orders WHERE current_state = 'confirmed' (لا يوجد جدول
 * confirmed_orders منفصل — انظر lib/orders.ts). زر "إرسال للشحن" يستدعي
 * POST /api/orders/:id/dispatch الذي يُنشئ صف shipments فعلياً.
 */
export default function ConfirmedOrdersPanel() {
  const [orders, setOrders] = useState<ConfirmedOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dispatchingId, setDispatchingId] = useState<number | null>(null)
  const [dispatchError, setDispatchError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/orders/confirmed', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذر تحميل الطلبات المؤكدة')
      setOrders(json.orders as ConfirmedOrder[])
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذر تحميل الطلبات المؤكدة')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleDispatch = async (orderId: number) => {
    setDispatchingId(orderId)
    setDispatchError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/dispatch`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذر إرسال الطلب للشحن')

      setOrders((prev) =>
        prev.map((o) =>
          o.order_id === orderId
            ? {
                ...o,
                shipment: {
                  id: json.shipment.id,
                  tracking_number: json.shipment.tracking_number,
                  status: json.shipment.status,
                },
              }
            : o
        )
      )
    } catch (err: unknown) {
      setDispatchError(err instanceof Error ? err.message : 'تعذر إرسال الطلب للشحن')
    } finally {
      setDispatchingId(null)
    }
  }

  const pendingCount = orders.filter((o) => !o.shipment).length

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden shadow-sm">
      <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#253765]/10 flex items-center justify-center">
            <ClipboardCheck size={16} className="text-[#253765]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0F172A]">الطلبات المؤكدة</h3>
            <p className="text-[10px] text-slate-400">
              {toArabicDigits(orders.length)} طلب مؤكَّد
              {pendingCount > 0 && (
                <span className="text-amber-600 font-bold"> · {toArabicDigits(pendingCount)} بانتظار الإرسال للشحن</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] hover:border-[#253765] disabled:opacity-50 text-slate-600 font-bold text-[11px] transition"
        >
          {loading ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          تحديث
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-amber-600 hover:text-amber-900 shrink-0">
            إخفاء
          </button>
        </div>
      )}
      {dispatchError && (
        <div className="mx-4 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-semibold text-rose-800 flex items-center justify-between gap-3">
          <span>{dispatchError}</span>
          <button onClick={() => setDispatchError(null)} className="text-rose-600 hover:text-rose-900 shrink-0">
            إخفاء
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-3">
            <RefreshCw size={24} className="animate-spin text-[#253765]" />
            <p className="text-xs font-semibold">جارِ تحميل الطلبات المؤكدة...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-slate-300 gap-2">
            <PackageCheck size={32} />
            <p className="text-xs font-semibold text-slate-400">لا توجد طلبات مؤكدة حالياً</p>
          </div>
        ) : (
          <table className="w-full text-right text-xs min-w-[960px]">
            <thead className="bg-[#F8FAFC] text-slate-500 border-b border-[#E2E8F0]">
              <tr>
                <th className="px-3 py-2.5 font-bold w-10" />
                <th className="px-4 py-2.5 font-bold">رقم الطلب</th>
                <th className="px-4 py-2.5 font-bold">الزبون</th>
                <th className="px-4 py-2.5 font-bold">الهاتف</th>
                <th className="px-4 py-2.5 font-bold">العنوان</th>
                <th className="px-4 py-2.5 font-bold">القطع</th>
                <th className="px-4 py-2.5 font-bold">الإجمالي</th>
                <th className="px-4 py-2.5 font-bold">التاريخ</th>
                <th className="px-4 py-2.5 font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {orders.map((order) => {
                const isOpen = expandedId === order.order_id
                const piecesCount = order.items.reduce((sum, it) => sum + toNumber(it.quantity), 0)
                const itemsSum = order.items.reduce((sum, it) => sum + itemLineTotal(it), 0)
                const recordedItemsTotal = toNumber(order.items_total_iqd)
                const totalsMismatch =
                  order.items.length > 0 && recordedItemsTotal > 0 && itemsSum !== recordedItemsTotal

                return (
                  <Fragment key={order.order_id}>
                    <tr className={isOpen ? 'bg-[#F1F5F9] transition' : 'hover:bg-[#F8FAFC] transition'}>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => setExpandedId(isOpen ? null : order.order_id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'إخفاء تفاصيل الطلب' : 'عرض تفاصيل الطلب'}
                          className="w-7 h-7 rounded-lg border border-[#E2E8F0] bg-white hover:border-[#253765] hover:text-[#253765] text-slate-400 flex items-center justify-center transition"
                        >
                          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-bold text-[#253765]">#{toArabicDigits(order.order_id)}</td>
                      <td className="px-4 py-3 text-[#0F172A] font-semibold">{orderDisplayName(order)}</td>
                      <td className="px-4 py-3 text-slate-500" dir="ltr">
                        {toArabicDigits(orderDisplayPhone(order))}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate" title={order.address || ''}>
                        {[order.governorate, order.district].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        {order.items.length > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#0F172A]">
                            <Package size={12} className="text-slate-400" />
                            {toArabicDigits(piecesCount)} قطعة
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-[#0F172A]">
                        {formatArabicCurrency(toNumber(order.grand_total_iqd))}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{formatDateTime(order.created_at)}</td>
                      <td className="px-4 py-3">
                        {order.shipment ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            أُرسل — {order.shipment.tracking_number}
                          </span>
                        ) : (
                          <button
                            onClick={() => void handleDispatch(order.order_id)}
                            disabled={dispatchingId === order.order_id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-[11px] transition"
                          >
                            {dispatchingId === order.order_id ? (
                              <Loader size={12} className="animate-spin" />
                            ) : (
                              <Truck size={12} />
                            )}
                            إرسال للشحن
                          </button>
                        )}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-[#F8FAFC]">
                        <td colSpan={9} className="px-4 pt-1 pb-5">
                          <div className="grid gap-3 lg:grid-cols-2">
                            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3.5">
                              <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-[#253765] mb-2.5">
                                <Package size={13} />
                                المنتجات المطلوبة
                              </h4>
                              {order.items.length === 0 ? (
                                <p className="text-[11px] text-slate-400 py-2">
                                  لم تُسجَّل عناصر لهذا الطلب في جدول order_items.
                                </p>
                              ) : (
                                <table className="w-full text-right text-[11px]">
                                  <thead className="text-slate-400 border-b border-[#F1F5F9]">
                                    <tr>
                                      <th className="pb-1.5 font-bold">المنتج</th>
                                      <th className="pb-1.5 font-bold">الكمية</th>
                                      <th className="pb-1.5 font-bold">سعر الوحدة</th>
                                      <th className="pb-1.5 font-bold">المجموع</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#F8FAFC]">
                                    {order.items.map((item) => (
                                      <tr key={item.id}>
                                        <td className="py-2 font-semibold text-[#0F172A]">{itemLabel(item)}</td>
                                        <td className="py-2 text-slate-500">{toArabicDigits(toNumber(item.quantity))}</td>
                                        <td className="py-2 text-slate-500">
                                          {formatArabicCurrency(toNumber(item.unit_price_iqd))}
                                        </td>
                                        <td className="py-2 font-bold text-[#0F172A]">
                                          {formatArabicCurrency(itemLineTotal(item))}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </section>

                            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3.5">
                              <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-[#253765] mb-2.5">
                                <MapPin size={13} />
                                بيانات التوصيل
                              </h4>
                              <dl className="space-y-1.5 text-[11px]">
                                <div className="flex gap-2">
                                  <dt className="text-slate-400 shrink-0 w-24 flex items-center gap-1">
                                    <User size={11} /> الزبون
                                  </dt>
                                  <dd className="font-semibold text-[#0F172A]">{orderDisplayName(order)}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="text-slate-400 shrink-0 w-24 flex items-center gap-1">
                                    <Phone size={11} /> الهاتف
                                  </dt>
                                  <dd className="font-semibold text-[#0F172A]" dir="ltr">
                                    {toArabicDigits(orderDisplayPhone(order))}
                                  </dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="text-slate-400 shrink-0 w-24">المحافظة</dt>
                                  <dd className="font-semibold text-[#0F172A]">{order.governorate || '—'}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="text-slate-400 shrink-0 w-24">المنطقة</dt>
                                  <dd className="font-semibold text-[#0F172A]">{order.district || '—'}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="text-slate-400 shrink-0 w-24">العنوان</dt>
                                  <dd className="text-[#0F172A]">{order.address || '—'}</dd>
                                </div>
                                <div className="flex gap-2">
                                  <dt className="text-slate-400 shrink-0 w-24">نقطة دالة</dt>
                                  <dd className="text-[#0F172A]">{order.address_details || '—'}</dd>
                                </div>
                              </dl>
                            </section>

                            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3.5">
                              <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-[#253765] mb-2.5">
                                <Receipt size={13} />
                                الحساب
                              </h4>
                              <dl className="space-y-1.5 text-[11px]">
                                <div className="flex justify-between gap-2">
                                  <dt className="text-slate-400">مجموع القطع</dt>
                                  <dd className="font-semibold text-[#0F172A]">
                                    {formatArabicCurrency(recordedItemsTotal)}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                  <dt className="text-slate-400">أجرة التوصيل</dt>
                                  <dd className="font-semibold text-[#0F172A]">
                                    {formatArabicCurrency(toNumber(order.delivery_fee_iqd))}
                                  </dd>
                                </div>
                                <div className="flex justify-between gap-2 border-t border-[#F1F5F9] pt-1.5 mt-1.5">
                                  <dt className="font-bold text-[#253765]">الحساب الكلي</dt>
                                  <dd className="font-bold text-[#253765]">
                                    {formatArabicCurrency(toNumber(order.grand_total_iqd))}
                                  </dd>
                                </div>
                              </dl>
                              {totalsMismatch && (
                                <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">
                                  تنبيه: مجموع الأسطر ({formatArabicCurrency(itemsSum)}) لا يطابق مجموع القطع المسجَّل.
                                </p>
                              )}
                            </section>

                            <section className="rounded-xl border border-[#E2E8F0] bg-white p-3.5">
                              <h4 className="flex items-center gap-1.5 text-[11px] font-bold text-[#253765] mb-2.5">
                                <MessageSquare size={13} />
                                ملخص البوت
                              </h4>
                              {order.order_content?.trim() ? (
                                <p className="text-[11px] text-[#0F172A] leading-relaxed whitespace-pre-line">
                                  {order.order_content}
                                </p>
                              ) : (
                                <p className="text-[11px] text-slate-400 py-2">
                                  لم يسجّل البوت ملخصاً لهذا الطلب (العمود order_content فارغ).
                                </p>
                              )}
                              {order.shipment && (
                                <div className="mt-3 pt-2.5 border-t border-[#F1F5F9] flex items-center gap-1.5 text-[11px] flex-wrap">
                                  <Truck size={12} className="text-emerald-600" />
                                  <span className="text-slate-400">رقم التتبع:</span>
                                  <span className="font-bold text-emerald-700" dir="ltr">
                                    {order.shipment.tracking_number}
                                  </span>
                                  <span className="text-slate-400">·</span>
                                  <span className="font-semibold text-slate-600">{order.shipment.status}</span>
                                </div>
                              )}
                            </section>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
