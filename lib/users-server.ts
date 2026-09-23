import { randomInt } from 'node:crypto'
import { supabaseServer } from '@/lib/supabase-server'
import { isAppRole, type AppRole } from '@/lib/roles'
import { log } from '@/lib/log'

/**
 * إدارة حسابات المنصة — إنشاء وقراءة
 * ===================================
 * لا تسجيل ذاتي في برق: مالك المنصة وحده يُنشئ الحسابات. هذا الملف هو
 * الطريق الوحيد لذلك، ويستعمل service_role لأن إنشاء مستخدم في auth.users
 * لا يمكن أن يمرّ بمفتاح المتصفح.
 *
 * قراران مقصودان يبسّطان أول دخول:
 *
 * • email_confirm: true — الحساب مؤكَّد لحظة إنشائه. بدونه يحتاج المستخدم
 *   رسالة تأكيد، ومُرسِل البريد (SMTP) غير مضبوط أصلاً فتبقى الحسابات
 *   معلّقة لا تدخل.
 *
 * • لا إجبار على تغيير كلمة المرور في أول دخول. الرمز يصل صاحبه من المالك
 *   مباشرة، وإجباره على تغييره يضيف خطوة تُفقد المستخدم غير التقني.
 */

export interface PlatformUser {
  userId: string
  email: string
  role: AppRole | null
  merchantId: string | null
  merchantName: string | null
  storeName: string | null
  lastSignInAt: string | null
  createdAt: string
}

export interface CreateUserInput {
  email: string
  role: AppRole
  merchantId?: string | null
  storeName?: string | null
}

/** رمز سبب الفشل — تترجمه الواجهة، ويبقى error نصاً للسجلّ. */
export type CreateUserErrorCode =
  | 'invalidEmail'
  | 'unknownRole'
  | 'merchantRequired'
  | 'emailTaken'
  | 'createFailed'
  | 'roleFailed'

export type CreateUserResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string; code: CreateUserErrorCode }

/**
 * أبجدية بلا محارف يلتبس بعضها ببعض (0/O و1/l/I).
 * الرمز يُملى على صاحبه في رسالة أو مكالمة، والالتباس فيه يُنتج محاولة
 * دخول فاشلة تبدو كأن الحساب معطوب.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'

/** أربع مجموعات رباعية: قوية بما يكفي، وتُقرأ وتُكتب بلا خطأ. */
function generatePassword(): string {
  const groups: string[] = []
  for (let g = 0; g < 4; g++) {
    let chunk = ''
    for (let i = 0; i < 4; i++) {
      chunk += ALPHABET[randomInt(ALPHABET.length)]
    }
    groups.push(chunk)
  }
  return groups.join('-')
}

export async function listPlatformUsers(): Promise<PlatformUser[]> {
  const { data: authData, error: authError } = await supabaseServer.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (authError) {
    log.error('USERS_LIST_FAILED', { reason: authError.message })
    throw new Error('تعذّر جلب الحسابات')
  }

  const { data: profiles, error: profileError } = await supabaseServer
    .from('profiles')
    .select('user_id, role, merchant_id, store_name')
  if (profileError) {
    log.error('USERS_PROFILES_FAILED', { reason: profileError.message })
    throw new Error('تعذّر جلب الصلاحيات')
  }

  const { data: merchants } = await supabaseServer.from('merchants').select('id, name')
  const merchantNames = new Map((merchants ?? []).map((m) => [m.id as string, m.name as string]))
  const byUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]))

  return authData.users.map((u) => {
    const p = byUser.get(u.id)
    const merchantId = (p?.merchant_id as string | null) ?? null
    return {
      userId: u.id,
      email: u.email ?? '—',
      role: isAppRole(p?.role) ? p.role : null,
      merchantId,
      merchantName: merchantId ? merchantNames.get(merchantId) ?? null : null,
      storeName: (p?.store_name as string | null) ?? null,
      lastSignInAt: u.last_sign_in_at ?? null,
      createdAt: u.created_at,
    }
  })
}

export async function createPlatformUser(input: CreateUserInput): Promise<CreateUserResult> {
  const email = input.email.trim().toLowerCase()

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: 'بريد إلكتروني غير صالح', code: 'invalidEmail' }
  }
  if (!isAppRole(input.role)) {
    return { ok: false, error: 'دور غير معروف', code: 'unknownRole' }
  }

  // يطابق قيد profiles_merchant_link_check: التاجر يلزمه تاجر مرتبط،
  // وغيره يجب أن يكون بلا merchant_id — وإلا رفضت القاعدة الصف.
  const merchantId = input.role === 'merchant' ? input.merchantId?.trim() || null : null
  if (input.role === 'merchant' && !merchantId) {
    return { ok: false, error: 'التاجر يلزمه اختيار المتجر المرتبط به', code: 'merchantRequired' }
  }

  const password = generatePassword()

  const { data: created, error: createError } = await supabaseServer.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !created?.user) {
    const reason = createError?.message ?? 'سبب غير معروف'
    log.warn('USER_CREATE_FAILED', { reason })
    if (/already/i.test(reason) || /registered/i.test(reason)) {
      return { ok: false, error: 'هذا البريد مسجَّل مسبقاً', code: 'emailTaken' }
    }
    return { ok: false, error: 'تعذّر إنشاء الحساب', code: 'createFailed' }
  }

  const { error: profileError } = await supabaseServer.from('profiles').insert({
    user_id: created.user.id,
    role: input.role,
    merchant_id: merchantId,
    store_name: input.storeName?.trim() || null,
  })

  if (profileError) {
    // حساب بلا صف صلاحية يدخل ثم تُنهى جلسته فوراً — يبدو للمستخدم عطلاً
    // غامضاً. نحذفه بدل أن نتركه معلّقاً.
    await supabaseServer.auth.admin.deleteUser(created.user.id)
    log.error('USER_PROFILE_INSERT_FAILED', { reason: profileError.message })
    return { ok: false, error: 'تعذّر ضبط الصلاحية — أُلغي الحساب', code: 'roleFailed' }
  }

  log.info('USER_CREATED', { user_id: created.user.id, role: input.role })
  return { ok: true, email, password }
}
