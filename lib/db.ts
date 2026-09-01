/**
 * مخزن البيانات المركزي لمنصة "برق" (Bariq In-Memory & Central DB Store)
 * -----------------------------------------------------------------
 * يدعم جميع عمليات الـ API، البوتات، بوابات الدفع، وإدارة الشحنات والتجار والحملات الإعلانية والمروجين
 */

export type OrderStatus = 'جديد' | 'قيد المعالجة' | 'بالطريق' | 'تم التسليم' | 'ملغي'
export type PaymentStatus = 'غير مدفوع' | 'قيد المعالجة' | 'تم الدفع' | 'فشل الدفع' | 'مسترجع'
export type PaymentGateway = 'عند الاستلام' | 'zaincash' | 'qicard' | 'زين كاش' | 'كي كارد' | 'ماستركارد'

export interface OrderTimelineEvent {
  title: string
  time: string
  description: string
  completed: boolean
}

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
  delivery_fee: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: PaymentGateway
  transaction_id?: string
  payment_link?: string
  created_at: string
  updated_at: string
  merchant_name: string
  merchant_id: string
  items?: OrderItem[]
  notes?: string
  driver_name?: string
  driver_phone?: string
  timeline?: OrderTimelineEvent[]
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
  created_at: string
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
  merchant_id: string
  messages: ChatMessage[]
}

export interface PaymentTransaction {
  id: string
  order_id: string
  gateway: 'zaincash' | 'qicard'
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed'
  customer_phone: string
  reference_id: string
  created_at: string
  completed_at?: string
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
  created_at: string
}

// Initial In-Memory Store
class BariqDatabase {
  private orders: Order[] = [
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
      created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      merchant_name: 'متجر دجلة',
      merchant_id: 'm1',
      items: [
        { id: 'it-1', name: 'ساعة يد كلاسيكية', quantity: 1, price: 40000 },
        { id: 'it-2', name: 'علبة هدايا فاخرة', quantity: 1, price: 5000 }
      ],
      notes: 'الاتصال قبل الوصول بربع ساعة',
      driver_name: 'حيدر السعدي',
      driver_phone: '07709988771',
      timeline: [
        { title: 'إنشاء الطلب عبر بوت واتساب', time: '10:15 ص', description: 'تم تسجيل الطلب وتأكيد العنوان', completed: true },
        { title: 'بانتظار معالجة المتجر', time: '10:20 ص', description: 'جاري تجهيز الشحنة من المتجر', completed: false }
      ]
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
      created_at: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      merchant_name: 'ستايل بغداد',
      merchant_id: 'm2',
      items: [
        { id: 'it-3', name: 'فستان صيفي حرير', quantity: 1, price: 56000 }
      ],
      notes: 'تغليف خاص للهدايا',
      timeline: [
        { title: 'إنشاء الطلب', time: '09:45 ص', description: 'تم إنشاء الطلب عبر المتجر الإلكتروني', completed: true },
        { title: 'دفع إلكتروني ناجح (زين كاش)', time: '09:48 ص', description: 'تم استلام المبلغ بنجاح عبر محفظة زين كاش', completed: true },
        { title: 'تجهيز الشحنة', time: '10:10 ص', description: 'تم التغليف وجاهزة لتسليمها للمندوب', completed: true }
      ]
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
      created_at: new Date(Date.now() - 1000 * 60 * 130).toISOString(),
      updated_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
      merchant_name: 'متجر دجلة',
      merchant_id: 'm1',
      items: [
        { id: 'it-4', name: 'عطر ليلي شرقي 100ml', quantity: 1, price: 33500 }
      ],
      driver_name: 'عمر التكريتي',
      driver_phone: '07705544332',
      timeline: [
        { title: 'إنشاء الطلب', time: '08:30 ص', description: 'تم تسجيل الطلب', completed: true },
        { title: 'دفع عبر بطاقة كي كارد / ماستركارد', time: '08:32 ص', description: 'تم الخصم والمصادقة الأمنية', completed: true },
        { title: 'استلام المندوب', time: '09:15 ص', description: 'استلم المندوب عمر الشحنة وهو بالطريق للزبون', completed: true }
      ]
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
      updated_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      merchant_name: 'أزياء الفرات',
      merchant_id: 'm3',
      driver_name: 'كرديار أربيل',
      driver_phone: '07501122334',
      timeline: [
        { title: 'إنشاء الطلب', time: '05:00 ص', description: 'تم تسجيل الطلب', completed: true },
        { title: 'بالطريق للتسليم', time: '07:30 ص', description: 'خرجت الشحنة للتوصيل', completed: true },
        { title: 'تم التسليم بنجاح', time: '08:45 ص', description: 'تم تسليم الشحنة وتحصيل المبلغ نقداً', completed: true }
      ]
    }
  ]

  private merchants: Merchant[] = [
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
      created_at: '2025-01-10',
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
      created_at: '2025-02-01',
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
      created_at: '2024-11-15',
      orders_count: 310,
      balance: 0
    }
  ]

  private marketers: Marketer[] = [
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

  private conversations: Conversation[] = [
    {
      id: 'c1',
      customer_name: 'أحمد الجبوري',
      customer_phone: '07701234567',
      last_message: 'وين وصل الطلب مالتي رقم BRQ-1001؟',
      channel: 'whatsapp',
      status: 'بانتظار رد',
      updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      merchant_name: 'متجر دجلة',
      merchant_id: 'm1',
      messages: [
        { id: 'm1-1', sender: 'customer', text: 'مرحباً، سويت طلب الصبح', time: '10:30 ص' },
        { id: 'm1-2', sender: 'bot', text: 'أهلاً بك في متجر دجلة عبر برق ⚡ تم تسجيل طلبك بنجاح.', time: '10:30 ص' },
        { id: 'm1-3', sender: 'customer', text: 'وين وصل الطلب مالتي رقم BRQ-1001؟', time: '11:15 ص' }
      ]
    },
    {
      id: 'c2',
      customer_name: 'زينب العبيدي',
      customer_phone: '07809876543',
      last_message: 'أريد أتحدث مع موظف خدمة العملاء بخصوص العنوان',
      channel: 'messenger',
      status: 'تم التصعيد',
      updated_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      merchant_name: 'ستايل بغداد',
      merchant_id: 'm2',
      messages: [
        { id: 'm2-1', sender: 'customer', text: 'مساء الخير، كتبت العنوان خطأ', time: '11:00 ص' },
        { id: 'm2-2', sender: 'bot', text: 'يرجى تزويدنا بالعنوان الصحيح وسنقوم بتحديثه', time: '11:01 ص' },
        { id: 'm2-3', sender: 'customer', text: 'أريد أتحدث مع موظف خدمة العملاء بخصوص العنوان', time: '11:05 ص' }
      ]
    },
    {
      id: 'c3',
      customer_name: 'حيدر الكعبي',
      customer_phone: '07723456789',
      last_message: 'تم تأكيد استلام الطلب والدفع، شكراً جزيلاً',
      channel: 'instagram',
      status: 'يرد تلقائيًا',
      updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      merchant_name: 'متجر دجلة',
      merchant_id: 'm1',
      messages: [
        { id: 'm3-1', sender: 'customer', text: 'شكراً، استلمت الطلب ودفعت عبر زين كاش', time: '09:00 ص' },
        { id: 'm3-2', sender: 'bot', text: 'سعداء بخدمتك! نتمنى لك يوماً سعيداً ⚡', time: '09:01 ص' }
      ]
    }
  ]

  private transactions: PaymentTransaction[] = [
    {
      id: 'TX-ZC-991',
      order_id: 'BRQ-1002',
      gateway: 'zaincash',
      amount: 62000,
      currency: 'IQD',
      status: 'completed',
      customer_phone: '07809876543',
      reference_id: 'ZC-TX-883921',
      created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 48).toISOString()
    },
    {
      id: 'TX-QI-992',
      order_id: 'BRQ-1003',
      gateway: 'qicard',
      amount: 38500,
      currency: 'IQD',
      status: 'completed',
      customer_phone: '07505551234',
      reference_id: 'QI-TX-440192',
      created_at: new Date(Date.now() - 1000 * 60 * 125).toISOString(),
      completed_at: new Date(Date.now() - 1000 * 60 * 124).toISOString()
    }
  ]

  private campaigns: AdCampaign[] = [
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
      marketer_name: 'أحمد عادل الخفاجي',
      created_at: '2026-08-15'
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
      marketer_notes: 'الفيديو الإعلاني الأول تريند على تيك توك بنسبة تفاعل 8.2%. خيار الدفع عند الاستلام هو الأكثر طلباً.',
      marketer_name: 'مريم خليل الشمري',
      created_at: '2026-08-18'
    },
    {
      id: 'CMP-703',
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
      marketer_notes: 'تم إنهاء الحملة بنجاح، بانتظار تجديد الميزانية للموسم الجديد.',
      marketer_name: 'أحمد عادل الخفاجي',
      created_at: '2026-08-01'
    },
    {
      id: 'CMP-704',
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
      target_audience: 'رجال وسيدات الأعمال وعشاق الساعات الفاخرة (24-50 سنة)',
      ad_headline: 'تسوق بأمان وادفع إلكترونياً عبر زين كاش أو كي كارد',
      marketer_notes: 'الإعلان يستهدف جمهور الدفع الرقمي والطلبات ذات القيمة المرتفعة.',
      marketer_name: 'أحمد عادل الخفاجي',
      created_at: '2026-08-22'
    }
  ]

  // ===== Order Operations =====
  public getOrders(filter?: { status?: string; merchant_id?: string; merchant_name?: string; search?: string }): Order[] {
    return this.orders.filter((o) => {
      if (filter?.status && filter.status !== 'الكل' && o.status !== filter.status) return false
      if (filter?.merchant_id && o.merchant_id !== filter.merchant_id) return false
      if (filter?.merchant_name && filter.merchant_name !== 'all' && o.merchant_name !== filter.merchant_name) return false
      if (filter?.search) {
        const q = filter.search.toLowerCase()
        const matches =
          o.id.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          o.customer_phone.includes(q) ||
          o.merchant_name.toLowerCase().includes(q) ||
          o.address.toLowerCase().includes(q)
        if (!matches) return false
      }
      return true
    })
  }

  public getOrderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id)
  }

  public createOrder(orderData: Partial<Order>): Order {
    const newId = orderData.id || `BRQ-${Math.floor(1000 + Math.random() * 9000)}`
    const newOrder: Order = {
      id: newId,
      customer_name: orderData.customer_name || 'زبون عام',
      customer_phone: orderData.customer_phone || '07700000000',
      address: orderData.address || 'العنوان غير محدد',
      city: orderData.city || 'بغداد',
      total_amount: Number(orderData.total_amount) || 0,
      delivery_fee: Number(orderData.delivery_fee) || 5000,
      status: orderData.status || 'جديد',
      payment_status: orderData.payment_status || 'غير مدفوع',
      payment_method: orderData.payment_method || 'عند الاستلام',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      merchant_name: orderData.merchant_name || 'متجر دجلة',
      merchant_id: orderData.merchant_id || 'm1',
      items: orderData.items || [{ id: 'it-gen', name: 'طلب تجاري', quantity: 1, price: Number(orderData.total_amount) || 0 }],
      notes: orderData.notes || '',
      timeline: [
        {
          title: 'إنشاء الطلب في المنصة',
          time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
          description: 'تم تسجيل الطلب وجاري إسناده',
          completed: true
        }
      ]
    }
    this.orders.unshift(newOrder)
    return newOrder
  }

  public updateOrderStatus(id: string, status: OrderStatus, notes?: string): Order | null {
    const idx = this.orders.findIndex((o) => o.id === id)
    if (idx === -1) return null

    const current = this.orders[idx]
    const updated: Order = {
      ...current,
      status,
      updated_at: new Date().toISOString(),
      timeline: [
        ...(current.timeline || []),
        {
          title: `تحديث الحالة إلى: ${status}`,
          time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
          description: notes || `تم تحديث حالة الشحنة بنجاح من خلال النظام`,
          completed: true
        }
      ]
    }
    this.orders[idx] = updated
    return updated
  }

  public updateOrderPayment(id: string, paymentStatus: PaymentStatus, transactionId?: string, gateway?: PaymentGateway): Order | null {
    const idx = this.orders.findIndex((o) => o.id === id)
    if (idx === -1) return null

    const current = this.orders[idx]
    const updated: Order = {
      ...current,
      payment_status: paymentStatus,
      transaction_id: transactionId || current.transaction_id,
      payment_method: gateway || current.payment_method,
      status: paymentStatus === 'تم الدفع' && current.status === 'جديد' ? 'قيد المعالجة' : current.status,
      updated_at: new Date().toISOString(),
      timeline: [
        ...(current.timeline || []),
        {
          title: `تأكيد الدفع الإلكتروني (${gateway || current.payment_method})`,
          time: new Date().toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }),
          description: `تم إتمام عملية الدفع بنجاح. رقم العملية: ${transactionId || 'N/A'}`,
          completed: true
        }
      ]
    }
    this.orders[idx] = updated

    // Update merchant balance if paid
    if (paymentStatus === 'تم الدفع') {
      const merchantIdx = this.merchants.findIndex((m) => m.id === current.merchant_id || m.name === current.merchant_name)
      if (merchantIdx !== -1) {
        this.merchants[merchantIdx].balance += current.total_amount
      }
    }

    return updated
  }

  // ===== Merchant Operations =====
  public getMerchants(): Merchant[] {
    return this.merchants
  }

  public getMerchantByApiKey(apiKey: string): Merchant | undefined {
    return this.merchants.find((m) => m.api_key === apiKey)
  }

  public getMerchantById(id: string): Merchant | undefined {
    return this.merchants.find((m) => m.id === id)
  }

  public updateMerchant(merchant: Merchant): Merchant {
    const idx = this.merchants.findIndex((m) => m.id === merchant.id)
    if (idx !== -1) {
      this.merchants[idx] = merchant
    } else {
      this.merchants.push(merchant)
    }
    return merchant
  }

  public deleteMerchant(id: string): boolean {
    const idx = this.merchants.findIndex((m) => m.id === id)
    if (idx === -1) return false
    this.merchants.splice(idx, 1)
    return true
  }

  // ===== Marketer Operations =====
  public getMarketers(): Marketer[] {
    return this.marketers
  }

  public createMarketer(data: Partial<Marketer>): Marketer {
    const newMkt: Marketer = {
      id: `mkt-${Math.floor(100 + Math.random() * 900)}`,
      name: data.name || 'مروج جديد',
      agency_name: data.agency_name || 'وكالة تسويق رقمي',
      email: data.email || 'marketer@bariq.app',
      phone: data.phone || '07700000000',
      status: 'نشط',
      assigned_merchants: data.assigned_merchants || ['متجر دجلة'],
      active_campaigns_count: 0,
      total_ad_budget_managed: 0,
      commission_rate: Number(data.commission_rate) || 10,
      created_at: new Date().toISOString().split('T')[0]
    }
    this.marketers.unshift(newMkt)
    return newMkt
  }

  public updateMarketer(id: string, data: Partial<Marketer>): Marketer | null {
    const idx = this.marketers.findIndex((m) => m.id === id)
    if (idx === -1) return null
    this.marketers[idx] = { ...this.marketers[idx], ...data }
    return this.marketers[idx]
  }

  // ===== Campaign Operations =====
  public getCampaigns(merchantName?: string): AdCampaign[] {
    if (merchantName && merchantName !== 'الكل' && merchantName !== 'all') {
      return this.campaigns.filter((c) => c.merchant_name === merchantName)
    }
    return this.campaigns
  }

  public createCampaign(campaignData: Partial<AdCampaign>): AdCampaign {
    const newCamp: AdCampaign = {
      id: `CMP-${Math.floor(700 + Math.random() * 300)}`,
      name: campaignData.name || 'حملة إعلانية جديدة',
      merchant_id: campaignData.merchant_id || 'm1',
      merchant_name: campaignData.merchant_name || 'متجر دجلة',
      platform: campaignData.platform || 'instagram',
      status: campaignData.status || 'نشطة',
      budget_total: Number(campaignData.budget_total) || 250000,
      budget_spent: 0,
      daily_budget: Number(campaignData.daily_budget) || 20000,
      reach: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      roas: 0,
      start_date: campaignData.start_date || new Date().toISOString().split('T')[0],
      end_date: campaignData.end_date || new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().split('T')[0],
      target_audience: campaignData.target_audience || 'الجمهور المستهدف في العراق',
      ad_headline: campaignData.ad_headline || '',
      marketer_notes: campaignData.marketer_notes || 'تم إنشاء الحملة حديثاً وجاري تشغيل الإعلانات.',
      marketer_name: campaignData.marketer_name || 'فريق برق ميديا',
      created_at: new Date().toISOString().split('T')[0]
    }
    this.campaigns.unshift(newCamp)
    return newCamp
  }

  public updateCampaignStatus(id: string, status: AdCampaignStatus): AdCampaign | null {
    const idx = this.campaigns.findIndex((c) => c.id === id)
    if (idx === -1) return null
    this.campaigns[idx].status = status
    return this.campaigns[idx]
  }

  public updateCampaignBudget(id: string, budgetTotal: number, dailyBudget: number, notes?: string): AdCampaign | null {
    const idx = this.campaigns.findIndex((c) => c.id === id)
    if (idx === -1) return null
    this.campaigns[idx].budget_total = budgetTotal
    this.campaigns[idx].daily_budget = dailyBudget
    if (notes) {
      this.campaigns[idx].marketer_notes = notes
    }
    return this.campaigns[idx]
  }

  // ===== Conversation Operations =====
  public getConversations(merchantName?: string): Conversation[] {
    if (merchantName && merchantName !== 'الكل' && merchantName !== 'all') {
      return this.conversations.filter((c) => c.merchant_name === merchantName)
    }
    return this.conversations
  }

  public addMessageToConversation(conversationId: string, message: ChatMessage): Conversation | null {
    const idx = this.conversations.findIndex((c) => c.id === conversationId)
    if (idx === -1) return null

    const current = this.conversations[idx]
    const updated: Conversation = {
      ...current,
      last_message: message.text,
      updated_at: new Date().toISOString(),
      messages: [...(current.messages || []), message]
    }
    this.conversations[idx] = updated
    return updated
  }

  // ===== Payment Transaction Operations =====
  public createTransaction(tx: Omit<PaymentTransaction, 'id' | 'created_at'>): PaymentTransaction {
    const newTx: PaymentTransaction = {
      id: `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      created_at: new Date().toISOString(),
      ...tx
    }
    this.transactions.unshift(newTx)
    return newTx
  }

  public completeTransaction(txId: string, referenceId: string): PaymentTransaction | null {
    const idx = this.transactions.findIndex((t) => t.id === txId || t.reference_id === referenceId)
    if (idx === -1) return null

    this.transactions[idx].status = 'completed'
    this.transactions[idx].completed_at = new Date().toISOString()
    return this.transactions[idx]
  }

  public getTransactions(): PaymentTransaction[] {
    return this.transactions
  }
}

// Global Singleton Instance
const globalDb = (global as any).__bariq_db || new BariqDatabase()
if (process.env.NODE_ENV !== 'production') {
  ;(global as any).__bariq_db = globalDb
}

export const db = globalDb
