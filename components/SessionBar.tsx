import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSessionProfile, homeForRole, ROLE_LABELS } from '@/lib/auth'
import SignOutButton from '@/components/SignOutButton'

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
 */
export default async function SessionBar() {
  const profile = await getSessionProfile()
  if (!profile) return null

  return (
    <div className="sticky top-0 z-50 bg-[#1D2B50] text-white/90">
      <div className="flex items-center justify-between gap-3 px-4 py-1.5 text-[11px]">
        <span className="truncate">
          <span className="font-bold text-amber-300">{ROLE_LABELS[profile.role]}</span>
          {profile.email && <span className="text-white/60"> · {profile.email}</span>}
        </span>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href={homeForRole(profile.role)}
            className="inline-flex items-center gap-1 font-bold text-white hover:text-amber-300 transition-colors"
          >
            <span>ادخل مساحتك</span>
            <ArrowLeft size={12} />
          </Link>
          <span aria-hidden className="text-white/25">|</span>
          <div className="[&_button]:text-white/80 [&_button:hover]:text-amber-300">
            <SignOutButton />
          </div>
        </div>
      </div>
    </div>
  )
}
