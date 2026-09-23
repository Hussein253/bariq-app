/**
 * نموذج باقات الاشتراك.
 * ======================
 * آمن للاستيراد في المتصفح: أنواع ومنطق نقي فقط، بلا مفاتيح ولا استعلامات.
 *
 * ⚠️ محتوى صفحة التعريف (الإمكانات، الجمهور، خطوات البدء، الأسئلة) لم يعد
 * هنا: انتقل إلى قواميس اللغات في lib/i18n/locales — نصٌّ يُعرض للزائر مكانه
 * حيث يُترجَم، لا حيث تُعرَّف حدود الاشتراك.
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

/**
 * تسميات عربية للشاشات الداخلية (مساحة التاجر).
 * ⚠️ الواجهات العامة لا تقرأ من هنا بل من القاموس: هذه الشاشات لم تُترجَم
 * بعد، وترجمتها عمل قائم بذاته — فتبقى تسمياتها حيث هي حتى ذلك الحين.
 */
export const ANALYTICS_LABELS: Record<AnalyticsTier, string> = {
  basic: 'إحصائيات أساسية',
  advanced: 'إحصائيات متقدمة',
}

export const SUPPORT_LABELS: Record<SupportTier, string> = {
  standard: 'دعم قياسي',
  priority: 'دعم ذو أولوية',
  vip: 'دعم مخصّص VIP',
}

/** قوالب أسطر المواصفات كما تأتي من قاموس اللغة المعروضة. */
export interface PlanSpecLabels {
  social: string
  actions: string
  catalogs: string
  products: string
  orderBooks: string
  seats: string
  analyticsBasic: string
  analyticsAdvanced: string
  supportPriority: string
  supportVip: string
  api: string
}

/**
 * يبني أسطر مواصفات الباقة المعروضة تحت السعر.
 *
 * ⚠️ الأرقام تمرّ بـ formatNumber التي يمرّرها المُستدعي: هي التي تعرف لغة
 * العرض فتكتب ٢٠٠ أو 200. بناء السطر هنا بأرقام ثابتة يجعل بطاقة السعر
 * تخلط أرقاماً غربية بنصّ عربي أو العكس.
 */
export function planSpecLines(
  plan: Plan,
  labels: PlanSpecLabels,
  formatNumber: (value: number) => string
): string[] {
  const put = (template: string, values: Record<string, number>): string =>
    template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? formatNumber(values[key]) : match
    )

  const lines = [
    put(labels.social, { social: plan.max_social_accounts, agents: plan.max_ai_agents }),
    put(labels.actions, { actions: plan.max_actions_monthly }),
    put(labels.catalogs, { catalogs: plan.max_catalogs }),
    put(labels.products, { products: plan.max_products }),
    put(labels.orderBooks, { orderBooks: plan.max_order_books }),
    put(labels.seats, { seats: plan.max_team_seats }),
    plan.analytics_tier === 'advanced' ? labels.analyticsAdvanced : labels.analyticsBasic,
  ]

  if (plan.support_tier === 'priority') lines.push(labels.supportPriority)
  if (plan.support_tier === 'vip') lines.push(labels.supportVip)
  if (plan.has_api_access) lines.push(labels.api)

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
