'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, UserPlus } from 'lucide-react'
import { signUpWithPassword, type SignUpState } from './actions'
import type { Dictionary } from '@/lib/i18n'

const INITIAL: SignUpState = { error: null }

type SignUpCopy = Dictionary['signup']

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-on-brand text-sm font-bold rounded-xl px-5 py-3 transition-colors"
    >
      {pending ? (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <UserPlus size={16} />
      )}
      {pending ? pendingLabel : label}
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
export default function SignUpForm({
  onSwitchToLogin,
  t,
}: {
  onSwitchToLogin: () => void
  t: SignUpCopy
}) {
  const [state, formAction] = useActionState(signUpWithPassword, INITIAL)

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="signup-email" className="block text-xs font-bold text-ink">
          {t.email}
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
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signup-password" className="block text-xs font-bold text-ink">
          {t.password}
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
        />
        <p className="text-[10px] text-ink-muted">{t.passwordHint}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="signup-confirm" className="block text-xs font-bold text-ink">
          {t.confirm}
        </label>
        <input
          id="signup-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-bg px-3 py-2.5 text-xs font-semibold text-danger-ink"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {state.error}
        </p>
      )}

      <SubmitButton label={t.submit} pendingLabel={t.submitting} />

      <button
        type="button"
        onClick={onSwitchToLogin}
        className="w-full text-[11px] font-bold text-ink-muted hover:text-brand-text transition-colors"
      >
        {t.haveAccount}
      </button>
    </form>
  )
}
