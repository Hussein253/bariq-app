'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Check } from 'lucide-react'
import { updatePasswordAction, type ResetState } from './actions'

const INITIAL_RESET_STATE: ResetState = { error: null }

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
        <Check size={16} />
      )}
      {pending ? 'جارٍ الحفظ…' : 'احفظ كلمة المرور وادخل'}
    </button>
  )
}

export default function ResetPasswordForm({ email }: { email: string | null }) {
  const [state, formAction] = useActionState(updatePasswordAction, INITIAL_RESET_STATE)

  return (
    <form action={formAction} className="space-y-4">
      {email && (
        <p className="text-[11px] text-slate-500 text-center">
          للحساب <span className="font-mono text-slate-700" dir="ltr">{email}</span>
        </p>
      )}

      {/* حقل مخفي بالبريد: مديرو كلمات المرور يربطون الكلمة الجديدة بالحساب
          الصحيح، ولا يعرفون لأي حساب يحفظونها بدونه. */}
      <input type="hidden" name="username" autoComplete="username" value={email ?? ''} readOnly />

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-bold text-slate-700">
          كلمة المرور الجديدة
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 text-left outline-none focus:border-[#253765] transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-xs font-bold text-slate-700">
          أعِدها للتأكيد
        </label>
        <input
          id="confirm"
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
    </form>
  )
}
