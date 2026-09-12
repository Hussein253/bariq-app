import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  ClipboardList,
  CreditCard,
  MapPin,
  MessageCircle,
  Package,
  Store,
  Truck,
  UserCog,
  Wallet,
} from 'lucide-react'
import { loadPlatformOverview, type MerchantRow, type PlatformOverview } from '@/lib/admin-server'
import { STATUS_LABELS, STATUS_COLORS, type ShipmentStatus } from '@/lib/shipments'
import { formatArabicCurrency, formatArabicNumber, toArabicDigits } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

const PLATFORM_LABELS: Record<string, { label: string; dot: string }> = {
  whatsapp: { label: 'واتساب', dot: 'bg-[#25D366]' },
  instagram: { label: 'إنستغرام', dot: 'bg-gradient-to-r from-pink-500 to-purple-600' },
  messenger: { label: 'ماسنجر', dot: 'bg-[#0084FF]' },
  telegram: { label: 'تيليغرام', dot: 'bg-sky-500' },
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
    <div className="relative rounded-2xl bg-white border border-[#E2E8F0] p-4 overflow-hidden">
      <div className={`absolute top-0 inset-x-0 h-[3px] ${accent}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] text-[#64748B] font-semibold leading-tight">{label}</p>
        <Icon size={15} className="text-[#253765] shrink-0" />
      </div>
      <p className="text-xl sm:text-2xl font-black text-[#0F172A] mt-2 font-mono break-all">{value}</p>
      {sub && <p className="mt-1.5 text-[10px] text-[#64748B] leading-relaxed">{sub}</p>}
    </div>
  )
}

function PlanBadge({ row }: { row: MerchantRow }) {
  if (!row.planName) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200">
        بلا اشتراك
      </span>
    )
  }
  const live = row.subscriptionStatus === 'active'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${
        live
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-sky-50 text-sky-700 border-sky-200'
      }`}
    >
      {row.planName}
      <span className="font-normal opacity-70">
        {row.subscriptionStatus === 'trialing' ? '· تجريبي' : row.subscriptionStatus === 'past_due' ? '· متأخر' : ''}
      </span>
    </span>
  )
}

/** بطاقة تاجر — تُعرض على الهاتف بدل صفوف الجدول التي تتكدّس. */
function MerchantCard({ row }: { row: MerchantRow }) {
  return (
    <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-bold text-sm text-[#0F172A] truncate">{row.name}</p>
          {row.phone && (
            <p className="text-[11px] text-slate-500 font-mono">{toArabicDigits(row.phone)}</p>
          )}
        </div>
        <PlanBadge row={row} />
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'منتجات', value: toArabicDigits(row.products) },
          { label: 'شحنات', value: toArabicDigits(row.shipments) },
          { label: 'محادثات', value: toArabicDigits(row.conversations) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] py-2">
            <dd className="font-black text-sm text-[#0F172A] font-mono">{s.value}</dd>
            <dt className="text-[10px] text-[#64748B] mt-0.5">{s.label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-3 pt-3 border-t border-[#F1F5F9] grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <p className="text-[#64748B]">محصّل (COD)</p>
          <p className="font-bold font-mono text-[#0F172A]">{formatArabicCurrency(row.codCollected)}</p>
        </div>
        <div>
          <p className="text-[#64748B]">قيد التسوية</p>
          <p className="font-bold font-mono text-amber-700">
            {formatArabicCurrency(row.pendingSettlement)}
          </p>
        </div>
      </div>

      <Link
        href={`/workspace?merchant=${row.id}`}
        className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#253765]/30 text-[#253765] font-bold text-[11px] hover:bg-[#253765]/5 transition"
      >
        <span>فتح مساحته</span>
        <ArrowLeft size={13} />
      </Link>
    </div>
  )
}

function Overview({ data }: { data: PlatformOverview }) {
  const { totals } = data

  return (
    <>
      {/* مؤشرات المنصة */}
      <section className="mb-8">
        <h2 className="text-sm font-black text-[#0F172A] mb-3">مؤشرات المنصة</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            icon={Store}
            label="التجار"
            value={toArabicDigits(totals.merchants)}
            sub={`${toArabicDigits(totals.activeSubscriptions)} اشتراك فعّال`}
            accent="bg-[#253765]"
          />
          <Kpi
            icon={Wallet}
            label="محصّل (COD)"
            value={formatArabicCurrency(totals.codCollected)}
            sub={`أجور توصيل: ${formatArabicCurrency(totals.deliveryFeesEarned)}`}
            accent="bg-emerald-600"
          />
          <Kpi
            icon={CreditCard}
            label="قيد التسوية"
            value={formatArabicCurrency(totals.pendingSettlement)}
            sub="صافي مستحق التجار"
            accent="bg-amber-500"
          />
          <Kpi
            icon={Truck}
            label="الشحنات"
            value={toArabicDigits(totals.shipments)}
            sub={`${toArabicDigits(totals.orders)} طلب مسجّل`}
            accent="bg-sky-600"
          />
          <Kpi
            icon={MessageCircle}
            label="المحادثات"
            value={toArabicDigits(totals.conversations)}
            sub={`${formatArabicNumber(totals.botMessages)} ردّ آلي`}
            accent="bg-purple-600"
          />
          <Kpi
            icon={Boxes}
            label="المنتجات"
            value={toArabicDigits(totals.products)}
            sub={`${toArabicDigits(totals.deliveryAreas)} منطقة توصيل`}
            accent="bg-rose-500"
          />
        </div>
      </section>

      {/* التوزيعات */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5">
          <h3 className="font-bold text-sm text-[#0F172A] mb-3 flex items-center gap-2">
            <Truck size={15} className="text-[#253765]" />
            الشحنات حسب الحالة
          </h3>
          {data.shipmentsByStatus.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">لا توجد شحنات بعد</p>
          ) : (
            <ul className="space-y-2">
              {data.shipmentsByStatus.map(({ status, count }) => {
                const c = STATUS_COLORS[status as ShipmentStatus]
                return (
                  <li key={status} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${c?.dot || 'bg-slate-300'}`} />
                      <span className="truncate">{STATUS_LABELS[status as ShipmentStatus] || status}</span>
                    </span>
                    <span className="font-black font-mono shrink-0">{toArabicDigits(count)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5">
          <h3 className="font-bold text-sm text-[#0F172A] mb-3 flex items-center gap-2">
            <MessageCircle size={15} className="text-[#253765]" />
            المحادثات حسب القناة
          </h3>
          {data.conversationsByPlatform.length === 0 ? (
            <p className="text-xs text-slate-400 py-3">لا توجد محادثات بعد</p>
          ) : (
            <ul className="space-y-2">
              {data.conversationsByPlatform.map(({ platform, count }) => {
                const p = PLATFORM_LABELS[platform]
                return (
                  <li key={platform} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${p?.dot || 'bg-slate-300'}`} />
                      <span className="truncate">{p?.label || platform}</span>
                    </span>
                    <span className="font-black font-mono shrink-0">{toArabicDigits(count)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5">
          <h3 className="font-bold text-sm text-[#0F172A] mb-3 flex items-center gap-2">
            <ClipboardList size={15} className="text-[#253765]" />
            توزيع الباقات
          </h3>
          <ul className="space-y-2">
            {data.planDistribution.map(({ planName, merchants }) => (
              <li key={planName} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-semibold">{planName}</span>
                <span className="font-black font-mono shrink-0">{toArabicDigits(merchants)}</span>
              </li>
            ))}
          </ul>
          {totals.couriers === 0 && (
            <p className="mt-4 pt-3 border-t border-[#F1F5F9] text-[10px] text-amber-700 flex items-start gap-1.5 leading-relaxed">
              <UserCog size={12} className="shrink-0 mt-0.5" />
              لا يوجد مندوب مسجّل — الشحنات لا يمكن إسنادها لأحد بعد.
            </p>
          )}
        </div>
      </section>

      {/* التجار */}
      <section>
        <h2 className="text-sm font-black text-[#0F172A] mb-3">
          التجار ({toArabicDigits(data.merchants.length)})
        </h2>

        {data.merchants.length === 0 ? (
          <div className="rounded-2xl bg-white border border-[#E2E8F0] py-14 text-center">
            <Store size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-[#0F172A]">لا يوجد تاجر مسجّل</p>
          </div>
        ) : (
          <>
            {/* الهاتف: بطاقات */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:hidden">
              {data.merchants.map((row) => (
                <MerchantCard key={row.id} row={row} />
              ))}
            </div>

            {/* الشاشات الكبيرة: جدول */}
            <div className="hidden lg:block rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="text-[#64748B] bg-[#F8FAFC] border-b border-[#E2E8F0] font-semibold">
                      <th className="p-3.5">التاجر</th>
                      <th className="p-3.5">الباقة</th>
                      <th className="p-3.5">منتجات</th>
                      <th className="p-3.5">شحنات</th>
                      <th className="p-3.5">محادثات</th>
                      <th className="p-3.5">محصّل (COD)</th>
                      <th className="p-3.5">قيد التسوية</th>
                      <th className="p-3.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.merchants.map((row) => (
                      <tr key={row.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        <td className="p-3.5">
                          <div className="font-bold text-[#0F172A]">{row.name}</div>
                          {row.phone && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              {toArabicDigits(row.phone)}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5"><PlanBadge row={row} /></td>
                        <td className="p-3.5 font-mono">{toArabicDigits(row.products)}</td>
                        <td className="p-3.5 font-mono">{toArabicDigits(row.shipments)}</td>
                        <td className="p-3.5 font-mono">{toArabicDigits(row.conversations)}</td>
                        <td className="p-3.5 font-mono">{formatArabicCurrency(row.codCollected)}</td>
                        <td className="p-3.5 font-mono text-amber-700 font-bold">
                          {formatArabicCurrency(row.pendingSettlement)}
                        </td>
                        <td className="p-3.5 text-left">
                          <Link
                            href={`/workspace?merchant=${row.id}`}
                            className="inline-flex items-center gap-1 text-[#253765] font-bold hover:underline whitespace-nowrap"
                          >
                            مساحته
                            <ArrowLeft size={12} />
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
  let data: PlatformOverview | null = null
  let loadError: string | null = null

  try {
    data = await loadPlatformOverview()
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : 'تعذّر تحميل بيانات المنصة'
    console.error('[ADMIN][LOAD_ERROR]', loadError)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="bg-[#253765] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 hover:text-white transition mb-2"
          >
            <ArrowLeft size={13} />
            الصفحة الرئيسية
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight">لوحة مالك المنصة</h1>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-1">
                كل أرقام هذه الصفحة محسوبة مباشرة من قاعدة البيانات — لا بيانات عرض
              </p>
            </div>
            <nav className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              {[
                { href: '/operations', label: 'العمليات' },
                { href: '/operations/chats', label: 'خدمة العملاء' },
                { href: '/dashboard', label: 'الشحنات' },
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
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>تعذّر تحميل بيانات المنصة: {loadError}</span>
          </div>
        ) : (
          data && <Overview data={data} />
        )}
      </main>
    </div>
  )
}
