'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { AlertCircle, LogIn } from 'lucide-react'
import { signIn, type LoginState } from './actions'
import type { Dictionary } from '@/lib/i18n'

const INITIAL: LoginState = { error: null }

type LoginCopy = Dictionary['login']

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
        <LogIn size={16} />
      )}
      {pending ? pendingLabel : label}
    </button>
  )
}

export default function LoginForm({
  next,
  initialError,
  t,
}: {
  next: string | null
  initialError?: string | null
  t: LoginCopy
}) {
  const [state, formAction] = useActionState(signIn, INITIAL)
  // يُتتبَّع ليُمرَّر إلى صفحة الاستعادة، فلا يُعيد المستخدم كتابته هناك
  const [email, setEmail] = useState('')

  // خطأ الإجراء يحلّ محلّ خطأ الرابط: الأحدث هو الأدلّ على ما يحدث الآن
  const shownError = state.error ?? initialError ?? null

  const forgotHref = email.trim()
    ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
    : '/forgot-password'

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

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
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="block text-xs font-bold text-ink">
          {t.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
        />
      </div>

      <div className="flex justify-start">
        <Link href={forgotHref} className="text-[11px] font-bold text-brand-text hover:underline">
          {t.forgot}
        </Link>
      </div>

      {shownError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-bg px-3 py-2.5 text-xs font-semibold text-danger-ink"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {shownError}
        </p>
      )}

      <SubmitButton label={t.submit} pendingLabel={t.submitting} />
    </form>
  )
}
