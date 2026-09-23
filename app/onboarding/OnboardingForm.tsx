'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, ArrowLeft, Store } from 'lucide-react'
import { completeOnboardingAction, type OnboardState } from './actions'
import type { Dictionary } from '@/lib/i18n'

const INITIAL: OnboardState = { error: null }

type OnboardingCopy = Dictionary['onboarding']

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-on-brand text-sm font-bold rounded-xl px-5 py-3 transition-colors"
    >
      {/* السهم يشير إلى الأمام في الاتجاهين: يساراً في العربية والكردية،
          ومقلوباً إلى اليمين في الإنجليزية. */}
      {pending ? (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <ArrowLeft size={16} className="ltr:rotate-180" />
      )}
      {pending ? pendingLabel : label}
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
export default function OnboardingForm({
  email,
  suggestedName,
  t,
}: {
  email: string | null
  suggestedName: string
  t: OnboardingCopy
}) {
  const [state, formAction] = useActionState(completeOnboardingAction, INITIAL)

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

      <div className="space-y-1.5">
        <label htmlFor="store_name" className="block text-xs font-bold text-ink">
          {t.storeName} <span className="font-normal text-ink-faint">{t.optional}</span>
        </label>
        <input
          id="store_name"
          name="store_name"
          type="text"
          autoFocus
          defaultValue={suggestedName}
          placeholder={t.storeNamePlaceholder}
          className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-brand transition-colors"
        />
        <p className="text-[10px] text-ink-faint leading-relaxed">{t.storeNameHint}</p>
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

      <p className="flex items-start gap-1.5 text-[10px] text-ink-faint leading-relaxed">
        <Store size={12} className="shrink-0 mt-0.5" />
        {t.planNote}
      </p>
    </form>
  )
}
