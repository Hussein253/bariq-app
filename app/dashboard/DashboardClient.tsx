'use client'

/**
 * لوحة تحكم الشحنات الحقيقية لمنصة "برق" — مربوطة فعلياً بجداول Supabase
 * (shipments / merchants / couriers)
 * ---------------------------------------------------------------------
 * ⚠️ لا يوجد تسجيل دخول على هذه اللوحة حالياً (بقرار صريح من المستخدم، مطابق
 * لوضع /operations الحالي) - محوّل الأدوار أدناه هو تبديل عرض فقط وليس حماية.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Package,
  Search,
  Store,
  Truck,
  Users,
  ShieldAlert,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  TrendingUp,
  Wallet,
  Clock,
  MapPin,
  Phone,
  ArrowLeft,
  RefreshCw,
  UserCog,
  ClipboardList,
  CircleDollarSign,
  BadgeCheck,
  Ban,
  PackagePlus,
} from 'lucide-react'
import { formatArabicCurrency, formatArabicNumber, toArabicDigits } from '@/lib/formatters'
import { PrintStickerButton } from '@/components/ShipmentSticker'
import NewOrderBooking from '@/components/NewOrderBooking'
import {
  type Shipment,
  type Merchant,
  type Courier,
  type ShipmentStatus,
  type SettlementStatus,
  SHIPMENT_STATUSES,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  STATUS_COLORS,
  SETTLEMENT_LABELS,
  SETTLEMENT_COLORS,
  TIMELINE_STEPS,
  formatDateTime,
} from '@/lib/shipments'

type Role = 'admin' | 'merchant'
type Tab = 'shipments' | 'booking' | 'merchants' | 'couriers'
type Toast = { message: string; type: 'success' | 'info' | 'error' }

function StatusBadge({ status }: { status: ShipmentStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {STATUS_LABELS[status]}
    </span>
  )
}

function SettlementBadge({ status }: { status: SettlementStatus }) {
  const c = SETTLEMENT_COLORS[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${c.bg} ${c.text} ${c.border}`}>
      {SETTLEMENT_LABELS[status]}
    </span>
  )
}

export default function DashboardClient({
  initialShipments,
  initialMerchants,
  initialCouriers,
  loadError,
}: {
  initialShipments: Shipment[]
  initialMerchants: Merchant[]
  initialCouriers: Courier[]
  loadError: string | null
}) {
  const router = useRouter()

  const [role, setRole] = useState<Role>('admin')
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>(initialMerchants[0]?.id || '')
  const [tab, setTab] = useState<Tab>('shipments')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'الكل' | ShipmentStatus>('الكل')
  const [governorateFilter, setGovernorateFilter] = useState('الكل')

  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null)
  const [reasonPrompt, setReasonPrompt] = useState<{ shipment: Shipment; target: ShipmentStatus } | null>(null)
  const [reasonText, setReasonText] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ===== نطاق البيانات حسب الدور المختار (عرض فقط - ليس تصفية أمنية حقيقية) =====
  const scopedShipments = useMemo(() => {
    if (role === 'merchant') {
      return initialShipments.filter((s) => s.merchant_id === selectedMerchantId)
    }
    return initialShipments
  }, [initialShipments, role, selectedMerchantId])

  const governorates = useMemo(() => {
    const set = new Set(scopedShipments.map((s) => s.governorate).filter(Boolean))
    return ['الكل', ...Array.from(set)]
  }, [scopedShipments])

  const filteredShipments = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scopedShipments.filter((s) => {
      const matchesSearch =
        !q ||
        s.tracking_number.toLowerCase().includes(q) ||
        String(s.order_id).includes(q) ||
        s.recipient_name.toLowerCase().includes(q) ||
        s.recipient_phone.includes(q) ||
        (s.merchant_name || '').toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'الكل' || s.status === statusFilter
      const matchesGov = governorateFilter === 'الكل' || s.governorate === governorateFilter
      return matchesSearch && matchesStatus && matchesGov
    })
  }, [scopedShipments, search, statusFilter, governorateFilter])

  // ===== مؤشرات الأداء اللوجستية =====
  const stats = useMemo(() => {
    const total = scopedShipments.length
    const delivered = scopedShipments.filter((s) => s.status === 'DELIVERED' || s.status === 'SETTLED_FINANCIALLY')
    const outForDelivery = scopedShipments.filter((s) => s.status === 'OUT_FOR_DELIVERY').length
    const postponed = scopedShipments.filter((s) => s.status === 'POSTPONED').length
    const returned = scopedShipments.filter((s) => s.status === 'RETURNED').length
    const active = scopedShipments.filter((s) =>
      ['ORDER_RECEIVED', 'PICKED_UP_SAME_DAY', 'IN_TRANSIT_HUB', 'OUT_FOR_DELIVERY'].includes(s.status)
    ).length

    const codCollected = delivered.reduce((sum, s) => sum + Number(s.cod_amount_iqd || 0), 0)
    const deliveryFeesEarned = delivered.reduce((sum, s) => sum + Number(s.delivery_fee_iqd || 0), 0)
    const pendingSettlement = scopedShipments
      .filter((s) => s.settlement_status === 'PENDING' && (s.status === 'DELIVERED' || s.status === 'SETTLED_FINANCIALLY'))
      .reduce((sum, s) => sum + Number(s.merchant_net_amount_iqd || 0), 0)

    const successRate = total > 0 ? ((delivered.length / total) * 100).toFixed(1) : '0'

    return { total, active, outForDelivery, postponed, returned, codCollected, deliveryFeesEarned, pendingSettlement, successRate, deliveredCount: delivered.length }
  }, [scopedShipments])

  const activeMerchant = initialMerchants.find((m) => m.id === selectedMerchantId)

  // ===== تنفيذ التحديث الفعلي عبر API الحقيقي =====
  const applyUpdate = async (id: string, patch: Record<string, unknown>) => {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'فشل تحديث الشحنة')
      }
      showToast('تم تحديث الشحنة بنجاح', 'success')
      setSelectedShipment(null)
      setReasonPrompt(null)
      setReasonText('')
      router.refresh()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'حدث خطأ غير متوقع أثناء التحديث', 'error')
    } finally {
      setUpdatingId(null)
    }
  }

  const requestTransition = (shipment: Shipment, target: ShipmentStatus) => {
    if (target === 'POSTPONED' || target === 'RETURNED') {
      setReasonPrompt({ shipment, target })
      setReasonText('')
      return
    }
    applyUpdate(shipment.id, { status: target })
  }

  const confirmReasonTransition = () => {
    if (!reasonPrompt) return
    if (!reasonText.trim()) {
      showToast('السبب مطلوب قبل المتابعة', 'error')
      return
    }
    const field = reasonPrompt.target === 'POSTPONED' ? 'postponed_reason' : 'returned_reason'
    applyUpdate(reasonPrompt.shipment.id, { status: reasonPrompt.target, [field]: reasonText.trim() })
  }

  const assignCourier = (shipment: Shipment, courierId: string) => {
    applyUpdate(shipment.id, { courier_id: courierId || null })
  }

  const updateSettlement = (shipment: Shipment, status: SettlementStatus) => {
    applyUpdate(shipment.id, { settlement_status: status })
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A] flex flex-col font-sans">
      {/* التنبيهات العائمة */}
      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur-md animate-fadeIn ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : toast.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-blue-200 bg-blue-50 text-blue-900'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 mr-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* شريط تنبيه: لا يوجد تسجيل دخول */}
      <div className="bg-[#253765] text-white px-4 sm:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border-b border-[#1D2B50]">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-amber-300" />
          <span className="font-bold">بيانات حقيقية من Supabase — لا يوجد تسجيل دخول على هذه اللوحة بعد:</span>
          <span className="text-slate-200 hidden md:inline">محوّل الدور أدناه تبديل عرض فقط، وليس حماية أمنية.</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#1D2B50] p-0.5 rounded-lg border border-white/15">
            <button
              onClick={() => setRole('admin')}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 ${
                role === 'admin' ? 'bg-white text-[#253765]' : 'text-slate-200 hover:text-white'
              }`}
            >
              <ShieldAlert size={13} />
              <span>مدير المنصة</span>
            </button>
            <button
              onClick={() => {
                setRole('merchant')
                setTab('shipments')
              }}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 ${
                role === 'merchant' ? 'bg-amber-400 text-slate-900' : 'text-slate-200 hover:text-white'
              }`}
            >
              <Store size={13} />
              <span>تاجر</span>
            </button>
          </div>
          {role === 'merchant' && (
            <select
              value={selectedMerchantId}
              onChange={(e) => setSelectedMerchantId(e.target.value)}
              className="bg-[#1D2B50] border border-white/20 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-bold outline-none"
            >
              {initialMerchants.length === 0 && <option value="">لا يوجد تجار بعد</option>}
              {initialMerchants.map((m) => (
                <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-1">
        {/* الشريط الجانبي */}
        <aside className="hidden lg:flex w-60 flex-col justify-between border-l border-[#E2E8F0] bg-white p-5 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-7 px-2">
              <div className="w-10 h-10 rounded-xl bg-[#253765] flex items-center justify-center text-white font-black text-xl shadow-md">⚡</div>
              <div>
                <p className="font-bold text-base text-[#253765] tracking-tight">برق</p>
                <p className="text-[11px] text-[#64748B]">{role === 'merchant' ? `لوحة ${activeMerchant?.name || 'التاجر'}` : 'لوحة الشحنات الحقيقية'}</p>
              </div>
            </div>

            <nav className="space-y-1.5">
              <button
                onClick={() => setTab('shipments')}
                className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                  tab === 'shipments' ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package size={17} />
                  <span>{role === 'merchant' ? 'شحناتي' : 'كل الشحنات'}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${tab === 'shipments' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {toArabicDigits(scopedShipments.length)}
                </span>
              </button>

              {/* حجز طلب جديد — إجراء أساسي مستقل */}
              <button
                onClick={() => setTab('booking')}
                className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                  tab === 'booking'
                    ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20'
                    : 'bg-[#253765]/5 text-[#253765] hover:bg-[#253765]/10 border border-[#253765]/15'
                }`}
              >
                <div className="flex items-center gap-3">
                  <PackagePlus size={17} />
                  <span>حجز طلب جديد</span>
                </div>
              </button>

              {role === 'admin' && (
                <>
                  <button
                    onClick={() => setTab('merchants')}
                    className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                      tab === 'merchants' ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Store size={17} />
                      <span>التجار</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${tab === 'merchants' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {toArabicDigits(initialMerchants.length)}
                    </span>
                  </button>
                  <button
                    onClick={() => setTab('couriers')}
                    className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                      tab === 'couriers' ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <UserCog size={17} />
                      <span>المندوبون</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${tab === 'couriers' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {toArabicDigits(initialCouriers.length)}
                    </span>
                  </button>
                </>
              )}

              <Link
                href="/operations"
                className="w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A] border border-dashed border-[#E2E8F0] mt-2"
              >
                <div className="flex items-center gap-3">
                  <ArrowLeft size={17} />
                  <span>الرجوع للوحة العمليات</span>
                </div>
              </Link>
            </nav>
          </div>

          <button
            onClick={() => router.refresh()}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#253765] transition"
          >
            <RefreshCw size={14} />
            <span>تحديث البيانات</span>
          </button>
        </aside>

        {/* المحتوى */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl mx-auto w-full overflow-y-auto">
          {loadError && (
            <div className="mb-5 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
              <AlertCircle size={16} />
              <span>تعذّر جلب بعض البيانات من Supabase: {loadError}</span>
            </div>
          )}

          {role === 'merchant' && initialMerchants.length === 0 && (
            <div className="mb-5 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              لا يوجد أي تاجر مسجّل بعد في جدول merchants.
            </div>
          )}

          <header className="mb-6">
            <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
              {tab === 'shipments'
                ? role === 'merchant'
                  ? `شحنات ${activeMerchant?.name || ''}`
                  : 'مركز تحكم الشحنات'
                : tab === 'booking'
                ? 'حجز طلب جديد'
                : tab === 'merchants'
                ? 'إدارة التجار'
                : 'إدارة المندوبين'}
            </h1>
            <p className="text-xs sm:text-sm text-[#64748B] mt-1">
              {tab === 'booking'
                ? 'أدخل بيانات الزبون ومحتوى الطلب — يُنشأ الطلب والشحنة معاً ويصدر رقم التتبع تلقائياً'
                : role === 'merchant'
                ? 'تظهر فقط الشحنات والتسويات الخاصة بمتجرك'
                : 'رؤية كاملة على شحنات كل التجار وحالاتها المالية واللوجستية'}
            </p>
          </header>

          {/* ===== بطاقات المؤشرات اللوجستية ===== */}
          {tab === 'shipments' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-[#253765]" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">إجمالي الشحنات</p>
                  <Package size={15} className="text-[#253765]" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">{toArabicDigits(stats.total)}</p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  نشطة الآن: <strong className="text-sky-700">{toArabicDigits(stats.active)}</strong>
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-emerald-600" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">نسبة التسليم الناجح</p>
                  <TrendingUp size={15} className="text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">{toArabicDigits(stats.successRate)}%</p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  مسلَّمة: <strong className="text-emerald-700">{toArabicDigits(stats.deliveredCount)}</strong> · مؤجلة:{' '}
                  <strong className="text-orange-700">{toArabicDigits(stats.postponed)}</strong> · مرتجعة:{' '}
                  <strong className="text-rose-700">{toArabicDigits(stats.returned)}</strong>
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-purple-600" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">قيمة البضائع المُحصّلة (COD)</p>
                  <CircleDollarSign size={15} className="text-purple-600" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mt-2 font-mono">{formatArabicCurrency(stats.codCollected)}</p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  أجور توصيل محصّلة: <strong className="text-[#0F172A]">{formatArabicCurrency(stats.deliveryFeesEarned)}</strong>
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-amber-500" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">مستحقات {role === 'merchant' ? 'متجرك' : 'التجار'} قيد التسوية</p>
                  <Wallet size={15} className="text-amber-600" />
                </div>
                <p className="text-xl font-black text-[#0F172A] mt-2 font-mono">{formatArabicCurrency(stats.pendingSettlement)}</p>
                <p className="mt-2 text-[11px] text-[#64748B]">صافي بعد خصم أجور التوصيل</p>
              </div>
            </div>
          )}

          {/* ===== تبويب الشحنات ===== */}
          {tab === 'shipments' && (
            <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
              <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex flex-col gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
                  {(['الكل', ...SHIPMENT_STATUSES] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                        statusFilter === st ? 'bg-[#253765] text-white shadow-sm' : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                      }`}
                    >
                      {st === 'الكل' ? 'الكل' : STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="بحث برقم التتبع، رقم الطلب، اسم الزبون، أو الهاتف..."
                      className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765] bg-white"
                    />
                  </div>
                  <select
                    value={governorateFilter}
                    onChange={(e) => setGovernorateFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none bg-white font-semibold"
                  >
                    {governorates.map((g) => (
                      <option key={g} value={g}>
                        {g === 'الكل' ? 'كل المحافظات' : g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-right text-[#64748B] bg-[#FAFAFA] border-b border-[#E2E8F0]">
                      <th className="px-4 py-3 font-bold">رقم التتبع</th>
                      <th className="px-4 py-3 font-bold">المستلم</th>
                      <th className="px-4 py-3 font-bold">المحافظة</th>
                      {role === 'admin' && <th className="px-4 py-3 font-bold">التاجر</th>}
                      <th className="px-4 py-3 font-bold">المندوب</th>
                      <th className="px-4 py-3 font-bold">الحالة</th>
                      <th className="px-4 py-3 font-bold">COD</th>
                      <th className="px-4 py-3 font-bold">التسوية</th>
                      <th className="px-4 py-3 font-bold">تاريخ الإنشاء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShipments.length === 0 && (
                      <tr>
                        <td colSpan={role === 'admin' ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                          لا توجد شحنات مطابقة
                        </td>
                      </tr>
                    )}
                    {filteredShipments.map((s) => (
                      <tr
                        key={s.id}
                        onClick={() => setSelectedShipment(s)}
                        className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC] cursor-pointer transition"
                      >
                        <td className="px-4 py-3 font-bold text-[#253765]">{s.tracking_number}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#0F172A]">{s.recipient_name}</div>
                          <div className="text-[10px] text-slate-500">{toArabicDigits(s.recipient_phone)}</div>
                        </td>
                        <td className="px-4 py-3">{s.governorate}</td>
                        {role === 'admin' && <td className="px-4 py-3">{s.merchant_name}</td>}
                        <td className="px-4 py-3">{s.courier_name || <span className="text-slate-400">غير مُعيَّن</span>}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.status} />
                        </td>
                        <td className="px-4 py-3 font-mono">{formatArabicCurrency(s.cod_amount_iqd)}</td>
                        <td className="px-4 py-3">
                          <SettlementBadge status={s.settlement_status} />
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDateTime(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ===== تبويب حجز طلب جديد ===== */}
          {tab === 'booking' && (
            <div className="max-w-2xl">
              <NewOrderBooking />
            </div>
          )}

          {/* ===== تبويب التجار ===== */}
          {tab === 'merchants' && role === 'admin' && (
            <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-[#64748B] bg-[#FAFAFA] border-b border-[#E2E8F0]">
                    <th className="px-4 py-3 font-bold">التاجر</th>
                    <th className="px-4 py-3 font-bold">الهاتف</th>
                    <th className="px-4 py-3 font-bold">الحالة</th>
                    <th className="px-4 py-3 font-bold">عدد الشحنات</th>
                    <th className="px-4 py-3 font-bold">مستحقات قيد التسوية</th>
                    <th className="px-4 py-3 font-bold">الرصيد المسجّل</th>
                  </tr>
                </thead>
                <tbody>
                  {initialMerchants.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400">لا يوجد تجار مسجّلون بعد</td>
                    </tr>
                  )}
                  {initialMerchants.map((m) => {
                    const mShipments = initialShipments.filter((s) => s.merchant_id === m.id)
                    const pending = mShipments
                      .filter((s) => s.settlement_status === 'PENDING' && (s.status === 'DELIVERED' || s.status === 'SETTLED_FINANCIALLY'))
                      .reduce((sum, s) => sum + Number(s.merchant_net_amount_iqd || 0), 0)
                    return (
                      <tr key={m.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-bold text-[#0F172A] flex items-center gap-2">
                          <Store size={14} className="text-[#253765]" />
                          {m.name}
                        </td>
                        <td className="px-4 py-3">{m.phone ? toArabicDigits(m.phone) : <span className="text-slate-400">غير مسجّل</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${m.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            {m.status === 'active' ? <BadgeCheck size={11} /> : <Ban size={11} />}
                            {m.status === 'active' ? 'نشط' : 'موقوف'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{toArabicDigits(mShipments.length)}</td>
                        <td className="px-4 py-3 font-mono text-amber-700 font-bold">{formatArabicCurrency(pending)}</td>
                        <td className="px-4 py-3 font-mono">{formatArabicCurrency(m.balance_iqd)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ===== تبويب المندوبين ===== */}
          {tab === 'couriers' && role === 'admin' && (
            <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-right text-[#64748B] bg-[#FAFAFA] border-b border-[#E2E8F0]">
                    <th className="px-4 py-3 font-bold">المندوب</th>
                    <th className="px-4 py-3 font-bold">الهاتف</th>
                    <th className="px-4 py-3 font-bold">الحالة</th>
                    <th className="px-4 py-3 font-bold">الشحنات النشطة الموكلة له</th>
                  </tr>
                </thead>
                <tbody>
                  {initialCouriers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-slate-400">لا يوجد مندوبون مسجّلون بعد</td>
                    </tr>
                  )}
                  {initialCouriers.map((c) => {
                    const activeCount = initialShipments.filter(
                      (s) => s.courier_id === c.id && ['PICKED_UP_SAME_DAY', 'IN_TRANSIT_HUB', 'OUT_FOR_DELIVERY'].includes(s.status)
                    ).length
                    return (
                      <tr key={c.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-bold text-[#0F172A] flex items-center gap-2">
                          <UserCog size={14} className="text-[#253765]" />
                          {c.name}
                        </td>
                        <td className="px-4 py-3">{c.phone ? toArabicDigits(c.phone) : <span className="text-slate-400">غير مسجّل</span>}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-700 border-sky-200">
                            {c.status === 'active' ? 'متاح' : c.status === 'on_leave' ? 'بإجازة' : 'غير متاح'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">{toArabicDigits(activeCount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* ===== لوحة تفاصيل الشحنة الجانبية ===== */}
      {selectedShipment && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedShipment(null)} />
          <div className="relative w-full sm:w-[420px] bg-white h-full overflow-y-auto shadow-2xl border-r border-[#E2E8F0] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-lg font-black text-[#253765]">{selectedShipment.tracking_number}</p>
                <p className="text-[11px] text-slate-500">طلب رقم {toArabicDigits(selectedShipment.order_id)}</p>
              </div>
              <button onClick={() => setSelectedShipment(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="mb-4 flex items-center justify-between gap-2">
              <StatusBadge status={selectedShipment.status} />
              <PrintStickerButton
                shipment={selectedShipment}
                merchantName={selectedShipment.merchant_name}
                orderContent={selectedShipment.order_content}
                label="طباعة الستيكر"
                compact
              />
            </div>

            {/* بيانات المستلم */}
            <div className="space-y-2 p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-xs mb-4">
              <div className="flex items-center gap-2 font-bold text-[#0F172A]">
                <Users size={13} className="text-[#253765]" />
                {selectedShipment.recipient_name}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Phone size={13} />
                {toArabicDigits(selectedShipment.recipient_phone)}
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <MapPin size={13} />
                {selectedShipment.governorate}
                {selectedShipment.district ? ` - ${selectedShipment.district}` : ''} — {selectedShipment.full_address}
              </div>
              {selectedShipment.nearest_landmark && (
                <p className="text-slate-500">أقرب نقطة دالة: {selectedShipment.nearest_landmark}</p>
              )}
            </div>

            {/* الخط الزمني */}
            <div className="mb-4">
              <p className="text-[11px] font-bold text-[#64748B] mb-2 flex items-center gap-1.5">
                <Clock size={13} /> مسار الشحنة
              </p>
              <div className="space-y-0">
                {TIMELINE_STEPS.map((step, idx) => {
                  const value = selectedShipment[step.atField] as string | null
                  const done = Boolean(value)
                  return (
                    <div key={step.status} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full mt-1 ${done ? STATUS_COLORS[step.status].dot : 'bg-slate-200'}`} />
                        {idx < TIMELINE_STEPS.length - 1 && <div className={`w-px flex-1 min-h-[22px] ${done ? 'bg-slate-300' : 'bg-slate-100'}`} />}
                      </div>
                      <div className="pb-3">
                        <p className={`text-xs font-semibold ${done ? 'text-[#0F172A]' : 'text-slate-400'}`}>{STATUS_LABELS[step.status]}</p>
                        <p className="text-[10px] text-slate-400">{done ? formatDateTime(value) : '—'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {(selectedShipment.status === 'POSTPONED' || selectedShipment.postponed_reason) && (
                <div className="mt-2 p-2.5 rounded-lg bg-orange-50 border border-orange-200 text-[11px] text-orange-800">
                  <strong>تأجيل:</strong> {selectedShipment.postponed_reason || '—'} ({formatDateTime(selectedShipment.postponed_at)})
                </div>
              )}
              {(selectedShipment.status === 'RETURNED' || selectedShipment.returned_reason) && (
                <div className="mt-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                  <strong>إرجاع:</strong> {selectedShipment.returned_reason || '—'} ({formatDateTime(selectedShipment.returned_at)})
                </div>
              )}
            </div>

            {/* المالية */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs">
              <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-[10px] text-slate-500">قيمة البضاعة (COD)</p>
                <p className="font-bold font-mono">{formatArabicCurrency(selectedShipment.cod_amount_iqd)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                <p className="text-[10px] text-slate-500">أجرة التوصيل</p>
                <p className="font-bold font-mono">{formatArabicCurrency(selectedShipment.delivery_fee_iqd)}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 col-span-2">
                <p className="text-[10px] text-emerald-700">صافي مستحق التاجر</p>
                <p className="font-bold font-mono text-emerald-800">{formatArabicCurrency(selectedShipment.merchant_net_amount_iqd)}</p>
              </div>
            </div>

            {/* طباعة ستيكر الشحنة — الإجراء الميداني الأول بعد تأكيد الطلب */}
            <div className="mb-4">
              <p className="text-[11px] font-bold text-[#64748B] mb-2">ملصق الشحنة</p>
              <PrintStickerButton
                shipment={selectedShipment}
                merchantName={selectedShipment.merchant_name}
                orderContent={selectedShipment.order_content}
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                ملصق حراري بعرض ٨٠ ملم — يُخفي لوحة التحكم تلقائياً عند الطباعة.
              </p>
            </div>

            {/* إجراءات الحالة */}
            <div className="mb-4">
              <p className="text-[11px] font-bold text-[#64748B] mb-2">تحديث حالة الشحنة</p>
              {STATUS_TRANSITIONS[selectedShipment.status].length === 0 ? (
                <p className="text-[11px] text-slate-400">الشحنة في حالتها النهائية - لا يوجد انتقال آخر متاح.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {STATUS_TRANSITIONS[selectedShipment.status].map((next) => (
                    <button
                      key={next}
                      disabled={updatingId === selectedShipment.id}
                      onClick={() => requestTransition(selectedShipment, next)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition disabled:opacity-50 ${STATUS_COLORS[next].bg} ${STATUS_COLORS[next].text} ${STATUS_COLORS[next].border} hover:brightness-95`}
                    >
                      {STATUS_LABELS[next]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* تعيين مندوب */}
            {role === 'admin' && (
              <div className="mb-4">
                <p className="text-[11px] font-bold text-[#64748B] mb-2 flex items-center gap-1.5">
                  <Truck size={13} /> المندوب المخصص
                </p>
                <select
                  value={selectedShipment.courier_id || ''}
                  disabled={updatingId === selectedShipment.id}
                  onChange={(e) => assignCourier(selectedShipment, e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none bg-white"
                >
                  <option value="">غير مُعيَّن</option>
                  {initialCouriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* حالة التسوية */}
            {role === 'admin' && (
              <div className="mb-2">
                <p className="text-[11px] font-bold text-[#64748B] mb-2 flex items-center gap-1.5">
                  <ClipboardList size={13} /> حالة التسوية المالية
                </p>
                <div className="flex gap-2">
                  {(['PENDING', 'DEPOSITED', 'DEFERRED'] as SettlementStatus[]).map((st) => (
                    <button
                      key={st}
                      disabled={updatingId === selectedShipment.id}
                      onClick={() => updateSettlement(selectedShipment, st)}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-bold border transition disabled:opacity-50 ${
                        selectedShipment.settlement_status === st
                          ? `${SETTLEMENT_COLORS[st].bg} ${SETTLEMENT_COLORS[st].text} ${SETTLEMENT_COLORS[st].border}`
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {SETTLEMENT_LABELS[st]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== نافذة سبب التأجيل/الإرجاع ===== */}
      {reasonPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setReasonPrompt(null)} />
          <div className="relative bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-bold text-sm mb-1">
              {reasonPrompt.target === 'POSTPONED' ? 'سبب تأجيل التسليم' : 'سبب إرجاع الشحنة'}
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">شحنة {reasonPrompt.shipment.tracking_number} — السبب إلزامي حسب سياسة المطابقة المالية.</p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              rows={3}
              placeholder="مثال: الزبون لم يرد على الاتصال، أو: تم رفض الاستلام من قبل الزبون"
              className="w-full p-2.5 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765] mb-3"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setReasonPrompt(null)}
                className="flex-1 py-2 rounded-xl border border-[#E2E8F0] text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                onClick={confirmReasonTransition}
                disabled={updatingId === reasonPrompt.shipment.id}
                className="flex-1 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white text-xs font-bold disabled:opacity-50"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
