import { supabaseServer } from '@/lib/supabase-server'
import { isAppRole, type AppRole } from '@/lib/roles'
import { log } from '@/lib/log'

/**
 * تزويد ذاتي للتاجر — التسجيل الحقيقي الوحيد في المنصة
 * =======================================================
 * حساب بلا صفّ في profiles لم يعد يعني "ارفضه" بإطلاق. جلسة صالحة (أثبتها
 * رابط بريد المستخدم فعلاً بالضغط عليه) وبلا صفّ تعني الآن "تاجر جديد
 * يُكمل إعداد متجره" — هذا هو التسجيل الذاتي نفسه، لا خطوة منفصلة عنه.
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

export type OnboardResult =
  | { ok: true; profile: OnboardedProfile }
  | { ok: false; status: number; error: string }

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
    return { ok: false, status: 500, error: 'تعذّر التحقق من حسابك — أعد المحاولة بعد قليل' }
  }
  if (!data) return null
  if (!isAppRole(data.role)) {
    log.error('ONBOARD_INVALID_ROLE', { user_id: userId, role: data.role })
    return { ok: false, status: 500, error: 'حالة حساب غير متوقَّعة — راجع مالك المنصة' }
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

  const trimmedName = storeName.trim()
  if (!trimmedName) {
    return { ok: false, status: 422, error: 'اسم المتجر مطلوب' }
  }

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
    return { ok: false, status: 500, error: 'باقة البداية المجانية غير مُهيَّأة — راجع مالك المنصة' }
  }

  // ---------- 1) التاجر ----------
  const { data: merchant, error: merchantError } = await supabaseServer
    .from('merchants')
    .insert({ name: trimmedName, status: 'active' })
    .select('id')
    .single()

  if (merchantError || !merchant) {
    log.error('ONBOARD_MERCHANT_INSERT_FAILED', { user_id: userId, reason: merchantError?.message })
    return { ok: false, status: 500, error: 'تعذّر إنشاء المتجر' }
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
    return { ok: false, status: 500, error: 'تعذّر تفعيل الاشتراك' }
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
    return { ok: false, status: 500, error: 'تعذّر إتمام إنشاء الحساب' }
  }

  log.info('MERCHANT_SELF_ONBOARDED', { user_id: userId, merchant_id: merchant.id })

  return {
    ok: true,
    profile: { userId, email, role: 'merchant', merchantId: merchant.id, storeName: trimmedName },
  }
}
