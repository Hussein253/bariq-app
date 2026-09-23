'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Check } from 'lucide-react'
import { updatePasswordAction, type ResetState } from './actions'
import type { Dictionary } from '@/lib/i18n'

const INITIAL_RESET_STATE: ResetState = { error: null }

type ResetCopy = Dictionary['reset']

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
        <Check size={16} />
      )}
      {pending ? pendingLabel : label}
    </button>
  )
}

export default function ResetPasswordForm({
  email,
  t,
}: {
  email: string | null
  t: ResetCopy
}) {
  const [state, formAction] = useActionState(updatePasswordAction, INITIAL_RESET_STATE)

  return (
    <form action={formAction} className="space-y-4">
      {email && (
        <p className="text-[11px] text-ink-muted text-center">
          {t.forAccount}{' '}
          <span className="font-mono text-ink" dir="ltr">
            {email}
          </span>
        </p>
      )}

      {/* حقل مخفي بالبريد: مديرو كلمات المرور يربطون الكلمة الجديدة بالحساب
          الصحيح، ولا يعرفون لأي حساب يحفظونها بدونه. */}
      <input type="hidden" name="username" autoComplete="username" value={email ?? ''} readOnly />

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-bold text-ink">
          {t.newPassword}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="block text-xs font-bold text-ink">
          {t.confirm}
        </label>
        <input
          id="confirm"
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
    </form>
  )
}
