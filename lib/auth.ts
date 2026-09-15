import { redirect } from 'next/navigation'
import { createSessionClient } from '@/lib/supabase/session'
import { supabaseServer } from '@/lib/supabase-server'
import { log } from '@/lib/log'
import { homeForRole, isAppRole, type AppRole } from '@/lib/roles'

export { ROLE_LABELS, homeForRole, isAppRole, APP_ROLES } from '@/lib/roles'
export type { AppRole } from '@/lib/roles'

/**
 * هوية المستخدم وصلاحياته — المصدر الوحيد للحقيقة
 * =================================================
 * قبل هذا الملف لم يكن في المنصة تسجيل دخول إطلاقاً: كل مسار يعمل بـ
 * service_role، وهوية التاجر تُقرأ من شريط العنوان (`?merchant=`). أي زائر
 * كان يبدّل المعرّف فيقرأ ويكتب بيانات تاجر آخر.
 *
 * الآن الهوية تأتي من جلسة Supabase وحدها، والدور والتاجر من public.profiles.
 * لا دالة هنا تقبل هوية من المُرسِل.
 */

export interface SessionProfile {
  userId: string
  email: string | null
  role: AppRole
  /** تاجر المستخدم. null لمالك المنصة وموظفي برق — ليسوا تجاراً. */
  merchantId: string | null
  storeName: string | null
}

/**
 * جلسة المستخدم الحالي مع دوره، أو null إن لم يكن داخلاً.
 *
 * getUser لا getSession: الأولى تتحقق من التوكن لدى خادم Supabase، والثانية
 * تقرأ الكوكي كما هو. كوكي مزوَّر يمرّ من الثانية ولا يمرّ من الأولى.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSessionClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // القراءة بـ service_role عمداً: سياسة profiles تسمح للمستخدم بقراءة صفّه،
  // لكن هذه الدالة تُستدعى في كل طلب تقريباً، ومرور الدور عبر RLS يجعل أي
  // خطأ مستقبلي في تلك السياسة يُسقط الصلاحيات بصمت بدل أن يمنع الدخول.
  const { data: profile, error } = await supabaseServer
    .from('profiles')
    .select('role, merchant_id, store_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    log.error('AUTH_PROFILE_LOOKUP_FAILED', { user_id: user.id, reason: error.message })
    return null
  }

  // مستخدم بلا صف في profiles لا يُمنح دوراً افتراضياً: حساب في auth.users
  // وحده لا يعني صلاحية على شيء. الربط يتم صراحةً (انظر supabase/seed).
  if (!profile || !isAppRole(profile.role)) {
    log.warn('AUTH_PROFILE_MISSING_OR_INVALID_ROLE', { user_id: user.id })
    return null
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role,
    merchantId: profile.merchant_id ?? null,
    storeName: profile.store_name ?? null,
  }
}

/**
 * يفرض وجود جلسة بأحد الأدوار المسموحة، وإلا يحوّل.
 * غير الداخل يُحوَّل إلى /login مع مسار العودة، والداخل بدور غير مخوَّل
 * يُحوَّل إلى واجهته هو — لا إلى صفحة خطأ، فالمشكلة ليست خطأً منه.
 */
export async function requireRole(allowed: AppRole[]): Promise<SessionProfile> {
  const profile = await getSessionProfile()

  if (!profile) redirect('/login')
  if (!allowed.includes(profile.role)) redirect(homeForRole(profile.role))

  return profile
}

export interface ActiveMerchant {
  merchantId: string
  /** هل يفتح مالك المنصة مساحة تاجر ليست له؟ */
  impersonating: boolean
}

/**
 * التاجر الذي تعمل عليه الصفحة أو المسار الحالي.
 *
 * التاجر العادي: تاجره من الجلسة حصراً، ويُتجاهل ما في الرابط تماماً.
 * مالك المنصة: يجوز له فتح مساحة أي تاجر (دعم فني)، ويُقيَّد كل دخول من هذا
 * النوع في admin_impersonation_log — الصلاحية بلا أثر تعني أن لا أحد يعرف
 * من اطّلع على بيانات من ولا متى.
 * موظف برق: ليس تاجراً ولا ينوب عن تاجر.
 */
export async function resolveActiveMerchant(
  profile: SessionProfile,
  requestedMerchantId?: string | null
): Promise<ActiveMerchant | null> {
  if (profile.role === 'merchant') {
    return profile.merchantId ? { merchantId: profile.merchantId, impersonating: false } : null
  }

  if (profile.role !== 'platform_owner') return null

  const requested = requestedMerchantId?.trim()
  if (!requested) return null

  const { data: merchant, error } = await supabaseServer
    .from('merchants')
    .select('id')
    .eq('id', requested)
    .maybeSingle()

  if (error || !merchant) return null

  await recordImpersonation(profile.userId, merchant.id)
  return { merchantId: merchant.id, impersonating: true }
}

/**
 * يقيّد دخول مالك المنصة إلى مساحة تاجر.
 * الفشل لا يمنع الدخول: تعطّل السجل مشكلة تشغيلية تُرصد في اللوق، وحجب
 * الدعم الفني بسببها ضرر أكبر — لكنه يُطبع صراحةً ليُلاحَظ.
 */
async function recordImpersonation(actorUserId: string, merchantId: string): Promise<void> {
  const { error } = await supabaseServer
    .from('admin_impersonation_log')
    .insert({ actor_user_id: actorUserId, merchant_id: merchantId })

  if (error) {
    log.error('IMPERSONATION_LOG_WRITE_FAILED', {
      actor_user_id: actorUserId,
      merchant_id: merchantId,
      reason: error.message,
    })
    return
  }

  log.info('MERCHANT_WORKSPACE_IMPERSONATED', {
    actor_user_id: actorUserId,
    merchant_id: merchantId,
  })
}
