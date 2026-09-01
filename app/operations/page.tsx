'use client'

/**
 * لوحة تحكم منصة "برق" — النسخة الإدارية الفاخرة بالأوف وايت وتوحيد الأرقام العربية
 * -------------------------------------------------------------------------------
 * المسار: app/operations/page.tsx
 * 
 * الميزات:
 * 1. توحيد كافة الأرقام والمبالغ والنسب والتواريخ وأرقام الهواتف إلى الأرقام العربية (٠، ١، ٢، ٣، ٤، ٥، ٦، ٧، ٨، ٩).
 * 2. قسم "الإدارة" الشامل مع إدارة حسابات واشتراكات التجار وحسابات المروجين.
 * 3. نظام تخصيص الصلاحيات (التاجر يرى فقط طلباته ومحادثاته وحملاته الخاصة).
 * 4. تكامل بوابات الدفع الإلكترونية العراقية (Zain Cash و Qi Card).
 * 5. واجهة أوف وايت فاخرة (#F8F9FA) مع أزرار أزرق ملكي (#253765).
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Printer,
  Search,
  Store,
  MessageCircle,
  Plus,
  X,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  MapPin,
  Clock,
  ShieldCheck,
  Send,
  Key,
  Copy,
  Check,
  Package,
  Sparkles,
  Eye,
  ArrowUpRight,
  Link2,
  CreditCard,
  QrCode,
  TrendingUp,
  Truck,
  Bot,
  Megaphone,
  BarChart3,
  Sliders,
  Play,
  Pause,
  ExternalLink,
  Target,
  Users,
  DollarSign,
  Layers,
  ChevronDown,
  UserCheck,
  Lock,
  Unlock,
  ShieldAlert,
  Edit,
  Trash2,
  Award
} from 'lucide-react'
import {
  toArabicDigits,
  formatArabicNumber,
  formatArabicCurrency,
  formatArabicPercent,
  formatArabicPhone,
  formatArabicDate
} from '@/lib/formatters'

// ---------- أنواع البيانات ----------

export type OrderStatus = 'جديد' | 'قيد المعالجة' | 'بالطريق' | 'تم التسليم' | 'ملغي'
export type PaymentStatus = 'غير مدفوع' | 'قيد المعالجة' | 'تم الدفع' | 'فشل الدفع'
export type PaymentMethod = 'عند الاستلام' | 'zaincash' | 'qicard' | 'زين كاش' | 'كي كارد'

export interface OrderItem {
  id: string
  name: string
  quantity: number
  price: number
}

export interface Order {
  id: string
  customer_name: string
  customer_phone: string
  address: string
  city: string
  total_amount: number
  delivery_fee?: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: PaymentMethod
  transaction_id?: string
  created_at: string
  merchant_name: string
  merchant_id?: string
  items?: OrderItem[]
  notes?: string
  driver_name?: string
  driver_phone?: string
}

export interface Merchant {
  id: string
  name: string
  owner_name: string
  phone: string
  city: string
  plan: 'أساسية' | 'متقدمة' | 'احترافية'
  subscription_status: 'نشط' | 'متوقف' | 'تجريبي'
  api_connected: boolean
  monthly_fee: number
  commission_rate?: number
  api_key: string
  webhook_url?: string
  orders_count: number
  balance: number
}

export interface Marketer {
  id: string
  name: string
  agency_name?: string
  email: string
  phone: string
  status: 'نشط' | 'متوقف'
  assigned_merchants: string[]
  active_campaigns_count: number
  total_ad_budget_managed: number
  commission_rate: number
  created_at: string
}

export interface ChatMessage {
  id: string
  sender: 'customer' | 'bot' | 'agent'
  text: string
  time: string
}

export interface Conversation {
  id: string
  customer_name: string
  customer_phone: string
  last_message: string
  channel: 'whatsapp' | 'messenger' | 'instagram' | 'telegram'
  status: 'يرد تلقائيًا' | 'بانتظار رد' | 'تم التصعيد'
  updated_at: string
  merchant_name: string
  messages: ChatMessage[]
}

export type AdPlatform = 'instagram' | 'facebook' | 'tiktok' | 'snapchat' | 'google'
export type AdCampaignStatus = 'نشطة' | 'مكتملة' | 'قيد المراجعة' | 'متوقفة'

export interface AdCampaign {
  id: string
  name: string
  merchant_id: string
  merchant_name: string
  platform: AdPlatform
  status: AdCampaignStatus
  budget_total: number
  budget_spent: number
  daily_budget: number
  reach: number
  impressions: number
  clicks: number
  conversions: number
  roas: number
  start_date: string
  end_date: string
  target_audience: string
  ad_headline: string
  marketer_notes?: string
  marketer_name: string
}

type MainNavView = 'orders' | 'admin' | 'campaigns'
type AdminSubTab = 'merchants' | 'marketers' | 'permissions'
type UserRole = 'super_admin' | 'merchant'
type TimeRange = 'today' | 'week' | 'month' | 'all'

// ---------- البيانات الأولية المحملة ----------

const INITIAL_MERCHANTS: Merchant[] = [
  {
    id: 'm1',
    name: 'متجر دجلة',
    owner_name: 'علي التميمي',
    phone: '07700112233',
    city: 'بغداد',
    plan: 'متقدمة',
    subscription_status: 'نشط',
    api_connected: true,
    monthly_fee: 35000,
    commission_rate: 5,
    api_key: 'brq_live_key_99f8a32b0c',
    webhook_url: 'https://api.dijlastore.com/webhooks/bariq',
    orders_count: 142,
    balance: 420000
  },
  {
    id: 'm2',
    name: 'ستايل بغداد',
    owner_name: 'سارة الراوي',
    phone: '07800223344',
    city: 'البصرة',
    plan: 'أساسية',
    subscription_status: 'تجريبي',
    api_connected: true,
    monthly_fee: 0,
    commission_rate: 7,
    api_key: 'brq_test_key_44b1c87a1d',
    webhook_url: '',
    orders_count: 28,
    balance: 85000
  },
  {
    id: 'm3',
    name: 'أزياء الفرات',
    owner_name: 'محمد الدليمي',
    phone: '07500334455',
    city: 'أربيل',
    plan: 'احترافية',
    subscription_status: 'متوقف',
    api_connected: false,
    monthly_fee: 50000,
    commission_rate: 4,
    api_key: 'brq_live_key_11e7d90a5f',
    webhook_url: '',
    orders_count: 310,
    balance: 0
  }
]

const INITIAL_MARKETERS: Marketer[] = [
  {
    id: 'mkt-1',
    name: 'أحمد عادل الخفاجي',
    agency_name: 'وكالة برق ميديا ديجيتال',
    email: 'ahmed@bariqmedia.iq',
    phone: '07709922114',
    status: 'نشط',
    assigned_merchants: ['متجر دجلة', 'أزياء الفرات'],
    active_campaigns_count: 3,
    total_ad_budget_managed: 900000,
    commission_rate: 10,
    created_at: '2025-01-15'
  },
  {
    id: 'mkt-2',
    name: 'مريم خليل الشمري',
    agency_name: 'تريند للتسويق الرقمي',
    email: 'maryam@trendiq.com',
    phone: '07801133445',
    status: 'نشط',
    assigned_merchants: ['ستايل بغداد'],
    active_campaigns_count: 1,
    total_ad_budget_managed: 300000,
    commission_rate: 12,
    created_at: '2025-02-10'
  }
]

const INITIAL_ORDERS: Order[] = [
  {
    id: 'BRQ-1001',
    customer_name: 'أحمد الجبوري',
    customer_phone: '07701234567',
    address: 'حي الكرادة - قرب ساحة الواثق - زقاق 14',
    city: 'بغداد',
    total_amount: 45000,
    delivery_fee: 5000,
    status: 'جديد',
    payment_status: 'غير مدفوع',
    payment_method: 'عند الاستلام',
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    merchant_name: 'متجر دجلة',
    merchant_id: 'm1',
    items: [
      { id: 'it-1', name: 'ساعة يد فاخرة', quantity: 1, price: 40000 },
      { id: 'it-2', name: 'علبة هدايا', quantity: 1, price: 5000 }
    ],
    notes: 'الاتصال قبل الوصول بربع ساعة',
    driver_name: 'حيدر السعدي',
    driver_phone: '07709988771'
  },
  {
    id: 'BRQ-1002',
    customer_name: 'زينب العبيدي',
    customer_phone: '07809876543',
    address: 'الجزائر - شارع 14 تموز مقابل مجمع النور',
    city: 'البصرة',
    total_amount: 62000,
    delivery_fee: 6000,
    status: 'قيد المعالجة',
    payment_status: 'تم الدفع',
    payment_method: 'zaincash',
    transaction_id: 'ZC-TX-883921',
    created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    merchant_name: 'ستايل بغداد',
    merchant_id: 'm2',
    items: [{ id: 'it-3', name: 'فستان صيفي حرير', quantity: 1, price: 56000 }],
    notes: 'تغليف خاص للهدايا'
  },
  {
    id: 'BRQ-1003',
    customer_name: 'مصطفى الحسيني',
    customer_phone: '07505551234',
    address: 'المنصور - تقاطع 14 رمضان',
    city: 'بغداد',
    total_amount: 38500,
    delivery_fee: 5000,
    status: 'بالطريق',
    payment_status: 'تم الدفع',
    payment_method: 'qicard',
    transaction_id: 'QI-TX-440192',
    created_at: new Date(Date.now() - 1000 * 60 * 125).toISOString(),
    merchant_name: 'متجر دجلة',
    merchant_id: 'm1',
    items: [{ id: 'it-4', name: 'عطر ليلي شرقي 100ml', quantity: 1, price: 33500 }],
    driver_name: 'عمر التكريتي',
    driver_phone: '07705544332'
  },
  {
    id: 'BRQ-1004',
    customer_name: 'نور الهدى كامل',
    customer_phone: '07712398745',
    address: 'حي الجامعة - قرب مول الجامعة',
    city: 'أربيل',
    total_amount: 95000,
    delivery_fee: 7000,
    status: 'تم التسليم',
    payment_status: 'تم الدفع',
    payment_method: 'عند الاستلام',
    created_at: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    merchant_name: 'أزياء الفرات',
    merchant_id: 'm3',
    driver_name: 'كرديار أربيل',
    driver_phone: '07501122334'
  }
]

const INITIAL_CAMPAIGNS: AdCampaign[] = [
  {
    id: 'CMP-701',
    name: 'حملة العطور الصيفية - ريلز انستغرام',
    merchant_id: 'm1',
    merchant_name: 'متجر دجلة',
    platform: 'instagram',
    status: 'نشطة',
    budget_total: 450000,
    budget_spent: 285000,
    daily_budget: 25000,
    reach: 128400,
    impressions: 195000,
    clicks: 7620,
    conversions: 245,
    roas: 4.6,
    start_date: '2026-08-15',
    end_date: '2026-09-05',
    target_audience: 'عشاق الأناقة والعطور (18-38 سنة) في بغداد والبصرة وأربيل',
    ad_headline: 'خصم 30% مع توصيل سريع بنفس اليوم عبر منصة برق ⚡',
    marketer_notes: 'الحملة تحقق عائد استثمار ممتاز (4.6x ROAS)، ريلز الإنستغرام هو الأكثر تحويلاً للطلبات.',
    marketer_name: 'أحمد عادل الخفاجي'
  },
  {
    id: 'CMP-702',
    name: 'تريند كولكشن الفساتين - تيك توك سبونسرد',
    merchant_id: 'm2',
    merchant_name: 'ستايل بغداد',
    platform: 'tiktok',
    status: 'نشطة',
    budget_total: 300000,
    budget_spent: 190000,
    daily_budget: 20000,
    reach: 215000,
    impressions: 340000,
    clicks: 12400,
    conversions: 180,
    roas: 3.9,
    start_date: '2026-08-18',
    end_date: '2026-09-02',
    target_audience: 'النساء والفتيات (16-32 سنة) في كافة محافظات العراق',
    ad_headline: 'أحدث موديلات الصيف الحصرية وصلت الآن! اطلبي بضغطة زر',
    marketer_notes: 'الفيديو الإعلاني الأول تريند على تيك توك بنسبة تفاعل 8.2%. خيار الدفع عند الاستلام هو المفضل.',
    marketer_name: 'مريم خليل الشمري'
  },
  {
    id: 'CMP-703',
    name: 'إعلانات فيسبوك ممولة - الدفع عبر زين كاش',
    merchant_id: 'm1',
    merchant_name: 'متجر دجلة',
    platform: 'facebook',
    status: 'نشطة',
    budget_total: 250000,
    budget_spent: 110000,
    daily_budget: 18000,
    reach: 89000,
    impressions: 122000,
    clicks: 3900,
    conversions: 115,
    roas: 4.1,
    start_date: '2026-08-22',
    end_date: '2026-09-08',
    target_audience: 'عشاق الساعات الفاخرة ورجال الأعمال (24-50 سنة)',
    ad_headline: 'تسوق بأمان وادفع إلكترونياً عبر زين كاش أو كي كارد',
    marketer_notes: 'الإعلان يستهدف جمهور الدفع الرقمي والطلبات ذات القيمة المرتفعة.',
    marketer_name: 'أحمد عادل الخفاجي'
  },
  {
    id: 'CMP-704',
    name: 'حملة سناب شات كولكشن أربيل',
    merchant_id: 'm3',
    merchant_name: 'أزياء الفرات',
    platform: 'snapchat',
    status: 'متوقفة',
    budget_total: 200000,
    budget_spent: 200000,
    daily_budget: 15000,
    reach: 98000,
    impressions: 145000,
    clicks: 4300,
    conversions: 88,
    roas: 2.8,
    start_date: '2026-08-01',
    end_date: '2026-08-15',
    target_audience: 'إقليم كردستان (أربيل، السليمانية، دهوك)',
    ad_headline: 'أزياء الخريف الفاخرة متوفرة الآن مع توصيل برق',
    marketer_notes: 'تم إنهاء الحملة بنجاح، بانتظار تجديد الميزانية للموسم القادم.',
    marketer_name: 'أحمد عادل الخفاجي'
  }
]

const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'c1',
    customer_name: 'أحمد الجبوري',
    customer_phone: '07701234567',
    last_message: 'وين وصل الطلب مالتي رقم BRQ-1001؟',
    channel: 'whatsapp',
    status: 'بانتظار رد',
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    merchant_name: 'متجر دجلة',
    messages: [
      { id: 'm1-1', sender: 'customer', text: 'مرحباً، سويت طلب الصبح من متجر دجلة', time: '١٠:٣٠ ص' },
      { id: 'm1-2', sender: 'bot', text: 'أهلاً بك في متجر دجلة عبر برق ⚡ تم تسجيل طلبك بنجاح.', time: '١٠:٣٠ ص' },
      { id: 'm1-3', sender: 'customer', text: 'وين وصل الطلب مالتي رقم BRQ-1001؟', time: '١١:١٥ ص' }
    ]
  },
  {
    id: 'c2',
    customer_name: 'زينب العبيدي',
    customer_phone: '07809876543',
    last_message: 'أريد أتحدث مع موظف بخصوص فستان ستايل بغداد',
    channel: 'messenger',
    status: 'تم التصعيد',
    updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    merchant_name: 'ستايل بغداد',
    messages: [
      { id: 'm2-1', sender: 'customer', text: 'مساء الخير، كتبت العنوان خطأ في طلب ستايل بغداد', time: '١١:٠٠ ص' },
      { id: 'm2-2', sender: 'bot', text: 'يرجى تزويدنا بالعنوان الصحيح وسنقوم بتحديثه', time: '١١:٠١ ص' },
      { id: 'm2-3', sender: 'customer', text: 'أريد أتحدث مع موظف بخصوص فستان ستايل بغداد', time: '١١:٠٥ ص' }
    ]
  }
]

// ---------- مكونات الشارات ----------

function StatusBadge({ status }: { status: string }) {
  let style = 'bg-slate-100 text-slate-700 border-slate-200'

  if (['تم التسليم', 'تم الدفع', 'نشط', 'متصل', 'نشطة', 'يرد تلقائيًا'].includes(status)) {
    style = 'bg-emerald-50 text-emerald-700 border-emerald-200'
  } else if (['ملغي', 'متوقف', 'متوقفة', 'فشل الدفع', 'تم التصعيد', 'غير مربوط'].includes(status)) {
    style = 'bg-rose-50 text-rose-700 border-rose-200'
  } else if (['بالطريق', 'متقدمة', 'احترافية', 'قيد المراجعة'].includes(status)) {
    style = 'bg-sky-50 text-sky-700 border-sky-200'
  } else if (['جديد', 'قيد المعالجة', 'بانتظار رد'].includes(status)) {
    style = 'bg-amber-50 text-amber-800 border-amber-200'
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {status}
    </span>
  )
}

function PlatformBadge({ platform }: { platform: AdPlatform }) {
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

function PaymentMethodBadge({ method }: { method: string }) {
  if (method === 'zaincash' || method === 'زين كاش') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-bold">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
        Zain Cash
      </span>
    )
  }
  if (method === 'qicard' || method === 'كي كارد' || method === 'ماستركارد') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
        <CreditCard size={11} />
        Qi Card / Master
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium">
      الدفع عند الاستلام (COD)
    </span>
  )
}

// ---------- المكون الرئيسي للوحة العمليات والإدارة بالأرقام العربية ----------

export default function OperationsPage() {
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>('super_admin')
  const [activeMerchantName, setActiveMerchantName] = useState<string>('متجر دجلة')

  // التبويب الرئيسي
  const [view, setView] = useState<MainNavView>('orders')
  const [adminSubTab, setAdminSubTab] = useState<AdminSubTab>('merchants')
  const [timeRange, setTimeRange] = useState<TimeRange>('today')

  // البيانات
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [merchants, setMerchants] = useState<Merchant[]>(INITIAL_MERCHANTS)
  const [marketers, setMarketers] = useState<Marketer[]>(INITIAL_MARKETERS)
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(INITIAL_CAMPAIGNS)
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS)

  // التصفية والبحث
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('الكل')
  const [platformFilter, setPlatformFilter] = useState<string>('الكل')

  // النوافذ المنبثقة
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null)
  const [paymentModalOrder, setPaymentModalOrder] = useState<Order | null>(null)
  const [activeChat, setActiveChat] = useState<Conversation | null>(null)
  const [newOrderModal, setNewOrderModal] = useState(false)
  const [newMerchantModal, setNewMerchantModal] = useState(false)
  const [newMarketerModal, setNewMarketerModal] = useState(false)
  const [newCampaignModal, setNewCampaignModal] = useState(false)

  // التنبيهات والدفع
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [paymentGateway, setPaymentGateway] = useState<'zaincash' | 'qicard'>('zaincash')
  const [paymentProcessing, setPaymentProcessing] = useState(false)

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3500)
  }

  // تصفية البيانات المخصصة للتاجر
  const userScopedOrders = useMemo(() => {
    if (currentUserRole === 'merchant') {
      return orders.filter((o) => o.merchant_name === activeMerchantName)
    }
    return orders
  }, [orders, currentUserRole, activeMerchantName])

  const userScopedConversations = useMemo(() => {
    if (currentUserRole === 'merchant') {
      return conversations.filter((c) => c.merchant_name === activeMerchantName)
    }
    return conversations
  }, [conversations, currentUserRole, activeMerchantName])

  const userScopedCampaigns = useMemo(() => {
    if (currentUserRole === 'merchant') {
      return campaigns.filter((c) => c.merchant_name === activeMerchantName)
    }
    return campaigns
  }, [campaigns, currentUserRole, activeMerchantName])

  // الإحصائيات الحية
  const stats = useMemo(() => {
    const totalRev = userScopedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const paidOrders = userScopedOrders.filter((o) => o.payment_status === 'تم الدفع')
    const paidRev = paidOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const activeDeliveries = userScopedOrders.filter((o) => ['جديد', 'قيد المعالجة', 'بالطريق'].includes(o.status)).length
    const deliveredCount = userScopedOrders.filter((o) => o.status === 'تم التسليم').length
    const successRate = userScopedOrders.length > 0 ? ((deliveredCount / userScopedOrders.length) * 100).toFixed(1) : '100'

    const totalAdBudget = userScopedCampaigns.reduce((sum, c) => sum + c.budget_total, 0)
    const totalAdSpent = userScopedCampaigns.reduce((sum, c) => sum + c.budget_spent, 0)
    const totalReach = userScopedCampaigns.reduce((sum, c) => sum + c.reach, 0)
    const totalAdOrders = userScopedCampaigns.reduce((sum, c) => sum + c.conversions, 0)
    const avgRoas = userScopedCampaigns.length > 0 ? (userScopedCampaigns.reduce((sum, c) => sum + c.roas, 0) / userScopedCampaigns.length).toFixed(1) : '4.2'

    return {
      totalRev,
      paidRev,
      activeDeliveries,
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
    return userScopedOrders.filter((o) => {
      const q = (search || '').trim().toLowerCase()
      const matchesSearch =
        !q ||
        (o.customer_name ?? '').toLowerCase().includes(q) ||
        (o.id ?? '').toLowerCase().includes(q) ||
        (o.customer_phone ?? '').includes(q) ||
        (o.merchant_name ?? '').toLowerCase().includes(q)

      const matchesStatus = statusFilter === 'الكل' || o.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [userScopedOrders, search, statusFilter])

  // تصفية الحملات المعروضة
  const filteredCampaigns = useMemo(() => {
    return userScopedCampaigns.filter((c) => {
      const q = (search || '').trim().toLowerCase()
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.merchant_name.toLowerCase().includes(q)
      const matchesPlatform = platformFilter === 'الكل' || c.platform === platformFilter
      return matchesSearch && matchesPlatform
    })
  }, [userScopedCampaigns, search, platformFilter])

  // محاكاة الدفع الإلكتروني
  const handleExecutePayment = async () => {
    if (!paymentModalOrder) return
    setPaymentProcessing(true)

    setTimeout(() => {
      const updatedOrder: Order = {
        ...paymentModalOrder,
        payment_status: 'تم الدفع',
        payment_method: paymentGateway,
        status: paymentModalOrder.status === 'جديد' ? 'قيد المعالجة' : paymentModalOrder.status,
        transaction_id: `${paymentGateway === 'zaincash' ? 'ZC' : 'QI'}-TX-${Math.floor(100000 + Math.random() * 900000)}`
      }

      setOrders((prev) => prev.map((o) => (o.id === paymentModalOrder.id ? updatedOrder : o)))
      if (selectedOrder?.id === paymentModalOrder.id) {
        setSelectedOrder(updatedOrder)
      }

      setPaymentProcessing(false)
      setPaymentModalOrder(null)
      showToast(`تم تأكيد استلام الدفع عبر ${paymentGateway === 'zaincash' ? 'زين كاش' : 'كي كارد'} بنجاح!`, 'success')
    }, 800)
  }

  // طباعة البوليصة الحرارية بالأرقام العربية
  const handlePrintLabel = (order: Order) => {
    const w = window.open('', '_blank', 'width=450,height=650')
    if (!w) {
      showToast('يرجى السماح بالنوافذ المنبثقة للطباعة', 'error')
      return
    }
    w.document.write(`
      <html lang="ar" dir="rtl">
        <head>
          <title>بوليصة شحن ${toArabicDigits(order.id)}</title>
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
            <p>رقم الطلب: ${toArabicDigits(order.id)} | المتجر: ${order.merchant_name}</p>
            <div class="row"><span>الزبون:</span><span>${order.customer_name} (${formatArabicPhone(order.customer_phone)})</span></div>
            <div class="row"><span>العنوان:</span><span>${order.city} - ${toArabicDigits(order.address)}</span></div>
            <div class="row"><span>حالة الدفع:</span><span>${order.payment_status} (${order.payment_method})</span></div>
            <div class="total">الإجمالي: ${formatArabicCurrency(order.total_amount)}</div>
          </div>
        </body>
      </html>
    `)
    w.document.close()
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
          <span className="font-bold">نظام محاكاة الصلاحيات المتقدمة:</span>
          <span className="text-slate-200 hidden md:inline">اختر نوع الحساب لمعاينة الصلاحيات وطريقة العرض المخصصة:</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-[#1D2B50] p-0.5 rounded-lg border border-white/15">
            <button
              onClick={() => {
                setCurrentUserRole('super_admin')
                showToast('تم التبديل إلى: وضع مدير المنصة (صلاحيات كاملة)', 'info')
              }}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 ${
                currentUserRole === 'super_admin' ? 'bg-white text-[#253765] shadow-xs' : 'text-slate-200 hover:text-white'
              }`}
            >
              <Award size={13} />
              <span>مدير المنصة (Super Admin)</span>
            </button>

            <button
              onClick={() => {
                setCurrentUserRole('merchant')
                if (view === 'admin') setView('orders')
                showToast(`تم تسجيل الدخول كـ: تاجر (${activeMerchantName})`, 'info')
              }}
              className={`px-3 py-1 rounded-md font-bold transition flex items-center gap-1.5 ${
                currentUserRole === 'merchant' ? 'bg-amber-400 text-slate-900 shadow-xs' : 'text-slate-200 hover:text-white'
              }`}
            >
              <Store size={13} />
              <span>حساب تاجر / صاحب بيج</span>
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
                  {currentUserRole === 'merchant' ? `لوحة ${activeMerchantName}` : 'لوحة الإدارة والعمليات'}
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
                  <span>{currentUserRole === 'merchant' ? 'طلبات متجري' : 'الطلبات والشحنات'}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === 'orders' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {toArabicDigits(userScopedOrders.length)}
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
                    <span>الإدارة</span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === 'admin' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {toArabicDigits(merchants.length + marketers.length)}
                  </span>
                </button>
              ) : (
                <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-[11px] text-slate-500 flex items-center gap-2">
                  <Lock size={14} className="text-slate-400" />
                  <span>الإدارة مقيدة لمدير المنصة فقط</span>
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
                  <span>{currentUserRole === 'merchant' ? 'حملاتي الإعلانية' : 'الحملات والترويج الإعلاني'}</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${view === 'campaigns' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>
                  {toArabicDigits(userScopedCampaigns.length)}
                </span>
              </button>
            </nav>

            {/* بوابات الدفع المدعومة */}
            <div className="mt-8 pt-6 border-t border-[#E2E8F0]">
              <p className="text-[10px] font-bold text-[#64748B] mb-3 uppercase tracking-wider">
                بوابات الدفع الإلكتروني
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-600" />
                    <span className="font-semibold text-slate-800">Zain Cash Iraq</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold">نشط</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    <span className="font-semibold text-slate-800">Qi Card & Master</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-bold">نشط</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{currentUserRole === 'merchant' ? `متصل: ${activeMerchantName}` : 'النظام متصل بالإدارة'}</span>
            </div>
            <span className="text-[#253765] font-bold">الإصدار {toArabicDigits('2.6')}</span>
          </div>
        </aside>

        {/* ===== مساحة المحتوى الرئيسية ===== */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl mx-auto w-full overflow-y-auto">
          {/* الترويسة العليا */}
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
                  {view === 'orders'
                    ? currentUserRole === 'merchant' ? `متابعة شحنات وطلبات ${activeMerchantName}` : 'إدارة الطلبات والشحن الذكي'
                    : view === 'admin'
                    ? 'الإدارة العامة — التحكم بالتجار والمروجين والصلاحيات'
                    : currentUserRole === 'merchant' ? `لوحة متابعة إعلانات ${activeMerchantName}` : 'منظومة الترويج والحملات الإعلانية الممولة'}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#253765] text-white shadow-sm">
                  {view === 'orders'
                    ? `${toArabicDigits(filteredOrders.length)} شحنة`
                    : view === 'admin'
                    ? `${toArabicDigits(merchants.length)} متجر • ${toArabicDigits(marketers.length)} مروج`
                    : `${toArabicDigits(filteredCampaigns.length)} حملة`}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#64748B] mt-1">
                {currentUserRole === 'merchant'
                  ? `أنت في وضع التاجر (${activeMerchantName}): تظهر فقط الشحنات والمحادثات والحملات الخاصة بمتجرك`
                  : 'أنت في وضع مدير المنصة (Super Admin): صلاحيات كاملة لإدارة التجار، المروجين، والباقات، والربط البرمجي'}
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
                  <span>إضافة طلب جديد</span>
                </button>
              )}
              {view === 'admin' && currentUserRole === 'super_admin' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNewMerchantModal(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-sm transition"
                  >
                    <Plus size={15} />
                    <span>تسجيل تاجر</span>
                  </button>
                  <button
                    onClick={() => setNewMarketerModal(true)}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition"
                  >
                    <Plus size={15} />
                    <span>إضافة مروج</span>
                  </button>
                </div>
              )}
              {view === 'campaigns' && (
                <button
                  onClick={() => setNewCampaignModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-sm transition active:scale-95"
                >
                  <Plus size={16} />
                  <span>إنشاء حملة إعلانية</span>
                </button>
              )}
            </div>
          </header>

          {/* ===== لوحة الإحصائيات العلوية بالأرقام العربية ===== */}
          <div className="mb-7 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-[#253765] flex items-center gap-1.5">
                <TrendingUp size={15} />
                <span>مؤشرات الأداء المالي، اللوجستي، والتسويقي {currentUserRole === 'merchant' && `(خاصة بـ ${activeMerchantName})`}</span>
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
                    {tr === 'today' ? 'اليوم' : tr === 'week' ? 'هذا الأسبوع' : tr === 'month' ? 'هذا الشهر' : 'الكل'}
                  </button>
                ))}
              </div>
            </div>

            {/* البطاقات الأربع بالأرقام العربية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-[#253765]" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">إجمالي المبيعات والطلبات</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    +{toArabicDigits('18.4')}% ↗
                  </span>
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {formatArabicCurrency(stats.totalRev)}
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  تم تحصيل: <strong className="text-emerald-700">{formatArabicCurrency(stats.paidRev)}</strong>
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-purple-600" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">الدفع الإلكتروني (Zain / Qi)</p>
                  <CreditCard size={15} className="text-purple-600" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {toArabicDigits(userScopedOrders.filter((o) => o.payment_status === 'تم الدفع').length)}{' '}
                  <span className="text-xs font-semibold text-purple-700">عملية مؤكدة</span>
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">بوابات زين كاش وكي كارد نشطة</p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-sky-600" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">الشحنات النشطة والتوصيل</p>
                  <Truck size={15} className="text-sky-600" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {toArabicDigits(stats.activeDeliveries)}{' '}
                  <span className="text-xs font-semibold text-sky-700">قيد الشحن</span>
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  نسبة التسليم الناجح: <strong className="text-emerald-700">{formatArabicPercent(stats.successRate)}</strong>
                </p>
              </div>

              <div className="card-luxury rounded-2xl p-4.5 bg-white border border-[#E2E8F0] relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-[3px] bg-amber-500" />
                <div className="flex items-start justify-between">
                  <p className="text-xs text-[#64748B] font-semibold">عائد الإعلانات (ROAS)</p>
                  <Megaphone size={15} className="text-amber-600" />
                </div>
                <p className="text-2xl font-black text-[#0F172A] mt-2 font-mono">
                  {toArabicDigits(stats.avgRoas)}x{' '}
                  <span className="text-xs font-semibold text-emerald-700">معدل العائد</span>
                </p>
                <p className="mt-2 text-[11px] text-[#64748B]">
                  طلبات مولدة: <strong className="text-[#0F172A]">{toArabicDigits(stats.totalAdOrders)} طلب</strong>
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
                    {['الكل', 'جديد', 'قيد المعالجة', 'بالطريق', 'تم التسليم', 'ملغي'].map((st) => (
                      <button
                        key={st}
                        onClick={() => setStatusFilter(st)}
                        className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
                          statusFilter === st
                            ? 'bg-[#253765] text-white shadow-sm'
                            : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 text-xs border border-[#CBD5E1] rounded-xl bg-white px-3 py-2 focus-within:border-[#253765] transition">
                    <Search size={14} className="text-[#64748B]" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="بحث بالرقم، الزبون، المتجر، الهاتف..."
                      className="bg-transparent outline-none placeholder:text-[#94A3B8] text-[#0F172A] w-48 sm:w-56 text-xs"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                        <th className="p-3.5">الطلب</th>
                        <th className="p-3.5">الزبون والمدينة</th>
                        <th className="p-3.5">المبلغ المطلوب</th>
                        <th className="p-3.5">حالة التوصيل</th>
                        <th className="p-3.5">طريقة الدفع</th>
                        <th className="p-3.5 text-center">العمليات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]">
                      {filteredOrders.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-500">
                            لا توجد طلبات مسجلة لهذا المتجر حالياً
                          </td>
                        </tr>
                      ) : (
                        filteredOrders.map((order) => (
                          <tr
                            key={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className="hover:bg-[#F8FAFC] transition-colors cursor-pointer"
                          >
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="font-bold text-[#253765]">{toArabicDigits(order.id)}</span>
                              <div className="text-[10px] text-[#64748B] mt-0.5">
                                {toArabicDigits(new Date(order.created_at).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }))}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <p className="font-bold text-[#0F172A] text-[13px]">{order.customer_name}</p>
                              <p className="text-[11px] text-[#64748B]">{order.city} • {formatArabicPhone(order.customer_phone)}</p>
                            </td>
                            <td className="p-3.5 whitespace-nowrap font-bold text-emerald-700 text-sm">
                              {formatArabicCurrency(order.total_amount)}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <StatusBadge status={order.status} />
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="space-y-1">
                                <PaymentMethodBadge method={order.payment_method} />
                                <div>
                                  <StatusBadge status={order.payment_status} />
                                </div>
                              </div>
                            </td>
                            <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setPaymentModalOrder(order)
                                    setPaymentGateway(order.payment_method === 'qicard' ? 'qicard' : 'zaincash')
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-[#253765] hover:bg-[#1D2B50] text-white font-bold transition shadow-sm"
                                >
                                  <CreditCard size={12} />
                                  <span>دفع</span>
                                </button>
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

              {/* قسم المحادثات الجانبي */}
              <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden shadow-sm">
                <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={17} className="text-[#253765]" />
                    <p className="text-sm font-bold text-[#0F172A]">
                      {currentUserRole === 'merchant' ? `محادثات زبائن ${activeMerchantName}` : 'محادثات البوت الحية'}
                    </p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#253765] text-white font-bold">
                    {toArabicDigits(userScopedConversations.length)} نشطة
                  </span>
                </div>
                <div className="divide-y divide-[#E2E8F0]">
                  {userScopedConversations.length === 0 ? (
                    <p className="p-6 text-center text-xs text-slate-400">لا توجد محادثات نشطة لهذا المتجر</p>
                  ) : (
                    userScopedConversations.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => setActiveChat(c)}
                        className="p-4 hover:bg-[#F8FAFC] transition cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-[#0F172A]">{c.customer_name}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold">
                            {c.channel}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B] line-clamp-2 leading-relaxed mb-2">
                          {toArabicDigits(c.last_message)}
                        </p>
                        <StatusBadge status={c.status} />
                      </div>
                    ))
                  )}
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
                    <span>إدارة التجار والاشتراكات ({toArabicDigits(merchants.length)})</span>
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
                    <span>إدارة المروجين والحملات ({toArabicDigits(marketers.length)})</span>
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
                    <span>صلاحيات المنصة والـ API</span>
                  </button>
                </div>

                <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full font-bold">
                  صلاحية مدير النظام الكاملة (Full Platform Access)
                </span>
              </div>

              {/* Sub-tab 1: إدارة التجار والاشتراكات */}
              {adminSubTab === 'merchants' && (
                <div className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between">
                    <p className="text-sm font-bold text-[#0F172A]">قائمة المتاجر المسجلة والتحكم بالاشتراكات</p>
                    <button
                      onClick={() => setNewMerchantModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#253765] text-white font-bold text-xs"
                    >
                      <Plus size={14} />
                      <span>إضافة تاجر جديد</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                          <th className="p-3.5">المتجر</th>
                          <th className="p-3.5">المدينة والمسؤول</th>
                          <th className="p-3.5">نوع الباقة</th>
                          <th className="p-3.5">الاشتراك</th>
                          <th className="p-3.5">نسبة العمولة</th>
                          <th className="p-3.5">الرصيد المالي</th>
                          <th className="p-3.5 text-left">إجراءات الإدارة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {merchants.map((m) => (
                          <tr key={m.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-3.5">
                              <p className="font-bold text-[13px] text-[#0F172A]">{m.name}</p>
                              <p className="text-[10px] text-[#64748B]">المعرف: {toArabicDigits(m.id)}</p>
                            </td>
                            <td className="p-3.5">
                              <p className="font-semibold text-slate-800">{m.city}</p>
                              <p className="text-[11px] text-[#64748B]">{m.owner_name} • {formatArabicPhone(m.phone)}</p>
                            </td>
                            <td className="p-3.5">
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 font-bold text-[11px]">
                                {m.plan}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <StatusBadge status={m.subscription_status} />
                            </td>
                            <td className="p-3.5 font-bold text-[#253765]">
                              {formatArabicPercent(m.commission_rate || 5)}
                            </td>
                            <td className="p-3.5 font-bold text-emerald-700 text-sm">
                              {formatArabicCurrency(m.balance)}
                            </td>
                            <td className="p-3.5 text-left">
                              <button
                                onClick={() => setSelectedMerchant(m)}
                                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white shadow-sm transition"
                              >
                                <span>التحكم بالاشتراك</span>
                                <Sliders size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
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
                      <p className="text-sm font-bold text-[#0F172A]">سجل المروجين ووكالات التسويق المعتمدة</p>
                      <p className="text-xs text-slate-500">إدارة حسابات المسوقين وتعيين المتاجر وإشراف الحملات الإعلانية</p>
                    </div>
                    <button
                      onClick={() => setNewMarketerModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#253765] text-white font-bold text-xs"
                    >
                      <Plus size={14} />
                      <span>إضافة حساب مروج</span>
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="text-[#64748B] border-b border-[#E2E8F0] bg-[#F8FAFC] font-semibold">
                          <th className="p-3.5">المروج / الوكالة</th>
                          <th className="p-3.5">الاتصال والبريد</th>
                          <th className="p-3.5">المتاجر المسندة</th>
                          <th className="p-3.5">الحملات النشطة</th>
                          <th className="p-3.5">الميزانيات المدارة</th>
                          <th className="p-3.5">نسبة العمولة</th>
                          <th className="p-3.5 text-left">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {marketers.map((mkt) => (
                          <tr key={mkt.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="p-3.5">
                              <p className="font-bold text-[13px] text-[#0F172A]">{mkt.name}</p>
                              <p className="text-[11px] text-[#64748B]">{mkt.agency_name}</p>
                            </td>
                            <td className="p-3.5 text-slate-700">
                              <p>{formatArabicPhone(mkt.phone)}</p>
                              <p className="text-[10px] text-slate-400">{mkt.email}</p>
                            </td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1">
                                {mkt.assigned_merchants.map((merchantName) => (
                                  <span key={merchantName} className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 text-[10px] font-bold">
                                    {merchantName}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="p-3.5 font-bold text-slate-800">
                              {toArabicDigits(mkt.active_campaigns_count)} حملات
                            </td>
                            <td className="p-3.5 font-bold text-emerald-700">
                              {formatArabicCurrency(mkt.total_ad_budget_managed)}
                            </td>
                            <td className="p-3.5 font-bold text-[#253765]">
                              {formatArabicPercent(mkt.commission_rate)}
                            </td>
                            <td className="p-3.5 text-left">
                              <StatusBadge status={mkt.status} />
                            </td>
                          </tr>
                        ))}
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
                      <h3 className="text-sm font-bold text-[#0F172A]">إعدادات الـ Webhooks والربط المركزي للمنصة</h3>
                      <p className="text-slate-500">التحكم بالمفاتيح البرمجية الرئيسية ومسارات الربط مع بوابات التوصيل والدفع</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <p className="font-bold text-slate-800">مسار Webhook البوتات (WhatsApp & Messenger)</p>
                      <p className="font-mono text-[11px] text-[#253765] bg-white p-2 rounded border border-slate-200">
                        https://api.bariq.app/api/webhooks/bot
                      </p>
                      <span className="text-[10px] text-emerald-700 font-bold">● متصل ويعمل بنسبة {toArabicDigits('99.9')}%</span>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <p className="font-bold text-slate-800">مسار مزامنة التوصيل والشحن اللوجستي</p>
                      <p className="font-mono text-[11px] text-[#253765] bg-white p-2 rounded border border-slate-200">
                        https://api.bariq.app/api/delivery/sync
                      </p>
                      <span className="text-[10px] text-emerald-700 font-bold">● متصل مع أنظمة المناديب</span>
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
                        ? `لوحة متابعة إعلانات ${activeMerchantName}`
                        : 'إدارة ومتابعة الحملات الإعلانية لكافة المتاجر'}
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      {currentUserRole === 'merchant'
                        ? 'مراقبة العائد المالي (ROAS)، الوصول، والميزانية المصروفة على حملات متجرك'
                        : 'إطلاق وتعديل الحملات وتحديث الميزانيات وكتابة التوجيهات للعملاء'}
                    </p>
                  </div>
                </div>

                {currentUserRole === 'super_admin' && (
                  <button
                    onClick={() => setNewCampaignModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#253765] text-white font-bold text-xs shadow-sm hover:bg-[#1D2B50] transition"
                  >
                    <Plus size={15} />
                    <span>إنشاء حملة جديدة</span>
                  </button>
                )}
              </div>

              {/* بطاقات الحملات الإعلانية */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredCampaigns.length === 0 ? (
                  <div className="col-span-2 p-12 bg-white rounded-2xl border border-slate-200 text-center text-slate-500">
                    لا توجد حملات إعلانية مسجلة لهذا المتجر حالياً
                  </div>
                ) : (
                  filteredCampaigns.map((camp) => {
                    const spendPercent = Math.min(100, Math.round((camp.budget_spent / camp.budget_total) * 100))
                    return (
                      <div
                        key={camp.id}
                        className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] p-5 shadow-sm space-y-4 hover:border-[#253765]/40 transition"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <PlatformBadge platform={camp.platform} />
                              <StatusBadge status={camp.status} />
                            </div>
                            <h3 className="text-sm font-bold text-[#0F172A]">{camp.name}</h3>
                            <p className="text-xs text-[#64748B]">
                              التاجر: <strong className="text-slate-800">{camp.merchant_name}</strong> • المروج: {camp.marketer_name}
                            </p>
                          </div>

                          {currentUserRole === 'super_admin' && (
                            <button
                              onClick={() => {
                                const nextSt: AdCampaignStatus = camp.status === 'نشطة' ? 'متوقفة' : 'نشطة'
                                setCampaigns((prev) => prev.map((c) => (c.id === camp.id ? { ...c, status: nextSt } : c)))
                                showToast(`تم ${nextSt === 'نشطة' ? 'تفعيل' : 'إيقاف'} الحملة`, 'info')
                              }}
                              className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 ${
                                camp.status === 'نشطة'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {camp.status === 'نشطة' ? <Pause size={13} /> : <Play size={13} />}
                              <span>{camp.status === 'نشطة' ? 'إيقاف' : 'تشغيل'}</span>
                            </button>
                          )}
                        </div>

                        {/* مؤشرات الأداء بالأرقام العربية */}
                        <div className="grid grid-cols-4 gap-2 bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-center text-xs">
                          <div>
                            <p className="text-[10px] text-[#64748B]">الوصول</p>
                            <p className="font-bold text-[#0F172A] mt-0.5">{formatArabicNumber(camp.reach)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">النقرات</p>
                            <p className="font-bold text-[#0F172A] mt-0.5">{formatArabicNumber(camp.clicks)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">الطلبات</p>
                            <p className="font-bold text-emerald-700 mt-0.5">{toArabicDigits(camp.conversions)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">العائد (ROAS)</p>
                            <p className="font-black text-[#253765] mt-0.5 font-mono">{toArabicDigits(camp.roas)}x</p>
                          </div>
                        </div>

                        {/* شريط الميزانية */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold">
                            <span className="text-[#64748B]">
                              المصروف: <strong className="text-slate-900">{formatArabicCurrency(camp.budget_spent)}</strong>
                            </span>
                            <span className="text-[#253765]">
                              الميزانية: {formatArabicCurrency(camp.budget_total)} ({formatArabicPercent(spendPercent)})
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
                              <span>تقرير وتوصية خبير التسويق:</span>
                            </p>
                            <p className="leading-relaxed text-[11px]">{toArabicDigits(camp.marketer_notes)}</p>
                          </div>
                        )}

                        <div className="pt-2 flex items-center justify-between text-xs">
                          <span className="text-[11px] text-[#64748B]">الفترة: {formatArabicDate(camp.start_date)} إلى {formatArabicDate(camp.end_date)}</span>
                          <button
                            onClick={() => setSelectedCampaign(camp)}
                            className="font-bold text-[#253765] hover:underline inline-flex items-center gap-1"
                          >
                            <span>عرض التقرير</span>
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
                    <StatusBadge status={selectedMerchant.subscription_status} />
                  </div>
                  <p className="text-xs text-[#64748B]">المعرف: {toArabicDigits(selectedMerchant.id)} • مدينة {selectedMerchant.city}</p>
                </div>
              </div>
              <button onClick={() => setSelectedMerchant(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] text-[#64748B]">الرصيد المتاح</p>
                  <p className="text-lg font-black text-emerald-700 font-mono mt-1">
                    {formatArabicCurrency(selectedMerchant.balance)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] text-[#64748B]">إجمالي الشحنات</p>
                  <p className="text-lg font-black text-slate-800 font-mono mt-1">
                    {toArabicDigits(selectedMerchant.orders_count)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-[10px] text-[#64748B]">الرسوم الشهرية</p>
                  <p className="text-lg font-black text-[#253765] font-mono mt-1">
                    {formatArabicCurrency(selectedMerchant.monthly_fee)}
                  </p>
                </div>
              </div>

              {/* تعديل الباقة والاشتراك */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#253765] border-b border-slate-200 pb-1.5">
                  إعدادات الاشتراك والباقة (صلاحيات الإدارة)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">باقة المتجر</label>
                    <select
                      value={selectedMerchant.plan}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, plan: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    >
                      <option value="أساسية">أساسية</option>
                      <option value="متقدمة">متقدمة</option>
                      <option value="احترافية">احترافية</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">حالة الاشتراك</label>
                    <select
                      value={selectedMerchant.subscription_status}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, subscription_status: e.target.value as any })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    >
                      <option value="نشط">نشط</option>
                      <option value="تجريبي">تجريبي</option>
                      <option value="متوقف">متوقف</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">الرسوم الشهرية (د.ع)</label>
                    <input
                      type="number"
                      value={selectedMerchant.monthly_fee}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, monthly_fee: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    />
                  </div>
                  <div>
                    <label className="text-[#64748B] block mb-1 font-bold">نسبة عمولة التوصيل (%)</label>
                    <input
                      type="number"
                      value={selectedMerchant.commission_rate || 5}
                      onChange={(e) => setSelectedMerchant({ ...selectedMerchant, commission_rate: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]"
                    />
                  </div>
                </div>
              </div>

              {/* الربط البرمجي ومفاتيح الـ API */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-[#253765]">مفتاح الوصول البرمجي (API Key):</h3>
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Key size={14} className="text-[#253765] shrink-0" />
                  <span className="font-mono text-[11px] text-slate-800 flex-1 truncate">{selectedMerchant.api_key}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(selectedMerchant.api_key)
                      setCopiedKey(true)
                      setTimeout(() => setCopiedKey(false), 2000)
                      showToast('تم نسخ مفتاح الـ API', 'info')
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
                إلغاء
              </button>
              <button
                onClick={() => {
                  setMerchants((prev) => prev.map((m) => (m.id === selectedMerchant.id ? selectedMerchant : m)))
                  setSelectedMerchant(null)
                  showToast(`تم حفظ تعديلات حساب ${selectedMerchant.name} بنجاح`, 'success')
                }}
                className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs"
              >
                حفظ التغييرات الإدارية
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
              <h2 className="text-sm font-bold text-[#0F172A]">تسجيل مروج / وكالة إعلانات جديدة</h2>
              <button onClick={() => setNewMarketerModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const newMkt: Marketer = {
                  id: `mkt-${Math.floor(100 + Math.random() * 900)}`,
                  name: (fd.get('name') as string) || 'مروج جديد',
                  agency_name: (fd.get('agency_name') as string) || 'وكالة إعلانات',
                  email: (fd.get('email') as string) || '',
                  phone: (fd.get('phone') as string) || '',
                  status: 'نشط',
                  assigned_merchants: [(fd.get('assigned_merchant') as string) || 'متجر دجلة'],
                  active_campaigns_count: 0,
                  total_ad_budget_managed: 0,
                  commission_rate: Number(fd.get('commission_rate')) || 10,
                  created_at: new Date().toISOString().split('T')[0]
                }
                setMarketers([newMkt, ...marketers])
                setNewMarketerModal(false)
                showToast(`تم تسجيل المروج "${newMkt.name}" بنجاح`, 'success')
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">اسم المروج / المسوق *</label>
                <input required name="name" placeholder="مثال: يوسف الكرخي" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">اسم الوكالة أو الفريق</label>
                  <input name="agency_name" placeholder="وكالة ديجيتال" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">رقم الهاتف *</label>
                  <input required name="phone" placeholder="077XXXXXXXX" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">إسناد المتجر الأولي</label>
                  <select name="assigned_merchant" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                    {merchants.map((m) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">نسبة عمولة الإعلانات (%)</label>
                  <input required type="number" name="commission_rate" defaultValue="10" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewMarketerModal(false)} className="text-slate-500 font-bold">إلغاء</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">تسجيل المروج</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ===== باقي النوافذ ===== */}
      {/* ========================================================================= */}
      {paymentModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#253765] text-white flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0F172A]">الدفع الإلكتروني العراقي</h2>
                  <p className="text-xs text-[#64748B]">طلب #{toArabicDigits(paymentModalOrder.id)} • {paymentModalOrder.customer_name}</p>
                </div>
              </div>
              <button onClick={() => setPaymentModalOrder(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-[#64748B]">المبلغ المطلوب تحصيله:</p>
                  <p className="text-2xl font-black text-emerald-700 font-mono mt-1">
                    {formatArabicCurrency(paymentModalOrder.total_amount)}
                  </p>
                </div>
                <StatusBadge status={paymentModalOrder.payment_status} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentGateway('zaincash')}
                  className={`p-3.5 rounded-xl border flex flex-col items-center text-center transition ${
                    paymentGateway === 'zaincash'
                      ? 'border-purple-600 bg-purple-50 text-purple-900 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-xs mb-1.5">
                    Z
                  </div>
                  <span className="font-bold text-xs">محفظة زين كاش</span>
                  <span className="text-[10px] text-purple-700">Zain Cash Iraq</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentGateway('qicard')}
                  className={`p-3.5 rounded-xl border flex flex-col items-center text-center transition ${
                    paymentGateway === 'qicard'
                      ? 'border-rose-600 bg-rose-50 text-rose-900 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-xs mb-1.5">
                    Qi
                  </div>
                  <span className="font-bold text-xs">بطاقة كي كارد / ماستر</span>
                  <span className="text-[10px] text-rose-700">Qi Card & Master</span>
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button onClick={() => setPaymentModalOrder(null)} className="text-xs font-bold text-slate-500">
                إلغاء
              </button>
              <button
                disabled={paymentProcessing}
                onClick={handleExecutePayment}
                className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-md transition disabled:opacity-50 flex items-center gap-2"
              >
                {paymentProcessing ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                <span>تأكيد إتمام الدفع ({paymentGateway === 'zaincash' ? 'زين كاش' : 'كي كارد'})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* تفاصيل الطلب */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-[#0F172A]">تفاصيل الطلب #{toArabicDigits(selectedOrder.id)}</h2>
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">المتجر: {selectedOrder.merchant_name}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between"><span className="text-[#64748B]">الزبون:</span><span className="font-bold">{selectedOrder.customer_name}</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">الهاتف:</span><span>{formatArabicPhone(selectedOrder.customer_phone)}</span></div>
                <div className="flex justify-between"><span className="text-[#64748B]">العنوان:</span><span>{selectedOrder.city} - {toArabicDigits(selectedOrder.address)}</span></div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold">
                  <span>المبلغ المطلوب:</span>
                  <span className="text-emerald-700 text-sm">{formatArabicCurrency(selectedOrder.total_amount)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => handlePrintLabel(selectedOrder)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs"
              >
                <Printer size={14} />
                <span>طباعة البوليصة</span>
              </button>
              <button onClick={() => setSelectedOrder(null)} className="px-5 py-2 rounded-xl bg-[#253765] text-white font-bold text-xs">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة المحادثة */}
      {activeChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col h-[560px] text-right">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#253765] text-white flex items-center justify-center">
                  <MessageCircle size={17} />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#0F172A]">{activeChat.customer_name}</h3>
                  <p className="text-[10px] text-[#64748B]">قناة {activeChat.channel} • {activeChat.merchant_name}</p>
                </div>
              </div>
              <button onClick={() => setActiveChat(null)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#F8FAFC] text-xs">
              {activeChat.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'agent' ? 'items-end' : m.sender === 'bot' ? 'items-center' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-3 ${
                      m.sender === 'agent'
                        ? 'bg-[#253765] text-white font-semibold'
                        : m.sender === 'bot'
                        ? 'bg-slate-200 text-slate-800 text-center'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    <p className="leading-relaxed">{toArabicDigits(m.text)}</p>
                  </div>
                  <span className="text-[9px] text-slate-400 mt-1 px-1">{toArabicDigits(m.time)}</span>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-100 bg-white flex items-center gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && replyText.trim()) {
                    const newM: ChatMessage = { id: `m-${Date.now()}`, sender: 'agent', text: replyText.trim(), time: 'الآن' }
                    const updated = { ...activeChat, last_message: newM.text, messages: [...activeChat.messages, newM] }
                    setConversations((prev) => prev.map((c) => (c.id === activeChat.id ? updated : c)))
                    setActiveChat(updated)
                    setReplyText('')
                    showToast('تم إرسال الرد للزبون', 'success')
                  }
                }}
                placeholder="اكتب ردك للزبون هنا..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#253765]"
              />
              <button
                onClick={() => {
                  if (replyText.trim()) {
                    const newM: ChatMessage = { id: `m-${Date.now()}`, sender: 'agent', text: replyText.trim(), time: 'الآن' }
                    const updated = { ...activeChat, last_message: newM.text, messages: [...activeChat.messages, newM] }
                    setConversations((prev) => prev.map((c) => (c.id === activeChat.id ? updated : c)))
                    setActiveChat(updated)
                    setReplyText('')
                    showToast('تم إرسال الرد للزبون', 'success')
                  }
                }}
                className="p-2.5 rounded-xl bg-[#253765] text-white"
              >
                <Send size={15} />
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
                  <StatusBadge status={selectedCampaign.status} />
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
                  <p className="text-[10px] text-slate-500">الوصول الكلي</p>
                  <p className="font-bold text-slate-800 text-sm mt-0.5">{formatArabicNumber(selectedCampaign.reach)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">الطلبات المولدة</p>
                  <p className="font-bold text-emerald-700 text-sm mt-0.5">{toArabicDigits(selectedCampaign.conversions)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">معدل العائد (ROAS)</p>
                  <p className="font-black text-[#253765] text-sm mt-0.5 font-mono">{toArabicDigits(selectedCampaign.roas)}x</p>
                </div>
              </div>

              <div>
                <span className="text-[#64748B] block font-bold mb-1">الجمهور المستهدف:</span>
                <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{toArabicDigits(selectedCampaign.target_audience)}</p>
              </div>

              <div>
                <span className="text-[#64748B] block font-bold mb-1">النص الإعلاني (Headline):</span>
                <p className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800">{toArabicDigits(selectedCampaign.ad_headline)}</p>
              </div>

              {selectedCampaign.marketer_notes && (
                <div>
                  <span className="text-[#64748B] block font-bold mb-1">ملاحظات وتوصية المروج:</span>
                  <p className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 leading-relaxed">{toArabicDigits(selectedCampaign.marketer_notes)}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setSelectedCampaign(null)} className="px-5 py-2 rounded-xl bg-[#253765] text-white font-bold text-xs">
                إغلاق
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
              <h2 className="text-sm font-bold text-[#0F172A]">تسجيل تاجر جديد في الإدارة</h2>
              <button onClick={() => setNewMerchantModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const newM: Merchant = {
                  id: `m${merchants.length + 1}`,
                  name: (fd.get('name') as string) || 'متجر جديد',
                  owner_name: (fd.get('owner_name') as string) || '',
                  phone: (fd.get('phone') as string) || '',
                  city: (fd.get('city') as string) || 'بغداد',
                  plan: 'أساسية',
                  subscription_status: 'تجريبي',
                  api_connected: true,
                  monthly_fee: 25000,
                  api_key: `brq_key_${Math.random().toString(36).substring(2, 9)}`,
                  orders_count: 0,
                  balance: 0
                }
                setMerchants([...merchants, newM])
                setNewMerchantModal(false)
                showToast(`تم تسجيل المتجر "${newM.name}" في الإدارة بنجاح`, 'success')
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">اسم المتجر *</label>
                <input required name="name" placeholder="مثال: بوتيك أور" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">اسم المالك</label>
                  <input name="owner_name" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">رقم الهاتف</label>
                  <input name="phone" placeholder="077XXXXXXXX" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewMerchantModal(false)} className="text-slate-500 font-bold">إلغاء</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">تسجيل الحساب</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إضافة طلب جديد */}
      {newOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">إضافة طلب شحن جديد</h2>
              <button onClick={() => setNewOrderModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const newO: Order = {
                  id: `BRQ-${Math.floor(1000 + Math.random() * 9000)}`,
                  customer_name: (fd.get('customer_name') as string) || 'زبون جديد',
                  customer_phone: (fd.get('customer_phone') as string) || '07700000000',
                  address: (fd.get('address') as string) || 'بغداد',
                  city: (fd.get('city') as string) || 'بغداد',
                  total_amount: Number(fd.get('total_amount')) || 25000,
                  status: 'جديد',
                  payment_status: 'غير مدفوع',
                  payment_method: 'عند الاستلام',
                  created_at: new Date().toISOString(),
                  merchant_name: currentUserRole === 'merchant' ? activeMerchantName : ((fd.get('merchant_name') as string) || 'متجر دجلة')
                }
                setOrders([newO, ...orders])
                setNewOrderModal(false)
                showToast(`تم إنشاء الطلب ${toArabicDigits(newO.id)} بنجاح`, 'success')
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">اسم الزبون *</label>
                <input required name="customer_name" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">رقم الهاتف *</label>
                  <input required name="customer_phone" placeholder="077XXXXXXXX" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">المدينة</label>
                  <select name="city" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                    <option value="بغداد">بغداد</option>
                    <option value="البصرة">البصرة</option>
                    <option value="أربيل">أربيل</option>
                    <option value="النجف">النجف</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">العنوان *</label>
                <input required name="address" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              {currentUserRole === 'super_admin' && (
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">المتجر التابع له</label>
                  <select name="merchant_name" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                    {merchants.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">المبلغ (د.ع) *</label>
                <input required type="number" name="total_amount" defaultValue="35000" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewOrderModal(false)} className="text-slate-500 font-bold">إلغاء</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">إنشاء الطلب</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* نافذة إنشاء حملة جديدة */}
      {newCampaignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden text-right">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#0F172A]">إطلاق حملة ترويج إعلانية جديدة</h2>
              <button onClick={() => setNewCampaignModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={17} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                const newC: AdCampaign = {
                  id: `CMP-${Math.floor(700 + Math.random() * 300)}`,
                  name: (fd.get('name') as string) || 'حملة إعلانية جديدة',
                  merchant_id: 'm1',
                  merchant_name: currentUserRole === 'merchant' ? activeMerchantName : ((fd.get('merchant_name') as string) || 'متجر دجلة'),
                  platform: (fd.get('platform') as AdPlatform) || 'instagram',
                  status: 'نشطة',
                  budget_total: Number(fd.get('budget_total')) || 250000,
                  budget_spent: 0,
                  daily_budget: Number(fd.get('daily_budget')) || 20000,
                  reach: 0,
                  impressions: 0,
                  clicks: 0,
                  conversions: 0,
                  roas: 0,
                  start_date: new Date().toISOString().split('T')[0],
                  end_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().split('T')[0],
                  target_audience: (fd.get('target_audience') as string) || 'العراق',
                  ad_headline: (fd.get('ad_headline') as string) || '',
                  marketer_notes: 'تم إطلاق الحملة حديثاً من قبل المروج.',
                  marketer_name: 'وكالة برق ميديا'
                }
                setCampaigns([newC, ...campaigns])
                setNewCampaignModal(false)
                showToast(`تم إطلاق الحملة "${newC.name}" بنجاح`, 'success')
              }}
              className="p-5 space-y-3 text-xs"
            >
              <div>
                <label className="text-[#64748B] block mb-1 font-bold">اسم الحملة الإعلانية *</label>
                <input required name="name" placeholder="مثال: حملة عروض نهاية الأسبوع" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">المنصة الإعلانية *</label>
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
                    <label className="text-[#64748B] block mb-1 font-bold">المتجر / العميل *</label>
                    <select name="merchant_name" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]">
                      {merchants.map((m) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">الميزانية الإجمالية (د.ع) *</label>
                  <input required type="number" name="budget_total" defaultValue="300000" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
                <div>
                  <label className="text-[#64748B] block mb-1 font-bold">الميزانية اليومية (د.ع)</label>
                  <input required type="number" name="daily_budget" defaultValue="20000" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
                </div>
              </div>

              <div>
                <label className="text-[#64748B] block mb-1 font-bold">الجمهور المستهدف</label>
                <input name="target_audience" placeholder="مثال: فئة الشباب 18-35 سنة في بغداد والمحافظات" className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2 text-slate-800 outline-none focus:border-[#253765]" />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between">
                <button type="button" onClick={() => setNewCampaignModal(false)} className="text-slate-500 font-bold">إلغاء</button>
                <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs">إطلاق الحملة</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}