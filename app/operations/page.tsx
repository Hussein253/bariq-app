import { requireRole } from '@/lib/auth'
import OperationsClient from './OperationsClient'
import { getTranslations } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

/**
 * /operations — لوحة تشغيل برق
 * ==============================
 * المحتوى مكوّن عميل (حالة وتبويبات كثيرة)، فلا يمكن فحص الصلاحية داخله:
 * أي فحص يجري في المتصفح يستطيع المستخدم تخطّيه. لذلك الصفحة نفسها مكوّن
 * خادم لا يفعل إلا الحراسة، ثم يسلّم العرض للعميل.
 *
 * موظف برق ومالك المنصة فقط: هنا طلبات كل التجار وأرصدتهم وعمولاتهم.
 */
export default async function OperationsPage() {
  await requireRole(['platform_owner', 'staff'])

  // اللوحة نفسها عربية بعد؛ نافذة الحجز داخلها مترجَمة فتحتاج لغتها.
  const { locale, t } = await getTranslations()

  return (
    <OperationsClient
      locale={locale}
      currency={t.pricing.price.currency}
      bookingT={t.app.booking}
    />
  )
}
