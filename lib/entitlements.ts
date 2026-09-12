import { supabaseServer } from '@/lib/supabase-server'
import type { Plan } from '@/lib/plans'

/**
 * صلاحيات التاجر وحدود باقته واستهلاكه الفعلي.
 * =============================================
 * ⚠️ يستعمل service_role — لا يُستورد أبداً في كود المتصفح.
 *
 * كل رقم استهلاك هنا محسوب من جداول حقيقية. ما لا يمكن قياسه بعد
 * يُعاد كـ null ويُعرض في الواجهة كـ "غير متاح" — لا يُقدَّر ولا يُختلق،
 * لأن حدّ باقة مبنياً على رقم مُخمَّن يمنع تاجراً دافعاً من العمل.
 */

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'

export interface Subscription {
  id: string
  merchant_id: string
  plan_id: string
  status: SubscriptionStatus
  current_period_start: string
  current_period_end: string | null
}

export interface UsageMetric {
  /** الاستهلاك الحالي، أو null إن لم يكن قابلاً للقياس بعد. */
  used: number | null
  limit: number
  label: string
  /** سبب تعذّر القياس — يُعرض للتاجر بدل رقم كاذب. */
  unavailableReason?: string
}

export interface MerchantEntitlements {
  merchant: { id: string; name: string; status: string }
  plan: Plan
  subscription: Subscription
  usage: {
    actions: UsageMetric
    teamSeats: UsageMetric
    products: UsageMetric
  }
}

/** نسبة الاستهلاك من الحدّ، أو null إن تعذّر القياس. */
export function usageRatio(metric: UsageMetric): number | null {
  if (metric.used === null || metric.limit <= 0) return null
  return Math.min(metric.used / metric.limit, 1)
}

/** هل تجاوز التاجر حدّ هذا المقياس؟ غير المقيس لا يُعتبر تجاوزاً أبداً. */
export function isOverLimit(metric: UsageMetric): boolean {
  return metric.used !== null && metric.used >= metric.limit
}

/**
 * يجلب باقة التاجر الفعّالة مع استهلاكه في الدورة الجارية.
 * يعيد null إن لم يكن للتاجر اشتراك فعّال — وهي حالة تُعالَج بعرض
 * دعوة للاشتراك، لا بمنح صلاحيات افتراضية.
 */
export async function loadMerchantEntitlements(
  merchantId: string
): Promise<MerchantEntitlements | null> {
  const { data: subRow, error: subError } = await supabaseServer
    .from('subscriptions')
    .select('*, plans(*), merchants(id, name, status)')
    .eq('merchant_id', merchantId)
    .in('status', ['trialing', 'active', 'past_due'])
    .maybeSingle()

  if (subError) throw new Error(subError.message)
  if (!subRow) return null

  const row = subRow as unknown as Subscription & {
    plans: Plan
    merchants: { id: string; name: string; status: string }
  }
  const { plans: plan, merchants: merchant, ...subscription } = row
  if (!plan || !merchant) return null

  const [actionsUsed, seatsUsed] = await Promise.all([
    countBotActions(merchantId, subscription.current_period_start),
    countTeamSeats(merchantId),
  ])

  return {
    merchant,
    plan,
    subscription,
    usage: {
      actions: {
        used: actionsUsed,
        limit: plan.max_actions_monthly,
        label: 'الإجراءات في الدورة الحالية',
      },
      teamSeats: {
        used: seatsUsed,
        limit: plan.max_team_seats,
        label: 'مقاعد الفريق',
      },
      products: {
        used: null,
        limit: plan.max_products,
        label: 'المنتجات والخدمات',
        // جدول products عام بلا عمود merchant_id، فلا يمكن نسب منتج
        // إلى تاجر بعينه. القياس يصبح ممكناً فور إضافة العمود وترحيل الصفوف.
        unavailableReason: 'يتطلب ربط جدول المنتجات بالتاجر',
      },
    },
  }
}

/**
 * الإجراء = رسالة واحدة أرسلها البوت نيابة عن التاجر داخل الدورة الجارية.
 * هذا التعريف نفسه المعروض للتاجر في صفحة الأسعار.
 */
async function countBotActions(merchantId: string, periodStart: string): Promise<number> {
  const { data: convs, error: convError } = await supabaseServer
    .from('conversations')
    .select('id')
    .eq('merchant_id', merchantId)

  if (convError) throw new Error(convError.message)

  const ids = (convs || []).map((c) => (c as { id: string }).id)
  if (ids.length === 0) return 0

  const { count, error } = await supabaseServer
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', ids)
    .eq('sender_type', 'bot')
    .gte('created_at', periodStart)

  if (error) throw new Error(error.message)
  return count ?? 0
}

async function countTeamSeats(merchantId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('merchant_id', merchantId)

  if (error) throw new Error(error.message)
  return count ?? 0
}

/** قائمة التجار لمحوّل الحساب — حتى يُبنى تسجيل الدخول الحقيقي. */
export async function listMerchantsWithPlan(): Promise<
  { id: string; name: string; planName: string | null }[]
> {
  const { data, error } = await supabaseServer
    .from('merchants')
    .select('id, name, subscriptions(status, plans(name_en))')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return ((data || []) as unknown as {
    id: string
    name: string
    subscriptions: { status: string; plans: { name_en: string } | null }[]
  }[]).map((m) => {
    const live = m.subscriptions?.find((s) =>
      ['trialing', 'active', 'past_due'].includes(s.status)
    )
    return { id: m.id, name: m.name, planName: live?.plans?.name_en ?? null }
  })
}
