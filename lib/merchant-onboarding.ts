import { supabaseServer } from '@/lib/supabase-server'
import { isAppRole, type AppRole } from '@/lib/roles'
import { isPlatformOwnerEmail } from '@/lib/platform-owner'
import { log } from '@/lib/log'

/**
 * تزويد ذاتي — التسجيل الحقيقي الوحيد في المنصة
 * ================================================
 * حساب بلا صفّ في profiles لم يعد يعني "ارفضه" بإطلاق. جلسة صالحة (أثبتها
 * رابط بريد المستخدم فعلاً بالضغط عليه) وبلا صفّ تعني الآن حساباً جديداً
 * يُمنح دوره الآن — هذا هو التسجيل الذاتي نفسه، لا خطوة منفصلة عنه.
 *
 * الدور يُحسم بالبريد وحده (lib/platform-owner):
 *   • بريد المالك → platform_owner بلا تاجر ولا اشتراك ولا اسم متجر يُطلب
 *   • أي بريد آخر → merchant على باقة Spark المجانية
 *
 * ⚠️ لماذا ثلاثة إدراجات لا واحد: enforce_plan_limit (مُحفِّز على كل جدول
 * محكوم بباقة) يرفض أي إدراج لتاجر بلا صفّ في subscriptions بخطأ
 * BQ_NO_SUBSCRIPTION. تاجر بلا اشتراك يدخل مساحته ولا يستطيع إضافة منتج
 * واحد. فالتزويد الكامل — تاجر + اشتراك + صلاحية — معاملة واحدة منطقياً.
 *
 * الباقة دائماً Spark (المجانية، سعرها صفر مُعتمَد فعلياً لا "قريباً").
 * الترقية الذاتية لباقة مدفوعة تحتاج بوابة دفع تعمل، وهي معطَّلة عمداً
 * (lib/payments) حتى تتوفر بيانات اعتماد حقيقية — بند ٢-أ في CLAUDE.md
 * يمنع بناء تدفّق شراء يتظاهر بالنجاح بلا بوابة فعلية خلفه.
 */

export interface OnboardedProfile {
  userId: string
  email: string | null
  role: AppRole
  merchantId: string | null
  storeName: string | null
}

/**
 * رمز سبب الفشل — لا نصّه.
 * ⚠️ أُضيف لأن النصّ هنا عربي ثابت، والتسجيل صار بثلاث لغات: الرمز يعبر إلى
 * الواجهة فتختار هي الصياغة من قاموس لغة المستخدم، ويبقى `error` كما هو
 * للسجلّ ولمسارات الـ API التي لا لغة لها.
 */
export type OnboardErrorCode =
  | 'verify'
  | 'unexpectedState'
  | 'ownerProvision'
  | 'missingFreePlan'
  | 'merchantCreate'
  | 'subscription'
  | 'profile'

export type OnboardResult =
  | { ok: true; profile: OnboardedProfile }
  | { ok: false; status: number; error: string; code: OnboardErrorCode }

async function fetchExistingProfile(
  userId: string,
  email: string | null
): Promise<OnboardResult | null> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('role, merchant_id, store_name')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    log.error('ONBOARD_PROFILE_LOOKUP_FAILED', { user_id: userId, reason: error.message })
    return { ok: false, status: 500, error: 'تعذّر التحقق من حسابك — أعد المحاولة بعد قليل', code: 'verify' }
  }
  if (!data) return null
  if (!isAppRole(data.role)) {
    log.error('ONBOARD_INVALID_ROLE', { user_id: userId, role: data.role })
    return { ok: false, status: 500, error: 'حالة حساب غير متوقَّعة — راجع مالك المنصة', code: 'unexpectedState' }
  }
  return {
    ok: true,
    profile: {
      userId,
      email,
      role: data.role,
      merchantId: data.merchant_id,
      storeName: data.store_name,
    },
  }
}

/**
 * اسم المتجر الافتراضي حين يترك المشترك الحقل فارغاً.
 *
 * ⚠️ ليس تخميناً لبيانات: الاسم حقل عرض يظهر في ردود البوت وعلى الملصقات،
 * ويغيّره صاحبه متى شاء من إعدادات متجره. وقف التسجيل على ملئه يعني حاجزاً
 * أمام من يريد فقط الدخول ليطّلع ويختار اشتراكه لاحقاً — وهو ما نُزيله هنا.
 * أما المعرّفات والمبالغ فلا تُشتق ولا تُخمَّن (بند ٢-أ في CLAUDE.md).
 */
function fallbackStoreName(email: string | null): string {
  const local = email?.split('@')[0]?.trim()
  return local ? `متجر ${local}` : 'متجري'
}

/** صفّ صلاحية مالك المنصة: بلا تاجر وبلا اشتراك — ليس مشتركاً. */
async function provisionPlatformOwner(
  userId: string,
  email: string | null
): Promise<OnboardResult> {
  const { error } = await supabaseServer
    .from('profiles')
    .insert({ user_id: userId, role: 'platform_owner', merchant_id: null, store_name: 'برق' })

  if (error) {
    // نفس سباق التبويبين أدناه: profiles_user_id_key يرفض الصفّ الثاني.
    const raced = await fetchExistingProfile(userId, email)
    if (raced) return raced

    log.error('ONBOARD_OWNER_INSERT_FAILED', { user_id: userId, reason: error.message })
    return { ok: false, status: 500, error: 'تعذّر إتمام إنشاء حساب المالك', code: 'ownerProvision' }
  }

  log.info('PLATFORM_OWNER_SELF_ONBOARDED', { user_id: userId })

  return {
    ok: true,
    profile: { userId, email, role: 'platform_owner', merchantId: null, storeName: 'برق' },
  }
}

export async function provisionSelfServeMerchant(
  userId: string,
  email: string | null,
  storeName: string
): Promise<OnboardResult> {
  // إعادة تحقق صريحة: قد يكون صفّ الصلاحية قد أُنشئ فعلاً — بتزويد ذاتي في
  // تبويب آخر، أو لأن مالك المنصة منح الحساب دوراً بعد إرسال رابط البريد
  // وقبل أن يُكمل صاحبه هذه الصفحة. لا يُخمَّن غياب الصفّ — يُتحقَّق منه هنا
  // من جديد لا يُعاد استعمال فحص getSessionProfile في الصفحة المستدعية.
  const existing = await fetchExistingProfile(userId, email)
  if (existing) return existing

  // المالك يسبق كل شيء: لا تاجر يُنشأ له ولا اشتراك ولا اسم متجر يُطلب منه.
  if (isPlatformOwnerEmail(email)) return provisionPlatformOwner(userId, email)

  const trimmedName = storeName.trim() || fallbackStoreName(email)

  // الباقة تُشتق بالكود لا بمعرّف ثابت في الكود: قاعدة بيئة أخرى قد تحمل
  // نفس الباقة بمعرّف مختلف، والبحث بالكود يفشل بوضوح إن حُذفت أو أُعيدت
  // تسميتها بدل أن يُدخل تاجراً في باقة عشوائية بصمت.
  const { data: sparkPlan, error: planError } = await supabaseServer
    .from('plans')
    .select('id')
    .eq('code', 'spark')
    .eq('is_active', true)
    .maybeSingle()

  if (planError || !sparkPlan) {
    log.error('ONBOARD_SPARK_PLAN_MISSING', { reason: planError?.message })
    return { ok: false, status: 500, error: 'باقة البداية المجانية غير مُهيَّأة — راجع مالك المنصة', code: 'missingFreePlan' }
  }

  // ---------- 1) التاجر ----------
  const { data: merchant, error: merchantError } = await supabaseServer
    .from('merchants')
    .insert({ name: trimmedName, status: 'active' })
    .select('id')
    .single()

  if (merchantError || !merchant) {
    log.error('ONBOARD_MERCHANT_INSERT_FAILED', { user_id: userId, reason: merchantError?.message })
    return { ok: false, status: 500, error: 'تعذّر إنشاء المتجر', code: 'merchantCreate' }
  }

  // ---------- 2) الاشتراك — بلا هذا الصفّ enforce_plan_limit يرفض كل شيء ----------
  const { error: subError } = await supabaseServer
    .from('subscriptions')
    .insert({ merchant_id: merchant.id, plan_id: sparkPlan.id, status: 'active' })

  if (subError) {
    await supabaseServer.from('merchants').delete().eq('id', merchant.id)
    log.error('ONBOARD_SUBSCRIPTION_INSERT_FAILED', {
      user_id: userId,
      merchant_id: merchant.id,
      reason: subError.message,
    })
    return { ok: false, status: 500, error: 'تعذّر تفعيل الاشتراك', code: 'subscription' }
  }

  // ---------- 3) الصلاحية ----------
  const { error: profileError } = await supabaseServer
    .from('profiles')
    .insert({ user_id: userId, role: 'merchant', merchant_id: merchant.id, store_name: trimmedName })

  if (profileError) {
    // سباق حقيقي: صفّان لنفس المستخدم يفتحان هذه الصفحة معاً (تبويبان).
    // profiles_user_id_key يرفض الثاني — ننظّف تاجرنا اليتيم ونعيد صفّ الفائز
    // بالسباق بدل أن نترك تاجراً بلا صلاحية تشير إليه.
    await supabaseServer.from('subscriptions').delete().eq('merchant_id', merchant.id)
    await supabaseServer.from('merchants').delete().eq('id', merchant.id)

    const raced = await fetchExistingProfile(userId, email)
    if (raced) return raced

    log.error('ONBOARD_PROFILE_INSERT_FAILED', { user_id: userId, reason: profileError.message })
    return { ok: false, status: 500, error: 'تعذّر إتمام إنشاء الحساب', code: 'profile' }
  }

  log.info('MERCHANT_SELF_ONBOARDED', { user_id: userId, merchant_id: merchant.id })

  return {
    ok: true,
    profile: { userId, email, role: 'merchant', merchantId: merchant.id, storeName: trimmedName },
  }
}
