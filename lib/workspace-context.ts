import { requireRole, resolveActiveMerchant, type SessionProfile } from '@/lib/auth'
import { listMerchantsWithPlan } from '@/lib/entitlements'

/**
 * سياق مساحة التاجر — أي تاجر تعرضه الصفحة ولمن
 * ===============================================
 * الصفحات الثلاث (/workspace و /workspace/catalog و /workspace/agents) كانت
 * تكرّر نفس السطر:
 *
 *     const activeId = requestedId && merchants.some(m => m.id === requestedId)
 *       ? requestedId : merchants[0]?.id
 *
 * وفيه عيبان: المعرّف يُقبل من الرابط من أي زائر (فيفتح مساحة أي تاجر)،
 * والسقوط على `merchants[0]` يعني أن كل زائر يرى بيانات أول تاجر في القاعدة
 * بلا أن يطلب شيئاً. الاثنان يُغلقان هنا في مكان واحد.
 *
 * القاعدة الآن:
 *   merchant       → تاجره من الجلسة. ما في الرابط يُتجاهل تماماً.
 *   platform_owner → أي تاجر (دعم فني)، ويُقيَّد الدخول في سجل التدقيق.
 *   staff          → ليس تاجراً ولا ينوب عنه — يُحوَّل إلى /operations.
 */

export interface WorkspaceMerchantOption {
  id: string
  name: string
  planName: string | null
}

export interface WorkspaceContext {
  profile: SessionProfile
  /** التاجر المعروض، أو null إن لم يُحدَّد أو لم يكن الحساب مربوطاً بتاجر. */
  merchantId: string | null
  /**
   * خيارات مُبدِّل التاجر. لمالك المنصة وحده قائمة كاملة؛ ولغيره تبقى فارغة
   * لأن مجرّد معرفة أسماء بقية التجار تسريب لا مبرّر له.
   */
  merchants: WorkspaceMerchantOption[]
  /** هل يفتح مالك المنصة مساحة ليست له؟ يُعرض شريط تنبيه في الواجهة. */
  impersonating: boolean
}

export async function loadWorkspaceContext(
  requestedId?: string | null
): Promise<WorkspaceContext> {
  const profile = await requireRole(['merchant', 'platform_owner'])

  if (profile.role === 'merchant') {
    return {
      profile,
      merchantId: profile.merchantId,
      merchants: [],
      impersonating: false,
    }
  }

  // مالك المنصة: القائمة كاملة، والمطلوب أولاً وإلا أول تاجر.
  const merchants = await listMerchantsWithPlan()
  const target = requestedId?.trim() || merchants[0]?.id || null

  if (!target) {
    return { profile, merchantId: null, merchants, impersonating: false }
  }

  const active = await resolveActiveMerchant(profile, target)

  return {
    profile,
    merchantId: active?.merchantId ?? null,
    merchants,
    impersonating: active?.impersonating ?? false,
  }
}
