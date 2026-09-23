'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, MailCheck, Send } from 'lucide-react'
import { requestResetAction, type ForgotState } from './actions'
import type { Dictionary } from '@/lib/i18n'

const INITIAL_FORGOT_STATE: ForgotState = { sent: false, error: null }

type ForgotCopy = Dictionary['forgot']

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
        <Send size={16} />
      )}
      {pending ? pendingLabel : label}
    </button>
  )
}

export default function ForgotPasswordForm({
  email,
  t,
}: {
  email: string | null
  t: ForgotCopy
}) {
  const [state, formAction] = useActionState(requestResetAction, INITIAL_FORGOT_STATE)

  if (state.sent) {
    return (
      <div className="rounded-2xl border-2 border-success-line bg-success-bg p-4 text-center">
        <MailCheck size={26} className="mx-auto text-success-ink mb-2" />
        <p className="font-black text-sm text-success-ink">{t.sentTitle}</p>
        <p className="text-[11px] text-success-ink/90 leading-relaxed mt-1.5">{t.sentBody}</p>
        <p className="text-[10px] text-success-ink/70 mt-2">{t.sentHint}</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-xs font-bold text-ink">
          {t.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={email ?? ''}
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
