'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, ArrowLeft, Store } from 'lucide-react'
import { completeOnboardingAction, type OnboardState } from './actions'

const INITIAL: OnboardState = { error: null }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-60 text-white text-sm font-bold rounded-xl px-5 py-3 transition-colors"
    >
      {pending ? (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <ArrowLeft size={16} />
      )}
      {pending ? 'جارٍ الإنشاء…' : 'ادخل مساحتك'}
    </button>
  )
}

/**
 * حقل واحد اختياري — لا أكثر
 * ============================
 * الاسم يُملأ مسبقاً من اسم البريد ليكون الدخول ضغطة واحدة. من أراد اسماً
 * غيره كتبه الآن، ومن أراد الدخول فوراً لم يوقفه شيء — ويغيّره لاحقاً من
 * إعدادات متجره. اختيار الاشتراك يأتي بعد الدخول لا قبله.
 */
export default function OnboardingForm({ email }: { email: string | null }) {
  const [state, formAction] = useActionState(completeOnboardingAction, INITIAL)
  const suggestedName = email?.split('@')[0]?.trim()

  return (
    <form action={formAction} className="space-y-4">
      {email && (
        <p className="text-[11px] text-slate-500 text-center">
          للحساب <span className="font-mono text-slate-700" dir="ltr">{email}</span>
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="store_name" className="block text-xs font-bold text-slate-700">
          اسم متجرك <span className="font-normal text-slate-400">(اختياري)</span>
        </label>
        <input
          id="store_name"
          name="store_name"
          type="text"
          autoFocus
          defaultValue={suggestedName ? `متجر ${suggestedName}` : ''}
          placeholder="مثال: ستايل بغداد"
          className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#253765] transition-colors"
        />
        <p className="text-[10px] text-slate-400 leading-relaxed">
          يظهر هذا الاسم لزبائنك في ردود البوت وعلى ملصقات الشحن — اتركه كما هو وغيّره لاحقاً من إعدادات متجرك.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {state.error}
        </p>
      )}

      <SubmitButton />

      <p className="flex items-start gap-1.5 text-[10px] text-slate-400 leading-relaxed">
        <Store size={12} className="shrink-0 mt-0.5" />
        تبدأ على باقة Spark المجانية للأبد. لا حاجة لبطاقة دفع الآن.
      </p>
    </form>
  )
}
