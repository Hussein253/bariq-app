'use client'

import { useRouter } from 'next/navigation'
import { Store } from 'lucide-react'

/**
 * محوّل التاجر المعروض — بديل مؤقت لتسجيل الدخول.
 * ⚠️ هذا تبديل عرض وليس حماية أمنية: أي زائر يستطيع اختيار أي تاجر.
 * يُستبدل بجلسة Supabase Auth تقرأ profiles.merchant_id.
 */
export default function MerchantSwitcher({
  merchants,
  activeId,
}: {
  merchants: { id: string; name: string; planName: string | null }[]
  activeId: string
}) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      <Store size={14} className="text-slate-200" />
      <select
        value={activeId}
        onChange={(e) => router.push(`/workspace?merchant=${e.target.value}`)}
        className="bg-[#1D2B50] border border-white/20 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-bold outline-none"
      >
        {merchants.map((m) => (
          <option key={m.id} value={m.id} className="bg-slate-900 text-white">
            {m.name}
            {m.planName ? ` — ${m.planName}` : ' — بلا اشتراك'}
          </option>
        ))}
      </select>
    </div>
  )
}
