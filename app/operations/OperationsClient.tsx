'use client'

/**
 * لوحة تحكم منصة "برق" — النسخة الإدارية الفاخرة بالأوف وايت
 * -------------------------------------------------------------------------------
 * المسار: app/operations/page.tsx
 *
 * الميزات:
 * 1. الواجهة ثلاثية اللغة (عربية · کوردی · English)، والأرقام تتبع لغة العرض
 *    (٠١٢٣ في العربية والكردية، 0123 في الإنجليزية) عبر lib/formatters.
 * 2. قسم "الإدارة" الشامل مع إدارة حسابات واشتراكات التجار وحسابات المروجين.
 * 3. نظام تخصيص الصلاحيات (التاجر يرى فقط طلباته ومحادثاته وحملاته الخاصة).
 * 4. تكامل بوابات الدفع الإلكترونية العراقية (Zain Cash و Qi Card).
 * 5. واجهة أوف وايت فاخرة (#F8F9FA) مع أزرار أزرق ملكي (#253765).
 *
 * ⚠️ الملصق الحراري المطبوع (handlePrintLabel) عربي دائماً بصرف النظر عن لغة
 * الواجهة: يقرأه المندوب والزبون في العراق، لا من فتح اللوحة — نفس مبدأ
 * STATUS_LABELS في lib/shipments.ts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Printer,
  Search,
  Store,
  MessageCircle,
  Plus,
  X,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Key,
  Copy,
  Check,
  Package,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Truck,
  Megaphone,
  Sliders,
  Play,
  Pause,
  DollarSign,
  Lock,
  ShieldAlert,
  Award
} from 'lucide-react'
import {
  toArabicDigits,
  formatArabicCurrency,
  formatArabicPhone,
  localizeDigits,
  formatNumberFor,
} from '@/lib/formatters'
import { orderDisplayName, orderDisplayPhone, type ConfirmedOrder } from '@/lib/orders'
import type { ShipmentStatus } from '@/lib/shipments'
import NewOrderBooking from '@/components/NewOrderBooking'
import { fill, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'

// ---------- أنواع البيانات ----------

/**
 * التاجر كما يصل من /api/merchants — جدول merchants الحقيقي مُثرى بباقته
 * الفعّالة وعدد شحناته. الحقول التي لم يُدخلها التاجر بعد تصل null ولا
 * تُستبدل بقيم افتراضية: رقم مُخترع في عمولة أو رصيد قرار مالي خاطئ.
 */
export interface Merchant {
  id: string
  name: string
  owner_name: string | null
  phone: string | null
  city: string | null
  /** اسم الباقة الفعّالة (Spark…Storm)، أو null إن لم يشترك بعد. */
  plan: string | null
  /** رمز حالة الاشتراك الخام (trialing/active/past_due/canceled)، أو null إن لم يوجد اشتراك فعّال. تُترجَم عند العرض عبر t.subscriptionStatus. */
  subscription_status: string | null
  api_connected: boolean
  monthly_fee: number | null
  commission_rate: number | null
  api_key: string | null
  webhook_url: string | null
  orders_count: number
  balance: number
}

/** المروّج كما يصل من /api/marketers — جدول public.marketers الحقيقي. */
export interface Marketer {
  id: string
  name: string
  agency_name: string | null
  email: string | null
  phone: string | null
  /** رمز الحالة الخام (active/suspended) — يُترجَم عند العرض عبر t.marketerStatus. */
  status: string
  /** التجار المسندون — من جدول marketer_merchants لا مصفوفة أسماء. */
  assigned_merchants: { id: string; name: string }[]
  active_campaigns_count: number
  total_ad_budget_managed: number
  commission_rate: number | null
  created_at: string
}

export type AdPlatform = 'instagram' | 'facebook' | 'tiktok' | 'snapchat' | 'google'

/** الحملة كما تصل من /api/campaigns — جدول public.ad_campaigns الحقيقي. */
export interface AdCampaign {
  id: string
  name: string
  merchant_id: string
  merchant_name: string | null
  marketer_id: string | null
  marketer_name: string | null
  platform: AdPlatform
  /** رمز الحالة الخام (active/completed/under_review/paused) — يُترجَم عند العرض عبر t.campaignStatus. */
  status: string
  budget_total: number
  budget_spent: number
  daily_budget: number
  attributed_revenue: number
  reach: number
  impressions: number
  clicks: number
  conversions: number
  /** عمود محسوب في قاعدة البيانات = الإيراد ÷ الإنفاق. null حين لا إنفاق. */
  roas: number | null
  start_date: string | null
  end_date: string | null
  target_audience: string | null
  ad_headline: string | null
  marketer_notes: string | null
}

type MainNavView = 'orders' | 'booking' | 'whatsapp' | 'instagram' | 'messenger' | 'admin' | 'campaigns'
type AdminSubTab = 'merchants' | 'marketers' | 'permissions'
type UserRole = 'super_admin' | 'merchant'
type TimeRange = 'today' | 'week' | 'month' | 'all'

type OpsCopy = Dictionary['app']

/** «الكل» كان نصاً عربياً يُقارَن به منطق التصفية — فيتعطّل بمجرد ترجمته.
 *  صار رمزاً لا لغة له، والنصّ المعروض يأتي من القاموس (t.common.all). */
const ALL = 'ALL' as const

// ---------- مكونات الشارات ----------

type BadgeTone = 'positive' | 'negative' | 'info' | 'warning' | 'neutral'

const TONE_STYLES: Record<BadgeTone, string> = {
  positive: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  negative: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
}

/** شارة حالة عامة — النغمة (tone) رمز لغوي محايد، فلا تنكسر ألوانها حين تُترجَم التسمية المعروضة. */
function Badge({ tone, label }: { tone: BadgeTone; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${TONE_STYLES[tone]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {label}
    </span>
  )
}

const SUBSCRIPTION_TONE: Record<string, BadgeTone> = {
  trialing: 'info',
  active: 'positive',
  past_due: 'warning',
  canceled: 'negative',
}
const CAMPAIGN_TONE: Record<string, BadgeTone> = {
  active: 'positive',
  completed: 'info',
  under_review: 'warning',
  paused: 'negative',
}
const MARKETER_TONE: Record<string, BadgeTone> = {
  active: 'positive',
  suspended: 'negative',
}

function subscriptionBadgeProps(status: string | null, t: OpsCopy): { tone: BadgeTone; label: string } {
  if (!status) return { tone: 'neutral', label: t.operations.merchantsTable.noSubscription }
  return { tone: SUBSCRIPTION_TONE[status] ?? 'neutral', label: (t.subscriptionStatus as Record<string, string>)[status] ?? status }
}
function campaignBadgeProps(status: string, t: OpsCopy): { tone: BadgeTone; label: string } {
  return { tone: CAMPAIGN_TONE[status] ?? 'neutral', label: (t.campaignStatus as Record<string, string>)[status] ?? status }
}
function marketerBadgeProps(status: string, t: OpsCopy): { tone: BadgeTone; label: string } {
  return { tone: MARKETER_TONE[status] ?? 'neutral', label: (t.marketerStatus as Record<string, string>)[status] ?? status }
}

function PlatformBadge({ platform }: { platform: AdPlatform }) {
  // أسماء منصات الإعلانات علامات تجارية — لا تُترجَم، كما في بقية المنصة.
  const styles: Record<AdPlatform, { name: string; bg: string; text: string; border: string }> = {
    instagram: { name: 'Instagram Ads', bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
    tiktok: { name: 'TikTok Ads', bg: 'bg-slate-900', text: 'text-white', border: 'border-slate-800' },
    facebook: { name: 'Meta / Facebook', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    snapchat: { name: 'Snapchat Ads', bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-300' },
    google: { name: 'Google Ads', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' }
  }

  const p = styles[platform] || { name: platform, bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' }

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${p.bg} ${p.text} ${p.border}`}>
      {p.name}
    </span>
  )
}

// حالات الشحنة "النشطة" (لم تصل بعد لحالة نهائية) — تُستخدم في بطاقة
// "الشحنات النشطة" وفي مرشّح جدول الطلبات.
const ACTIVE_SHIPMENT_STATUSES = new Set<ShipmentStatus>([
  'ORDER_RECEIVED', 'PICKED_UP_SAME_DAY', 'IN_TRANSIT_HUB', 'OUT_FOR_DELIVERY', 'POSTPONED'
])
const DELIVERED_SHIPMENT_STATUSES = new Set<ShipmentStatus>(['DELIVERED', 'SETTLED_FINANCIALLY'])

type OrderStageKey = 'CANCELLED' | 'AWAITING_SHIPMENT' | 'IN_TRANSIT' | 'DELIVERED'

const ORDER_STAGE_TONE: Record<OrderStageKey, BadgeTone> = {
  CANCELLED: 'negative',
  DELIVERED: 'positive',
  IN_TRANSIT: 'info',
  AWAITING_SHIPMENT: 'warning',
}

/** تسميات المرحلة للملصق المطبوع فقط — عربية ثابتة بصرف النظر عن لغة الواجهة. */
const PRINT_STAGE_LABELS: Record<OrderStageKey, string> = {
  CANCELLED: 'ملغي',
  AWAITING_SHIPMENT: 'بانتظار الإرسال للشحن',
  IN_TRANSIT: 'قيد الشحن',
  DELIVERED: 'تم التسليم',
}

function deriveOrderStageKey(order: ConfirmedOrder): OrderStageKey {
  if (order.current_state === 'cancelled') return 'CANCELLED'
  if (!order.shipment) return 'AWAITING_SHIPMENT'
  const status = order.shipment.status as ShipmentStatus
  return DELIVERED_SHIPMENT_STATUSES.has(status) ? 'DELIVERED' : 'IN_TRANSIT'
}

/**
 * يشتق مرحلة الطلب من current_state (orders) وحالة الشحنة المرتبطة (shipments) إن وُجدت.
 * التسمية المعروضة على الشاشة تتبع لغة الواجهة: عامة (ملغي/بانتظار الشحن) من
 * قاموس العمليات، أو دقيقة (STATUS_LABELS المترجَمة) من t.shipmentStatus حين
 * تكون الشحنة قيد الشحن أو مُسلَّمة.
 */
function deriveOrderStage(order: ConfirmedOrder, t: OpsCopy): { key: OrderStageKey; label: string } {
  const key = deriveOrderStageKey(order)
  if (key === 'CANCELLED') return { key, label: t.operations.orderStage.cancelled }
  if (key === 'AWAITING_SHIPMENT') return { key, label: t.operations.orderStage.awaitingShipment }
  const status = order.shipment!.status as ShipmentStatus
  return { key, label: t.shipmentStatus[status] ?? status }
}

function OrderStageBadge({ order, t }: { order: ConfirmedOrder; t: OpsCopy }) {
  const stage = deriveOrderStage(order, t)
  return <Badge tone={ORDER_STAGE_TONE[stage.key]} label={stage.label} />
}

// ---------- المكون الرئيسي للوحة العمليات والإدارة ----------

export default function OperationsClient({
  locale,
  currency,
  t,
}: {
  locale: Locale
  currency: string
  /** ⚠️ خاصية لا استيراد: مكوّن عميل، والقاموس كله لا يعبر إلى المتصفّح. */
  t: OpsCopy
}) {
  const o = t.operations
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('super_admin')
  const [activeMerchantName, setActiveMerchantName] = useState<string>('متجر دجلة')

  // التبويب الرئيسي
  const [view, setView] = useState<MainNavView>('orders')
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('merchants')
  const [timeRange, setTimeRange] = useState<TimeRange>('today')

  // البيانات
  const [orders, setOrders] = useState<ConfirmedOrder[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [dispatchingOrderId, setDispatchingOrderId] = useState<number | null>(null)
  const [merchants, setMerchants] = useState<Merchant[]>([])
  const [merchantsLoading, setMerchantsLoading] = useState(true)
  const [merchantsError, setMerchantsError] = useState<string | null>(null)
  const [marketers, setMarketers] = useState<Marketer[]>([])
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([])
  const [promoLoading, setPromoLoading] = useState(true)
  const [promoError, setPromoError] = useState<string | null>(null)

  // التصفية والبحث
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<typeof ALL | OrderStageKey>(ALL)
  // تصفية الحملات حسب المنصة: القيمة تُقرأ في الفلترة أدناه، لكن لا يوجد
  // عنصر واجهة يغيّرها بعد — فهي عملياً معطَّلة على "الكل". يُضاف المُبدِّل
  // عند بناء قسم الحملات الكامل.
  const [platformFilter] = useState<typeof ALL | AdPlatform>(ALL)

  // النوافذ المنبثقة
  const [selectedOrder, setSelectedOrder] = useState<ConfirmedOrder | null>(null)
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null)
  const [newOrderModal, setNewOrderModal] = useState(false)
  const [newMerchantModal, setNewMerchantModal] = useState(false)
  const [newMarketerModal, setNewMarketerModal] = useState(false)
  const [newCampaignModal, setNewCampaignModal] = useState(false)

  // التنبيهات
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ---------- تنسيق الأرقام بلغة الواجهة (لا عربية ثابتة) ----------
  const num = (value: number | null | undefined) => formatNumberFor(locale, value)
  const digits = (value: string | number | null | undefined) => localizeDigits(value, locale)
  const money = (value: number | null | undefined) => `${formatNumberFor(locale, value)} ${currency}`
  const percent = (value: number | string | null | undefined) => `${localizeDigits(value ?? 0, locale)}%`
  const timeLocale = locale === 'en' ? 'en-US' : 'ar-IQ'

  // تحميل الطلبات الحية من public.orders عبر Supabase (لا بيانات وهمية)
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await fetch('/api/orders/dashboard', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || o.errors.loadOrdersFailed)
      setOrders(json.orders as ConfirmedOrder[])
      setOrdersError(null)
    } catch (err: unknown) {
      setOrdersError(err instanceof Error ? err.message : o.errors.loadOrdersFailed)
    } finally {
      setOrdersLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // الاستدعاء داخل دالة غير متزامنة لا في جسم الـ effect مباشرة:
  // setState متزامن هناك يُطلق دورات تصيير متتالية.
  useEffect(() => {
    void (async () => {
      await loadOrders()
    })()
  }, [loadOrders])

  // التجار الحقيقيون من public.merchants مع باقتهم الفعّالة (لا بيانات وهمية)
  const loadMerchants = useCallback(async () => {
    setMerchantsLoading(true)
    try {
      const res = await fetch('/api/merchants', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || o.errors.loadMerchantsFailed)

      const rows = json.merchants as {
        id: string
        name: string
        owner_name: string | null
        phone: string | null
        city: string | null
        status: string
        balance_iqd: number
        commission_rate: number | null
        api_key: string | null
        webhook_url: string | null
        api_connected: boolean
        plan_name: string | null
        subscription_status: string | null
        monthly_fee_iqd: number | null
        orders_count: number
      }[]

      setMerchants(
        rows.map((m) => ({
          id: m.id,
          name: m.name,
          owner_name: m.owner_name,
          phone: m.phone,
          city: m.city,
          plan: m.plan_name,
          // الرمز الخام يُحفَظ كما وصل — يُترجَم عند العرض حسب لغة الواجهة
          subscription_status: m.subscription_status,
          api_connected: m.api_connected,
          monthly_fee: m.monthly_fee_iqd,
          commission_rate: m.commission_rate,
          api_key: m.api_key,
          webhook_url: m.webhook_url,
          orders_count: m.orders_count,
          balance: m.balance_iqd,
        }))
      )
      setMerchantsError(null)
    } catch (err: unknown) {
      setMerchantsError(err instanceof Error ? err.message : o.errors.loadMerchantsFailed)
    } finally {
      setMerchantsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void (async () => {
      await loadMerchants()
    })()
  }, [loadMerchants])

  // المروّجون والحملات من Supabase (لا بيانات وهمية)
  const loadPromotion = useCallback(async () => {
    setPromoLoading(true)
    try {
      const [mRes, cRes] = await Promise.all([
        fetch('/api/marketers', { cache: 'no-store' }),
        fetch('/api/campaigns', { cache: 'no-store' }),
      ])
      const [mJson, cJson] = await Promise.all([mRes.json(), cRes.json()])

      if (!mRes.ok || !mJson.success) throw new Error(mJson.error || o.errors.loadPromotionFailed)
      if (!cRes.ok || !cJson.success) throw new Error(cJson.error || o.errors.loadPromotionFailed)

      // الرموز الخام تُحفَظ كما وصلت — تُترجَم عند العرض حسب لغة الواجهة
      setMarketers(mJson.marketers as Marketer[])

      setCampaigns(
        (
          cJson.campaigns as {
            id: string
            name: string
            merchant_id: string
            merchant_name: string | null
            marketer_id: string | null
            marketer_name: string | null
            platform: AdPlatform
            status: string
            budget_total_iqd: number
            budget_spent_iqd: number
            daily_budget_iqd: number
            attributed_revenue_iqd: number
            reach: number
            impressions: number
            clicks: number
            conversions: number
            roas: number | null
            start_date: string | null
            end_date: string | null
            target_audience: string | null
            ad_headline: string | null
            marketer_notes: string | null
          }[]
        ).map((c) => ({
          id: c.id,
          name: c.name,
          merchant_id: c.merchant_id,
          merchant_name: c.merchant_name,
          marketer_id: c.marketer_id,
          marketer_name: c.marketer_name,
          platform: c.platform,
          status: c.status,
          budget_total: c.budget_total_iqd,
          budget_spent: c.budget_spent_iqd,
          daily_budget: c.daily_budget_iqd,
          attributed_revenue: c.attributed_revenue_iqd,
          reach: c.reach,
          impressions: c.impressions,
          clicks: c.clicks,
          conversions: c.conversions,
          roas: c.roas,
          start_date: c.start_date,
          end_date: c.end_date,
          target_audience: c.target_audience,
          ad_headline: c.ad_headline,
          marketer_notes: c.marketer_notes,
        }))
      )
      setPromoError(null)
    } catch (err: unknown) {
      setPromoError(err instanceof Error ? err.message : o.errors.loadPromotionFailed)
    } finally {
      setPromoLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void (async () => {
      await loadPromotion()
    })()
  }, [loadPromotion])

  // عدد المحادثات الحية الحقيقي لكل قناة — من Supabase عبر /api/conversations
  // (لا بيانات وهمية: اللوحة الجانبية هنا رابط مختصر فقط، والعرض الكامل في /operations/chats)
  const [liveChatCounts, setLiveChatCounts] = useState<{
    whatsapp: number
    instagram: number
    messenger: number
    total: number
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/conversations', { cache: 'no-store' })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !json?.success) return
        const list = (json.conversations || []) as { platform?: string }[]
        const byPlatform = (p: string) =>
          list.filter((c) => (c.platform || 'whatsapp').toLowerCase() === p).length
        setLiveChatCounts({
          whatsapp: byPlatform('whatsapp'),
          instagram: byPlatform('instagram'),
          messenger: byPlatform('messenger'),
          total: list.length,
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // ملاحظة: عمود merchant_id لم يُضَف بعد لجدول orders الحقيقي (انظر تعليق
  // /api/orders/[id]/dispatch)، فلا يمكن تصفية الطلبات الحقيقية حسب التاجر
  // حالياً — تُعرض جميعها بغض النظر عن الدور المختار في محاكي الصلاحيات.
  const userScopedOrders = orders

  const userScopedCampaigns = useMemo(() => {
    if (currentUserRole === 'merchant') {
      return campaigns.filter((c) => c.merchant_name === activeMerchantName)
    }
    return campaigns
  }, [campaigns, currentUserRole, activeMerchantName])

  // الإحصائيات الحية — محسوبة بالكامل من public.orders + shipments المرتبطة
  const stats = useMemo(() => {
    const nonCancelled = userScopedOrders.filter((o) => o.current_state !== 'cancelled')
    const totalSales = nonCancelled.reduce((sum, o) => sum + (o.grand_total_iqd ?? o.items_total_iqd ?? 0), 0)
    const cancelledCount = userScopedOrders.length - nonCancelled.length
    const pendingDispatchCount = nonCancelled.filter((o) => !o.shipment).length

    const shipmentStatuses = userScopedOrders
      .map((o) => o.shipment?.status)
      .filter((s): s is ShipmentStatus => Boolean(s))
    const activeShipments = shipmentStatuses.filter((s) => ACTIVE_SHIPMENT_STATUSES.has(s)).length
    const deliveredCount = shipmentStatuses.filter((s) => DELIVERED_SHIPMENT_STATUSES.has(s)).length
    const successRate = shipmentStatuses.length > 0 ? ((deliveredCount / shipmentStatuses.length) * 100).toFixed(1) : '0.0'

    const totalAdBudget = userScopedCampaigns.reduce((sum, c) => sum + c.budget_total, 0)
    const totalAdSpent = userScopedCampaigns.reduce((sum, c) => sum + c.budget_spent, 0)
    const totalReach = userScopedCampaigns.reduce((sum, c) => sum + c.reach, 0)
    const totalAdOrders = userScopedCampaigns.reduce((sum, c) => sum + c.conversions, 0)
    // المتوسط على الحملات التي أنفقت فعلاً فقط: حملة بلا إنفاق ليس عائدها
    // صفراً بل غير معرّف، وإدراجها تسحب المتوسط لأسفل وتضلّل قرار الميزانية.
    // ولا يوجد رقم افتراضي حين لا حملات — null تُعرض شرطة لا عائداً مُخترعاً.
    const scoredCampaigns = userScopedCampaigns.filter((c) => c.roas !== null)
    const avgRoas =
      scoredCampaigns.length > 0
        ? (
            scoredCampaigns.reduce((sum, c) => sum + (c.roas as number), 0) /
            scoredCampaigns.length
          ).toFixed(1)
        : null

    return {
      totalSales,
      cancelledCount,
      pendingDispatchCount,
      activeShipments,
      deliveredCount,
      successRate,
      totalOrders: userScopedOrders.length,
      totalAdBudget,
      totalAdSpent,
      totalReach,
      totalAdOrders,
      avgRoas
    }
  }, [userScopedOrders, userScopedCampaigns])

  // تصفية الطلبات المعروضة
  const filteredOrders = useMemo(() => {
    return userScopedOrders.filter((ord) => {
      const q = (search || '').trim().toLowerCase()
      const matchesSearch =
        !q ||
        orderDisplayName(ord).toLowerCase().includes(q) ||
        String(ord.order_id).includes(q) ||
        orderDisplayPhone(ord).includes(q) ||
        (ord.order_content ?? '').toLowerCase().includes(q)

      const matchesStatus = statusFilter === ALL || deriveOrderStageKey(ord) === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [userScopedOrders, search, statusFilter])

  // تصفية الحملات المعروضة
  const filteredCampaigns = useMemo(() => {
    return userScopedCampaigns.filter((c) => {
      const q = (search || '').trim().toLowerCase()
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.merchant_name || '').toLowerCase().includes(q)
      const matchesPlatform = platformFilter === ALL || c.platform === platformFilter
      return matchesSearch && matchesPlatform
    })
  }, [userScopedCampaigns, search, platformFilter])

  // إرسال طلب مؤكَّد للشحن (ينشئ صف shipments فعلياً عبر Supabase)
  const handleDispatch = async (orderId: number) => {
    setDispatchingOrderId(orderId)
    try {
      const res = await fetch(`/api/orders/${orderId}/dispatch`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || o.errors.dispatchFailed)

      const shipmentRef = { id: json.shipment.id, tracking_number: json.shipment.tracking_number, status: json.shipment.status }
      setOrders((prev) => prev.map((ord) => (ord.order_id === orderId ? { ...ord, shipment: shipmentRef } : ord)))
      setSelectedOrder((prev) => (prev && prev.order_id === orderId ? { ...prev, shipment: shipmentRef } : prev))
      showToast(fill(o.errors.dispatchedToast, { n: digits(orderId), tracking: json.shipment.tracking_number }), 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : o.errors.dispatchFailed, 'error')
    } finally {
      setDispatchingOrderId(null)
    }
  }

  // طباعة البوليصة الحرارية بالأرقام العربية من بيانات الطلب الحقيقية
  // ⚠️ عربية دائماً بصرف النظر عن لغة الواجهة — راجع تعليق ترويسة الملف.
  const handlePrintLabel = (order: ConfirmedOrder) => {
    const w = window.open('', '_blank', 'width=450,height=650')
    if (!w) {
      showToast(o.errors.popupBlocked, 'error')
      return
    }
    const stageLabel = PRINT_STAGE_LABELS[deriveOrderStageKey(order)]
    w.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>بوليصة شحن ${toArabicDigits(order.order_id)}</title>
          <style>
            body { font-family: Tahoma, sans-serif; padding: 15px; color: #111; }
            .ticket { border: 2px solid #222; border-radius: 8px; padding: 15px; max-width: 360px; margin: auto; }
            .brand { font-size: 22px; font-weight: bold; color: #253765; }
            .row { display: flex; justify-content: space-between; margin: 6px 0; border-bottom: 1px dashed #ccc; padding-bottom: 4px; font-size: 13px; }
            .total { font-size: 16px; font-weight: bold; margin-top: 10px; color: #059669; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="ticket">
            <div class="brand">⚡ بـرق للشحن الفوري</div>
            <p>رقم الطلب: ${toArabicDigits(order.order_id)}${order.shipment ? ` | التتبع: ${order.shipment.tracking_number}` : ''}</p>
            <div class="row"><span>الزبون:</span><span>${orderDisplayName(order)} (${formatArabicPhone(orderDisplayPhone(order))})</span></div>
            <div class="row"><span>العنوان:</span><span>${[order.governorate, order.district].filter(Boolean).join(' - ')} - ${toArabicDigits(order.address || '')}</span></div>
            ${
              order.order_content
                ? `<div class="row" style="background:#f4f4f4; padding:4px; font-weight:bold;">
                    <span>محتوى الطلب:</span>
                    <span>${toArabicDigits(order.order_content)}</span>
                  </div>`
                : ''
            }
            <div class="row"><span>حالة الطلب:</span><span>${stageLabel}</span></div>
            <div class="total">الإجمالي: ${formatArabicCurrency(order.grand_total_iqd ?? order.items_total_iqd ?? 0)}</div>
          </div>
        </body>
      </html>
    `)
    w.document.close()
  }

  const stageFilterLabel = (key: typeof ALL | OrderStageKey) => {
    if (key === ALL) return t.common.all
    if (key === 'CANCELLED') return o.orderStage.cancelled
    if (key === 'AWAITING_SHIPMENT') return o.orderStage.awaitingShipment
    if (key === 'IN_TRANSIT') return o.orderStage.inTransit
    return o.orderStage.delivered
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A] flex flex-col font-sans selection:bg-[#253765]/20 selection:text-[#253765]">
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
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <Sparkles size={18} />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 mr-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ===== شريط تحديد الصلاحيات (Role Persona Switcher) ===== */}
      <div className="bg-[#253765] text-white px-4 sm:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs border-b border-[#1D2B50] shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldAlert size={15} className="text-amber-300" />
          <span className="font-bold">{o.roleSwitcher.label}</span>
          <span className="text-slate-200 hidden md:inline">{o.roleSwitcher.hint}</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#1D2B50] p-0.5 rounded-lg border border-white/15">
            <button
              onClick={() => {
                setCurrentUserRole('super_admin')
                showToast(o.roleSwitcher.toastAdmin, 'info')
              }}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 ${
                currentUserRole === 'super_admin' ? 'bg-white text-[#253765] shadow-xs' : 'text-slate-200 hover:text-white'
              }`}
            >
              <Award size={13} />
              <span>{o.roleSwitcher.admin}</span>
            </button>

            <button
              onClick={() => {
                setCurrentUserRole('merchant')
                if (view === 'admin') setView('orders')
                showToast(fill(o.roleSwitcher.toastMerchant, { name: activeMerchantName }), 'info')
              }}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 ${
                currentUserRole === 'merchant' ? 'bg-amber-400 text-slate-900 shadow-xs' : 'text-slate-200 hover:text-white'
              }`}
            >
              <Store size={13} />
              <span>{o.roleSwitcher.merchant}</span>
            </button>
          </div>

          {currentUserRole === 'merchant' && (
            <select
              value={activeMerchantName}
              onChange={(e) => setActiveMerchantName(e.target.value)}
              className="bg-[#1D2B50] border border-white/20 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-bold outline-none"
            >
              {merchants.map((m) => (
                <option key={m.id} value={m.name} className="bg-slate-900 text-white">
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-1">
        {/* ===== الشريط الجانبي الفاخر (Sidebar) ===== */}
        <aside className="hidden lg:flex w-64 flex-col justify-between border-l border-[#E2E8F0] bg-[#FFFFFF] p-5 shrink-0 shadow-sm">
          <div>
            {/* الشعار */}
            <div className="flex items-center gap-3 mb-7 px-2">
              <div className="w-10 h-10 rounded-xl bg-[#253765] flex items-center justify-center text-white font-black text-xl shadow-md">
                ⚡
              </div>
              <div>
                <p className="font-bold text-base text-[#253765] tracking-tight">بـرق</p>
                <p className="text-[11px] text-[#64748B]">
                  {currentUserRole === 'merchant' ? fill(o.sidebar.subMerchant, { name: activeMerchantName }) : o.sidebar.subAdmin}
                </p>
              </div>
            </div>

            {/* أزرار التنقل الرئيسية */}
            <nav className="space-y-1.5">
              {/* 1. الطلبات والشحنات */}
              <button
                onClick={() => setView('orders')}
                className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                  view === 'orders'
                    ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20'
                    : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package size={17} />
                  <span>{currentUserRole === 'merchant' ? o.sidebar.navOrdersMerchant : o.sidebar.navOrdersAdmin}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === 'orders' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {digits(userScopedOrders.length)}
                </span>
              </button>

              {/* 2. الإدارة */}
              {currentUserRole === 'super_admin' ? (
                <button
                  onClick={() => setView('admin')}
                  className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                    view === 'admin'
                      ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20'
                      : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck size={17} />
                    <span>{o.sidebar.navAdmin}</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === 'admin' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {digits(merchants.length + marketers.length)}
                  </span>
                </button>
              ) : (
                <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
                  <Lock size={14} className="text-slate-400" />
                  <span>{o.sidebar.navAdminLocked}</span>
                </div>
              )}

              {/* 3. الحملات الإعلانية */}
              <button
                onClick={() => setView('campaigns')}
                className={`w-full flex items-center justify-between py-3 px-3.5 rounded-xl text-xs font-bold transition-all ${
                  view === 'campaigns'
                    ? 'bg-[#253765] text-white shadow-md shadow-[#253765]/20'
                    : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Megaphone size={17} />
                  <span>{currentUserRole === 'merchant' ? o.sidebar.navCampaignsMerchant : o.sidebar.navCampaignsAdmin}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === 'campaigns' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {digits(userScopedCampaigns.length)}
                </span>
              </button>

              {/* 4. لوحات محادثات التطبيقات الثلاثة المستقلة (عزل تام دون تداخل) */}
              <div className="pt-2 pb-1">
                <p className="text-[10px] font-bold text-[#64748B] px-3 mb-1.5 uppercase tracking-wider">
                  {o.sidebar.independentChatsTitle}
                </p>
                <div className="space-y-1">
                  {/* لوحة واتساب — رابط مباشر لتبويب واتساب الحقيقي في /operations/chats */}
                  <Link
                    href="/operations/chats?platform=whatsapp"
                    className="w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-bold transition-all text-slate-600 hover:bg-[#25D366]/10 hover:text-[#15803d]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#25D366]" />
                      <span>{o.sidebar.chatWhatsapp}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {liveChatCounts ? digits(liveChatCounts.whatsapp) : '…'}
                    </span>
                  </Link>

                  {/* لوحة إنستغرام — رابط مباشر لتبويب إنستغرام الحقيقي في /operations/chats */}
                  <Link
                    href="/operations/chats?platform=instagram"
                    className="w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-bold transition-all text-slate-600 hover:bg-pink-50 hover:text-pink-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600" />
                      <span>{o.sidebar.chatInstagram}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-800">
                      {liveChatCounts ? digits(liveChatCounts.instagram) : '…'}
                    </span>
                  </Link>

                  {/* لوحة ماسنجر — رابط مباشر لتبويب ماسنجر الحقيقي في /operations/chats */}
                  <Link
                    href="/operations/chats?platform=messenger"
                    className="w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-bold transition-all text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0084FF]" />
                      <span>{o.sidebar.chatMessenger}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {liveChatCounts ? digits(liveChatCounts.messenger) : '…'}
                    </span>
                  </Link>
                </div>
              </div>

              {/* 5. المحادثات الحية الشاملة (محادثات متعددة القنوات) */}
              <Link
                href="/operations/chats"
                className="w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all bg-gradient-to-r from-[#25D366]/10 to-pink-50 text-[#1DA851] hover:from-[#25D366]/20 hover:to-pink-100 border border-[#25D366]/20"
              >
                <div className="flex items-center gap-2.5">
                  <MessageCircle size={16} />
                  <span>{o.sidebar.liveChatsLink}</span>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#253765] text-white font-black">
                  {o.sidebar.liveChatsNew}
                </span>
              </Link>

              {/* 6. لوحة تتبع الشحنات الحقيقية (بمعزل عن الحجز) */}
              <Link
                href="/dashboard"
                className="w-full flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-bold transition-all bg-[#253765]/5 text-[#253765] hover:bg-[#253765]/10 border border-[#253765]/15"
              >
                <div className="flex items-center gap-2.5">
                  <Truck size={16} />
                  <span>{o.sidebar.trackingLink}</span>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#253765] text-white">
                  Tracking
                </span>
              </Link>
            </nav>

            {/* بوابات الدفع المدعومة */}
            <div className="mt-8 pt-6 border-t border-[#E2E8F0]">
              <p className="text-[10px] font-bold text-[#64748B] mb-3 uppercase tracking-wider">
                {o.sidebar.paymentGatewaysTitle}
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-600" />
                    <span className="font-semibold text-slate-800">Zain Cash Iraq</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold">{o.sidebar.gatewayActive}</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    <span className="font-semibold text-slate-800">Qi Card & Master</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold">{o.sidebar.gatewayActive}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{currentUserRole === 'merchant' ? fill(o.sidebar.connectedMerchant, { name: activeMerchantName }) : o.sidebar.connectedAdmin}</span>
            </div>
            <span className="text-[#253765] font-bold">{fill(o.sidebar.version, { n: digits('2.6') })}</span>
          </div>
        </aside>

        {/* ===== مساحة المحتوى الرئيسية ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          {/*
            شريط تنقّل الهاتف — الشريط الجانبي أعلاه مخفي دون lg، فبدونه
            تختفي كل وسائل التنقّل على الهاتف ويعلق المستخدم في تبويب واحد.
          */}
          <nav className="lg:hidden sticky top-0 z-30 bg-white border-b border-[#E2E8F0] overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-1.5 px-3 py-2 w-max">
              {([
                { key: 'orders', label: o.mobileNav.orders },
                ...(currentUserRole === 'super_admin'
                  ? ([{ key: 'admin', label: o.mobileNav.admin }] as { key: MainNavView; label: string }[])
                  : []),
                { key: 'campaigns', label: o.mobileNav.campaigns },
              ] as { key: MainNavView; label: string }[]).map((item) => (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                    view === item.key ? 'bg-[#253765] text-white' : 'text-[#64748B] hover:bg-[#F1F5F9]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
              <span className="w-px h-5 bg-[#E2E8F0] mx-1 shrink-0" />
              {[
                { href: '/operations/chats?platform=whatsapp', label: o.mobileNav.whatsapp },
                { href: '/operations/chats?platform=instagram', label: o.mobileNav.instagram },
                { href: '/operations/chats?platform=messenger', label: o.mobileNav.messenger },
                { href: '/workspace', label: o.mobileNav.myWorkspace },
                { href: '/dashboard', label: o.mobileNav.shipments },
                { href: '/admin', label: o.mobileNav.ownerPanel },
              ].map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-[#253765] bg-[#253765]/5 hover:bg-[#253765]/10 whitespace-nowrap transition"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </nav>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl mx-auto w-full overflow-y-auto">
          {/* الترويسة العليا */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                  {view === 'orders'
                    ? currentUserRole === 'merchant' ? fill(o.header.titleOrdersMerchant, { name: activeMerchantName }) : o.header.titleOrdersAdmin
                    : view === 'admin'
                    ? o.header.titleAdmin
                    : currentUserRole === 'merchant' ? fill(o.header.titleCampaignsMerchant, { name: activeMerchantName }) : o.header.titleCampaignsAdmin}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#253765] text-white shadow-sm">
                  {view === 'orders'
                    ? fill(o.header.badgeShipments, { n: digits(filteredOrders.length) })
                    : view === 'admin'
                    ? fill(o.header.badgeAdmin, { merchants: digits(merchants.length), marketers: digits(marketers.length) })
                    : fill(o.header.badgeCampaigns, { n: digits(filteredCampaigns.length) })}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1">
                {currentUserRole === 'merchant'
                  ? fill(o.header.subtitleMerchant, { name: activeMerchantName })
                  : o.header.subtitleAdmin}
              </p>
            </div>

            {/* الأزرار العلوية */}
            <div className="flex items-center gap-3">
              {view === 'orders' && (
                <button
                  onClick={() => setNewOrderModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-sm transition active:scale-95"
                >
                  <Plus size={16} />
                  <span>{o.header.addOrder}</span>
                </button>
              )}
              {view === 'admin' && currentUserRole === 'super_admin' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNewMerchantModal(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-sm transition"
                  >
                    <Plus size={15} />
                    <span>{o.header.addMerchant}</span>
                  </button>
                  <button
                    onClick={() => setNewMarketerModal(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition"
                  >
                    <Plus size={15} />
                    <span>{o.header.addMarketer}</span>
                  </button>
                </div>
              )}
              {view === 'campaigns' && (
                <button
                  onClick={() => setNewCampaignModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-sm transition active:scale-95"
                >
                  <Plus size={16} />
                  <span>{o.header.addCampaign}</span>
                </button>
              )}
            </div>
          </header>

          {/* ===== لوحة الإحصائيات العلوية ===== */}
          <div className="mb-7 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#253765] flex items-center gap-1.5">
                <TrendingUp size={15} />
                <span>{currentUserRole === 'merchant' ? fill(o.kpi.sectionLabelMerchant, { name: activeMerchantName }) : o.kpi.sectionLabel}</span>
              </p>
              <div className="flex items-center bg-white p-1 rounded-xl border border-[#E2E8F0] text-[11px] shadow-sm">
                {(['today', 'week', 'month', 'all'] as TimeRange[]).map((tr) => (
                  <button
                    key={tr}
                    onClick={() => setTimeRange(tr)}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      timeRange === tr
                        ? 'bg-[#253765] text-white'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {tr === 'today' ? o.timeRange.today : tr === 'week' ? o.timeRange.week : tr === 'month' ? o.timeRange.month : o.timeRange.all}
                  </button>
                ))}
              </div>
            </div>

            {/* بطاقات الإحصاءات — مبنية بالكامل على استعلامات حية من public.orders/shipments */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-[#253765]" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">{o.kpi.totalSales}</p>
                  <DollarSign size={15} className="text-[#253765]" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {ordersLoading ? '…' : money(stats.totalSales)}
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  {fill(o.kpi.totalOrdersCount, { n: digits(stats.totalOrders) })}
                  {stats.cancelledCount > 0 && (
                    <> · <strong className="text-rose-600">{fill(o.kpi.cancelledSuffix, { n: digits(stats.cancelledCount) })}</strong></>
                  )}
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-sky-600" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">{o.kpi.activeShipments}</p>
                  <Truck size={15} className="text-sky-600" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {ordersLoading ? '…' : digits(stats.activeShipments)}{' '}
                  <span className="text-xs font-semibold text-sky-700">{o.kpi.inTransitTag}</span>
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  {o.kpi.successRateLabel} <strong className="text-emerald-700">{percent(stats.successRate)}</strong>
                  {stats.pendingDispatchCount > 0 && (
                    <> · <strong className="text-amber-700">{fill(o.kpi.awaitingDispatchSuffix, { n: digits(stats.pendingDispatchCount) })}</strong></>
                  )}
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-amber-500" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">{o.kpi.roas}</p>
                  <Megaphone size={15} className="text-amber-600" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {stats.avgRoas === null ? (
                    <span className="text-lg text-slate-400">—</span>
                  ) : (
                    <>
                      {digits(stats.avgRoas)}x{' '}
                      <span className="text-xs font-semibold text-emerald-700">{o.kpi.roasRateTag}</span>
                    </>
                  )}
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  {o.kpi.generatedOrdersLabel} <strong className="text-[#0F172A]">{fill(o.kpi.generatedOrdersValue, { n: digits(stats.totalAdOrders) })}</strong>
                </p>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* ===== 1. واجهة الطلبات والشحنات (Orders View) ===== */}
          {/* ========================================================================= */}
          {view === 'orders' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
              <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
                    {([ALL, 'AWAITING_SHIPMENT', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'] as (typeof ALL | OrderStageKey)[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                          statusFilter === st
                            ? 'bg-[#253765] text-white shadow-sm'
                            : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                        }`}
                      >
                        {stageFilterLabel(st)}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-xs border border-[#CBD5E1] rounded-xl bg-white px-3 py-2 focus-within:border-[#253765] transition">
                      <Search size={14} className="text-[#64748B]" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={o.ordersTable.searchPlaceholder}
                        className="bg-transparent outline-none placeholder:text-[#94A3B8] text-[#0F172A] w-48 sm:w-56 text-xs"
                      />
                    </div>
                    <button
                      onClick={() => void loadOrders()}
                      disabled={ordersLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E2E8F0] hover:border-[#253765] disabled:opacity-50 text-slate-600 font-bold text-[11px] transition shrink-0"
                    >
                      <RefreshCw size={12} className={ordersLoading ? 'animate-spin' : ''} />
                      {o.ordersTable.refresh}
                    </button>
                  </div>
                </div>

                {ordersError && (
                  <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 flex items-center justify-between gap-3">
                    <span>{ordersError}</span>
                    <button onClick={() => setOrdersError(null)} className="text-amber-600 hover:text-amber-900 shrink-0">
                      {o.ordersTable.hide}
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                        <th className="p-3.5">{o.ordersTable.colOrder}</th>
                        <th className="p-3.5">{o.ordersTable.colCustomer}</th>
                        <th className="p-3.5">{o.ordersTable.colAmount}</th>
                        <th className="p-3.5">{o.ordersTable.colStatus}</th>
                        <th className="p-3.5 text-center">{o.ordersTable.colActions}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {ordersLoading ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400">
                            <RefreshCw size={20} className="animate-spin inline-block mb-2" />
                            <p className="text-xs font-semibold">{o.ordersTable.loading}</p>
                          </td>
                        </tr>
                      ) : filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">
                            {o.ordersTable.empty}
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((order) => (
                          <tr
                            key={order.order_id}
                            onClick={() => setSelectedOrder(order)}
                            className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                          >
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="font-bold text-[#253765]">#{digits(order.order_id)}</span>
                              <div className="text-[10px] text-[#64748B] mt-0.5">
                                {digits(new Date(order.created_at).toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' }))}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <p className="font-bold text-[#0F172A] text-[13px]">{orderDisplayName(order)}</p>
                              <p className="text-[11px] text-[#64748B]">
                                {[order.governorate, order.district].filter(Boolean).join(' · ') || '—'} • {digits(orderDisplayPhone(order))}
                              </p>
                            </td>
                            <td className="p-3.5 whitespace-nowrap font-bold text-emerald-700 text-sm">
                              {money(order.grand_total_iqd ?? order.items_total_iqd ?? 0)}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <OrderStageBadge order={order} t={t} />
                            </td>
                            <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                {!order.shipment && order.current_state === 'confirmed' && (
                                  <button
                                    onClick={() => void handleDispatch(order.order_id)}
                                    disabled={dispatchingOrderId === order.order_id}
                                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold transition shadow-sm"
                                  >
                                    {dispatchingOrderId === order.order_id ? (
                                      <RefreshCw size={12} className="animate-spin" />
                                    ) : (
                                      <Truck size={12} />
                                    )}
                                    <span>{o.ordersTable.sendToShipping}</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handlePrintLabel(order)}
                                  className="inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                                >
                                  <Printer size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* قسم المحادثات الجانبي — ملخص حقيقي من Supabase، والعرض الكامل والرد في /operations/chats */}
              <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden shadow-sm flex flex-col">
                <div className="p-3.5 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={17} className="text-[#253765]" />
                    <p className="text-sm font-bold text-[#0F172A]">
                      {currentUserRole === 'merchant' ? fill(o.chatsSidebar.titleMerchant, { name: activeMerchantName }) : o.chatsSidebar.titleAdmin}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#253765] text-white font-bold">
                    {fill(o.chatsSidebar.totalBadge, { n: liveChatCounts ? digits(liveChatCounts.total) : '…' })}
                  </span>
                </div>

                <div className="p-3.5 space-y-2">
                  <Link
                    href="/operations/chats?platform=whatsapp"
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-[#E2E8F0] hover:border-[#25D366]/40 hover:bg-[#25D366]/5 transition text-xs font-bold text-slate-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#25D366]" />
                      <span>{o.chatsSidebar.whatsapp}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      {liveChatCounts ? digits(liveChatCounts.whatsapp) : '…'}
                    </span>
                  </Link>

                  <Link
                    href="/operations/chats?platform=instagram"
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-[#E2E8F0] hover:border-pink-300 hover:bg-pink-50 transition text-xs font-bold text-slate-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-600" />
                      <span>{o.chatsSidebar.instagram}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-800">
                      {liveChatCounts ? digits(liveChatCounts.instagram) : '…'}
                    </span>
                  </Link>

                  <Link
                    href="/operations/chats?platform=messenger"
                    className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-[#E2E8F0] hover:border-blue-300 hover:bg-blue-50 transition text-xs font-bold text-slate-700"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0084FF]" />
                      <span>{o.chatsSidebar.messenger}</span>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      {liveChatCounts ? digits(liveChatCounts.messenger) : '…'}
                    </span>
                  </Link>

                  <Link
                    href="/operations/chats"
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white text-xs font-bold transition mt-1"
                  >
                    <MessageCircle size={13} />
                    <span>{o.chatsSidebar.openLive}</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* ===== 2. واجهة الإدارة الشاملة (Administration View) ===== */}
          {/* ========================================================================= */}
          {view === 'admin' && currentUserRole === 'super_admin' && (
            <div className="space-y-6">
              {/* تبويبات الإدارة الداخلية */}
              <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0] flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAdminSubTab('merchants')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                      adminSubTab === 'merchants'
                        ? 'bg-[#253765] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Store size={15} />
                    <span>{fill(o.adminTabs.merchantsTab, { n: digits(merchants.length) })}</span>
                  </button>

                  <button
                    onClick={() => setAdminSubTab('marketers')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                      adminSubTab === 'marketers'
                        ? 'bg-[#253765] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Megaphone size={15} />
                    <span>{fill(o.adminTabs.marketersTab, { n: digits(marketers.length) })}</span>
                  </button>

                  <button
                    onClick={() => setAdminSubTab('permissions')}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                      adminSubTab === 'permissions'
                        ? 'bg-[#253765] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Key size={15} />
                    <span>{o.adminTabs.permissionsTab}</span>
                  </button>
                </div>

                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full font-bold">
                  {o.adminTabs.fullAccessBadge}
                </span>
              </div>

              {/* Sub-tab 1: إدارة التجار والاشتراكات */}
              {adminSubTab === 'merchants' && (
                <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between">
                    <p className="text-sm font-bold text-[#0F172A]">{o.merchantsTable.title}</p>
                    <button
                      onClick={() => setNewMerchantModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#253765] text-white font-bold text-xs"
                    >
                      <Plus size={14} />
                      <span>{o.merchantsTable.addMerchant}</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                          <th className="p-3.5">{o.merchantsTable.colStore}</th>
                          <th className="p-3.5">{o.merchantsTable.colCityOwner}</th>
                          <th className="p-3.5">{o.merchantsTable.colPlan}</th>
                          <th className="p-3.5">{o.merchantsTable.colSubscription}</th>
                          <th className="p-3.5">{o.merchantsTable.colCommission}</th>
                          <th className="p-3.5">{o.merchantsTable.colBalance}</th>
                          <th className="p-3.5 text-left">{o.merchantsTable.colActions}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {merchantsLoading && (
                          <tr>
                            <td colSpan={7} className="p-10 text-center text-[#64748B]">
                              <RefreshCw size={16} className="animate-spin inline-block ml-2" />
                              {o.merchantsTable.loading}
                            </td>
                          </tr>
                        )}
                        {!merchantsLoading && merchantsError && (
                          <tr>
                            <td colSpan={7} className="p-10 text-center text-rose-700 font-semibold">
                              {fill(o.merchantsTable.loadError, { error: merchantsError })}
                            </td>
                          </tr>
                        )}
                        {!merchantsLoading && !merchantsError && merchants.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-10 text-center text-[#64748B]">
                              {o.merchantsTable.empty}
                            </td>
                          </tr>
                        )}
                        {merchants.map((m) => {
                          const sub = subscriptionBadgeProps(m.subscription_status, t)
                          return (
                          <tr key={m.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-3.5">
                              <p className="font-bold text-[13px] text-[#0F172A]">{m.name}</p>
                              <p className="text-[10px] text-[#64748B] font-mono">
                                {m.id.slice(0, 8)}
                              </p>
                            </td>
                            <td className="p-3.5">
                              <p className="font-semibold text-slate-800">
                                {m.city ?? <span className="text-slate-400 font-normal">{o.merchantsTable.cityUnset}</span>}
                              </p>
                              <p className="text-[11px] text-[#64748B]">
                                {m.owner_name ?? o.merchantsTable.ownerUnset}
                                {m.phone ? ` • ${digits(m.phone)}` : ''}
                              </p>
                            </td>
                            <td className="p-3.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                                  m.plan
                                    ? 'bg-[#253765]/10 text-[#253765]'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >
                                {m.plan ?? o.merchantsTable.noPlan}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <Badge tone={sub.tone} label={sub.label} />
                            </td>
                            {/* العمولة تُعرض فارغة إن لم تُتفق — رقم افتراضي هنا التزام مالي مُخترع */}
                            <td className="p-3.5 font-bold text-[#253765]">
                              {m.commission_rate === null ? (
                                <span className="text-slate-400 font-normal">{o.merchantsTable.commissionUnset}</span>
                              ) : (
                                percent(m.commission_rate)
                              )}
                            </td>
                            <td className="p-3.5 font-bold text-emerald-700 text-sm">
                              {money(m.balance)}
                            </td>
                            <td className="p-3.5 text-left">
                              <button
                                onClick={() => setSelectedMerchant(m)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white shadow-sm transition"
                              >
                                <span>{o.merchantsTable.controlSubscription}</span>
                                <Sliders size={13} />
                              </button>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-tab 2: إدارة المروجين والحملات الإعلانية */}
              {adminSubTab === 'marketers' && (
                <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">{o.marketersTable.title}</p>
                      <p className="text-xs text-slate-500">{o.marketersTable.subtitle}</p>
                    </div>
                    <button
                      onClick={() => setNewMarketerModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#253765] text-white font-bold text-xs"
                    >
                      <Plus size={14} />
                      <span>{o.marketersTable.addMarketer}</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                          <th className="p-3.5">{o.marketersTable.colMarketer}</th>
                          <th className="p-3.5">{o.marketersTable.colContact}</th>
                          <th className="p-3.5">{o.marketersTable.colMerchants}</th>
                          <th className="p-3.5">{o.marketersTable.colCampaigns}</th>
                          <th className="p-3.5">{o.marketersTable.colBudgets}</th>
                          <th className="p-3.5">{o.marketersTable.colCommission}</th>
                          <th className="p-3.5 text-left">{o.marketersTable.colStatus}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {promoLoading && (
                          <tr>
                            <td colSpan={6} className="p-10 text-center text-[#64748B]">
                              <RefreshCw size={16} className="animate-spin inline-block ml-2" />
                              {o.marketersTable.loading}
                            </td>
                          </tr>
                        )}
                        {!promoLoading && promoError && (
                          <tr>
                            <td colSpan={6} className="p-10 text-center text-rose-700 font-semibold">
                              {promoError}
                            </td>
                          </tr>
                        )}
                        {!promoLoading && !promoError && marketers.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-10 text-center text-[#64748B]">
                              {o.marketersTable.empty}
                            </td>
                          </tr>
                        )}
                        {marketers.map((mkt) => {
                          const mktBadge = marketerBadgeProps(mkt.status, t)
                          return (
                          <tr key={mkt.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-3.5">
                              <p className="font-bold text-[13px] text-[#0F172A]">{mkt.name}</p>
                              <p className="text-[11px] text-[#64748B]">{mkt.agency_name}</p>
                            </td>
                            <td className="p-3.5 text-slate-700">
                              <p>{digits(mkt.phone)}</p>
                              <p className="text-[10px] text-slate-400">{mkt.email}</p>
                            </td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1">
                                {mkt.assigned_merchants.length === 0 && (
                                  <span className="text-[10px] text-slate-400">{o.marketersTable.noAssignedMerchants}</span>
                                )}
                                {mkt.assigned_merchants.map((m) => (
                                  <span key={m.id} className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold">
                                    {m.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3.5 font-bold text-slate-800">
                              {digits(mkt.active_campaigns_count)} {o.marketersTable.campaignsCountSuffix}
                            </td>
                            <td className="p-3.5 font-bold text-emerald-700">
                              {money(mkt.total_ad_budget_managed)}
                            </td>
                            <td className="p-3.5 font-bold text-[#253765]">
                              {percent(mkt.commission_rate)}
                            </td>
                            <td className="p-3.5 text-left">
                              <Badge tone={mktBadge.tone} label={mktBadge.label} />
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sub-tab 3: الصلاحيات والربط البرمجي */}
              {adminSubTab === 'permissions' && (
                <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] p-6 shadow-sm space-y-4 text-xs">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-[#253765] text-white flex items-center justify-center">
                      <Key size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#0F172A]">{o.permissions.title}</h3>
                      <p className="text-slate-500">{o.permissions.subtitle}</p>
                    </div>
                  </div>

                  {/*
                    ⚠️ أُزيلت من هنا مؤشّرات "● متصل ويعمل بنسبة ٩٩.٩٪" و"● متصل
                    مع أنظمة المناديب": لا يوجد في المنصة أي قياس اتصال أو زمن
                    تشغيل يغذّيها — كانت نصاً ثابتاً يوحي بمراقبة غير قائمة.
                    رقم جاهزية مُختلق في لوحة تشغيل أسوأ من غياب الرقم، لأنه
                    يمنع موظف العمليات من الشك حين يتعطّل المسار فعلاً.
                    يعود المؤشّر يوم تُبنى مراقبة حقيقية تقرأ آخر حدث ناجح.
                  */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <p className="font-bold text-slate-800">{o.permissions.botWebhookTitle}</p>
                      <p className="font-mono text-[11px] text-[#253765] bg-white p-2 rounded border border-slate-200 break-all">
                        POST /api/webhooks/bot
                      </p>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {o.permissions.botWebhookHint1}{' '}
                        <span className="font-mono">x-bariq-signature</span> {o.permissions.botWebhookHint2}{' '}
                        <span className="font-mono">BARIQ_BOT_WEBHOOK_SECRET</span>{o.permissions.botWebhookHint3}
                      </p>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <p className="font-bold text-slate-800">{o.permissions.deliverySyncTitle}</p>
                      <p className="font-mono text-[11px] text-[#253765] bg-white p-2 rounded border border-slate-200 break-all">
                        POST /api/delivery/sync
                      </p>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        {o.permissions.deliverySyncHint1}{' '}
                        <span className="font-mono">BARIQ_DELIVERY_SYNC_SECRET</span>{o.permissions.deliverySyncHint2}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ===== 3. واجهة الحملات الإعلانية (Campaigns View) ===== */}
          {/* ========================================================================= */}
          {view === 'campaigns' && (
            <div className="space-y-6">
              <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#253765]/10 flex items-center justify-center text-[#253765]">
                    <Megaphone size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#0F172A]">
                      {currentUserRole === 'merchant'
                        ? fill(o.campaignsView.titleMerchant, { name: activeMerchantName })
                        : o.campaignsView.titleAdmin}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      {currentUserRole === 'merchant'
                        ? o.campaignsView.subtitleMerchant
                        : o.campaignsView.subtitleAdmin}
                    </p>
                  </div>
                </div>

                {currentUserRole === 'super_admin' && (
                  <button
                    onClick={() => setNewCampaignModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#253765] text-white font-bold text-xs shadow-sm hover:bg-[#1D2B50] transition"
                  >
                    <Plus size={15} />
                    <span>{o.campaignsView.newCampaign}</span>
                  </button>
                )}
              </div>

              {/* بطاقات الحملات الإعلانية */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {promoLoading ? (
                  <div className="col-span-2 p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-500">
                    <RefreshCw size={18} className="animate-spin inline-block ml-2" />
                    {o.campaignsView.loading}
                  </div>
                ) : promoError ? (
                  <div className="col-span-2 p-12 bg-white rounded-2xl border border-rose-200 text-center text-rose-700 font-semibold">
                    {promoError}
                  </div>
                ) : filteredCampaigns.length === 0 ? (
                  <div className="col-span-2 p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-500">
                    {o.campaignsView.empty}
                  </div>
                ) : (
                  filteredCampaigns.map((camp) => {
                    // ميزانية صفر تجعل القسمة NaN — والشريط يظهر فارغاً لا مكسوراً
                    const spendPercent =
                      camp.budget_total > 0
                        ? Math.min(100, Math.round((camp.budget_spent / camp.budget_total) * 100))
                        : 0
                    const campBadge = campaignBadgeProps(camp.status, t)
                    return (
                      <div
                        key={camp.id}
                        className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] p-5 shadow-sm space-y-4 hover:border-[#253765]/40 transition"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <PlatformBadge platform={camp.platform} />
                              <Badge tone={campBadge.tone} label={campBadge.label} />
                            </div>
                            <h3 className="text-sm font-bold text-[#0F172A]">{camp.name}</h3>
                            <p className="text-xs text-[#64748B]">
                              {o.campaignsView.merchantLabel} <strong className="text-slate-800">{camp.merchant_name}</strong> • {o.campaignsView.marketerLabel} {camp.marketer_name}
                            </p>
                          </div>

                          {currentUserRole === 'super_admin' && (
                            <button
                              onClick={async () => {
                                // الحفظ في قاعدة البيانات لا في حالة المتصفح:
                                // إيقاف حملة يعني إيقاف إنفاق فعلي، ولا يصحّ
                                // أن يعود المبلغ يُصرف بمجرد تحديث الصفحة.
                                const nextDb = camp.status === 'active' ? 'paused' : 'active'
                                try {
                                  const res = await fetch(`/api/campaigns/${camp.id}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: nextDb }),
                                  })
                                  const json = await res.json()
                                  if (!res.ok || !json.success) throw new Error(json.error)
                                  await loadPromotion()
                                  showToast(nextDb === 'active' ? o.campaignsView.toggledOn : o.campaignsView.toggledOff, 'success')
                                } catch (err: unknown) {
                                  showToast(err instanceof Error ? err.message : o.campaignsView.toggleFailed, 'error')
                                }
                              }}
                              className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                                camp.status === 'active'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {camp.status === 'active' ? <Pause size={13} /> : <Play size={13} />}
                              <span>{camp.status === 'active' ? o.campaignsView.pause : o.campaignsView.play}</span>
                            </button>
                          )}
                        </div>

                        {/* مؤشرات الأداء */}
                        <div className="grid grid-cols-4 gap-2 bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center text-xs">
                          <div>
                            <p className="text-[10px] text-[#64748B]">{o.campaignsView.reach}</p>
                            <p className="font-bold text-[#0F172A] mt-0.5">{num(camp.reach)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">{o.campaignsView.clicksLabel}</p>
                            <p className="font-bold text-[#0F172A] mt-0.5">{num(camp.clicks)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">{o.campaignsView.ordersLabel}</p>
                            <p className="font-bold text-emerald-700 mt-0.5">{digits(camp.conversions)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">{o.campaignsView.roasLabel}</p>
                            <p className="font-black text-[#253765] mt-0.5 font-mono">
                              {camp.roas === null ? <span className="text-slate-400">—</span> : `${digits(camp.roas)}x`}
                            </p>
                          </div>
                        </div>

                        {/* شريط الميزانية */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-[#64748B]">
                              {o.campaignsView.spentLabel} <strong className="text-slate-900">{money(camp.budget_spent)}</strong>
                            </span>
                            <span className="text-[#253765]">
                              {o.campaignsView.budgetLabel} {money(camp.budget_total)} ({percent(spendPercent)})
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-[#253765] h-full rounded-full transition-all duration-500"
                              style={{ width: `${spendPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* تقرير المروج */}
                        {camp.marketer_notes && (
                          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900 space-y-1">
                            <p className="font-bold flex items-center gap-1.5 text-[#253765]">
                              <Sparkles size={13} />
                              <span>{o.campaignsView.marketerReportTitle}</span>
                            </p>
                            <p className="leading-relaxed text-[11px]">{camp.marketer_notes}</p>
                          </div>
                        )}

                        <div className="pt-2 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-[#64748B]">{fill(o.campaignsView.periodLabel, { start: digits(camp.start_date), end: digits(camp.end_date) })}</span>
                          <button
                            onClick={() => setSelectedCampaign(camp)}
                            className="font-bold text-[#253765] hover:underline inline-flex items-center gap-1"
                          >
                            <span>{o.campaignsView.viewReport}</span>
                            <ArrowUpRight size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </main>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ===== نافذة التحكم باشتراك وحساب التاجر (Merchant Administration Modal) ===== */}
      {/* ========================================================================= */}
      {selectedMerchant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#253765] text-white flex items-center justify-center">
                  <Store size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#0F172A]">{selectedMerchant.name}</h2>
                    {(() => {
                      const sub = subscriptionBadgeProps(selectedMerchant.subscription_status, t)
                      return <Badge tone={sub.tone} label={sub.label} />
                    })()}
                  </div>
                  <p className="text-xs text-[#64748B]">
                    {fill(o.merchantModal.idLabel, { id: digits(selectedMerchant.id) })} •{' '}
                    {selectedMerchant.city ? fill(o.merchantModal.cityKnown, { city: selectedMerchant.city }) : o.merchantModal.cityUnknown}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedMerchant(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] text-[#64748B]">{o.merchantModal.availableBalance}</p>
                  <p className="text-lg font-black text-emerald-700 font-mono mt-1">
                    {money(selectedMerchant.balance)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] text-[#64748B]">{o.merchantModal.totalShipments}</p>
                  <p className="text-lg font-black text-slate-800 font-mono mt-1">
                    {digits(selectedMerchant.orders_count)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] text-[#64748B]">{o.merchantModal.monthlyFee}</p>
                  <p className="text-lg font-black text-[#253765] font-mono mt-1">
                    {money(selectedMerchant.monthly_fee)}
                  </p>
                </div>
              </div>

              {/* تعديل الباقة والاشتراك */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#253765] border-b border-slate-200 pb-1.5">
                  {o.merchantModal.subscriptionSettingsTitle}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">{o.merchantModal.planLabel}</label>
                    <select
                      value={selectedMerchant.plan ?? ''}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, plan: e.target.value || null })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    >
                      <option value={o.merchantModal.planBasic}>{o.merchantModal.planBasic}</option>
                      <option value={o.merchantModal.planAdvanced}>{o.merchantModal.planAdvanced}</option>
                      <option value={o.merchantModal.planPro}>{o.merchantModal.planPro}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">{o.merchantModal.subscriptionStatusLabel}</label>
                    <select
                      value={selectedMerchant.subscription_status ?? ''}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, subscription_status: e.target.value || null })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    >
                      <option value="active">{t.subscriptionStatus.active}</option>
                      <option value="trialing">{t.subscriptionStatus.trialing}</option>
                      <option value="past_due">{t.subscriptionStatus.past_due}</option>
                      <option value="canceled">{t.subscriptionStatus.canceled}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">{o.merchantModal.monthlyFeeInputLabel}</label>
                    <input
                      type="number"
                      value={selectedMerchant.monthly_fee ?? ''}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, monthly_fee: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    />
                  </div>
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">{o.merchantModal.commissionInputLabel}</label>
                    <input
                      type="number"
                      value={selectedMerchant.commission_rate ?? ''}
                      placeholder={o.merchantModal.commissionPlaceholder}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, commission_rate: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    />
                  </div>
                </div>
              </div>

              {/* الربط البرمجي ومفاتيح الـ API */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#253765]">{o.merchantModal.apiKeyLabel}</h3>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Key size={14} className="text-[#253765] shrink-0" />
                  <span className="font-mono text-[11px] text-slate-800 flex-1 truncate">{selectedMerchant.api_key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedMerchant.api_key ?? '')
                      setCopiedKey(true)
                      setTimeout(() => setCopiedKey(false), 2000)
                      showToast(o.merchantModal.apiKeyCopied, 'info')
                    }}
                    className="text-slate-500 hover:text-slate-900"
                  >
                    {copiedKey ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button onClick={() => setSelectedMerchant(null)} className="text-xs font-bold text-slate-500">
                {t.common.cancel}
              </button>
              <button
                onClick={() => {
                  setMerchants((prev) => prev.map((m) => (m.id === selectedMerchant.id ? selectedMerchant : m)))
                  setSelectedMerchant(null)
                  showToast(fill(o.merchantModal.savedToast, { name: selectedMerchant.name }), 'success')
                }}
                className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs"
              >
                {o.merchantModal.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===== نافذة إضافة مروج جديد ===== */}
      {/* ========================================================================= */}
      {newMarketerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">{o.newMarketerModal.title}</h2>
              <button onClick={() => setNewMarketerModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const name = (fd.get('name') as string)?.trim()
                const rate = fd.get('commission_rate')
                const assigned = fd.get('assigned_merchant') as string

                try {
                  const res = await fetch('/api/marketers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name,
                      agency_name: fd.get('agency_name'),
                      email: fd.get('email'),
                      phone: fd.get('phone'),
                      // العمولة تبقى فارغة إن لم تُدخل — لا نسبة افتراضية
                      commission_rate: rate ? Number(rate) : null,
                      merchant_ids: assigned ? [assigned] : [],
                    }),
                  })
                  const json = await res.json()
                  if (!res.ok || !json.success) throw new Error(json.error || o.newMarketerModal.registerFailed)

                  await loadPromotion()
                  setNewMarketerModal(false)
                  showToast(
                    json.warning || fill(o.newMarketerModal.registeredToast, { name }),
                    json.warning ? 'info' : 'success'
                  )
                } catch (err: unknown) {
                  showToast(err instanceof Error ? err.message : o.newMarketerModal.registerFailed, 'error')
                }
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">{o.newMarketerModal.nameLabel}</label>
                <input required name="name" placeholder={o.newMarketerModal.namePlaceholder} className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newMarketerModal.agencyLabel}</label>
                  <input name="agency_name" placeholder={o.newMarketerModal.agencyPlaceholder} className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newMarketerModal.phoneLabel}</label>
                  <input required name="phone" placeholder="077XXXXXXXX" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newMarketerModal.assignLabel}</label>
                  {/* القيمة معرّف التاجر لا اسمه: الإسناد مفتاح أجنبي حقيقي */}
                  <select name="assigned_merchant" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                    <option value="">{o.newMarketerModal.noAssign}</option>
                    {merchants.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newMarketerModal.commissionLabel}</label>
                  <input required type="number" name="commission_rate" defaultValue="10" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewMarketerModal(false)} className="text-slate-500 font-bold">{t.common.cancel}</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">{o.newMarketerModal.submit}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===== باقي النوافذ ===== */}
      {/* ========================================================================= */}

      {/* تفاصيل الطلب */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#0F172A]">{fill(o.orderDetail.title, { n: digits(selectedOrder.order_id) })}</h2>
                  <OrderStageBadge order={selectedOrder} t={t} />
                </div>
                {selectedOrder.shipment && (
                  <p className="text-xs text-[#64748B] mt-0.5">{fill(o.orderDetail.trackingNumber, { tracking: selectedOrder.shipment.tracking_number })}</p>
                )}
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between"><span className="text-[#64748B]">{o.orderDetail.customer}</span><span className="font-bold">{orderDisplayName(selectedOrder)}</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">{o.orderDetail.phone}</span><span>{digits(orderDisplayPhone(selectedOrder))}</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">{o.orderDetail.address}</span><span>{[selectedOrder.governorate, selectedOrder.district].filter(Boolean).join(' - ')} - {digits(selectedOrder.address || '')}</span></div>
                {selectedOrder.order_content && (
                  <div className="flex justify-between"><span className="text-[#64748B]">{o.orderDetail.content}</span><span>{selectedOrder.order_content}</span></div>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                  <span>{o.orderDetail.amountDue}</span>
                  <span className="text-emerald-700 text-sm">{money(selectedOrder.grand_total_iqd ?? selectedOrder.items_total_iqd ?? 0)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintLabel(selectedOrder)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs"
                >
                  <Printer size={14} />
                  <span>{o.orderDetail.printLabel}</span>
                </button>
                {!selectedOrder.shipment && selectedOrder.current_state === 'confirmed' && (
                  <button
                    onClick={() => void handleDispatch(selectedOrder.order_id)}
                    disabled={dispatchingOrderId === selectedOrder.order_id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-xs transition"
                  >
                    {dispatchingOrderId === selectedOrder.order_id ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Truck size={14} />
                    )}
                    <span>{o.orderDetail.sendToShipping}</span>
                  </button>
                )}
              </div>
              <button onClick={() => setSelectedOrder(null)} className="px-5 py-2 rounded-xl bg-[#253765] text-white font-bold text-xs">
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تفاصيل الحملة الإعلانية */}
      {selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <PlatformBadge platform={selectedCampaign.platform} />
                  {(() => {
                    const campBadge = campaignBadgeProps(selectedCampaign.status, t)
                    return <Badge tone={campBadge.tone} label={campBadge.label} />
                  })()}
                </div>
                <h2 className="text-base font-bold text-[#0F172A]">{selectedCampaign.name}</h2>
              </div>
              <button onClick={() => setSelectedCampaign(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <div>
                  <p className="text-[10px] text-slate-500">{o.campaignDetail.totalReach}</p>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{num(selectedCampaign.reach)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">{o.campaignDetail.generatedOrders}</p>
                  <p className="font-bold text-emerald-700 text-sm mt-0.5">{digits(selectedCampaign.conversions)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">{o.campaignDetail.roas}</p>
                  <p className="font-black text-[#253765] text-sm mt-0.5 font-mono">
                    {selectedCampaign.roas === null ? (
                      <span className="text-slate-400 text-xs font-normal">{o.campaignDetail.noSpendYet}</span>
                    ) : (
                      `${digits(selectedCampaign.roas)}x`
                    )}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-[#64748B] block font-bold mb-1">{o.campaignDetail.targetAudience}</span>
                <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{selectedCampaign.target_audience}</p>
              </div>

              <div>
                <span className="text-[#64748B] block font-bold mb-1">{o.campaignDetail.adHeadline}</span>
                <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{selectedCampaign.ad_headline}</p>
              </div>

              {selectedCampaign.marketer_notes && (
                <div>
                  <span className="text-[#64748B] block font-bold mb-1">{o.campaignDetail.marketerNotes}</span>
                  <p className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 leading-relaxed">{selectedCampaign.marketer_notes}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setSelectedCampaign(null)} className="px-5 py-2 rounded-xl bg-[#253765] text-white font-bold text-xs">
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تسجيل تاجر جديد */}
      {newMerchantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">{o.newMerchantModal.title}</h2>
              <button onClick={() => setNewMerchantModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const name = (fd.get('name') as string)?.trim()

                try {
                  const res = await fetch('/api/merchants', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name,
                      owner_name: fd.get('owner_name'),
                      phone: fd.get('phone'),
                      city: fd.get('city'),
                    }),
                  })
                  const json = await res.json()
                  if (!res.ok || !json.success) throw new Error(json.error || o.newMerchantModal.registerFailed)

                  // إعادة الجلب بدل الإضافة محلياً: الباقة وعدد الشحنات
                  // يحسبهما الخادم، ولا يصحّ تخمينهما في المتصفح
                  await loadMerchants()
                  setNewMerchantModal(false)
                  showToast(fill(o.newMerchantModal.registeredToast, { name }), 'success')
                } catch (err: unknown) {
                  showToast(err instanceof Error ? err.message : o.newMerchantModal.registerFailed, 'error')
                }
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">{o.newMerchantModal.nameLabel}</label>
                <input required name="name" placeholder={o.newMerchantModal.namePlaceholder} className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newMerchantModal.ownerLabel}</label>
                  <input name="owner_name" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newMerchantModal.phoneLabel}</label>
                  <input name="phone" placeholder={o.newMerchantModal.phonePlaceholder} className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewMerchantModal(false)} className="text-slate-500 font-bold">{t.common.cancel}</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">{o.newMerchantModal.submit}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إضافة طلب جديد — حجز حقيقي عبر /api/orders/book (Supabase) */}
      {newOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn overflow-y-auto">
          <div className="w-full max-w-lg my-8">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#0F172A]">{o.newOrderModal.title}</h2>
                <button onClick={() => setNewOrderModal(false)} className="text-slate-400 hover:text-slate-700">
                  <X size={17} />
                </button>
              </div>
              <div className="[&>div]:rounded-none [&>div]:border-0 [&>div]:shadow-none">
                <NewOrderBooking
                  locale={locale}
                  currency={currency}
                  t={t.booking}
                  merchants={merchants.map((m) => ({ id: m.id, name: m.name }))}
                  onBooked={() => {
                    void loadOrders()
                    showToast(o.newOrderModal.bookedToast, 'success')
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إنشاء حملة جديدة */}
      {newCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">{o.newCampaignModal.title}</h2>
              <button onClick={() => setNewCampaignModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const name = (fd.get('name') as string)?.trim()

                // التاجر يُحدَّد بمعرّفه: في وضع التاجر هو نفسه، وفي وضع
                // المدير يُختار من القائمة. لا معرّف افتراضي مُخترع.
                const merchantId =
                  currentUserRole === 'merchant'
                    ? merchants.find((m) => m.name === activeMerchantName)?.id
                    : (fd.get('merchant_id') as string)

                if (!merchantId) {
                  showToast(o.newCampaignModal.chooseMerchantFirst, 'error')
                  return
                }

                try {
                  const res = await fetch('/api/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      name,
                      merchant_id: merchantId,
                      platform: (fd.get('platform') as string) || 'instagram',
                      status: 'under_review',
                      // الميزانيات تصل كما أُدخلت — بلا مبالغ افتراضية
                      budget_total_iqd: Number(fd.get('budget_total') || 0),
                      daily_budget_iqd: Number(fd.get('daily_budget') || 0),
                      start_date: fd.get('start_date') || null,
                      end_date: fd.get('end_date') || null,
                      target_audience: fd.get('target_audience'),
                      ad_headline: fd.get('ad_headline'),
                    }),
                  })
                  const json = await res.json()
                  if (!res.ok || !json.success) throw new Error(json.error || o.newCampaignModal.createFailed)

                  await loadPromotion()
                  setNewCampaignModal(false)
                  showToast(fill(o.newCampaignModal.createdToast, { name }), 'success')
                } catch (err: unknown) {
                  showToast(err instanceof Error ? err.message : o.newCampaignModal.createFailed, 'error')
                }
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">{o.newCampaignModal.nameLabel}</label>
                <input required name="name" placeholder={o.newCampaignModal.namePlaceholder} className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newCampaignModal.platformLabel}</label>
                  <select name="platform" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                    <option value="instagram">Instagram Ads</option>
                    <option value="tiktok">TikTok Ads</option>
                    <option value="facebook">Meta / Facebook</option>
                    <option value="snapchat">Snapchat Ads</option>
                    <option value="google">Google Ads</option>
                  </select>
                </div>
                {currentUserRole === 'super_admin' && (
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">{o.newCampaignModal.merchantLabel}</label>
                    <select required name="merchant_id" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                      <option value="">{o.newCampaignModal.chooseMerchant}</option>
                      {merchants.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newCampaignModal.totalBudgetLabel}</label>
                  <input required type="number" name="budget_total" defaultValue="300000" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">{o.newCampaignModal.dailyBudgetLabel}</label>
                  <input required type="number" name="daily_budget" defaultValue="20000" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>

              <div>
                <label className="text-[#64748B] block mb-1 font-bold">{o.newCampaignModal.targetAudienceLabel}</label>
                <input name="target_audience" placeholder={o.newCampaignModal.targetAudiencePlaceholder} className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewCampaignModal(false)} className="text-slate-500 font-bold">{t.common.cancel}</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">{o.newCampaignModal.submit}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
