'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Check, Copy, KeyRound, UserPlus } from 'lucide-react'
import { createUserAction, type CreateUserState } from './actions'
import { APP_ROLES, type AppRole } from '@/lib/roles'
import { fill, type Dictionary } from '@/lib/i18n'

const INITIAL_CREATE_STATE: CreateUserState = { error: null, created: null }

type UsersCopy = Dictionary['app']['users']
type RoleLabels = Dictionary['session']['roles']

export interface MerchantOption {
  id: string
  name: string
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover disabled:opacity-60 text-on-brand text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
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
 * بطاقة الرمز — تظهر مرة واحدة بعد الإنشاء.
 * Supabase يحفظ تجزئة الرمز لا نصّه، فلا سبيل لعرضه ثانيةً بعد مغادرة
 * الصفحة. لذلك التحذير صريح وزر النسخ يأخذ الرسالة كاملة جاهزة للإرسال.
 *
 * ⚠️ نصّ الترحيب يُبنى بلغة الواجهة: من يرسله هو مالك المنصة، وهو أدرى بلغة
 * من يرسل إليه — فيبدّل لغته قبل النسخ إن اقتضى الأمر.
 */
function CredentialCard({
  email,
  password,
  t,
}: {
  email: string
  password: string
  t: UsersCopy
}) {
  const [copied, setCopied] = useState(false)

  const loginUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/login`
      : 'https://bariq-app.vercel.app/login'

  const message = fill(t.created.welcomeMessage, { url: loginUrl, email, password })

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-2xl border-2 border-success-line bg-success-bg p-4 sm:p-5">
      <div className="flex items-start gap-2 mb-3">
        <KeyRound size={18} className="text-success-ink shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-sm text-success-ink">{t.created.title}</p>
          <p className="text-[11px] text-success-ink/90 leading-relaxed mt-0.5">
            {t.created.warning}
          </p>
        </div>
      </div>

      <dl className="rounded-xl bg-surface border border-success-line divide-y divide-line mb-3">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <dt className="text-[11px] font-bold text-ink-muted shrink-0">{t.created.email}</dt>
          <dd className="font-mono text-xs text-ink text-start break-all" dir="ltr">
            {email}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <dt className="text-[11px] font-bold text-ink-muted shrink-0">{t.created.password}</dt>
          <dd className="font-mono text-sm font-black text-brand-text text-start tracking-wide" dir="ltr">
            {password}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={copy}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 transition-colors"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? t.created.copiedAll : t.created.copyAll}
      </button>
    </div>
  )
}

/**
 * النموذج مفصول ليحمل حالة الدور محلياً. مفتاحه في الأب يتغيّر بعد كل إنشاء
 * ناجح فيُعاد تركيبه فارغاً — وهذا يُفرّغ الحقول والدور معاً بلا useEffect.
 * عند الخطأ يبقى المفتاح كما هو فلا يفقد المستخدم ما كتبه.
 */
function CreateForm({
  merchants,
  formAction,
  error,
  t,
  roleLabels,
  optionalLabel,
}: {
  merchants: MerchantOption[]
  formAction: (formData: FormData) => void
  error: string | null
  t: UsersCopy
  roleLabels: RoleLabels
  optionalLabel: string
}) {
  const [role, setRole] = useState<AppRole | ''>('')

  return (
    <form action={formAction} className="rounded-2xl bg-surface border border-line p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-xs font-bold text-ink">
            {t.form.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            dir="ltr"
            placeholder="name@example.com"
            className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink text-left outline-none focus:border-brand transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="role" className="block text-xs font-bold text-ink">
            {t.form.role}
          </label>
          <select
            id="role"
            name="role"
            required
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole | '')}
            className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-brand transition-colors"
          >
            <option value="">{t.form.chooseRole}</option>
            {APP_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>

        {role === 'merchant' && (
          <div className="space-y-1.5">
            <label htmlFor="merchant_id" className="block text-xs font-bold text-ink">
              {t.form.merchant}
            </label>
            <select
              id="merchant_id"
              name="merchant_id"
              required
              className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-brand transition-colors"
            >
              <option value="">{t.form.chooseMerchant}</option>
              {merchants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-ink-muted leading-relaxed">{t.form.merchantHint}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="store_name" className="block text-xs font-bold text-ink">
            {t.form.displayName}{' '}
            <span className="font-normal text-ink-faint">{optionalLabel}</span>
          </label>
          <input
            id="store_name"
            name="store_name"
            type="text"
            className="w-full bg-surface-2 border border-line rounded-xl px-3 py-2.5 text-sm text-ink outline-none focus:border-brand transition-colors"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-bg px-3 py-2.5 text-xs font-semibold text-danger-ink"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <SubmitButton label={t.form.submit} pendingLabel={t.form.submitting} />
    </form>
  )
}

export default function UsersClient({
  merchants,
  t,
  roleLabels,
  optionalLabel,
}: {
  merchants: MerchantOption[]
  t: UsersCopy
  roleLabels: RoleLabels
  optionalLabel: string
}) {
  const [state, formAction] = useActionState(createUserAction, INITIAL_CREATE_STATE)

  return (
    <div className="space-y-4">
      {state.created && (
        <CredentialCard email={state.created.email} password={state.created.password} t={t} />
      )}

      <CreateForm
        key={state.created?.email ?? 'new'}
        merchants={merchants}
        formAction={formAction}
        error={state.error}
        t={t}
        roleLabels={roleLabels}
        optionalLabel={optionalLabel}
      />
    </div>
  )
}
