/**
 * مفردات الأدوار — بيانات نقية بلا أي وصول لقاعدة البيانات
 * =========================================================
 * مفصولة عن lib/auth.ts عمداً: ذاك يستورد عميل service_role الذي يتطلّب
 * متغيّرات بيئة لحظة التحميل، فلا يصلح للاستيراد من مكوّن عميل ولا من اختبار.
 *
 * ⚠️ القائمة هنا يجب أن تطابق قيد profiles_role_check في الترحيل ٠١١.
 * يحرس التطابقَ اختبارٌ في tests/auth-roles.test.ts يقرأ القيد من ملف
 * الترحيل نفسه — دور يُضاف في مكان دون الآخر يُنشئ حساباً لا يستطيع الدخول.
 */

export type AppRole = 'platform_owner' | 'staff' | 'merchant'

export const APP_ROLES: AppRole[] = ['platform_owner', 'staff', 'merchant']

export const ROLE_LABELS: Record<AppRole, string> = {
  platform_owner: 'مالك المنصة',
  staff: 'موظف برق',
  merchant: 'تاجر',
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === 'string' && (APP_ROLES as string[]).includes(value)
}

/** الصفحة الرئيسية لكل دور — تُستعمل بعد الدخول وعند رفض الوصول. */
export function homeForRole(role: AppRole): string {
  switch (role) {
    case 'platform_owner':
      return '/admin'
    case 'staff':
      return '/operations'
    case 'merchant':
      return '/workspace'
  }
}
