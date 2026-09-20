'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, UserPlus } from 'lucide-react'
import { signUpWithPassword, type SignUpState } from './actions'

const INITIAL: SignUpState = { error: null }

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
        <UserPlus size={16} />
      )}
      {pending ? 'جارٍ الإنشاء…' : 'أنشئ الحساب'}
    </button>
  )
}

/**
 * إنشاء حساب بكلمة مرور
 * =======================
 * ⚠️ autoComplete="new-password" في الحقلين ليس تزييناً: هو ما يجعل المتصفّح
 * يعرض «هل تحفظ كلمة المرور؟» بعد الإرسال، ويقترح كلمة قوية قبله. و
 * autoComplete="username" على حقل البريد شرط لأن يربط المتصفّح الكلمة
 * المحفوظة بالحساب — بدونه يحفظها بلا اسم مستخدم فلا يملؤها في المرة التالية.
 */
export default function SignUpForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const [state, formAction] = useActionState(signUpWithPassword, INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="signup-email" className="block text-xs font-bold text-slate-700">
          البريد الإلكتروني
        </label>
        <input
          id="signup-email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="username"
          dir="ltr"
          placeholder="name@example.com"
          className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 text-left outline-none focus:border-[#253765] transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signup-password" className="block text-xs font-bold text-slate-700">
          كلمة المرور
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 text-left outline-none focus:border-[#253765] transition-colors"
        />
        <p className="text-[10px] text-slate-500">ثمانية محارف على الأقل</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signup-confirm" className="block text-xs font-bold text-slate-700">
          تأكيد كلمة المرور
        </label>
        <input
          id="signup-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 text-left outline-none focus:border-[#253765] transition-colors"
        />
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

      <button
        type="button"
        onClick={onSwitchToLogin}
        className="w-full text-[11px] font-bold text-slate-500 hover:text-[#253765] transition-colors"
      >
        لديك حساب؟ سجّل الدخول
      </button>
    </form>
  )
}
