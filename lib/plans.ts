/**
 * نموذج باقات الاشتراك ومحتوى صفحة التعريف بمنصة برق.
 * ====================================================
 * آمن للاستيراد في المتصفح: أنواع ومحتوى ثابت فقط، بلا مفاتيح ولا استعلامات.
 */

export type AnalyticsTier = 'basic' | 'advanced'
export type SupportTier = 'standard' | 'priority' | 'vip'

export interface Plan {
  id: string
  code: string
  name_en: string
  tagline_ar: string
  /** السعر الشهري بالدينار. null = لم يُعتمد سعر بعد ويُعرض "قريباً". */
  price_iqd_monthly: number | null
  /** السعر قبل خصم الإطلاق لعرض الشطب. null = لا خصم. */
  list_price_iqd_monthly: number | null
  sort_order: number
  is_featured: boolean
  max_social_accounts: number
  max_ai_agents: number
  max_actions_monthly: number
  max_catalogs: number
  max_products: number
  max_order_books: number
  max_team_seats: number
  analytics_tier: AnalyticsTier
  support_tier: SupportTier
  has_api_access: boolean
}

export const ANALYTICS_LABELS: Record<AnalyticsTier, string> = {
  basic: 'إحصائيات أساسية',
  advanced: 'إحصائيات متقدمة',
}

export const SUPPORT_LABELS: Record<SupportTier, string> = {
  standard: 'دعم قياسي',
  priority: 'دعم ذو أولوية',
  vip: 'دعم مخصّص VIP',
}

/** يبني أسطر مواصفات الباقة المعروضة تحت السعر. */
export function planSpecLines(plan: Plan): string[] {
  const lines = [
    `${plan.max_social_accounts} حسابات تواصل اجتماعي (حتى ${plan.max_ai_agents} موظف ذكي)`,
    `${plan.max_actions_monthly.toLocaleString('en-US')} إجراء شهرياً`,
    `${plan.max_catalogs} قاعدة منتجات وخدمات`,
    `${plan.max_products.toLocaleString('en-US')} منتج وخدمة على مستوى الحساب`,
    `${plan.max_order_books} سجل طلبات`,
    `${plan.max_team_seats} مقعد لأعضاء الفريق`,
    ANALYTICS_LABELS[plan.analytics_tier],
  ]
  if (plan.support_tier !== 'standard') lines.push(SUPPORT_LABELS[plan.support_tier])
  if (plan.has_api_access) lines.push('وصول برمجي كامل (API)')
  return lines
}

/**
 * يرشّح باقة بناءً على الحجم الشهري المتوقع للإجراءات.
 * يُستعمل في حاسبة الباقة على صفحة التعريف.
 */
export function recommendPlan(monthlyActions: number, plans: Plan[]): Plan | null {
  const sorted = [...plans].sort((a, b) => a.max_actions_monthly - b.max_actions_monthly)
  return sorted.find((p) => p.max_actions_monthly >= monthlyActions) ?? sorted[sorted.length - 1] ?? null
}

// ---------- محتوى صفحة التعريف ----------

export interface Capability {
  /** الاسم التسويقي الأنيق بالعربية. */
  title: string
  /** المقابل الإنجليزي المعروض كسطر ثانوي. */
  subtitle: string
  body: string
  /** مفتاح أيقونة lucide يُترجم في المكوّن. */
  icon: string
}

export const CAPABILITIES: Capability[] = [
  {
    title: 'العقل المعرفي',
    subtitle: 'Knowledge Core',
    icon: 'brain',
    body: 'يتعلّم الموظف الذكي منتجاتك وخدماتك وسياساتك، ثم يجيب كل زبون من قاعدة معرفتك أنت — لا من التخمين.',
  },
  {
    title: 'المركز الموحّد',
    subtitle: 'Unified Inbox',
    icon: 'inbox',
    body: 'واتساب وإنستغرام وماسنجر في شاشة واحدة. كل رسالة تصل مكانها، ولا استفسار يضيع بين الإشعارات.',
  },
  {
    title: 'الالتقاط الذكي',
    subtitle: 'Smart Capture',
    icon: 'clipboard',
    body: 'كل طلب وكل موعد يُسجَّل في قاعدة البيانات لحظة تأكيده داخل المحادثة — بلا إعادة كتابة ولا نسخ يدوي.',
  },
  {
    title: 'الجسر اللوجستي',
    subtitle: 'Logistics Bridge',
    icon: 'truck',
    body: 'ما يميّز برق: الطلب المؤكَّد في المحادثة يتحوّل إلى شحنة برقم تتبّع وملصق حراري جاهز للطباعة، دون مغادرة المنصة.',
  },
  {
    title: 'الحوافز الفورية',
    subtitle: 'Instant Rewards',
    icon: 'ticket',
    body: 'يطبّق الزبون رمز الخصم داخل المحادثة مباشرة، فيُتحقَّق منه ويُحتسب على المبلغ فوراً.',
  },
  {
    title: 'الهوية الحيّة',
    subtitle: 'Live Profile',
    icon: 'mapPin',
    body: 'الموقع وساعات العمل وسياسات التوصيل والإرجاع — تفاصيل عملك حاضرة للزبون في أي ساعة يسأل فيها.',
  },
  {
    title: 'الرادار التجاري',
    subtitle: 'Deal Radar',
    icon: 'radar',
    body: 'طلبات الجملة وعروض الشراكة والرعاية تُرصَد وتُميَّز، فلا تضيع صفقة تستحق المتابعة وسط الرسائل اليومية.',
  },
  {
    title: 'النبض المستمر',
    subtitle: 'Always-On',
    icon: 'activity',
    body: 'المنصة تعمل على مدار الساعة — حين تنام، وحين تنشغل، وحين يتضاعف الضغط في موسم الذروة.',
  },
]

export interface AudienceSegment {
  title: string
  body: string
  icon: string
}

export const AUDIENCE: AudienceSegment[] = [
  {
    title: 'أصحاب المتاجر على إنستغرام وفيسبوك',
    icon: 'store',
    body: 'سواء بدأت البيع للتو أو تدير متجراً قائماً، برق يغطّي الحالتين بالإعداد نفسه.',
  },
  {
    title: 'مديرو حسابات التواصل',
    icon: 'users',
    body: 'تدير صفحات نيابة عن أصحابها؟ كل صفحة تحصل على موظفها الذكي المستقلّ بقاعدة معرفتها الخاصة.',
  },
  {
    title: 'وكالات التسويق',
    icon: 'layers',
    body: 'رسائل عملاء زبائنك تفوق طاقة الفريق؟ برق يدير تلك المحادثات على أي نطاق تحتاجه.',
  },
  {
    title: 'التجّار الذين يشحنون يومياً',
    icon: 'package',
    body: 'من المحادثة إلى باب الزبون: حجز، ملصق، مندوب، تتبّع، ثم تسوية مالية دقيقة.',
  },
]

export interface OnboardingStep {
  title: string
  body: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { title: 'أنشئ حسابك', body: 'سجّل على باقة Spark المجانية — دون بطاقة ائتمان ودون مدة محددة.' },
  { title: 'ابنِ قاعدة معرفتك', body: 'أضِف منتجاتك وخدماتك وأسعارك وسياساتك ليجيب الموظف الذكي بدقّة.' },
  { title: 'اربط قنواتك', body: 'اربط حساب إنستغرام أو فيسبوك للأعمال عبر واجهة Meta الرسمية بنقرتين.' },
  { title: 'اضبط الأسلوب وشغّل', body: 'حدّد نبرة الردّ، فعّل الخدمة، ودَع برق يتولّى المحادثات والشحن.' },
]

export interface FaqEntry {
  question: string
  answer: string
}

export const FAQ: FaqEntry[] = [
  {
    question: 'هل يتحدث الموظف الذكي باللهجة العراقية؟',
    answer:
      'نعم. الردود مضبوطة على لهجة السوق العراقي ومصطلحاته، مع نبرة مهنية مهذّبة تناسب بيئة التجارة الإلكترونية المحلية.',
  },
  {
    question: 'ماذا يحدث عندما لا يعرف الموظف الذكي الإجابة؟',
    answer:
      'يتوقّف عن التخمين ويصعّد المحادثة إليك فوراً مع وسمها كـ «تم التصعيد» في المركز الموحّد، فتراها في أعلى القائمة وتتولّاها بنفسك.',
  },
  {
    question: 'هل أستطيع التدخّل في المحادثة يدوياً؟',
    answer:
      'في أي لحظة. إيقاف الموظف الذكي على محادثة بعينها يتم بزرّ واحد، فتكمل أنت الحوار ثم تعيد تفعيله متى شئت.',
  },
  {
    question: 'هل يتعرّض حسابي على إنستغرام أو فيسبوك للتقييد؟',
    answer:
      'الربط يتم عبر واجهات Meta الرسمية المعتمدة (WhatsApp Cloud API و Messenger و Instagram Messaging) وضمن حدود سياساتها — لا أتمتة غير رسمية ولا وصول من خارج القنوات المعتمدة.',
  },
  {
    question: 'كيف يرتبط الطلب بالشحن؟',
    answer:
      'عند تأكيد الطلب داخل المحادثة يُنشأ تلقائياً في سجل الطلبات برقم تتبّع وملصق حراري جاهز، ثم ينتقل في مسار الشحنة حتى التسوية المالية مع التاجر.',
  },
  {
    question: 'ما الذي يُحتسب «إجراءً»؟',
    answer:
      'الإجراء الواحد = رسالة واحدة يعالجها الموظف الذكي نيابةً عنك. رسائلك التي ترسلها بنفسك لا تُحتسب.',
  },
]
