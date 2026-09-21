import { NextResponse } from 'next/server'
import { apiMessages } from '@/lib/i18n/api'
import {
  getSessionProfile,
  resolveActiveMerchant,
  type AppRole,
  type SessionProfile,
} from '@/lib/auth'

/**
 * حارس الجلسة لمسارات الـ API التي تخدم لوحات التحكم
 * ====================================================
 * نظير requireRole للصفحات، لكنه يردّ JSON بدل التحويل: مسار API يُنادى من
 * fetch، والتحويل إلى /login يصل المتصفح كصفحة HTML في مكان يتوقّع JSON.
 *
 * ⚠️ الفرق عن lib/api-auth.ts: ذاك لمفاتيح الآلة (نظام التاجر الخارجي)،
 * وهذا لجلسة إنسان أمام المتصفح. لا يُخلطان.
 */

export type SessionGuardResult =
  | { ok: true; profile: SessionProfile }
  | { ok: false; response: NextResponse }

export async function requireSession(allowed: AppRole[]): Promise<SessionGuardResult> {
  const profile = await getSessionProfile()
  const t = await apiMessages()

  if (!profile) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: t.signInRequired }, { status: 401 }),
    }
  }

  if (!allowed.includes(profile.role)) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: t.forbidden }, { status: 403 }),
    }
  }

  return { ok: true, profile }
}

export type MerchantScopeResult =
  | { ok: true; profile: SessionProfile; merchantId: string; impersonating: boolean }
  | { ok: false; response: NextResponse }

/**
 * يستخرج التاجر الذي يعمل عليه المسار.
 *
 * ⚠️ هذه هي الدالة التي تحلّ محلّ `searchParams.get('merchant_id')` في كل
 * مسار يخدم لوحة التاجر. المعرّف في الرابط لم يعد هوية بل طلب يُمحَّص:
 * التاجر العادي يُتجاهل ما أرسله ويُستعمل تاجر جلسته، ومالك المنصة وحده
 * يُسمح له بفتح تاجر آخر — ويُقيَّد ذلك في سجل التدقيق.
 */
export async function requireMerchantScope(
  requestedMerchantId?: string | null
): Promise<MerchantScopeResult> {
  const guard = await requireSession(['merchant', 'platform_owner'])
  if (!guard.ok) return guard

  const active = await resolveActiveMerchant(guard.profile, requestedMerchantId)

  if (!active) {
    // مالك المنصة بلا تاجر مُحدَّد ليس خطأ صلاحية بل طلب ناقص؛ وتاجر بلا
    // merchant_id في ملفّه حساب غير مكتمل الربط — كلاهما ٤٠٠ لا ٤٠٣.
    const t = await apiMessages()
    const error =
      guard.profile.role === 'platform_owner'
        ? t.merchantRequiredOwner
        : t.merchantUnlinked

    return { ok: false, response: NextResponse.json({ success: false, error }, { status: 400 }) }
  }

  return {
    ok: true,
    profile: guard.profile,
    merchantId: active.merchantId,
    impersonating: active.impersonating,
  }
}
