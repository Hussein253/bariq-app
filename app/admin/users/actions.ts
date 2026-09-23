'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth'
import { createPlatformUser } from '@/lib/users-server'
import { isAppRole } from '@/lib/roles'
import { getTranslations } from '@/lib/i18n/server'

// ⚠️ ملف 'use server' لا يصدّر إلا دوالّ غير متزامنة — الحالة الأولية في
// مكوّن العميل، والأنواع وحدها تُصدَّر من هنا لأنها تُمحى عند الترجمة.
export interface CreateUserState {
  error: string | null
  created: { email: string; password: string } | null
}

/**
 * إنشاء حساب جديد — لمالك المنصة وحده.
 *
 * الرمز المولَّد يُعاد مرة واحدة فقط ولا يُخزَّن عندنا بصورة يمكن قراءتها:
 * Supabase يحفظ تجزئته لا نصّه. من فقده يُنشأ له رمز جديد.
 */
export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  await requireRole(['platform_owner'])

  const email = String(formData.get('email') || '')
  const roleRaw = String(formData.get('role') || '')
  const merchantId = String(formData.get('merchant_id') || '')
  const storeName = String(formData.get('store_name') || '')

  const { t } = await getTranslations()

  if (!isAppRole(roleRaw)) {
    return { error: t.app.users.errors.chooseRole, created: null }
  }

  const result = await createPlatformUser({
    email,
    role: roleRaw,
    merchantId: merchantId || null,
    storeName: storeName || null,
  })

  if (!result.ok) {
    // الرمز لا النصّ: نصّ الوحدة عربي ثابت، والمالك قد يعمل بالإنجليزية.
    return { error: t.app.users.errors[result.code], created: null }
  }

  revalidatePath('/admin/users')
  return { error: null, created: { email: result.email, password: result.password } }
}
