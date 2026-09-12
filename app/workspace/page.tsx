import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bot,
  Brain,
  Check,
  Headphones,
  Lock,
  MessageCircle,
  Package,
  ShieldAlert,
  Terminal,
  Truck,
  Users,
} from 'lucide-react'
import MerchantSwitcher from '@/components/MerchantSwitcher'
import {
  listMerchantsWithPlan,
  loadMerchantEntitlements,
  usageRatio,
  isOverLimit,
  type MerchantEntitlements,
  type UsageMetric,
} from '@/lib/entitlements'
import { ANALYTICS_LABELS, SUPPORT_LABELS } from '@/lib/plans'
import { formatArabicNumber, toArabicDigits } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, { text: string; className: string }> = {
  trialing: { text: 'تجريبي', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  active: { text: 'نشط', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  past_due: { text: 'متأخر السداد', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  canceled: { text: 'ملغى', className: 'bg-rose-50 text-rose-700 border-rose-200' },
}

function UsageMeter({ metric }: { metric: UsageMetric }) {
  const ratio = usageRatio(metric)
  const over = isOverLimit(metric)

  return (
    <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm">
      <p className="text-xs text-[#64748B] font-semibold">{metric.label}</p>

      {metric.used === null ? (
        <>
          <p className="text-lg font-black text-slate-400 mt-2">غير متاح</p>
          <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
            {metric.unavailableReason}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
            {formatArabicNumber(metric.used)}
            <span className="text-sm font-bold text-slate-400">
              {' / '}
              {formatArabicNumber(metric.limit)}
            </span>
          </p>
          <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                over ? 'bg-rose-600' : ratio !== null && ratio > 0.8 ? 'bg-amber-500' : 'bg-[#253765]'
              }`}
              style={{ width: `${Math.round((ratio ?? 0) * 100)}%` }}
            />
          </div>
          {over && (
            <p className="text-[10px] text-rose-700 font-bold mt-1.5">
              بلغت حدّ الباقة — الترقية تفتح المزيد
            </p>
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
        included ? 'bg-white border-[#E2E8F0]' : 'bg-slate-50 border-dashed border-slate-200'
      }`}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          included ? 'bg-[#253765]/10 text-[#253765]' : 'bg-slate-200/60 text-slate-400'
        }`}
      >
        <Icon size={17} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-bold text-sm ${included ? 'text-[#0F172A]' : 'text-slate-400'}`}>
            {title}
          </h3>
          {included ? (
            <Check size={13} className="text-emerald-600 shrink-0" />
          ) : (
            <Lock size={12} className="text-slate-400 shrink-0" />
          )}
        </div>
        <p className={`text-[11px] mt-1 leading-relaxed ${included ? 'text-[#64748B]' : 'text-slate-400'}`}>
          {detail}
        </p>
      </div>
    </div>
  )
}

function Workspace({ ent }: { ent: MerchantEntitlements }) {
  const { plan, subscription, usage } = ent
  const status = STATUS_LABELS[subscription.status] ?? STATUS_LABELS.trialing

  return (
    <>
      {/* الباقة الحالية */}
      <section className="mb-8 rounded-2xl bg-gradient-to-l from-[#253765] to-[#1D2B50] text-white p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-slate-300 font-semibold mb-1">باقتك الحالية</p>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black tracking-tight">{plan.name_en}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${status.className}`}>
                {status.text}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-2 max-w-md leading-relaxed">{plan.tagline_ar}</p>
          </div>

          <Link
            href="/#pricing"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white text-[#253765] font-bold text-xs shadow-md transition active:scale-95 shrink-0"
          >
            <span>ترقية الباقة</span>
            <ArrowLeft size={15} />
          </Link>
        </div>
      </section>

      {/* الاستهلاك */}
      <section className="mb-8">
        <h2 className="text-sm font-black text-[#0F172A] mb-3">استهلاكك في الدورة الحالية</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <UsageMeter metric={usage.actions} />
          <UsageMeter metric={usage.teamSeats} />
          <UsageMeter metric={usage.products} />
        </div>
      </section>

      {/* ما تشمله الباقة */}
      <section className="mb-8">
        <h2 className="text-sm font-black text-[#0F172A] mb-3">ما تشمله باقتك</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FeatureRow
            icon={Bot}
            title="الموظفون الأذكياء"
            detail={`حتى ${toArabicDigits(plan.max_ai_agents)} موظف ذكي على ${toArabicDigits(
              plan.max_social_accounts
            )} حسابات تواصل`}
            included
          />
          <FeatureRow
            icon={Package}
            title="قواعد المنتجات"
            detail={`${toArabicDigits(plan.max_catalogs)} قاعدة، بسعة ${formatArabicNumber(
              plan.max_products
            )} منتج وخدمة`}
            included
          />
          <FeatureRow
            icon={BarChart3}
            title={ANALYTICS_LABELS[plan.analytics_tier]}
            detail={
              plan.analytics_tier === 'advanced'
                ? 'تقارير تفصيلية عن الاستجابة والتحويل ومصادر الطلبات'
                : 'مؤشرات أساسية — الإحصائيات المتقدمة تبدأ من باقة Flash'
            }
            included={plan.analytics_tier === 'advanced'}
          />
          <FeatureRow
            icon={Headphones}
            title={SUPPORT_LABELS[plan.support_tier]}
            detail={
              plan.support_tier === 'vip'
                ? 'قناة دعم مخصّصة مع أولوية قصوى'
                : plan.support_tier === 'priority'
                ? 'ردّ قبل بقية الطلبات في الطابور'
                : 'الدعم القياسي — الأولوية تبدأ من باقة Bolt'
            }
            included={plan.support_tier !== 'standard'}
          />
          <FeatureRow
            icon={Terminal}
            title="الوصول البرمجي (API)"
            detail={
              plan.has_api_access
                ? 'اربط أنظمتك الداخلية مباشرة بمنصة برق'
                : 'متاح في باقة Storm فقط'
            }
            included={plan.has_api_access}
          />
          <FeatureRow
            icon={Truck}
            title="الجسر اللوجستي"
            detail="تحويل الطلب المؤكَّد إلى شحنة برقم تتبّع وملصق حراري — في كل الباقات"
            included
          />
        </div>
      </section>

      {/* روابط التشغيل */}
      <section>
        <h2 className="text-sm font-black text-[#0F172A] mb-3">ابدأ العمل</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            {
              href: `/workspace/catalog?merchant=${ent.merchant.id}`,
              icon: Brain,
              label: 'العقل المعرفي',
              sub: `${toArabicDigits(usage.products.used ?? 0)} منتج يجيب عنه موظفك الذكي`,
            },
            { href: '/operations/chats', icon: MessageCircle, label: 'خدمة العملاء', sub: 'محادثات القنوات الثلاث' },
            { href: '/operations', icon: Package, label: 'الطلبات والشحنات', sub: 'إدارة ومتابعة' },
            { href: '/dashboard', icon: Truck, label: 'تتبّع الشحنات', sub: 'الحالة الميدانية' },
          ].map(({ href, icon: Icon, label, sub }) => (
            <Link
              key={href}
              href={href}
              className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm hover:border-[#253765] transition flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-[#253765]/10 text-[#253765] flex items-center justify-center shrink-0">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm text-[#0F172A]">{label}</p>
                <p className="text-[11px] text-[#64748B]">{sub}</p>
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

  let merchants: { id: string; name: string; planName: string | null }[] = []
  let ent: MerchantEntitlements | null = null
  let loadError: string | null = null

  try {
    merchants = await listMerchantsWithPlan()
    const activeId = requestedId && merchants.some((m) => m.id === requestedId)
      ? requestedId
      : merchants[0]?.id
    if (activeId) ent = await loadMerchantEntitlements(activeId)
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : 'تعذّر تحميل بيانات الاشتراك'
    console.error('[WORKSPACE][LOAD_ERROR]', loadError)
  }

  const activeId = ent?.merchant.id ?? merchants[0]?.id ?? ''

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* شريط تنبيه انعدام تسجيل الدخول */}
      <div className="bg-[#253765] text-white px-4 sm:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-amber-300 shrink-0" />
          <span className="font-bold">لا يوجد تسجيل دخول بعد:</span>
          <span className="text-slate-200 hidden md:inline">
            محوّل التاجر تبديل عرض فقط، وليس حماية أمنية.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 font-bold transition whitespace-nowrap"
          >
            لوحة المالك
          </Link>
          {merchants.length > 0 && <MerchantSwitcher merchants={merchants} activeId={activeId} />}
        </div>
      </div>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-8 py-8">
        <div className="mb-7">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#253765] transition mb-2"
          >
            <ArrowLeft size={14} />
            الصفحة الرئيسية
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0F172A] tracking-tight">
            {ent ? `مساحة ${ent.merchant.name}` : 'مساحة التاجر'}
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            باقتك، استهلاكك، وما تفتحه لك من إمكانات المنصة
          </p>
        </div>

        {loadError && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>تعذّر تحميل بيانات الاشتراك: {loadError}</span>
          </div>
        )}

        {!loadError && merchants.length === 0 && (
          <div className="p-8 rounded-2xl bg-white border border-[#E2E8F0] text-center">
            <Users size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-[#0F172A]">لا يوجد تاجر مسجّل بعد</p>
            <p className="text-xs text-[#64748B] mt-1">أضِف تاجراً من لوحة الإدارة ليظهر هنا.</p>
          </div>
        )}

        {!loadError && merchants.length > 0 && !ent && (
          <div className="p-8 rounded-2xl bg-white border border-amber-200 bg-amber-50/40 text-center">
            <AlertCircle size={28} className="mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-bold text-[#0F172A]">لا يوجد اشتراك فعّال لهذا التاجر</p>
            <p className="text-xs text-[#64748B] mt-1 mb-4">
              اختر باقة لتفعيل الموظف الذكي والجسر اللوجستي.
            </p>
            <Link
              href="/#pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs transition"
            >
              <span>استعراض الباقات</span>
              <ArrowLeft size={15} />
            </Link>
          </div>
        )}

        {ent && <Workspace ent={ent} />}
      </main>
    </div>
  )
}
