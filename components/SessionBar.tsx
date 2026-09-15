import { getSessionProfile, ROLE_LABELS } from '@/lib/auth'
import SignOutButton from '@/components/SignOutButton'

/**
 * شريط الجلسة — من الداخل حالياً، وطريق الخروج.
 * لا يُعرض لغير الداخل، فتبقى صفحة التعريف العامة كما هي.
 *
 * يُعرض الدور لأن المستخدم يحتاج أن يعرف بأي صلاحية يتصرّف: مالك المنصة
 * الذي يظن نفسه في حساب تاجر قد يتّخذ قراراً على بيانات ليست ما يحسب.
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
        <div className="[&_button]:text-white/80 [&_button:hover]:text-amber-300 shrink-0">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
