/**
 * مصادقة الـ API العام للتجار بمفتاح برمجي (Machine-to-Machine)
 * ==============================================================
 * هذه ليست جلسة دخول لموظف — بل مفتاح يحمله نظام التاجر (متجره الإلكتروني
 * أو مسار n8n) لينادي /api/orders نيابة عنه. المفتاح يُولَّد ويُخزَّن في
 * merchants.api_key (فريد على مستوى القاعدة).
 *
 * ⚠️ قبل هذا الملف كان المفتاح اختيارياً: الطلب بلا ترويسة Authorization كان
 * يُقبل ويُنسب لتاجر ثابت ('m1'). أي شخص كان يستطيع إنشاء طلبات باسم أي تاجر.
 * الآن المفتاح إلزامي، والتاجر يُستخرج منه حصراً — لا من جسم الطلب.
 */

import { supabaseServer } from '@/lib/supabase-server'

export interface ApiMerchant {
  id: string
  name: string
  status: string
}

export type ApiAuthResult =
  | { ok: true; merchant: ApiMerchant }
  | { ok: false; status: number; error: string }

const KEY_PREFIX = 'brq_live_'

/**
 * يستخرج التاجر من ترويسة Authorization: Bearer brq_live_xxx.
 * لا يقبل المفتاح من الرابط ولا من جسم الطلب: كلاهما يُسجَّل في سجلات الوكيل
 * والمتصفح، فيتسرّب المفتاح إلى مكان لا يُمحى منه.
 */
export async function authenticateMerchant(req: Request): Promise<ApiAuthResult> {
  const header = req.headers.get('authorization') || ''
  if (!header.toLowerCase().startsWith('bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'مفتاح الـ API مطلوب — أرسله في ترويسة Authorization: Bearer <key>',
    }
  }

  const apiKey = header.slice(7).trim()
  if (!apiKey.startsWith(KEY_PREFIX)) {
    return { ok: false, status: 401, error: 'صيغة مفتاح الـ API غير صحيحة' }
  }

  const { data, error } = await supabaseServer
    .from('merchants')
    .select('id, name, status')
    .eq('api_key', apiKey)
    .maybeSingle()

  if (error) {
    return { ok: false, status: 500, error: 'تعذّر التحقق من مفتاح الـ API' }
  }
  if (!data) {
    return { ok: false, status: 401, error: 'مفتاح الـ API غير صالح' }
  }
  if (data.status !== 'active') {
    // تاجر موقوف يحتفظ بمفتاحه لكن لا يُنشئ طلبات — الإيقاف يجب أن يُلزم فعلاً
    return { ok: false, status: 403, error: 'حساب التاجر موقوف' }
  }

  return { ok: true, merchant: data as ApiMerchant }
}
