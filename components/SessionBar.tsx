import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getSessionProfile, homeForRole } from '@/lib/auth'
import SignOutButton from '@/components/SignOutButton'
import InterfaceControls from '@/components/InterfaceControls'
import { getTranslations } from '@/lib/i18n/server'
import { LOCALE_DIR } from '@/lib/i18n/config'

/**
 * شريط الجلسة — من الداخل حالياً، ومدخل مساحته، وطريق الخروج.
 * لا يُعرض لغير الداخل، فتبقى صفحة التعريف العامة كما هي للزائر.
 *
 * يُعرض الدور لأن المستخدم يحتاج أن يعرف بأي صلاحية يتصرّف: مالك المنصة
 * الذي يظن نفسه في حساب تاجر قد يتّخذ قراراً على بيانات ليست ما يحسب.
 *
 * ⚠️ ورابط «ادخل مساحتك» ليس زينة: الجذر صار يفتح على /platform التعريفية
 * لكل داخل (app/page.tsx)، وروابط تلك الصفحة ثابتة لا تعرف دور قارئها —
 * «مساحة التاجر» يضغطها مالك المنصة فيُقذف منها إلى لوحته بالتفافة. هذا
 * الرابط وحده يعرف الدور فيذهب بصاحبه إلى واجهته من أول ضغطة. ولأن الشريط
 * في التخطيط الجذري، يبقى المدخل حاضراً في كل صفحة لا في التعريفية وحدها.
 *
 * ⚠️ وضابطا اللغة والمظهر هنا لسبب البقاء نفسه: الشريط في التخطيط الجذري،
 * فوجودهما فيه يعني أن التاجر يبدّل لغته من أي شاشة داخلية كان فيها بدل
 * أن يخرج إلى الصفحة التعريفية ليجد المبدّل.
 */
export default async function SessionBar() {
  const profile = await getSessionProfile()
  if (!profile) return null

  const { locale, t } = await getTranslations()
  // السهم يتبع اتجاه القراءة: «إلى الأمام» يسارٌ في العربية ويمينٌ في
  // الإنجليزية، وسهم ثابت يشير إلى الخلف في إحدى اللغتين دائماً.
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight

  return (
    <div className="sticky top-0 z-50 bg-bar text-on-bar/90">
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-[11px]">
        <span className="truncate">
          <span className="font-bold text-amber-300">{t.session.roles[profile.role]}</span>
          {profile.email && <span className="text-on-bar/60"> · {profile.email}</span>}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={homeForRole(profile.role)}
            className="inline-flex items-center gap-1 font-bold text-on-bar hover:text-amber-300 transition-colors"
          >
            <span>{t.session.enterWorkspace}</span>
            <Forward size={12} />
          </Link>
          <span aria-hidden className="text-on-bar/25">|</span>
          <div className="[&_button]:text-on-bar/80 [&_button:hover]:text-amber-300">
            <SignOutButton label={t.session.signOut} pendingLabel={t.session.signingOut} />
          </div>
          <span aria-hidden className="text-on-bar/25">|</span>
          <InterfaceControls locale={locale} t={t} variant="bar" />
        </div>
      </div>
    </div>
  )
}
