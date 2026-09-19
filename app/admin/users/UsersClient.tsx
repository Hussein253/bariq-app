'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, Check, Copy, KeyRound, UserPlus } from 'lucide-react'
import { createUserAction, type CreateUserState } from './actions'

const INITIAL_CREATE_STATE: CreateUserState = { error: null, created: null }
import { APP_ROLES, ROLE_LABELS, type AppRole } from '@/lib/roles'

export interface MerchantOption {
  id: string
  name: string
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-60 text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
    >
      {pending ? (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : (
        <UserPlus size={16} />
      )}
      {pending ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}
    </button>
  )
}

/**
 * بطاقة الرمز — تظهر مرة واحدة بعد الإنشاء.
 * Supabase يحفظ تجزئة الرمز لا نصّه، فلا سبيل لعرضه ثانيةً بعد مغادرة
 * الصفحة. لذلك التحذير صريح وزر النسخ يأخذ الرسالة كاملة جاهزة للإرسال.
 */
function CredentialCard({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false)

  const message =
    `مرحباً بك في منصة برق ⚡\n\n` +
    `رابط الدخول: https://bariq-app.vercel.app/login\n` +
    `البريد: ${email}\n` +
    `رمز الدخول: ${password}\n\n` +
    `عند أول دخول سيعرض المتصفح حفظ البريد والرمز — اقبل العرض حتى لا تكتبهما في كل مرة.`

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
    <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 sm:p-5">
      <div className="flex items-start gap-2 mb-3">
        <KeyRound size={18} className="text-emerald-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-sm text-emerald-900">أُنشئ الحساب</p>
          <p className="text-[11px] text-emerald-800 leading-relaxed mt-0.5">
            انسخ الرسالة وأرسلها لصاحبها الآن. الرمز لا يظهر مرة أخرى بعد مغادرة هذه
            الصفحة — من يفقده يُنشأ له حساب برمز جديد.
          </p>
        </div>
      </div>

      <dl className="rounded-xl bg-white border border-emerald-200 divide-y divide-emerald-100 mb-3">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <dt className="text-[11px] font-bold text-slate-500 shrink-0">البريد</dt>
          <dd className="font-mono text-xs text-slate-900 text-left break-all" dir="ltr">
            {email}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <dt className="text-[11px] font-bold text-slate-500 shrink-0">رمز الدخول</dt>
          <dd className="font-mono text-sm font-black text-[#253765] text-left tracking-wide" dir="ltr">
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
        {copied ? 'نُسخت الرسالة' : 'نسخ رسالة الترحيب كاملة'}
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
}: {
  merchants: MerchantOption[]
  formAction: (formData: FormData) => void
  error: string | null
}) {
  const [role, setRole] = useState<AppRole | ''>('')

  return (
    <form action={formAction} className="rounded-2xl bg-white border border-[#E2E8F0] p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-bold text-slate-700">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              dir="ltr"
              placeholder="name@example.com"
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 text-left outline-none focus:border-[#253765] transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="role" className="block text-xs font-bold text-slate-700">
              الدور
            </label>
            <select
              id="role"
              name="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole | '')}
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#253765] transition-colors"
            >
              <option value="">اختر الدور…</option>
              {APP_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {role === 'merchant' && (
            <div className="space-y-1.5">
              <label htmlFor="merchant_id" className="block text-xs font-bold text-slate-700">
                المتجر المرتبط
              </label>
              <select
                id="merchant_id"
                name="merchant_id"
                required
                className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#253765] transition-colors"
              >
                <option value="">اختر المتجر…</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                التاجر يرى مساحة متجره وحده. حساب تاجر بلا متجر مرتبط يدخل ولا يرى شيئاً،
                ولذلك ترفضه القاعدة.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="store_name" className="block text-xs font-bold text-slate-700">
              الاسم المعروض <span className="font-normal text-slate-400">(اختياري)</span>
            </label>
            <input
              id="store_name"
              name="store_name"
              type="text"
              className="w-full bg-[#F8FAFC] border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#253765] transition-colors"
            />
          </div>
        </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800"
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          {error}
        </p>
      )}

      <SubmitButton />
    </form>
  )
}

export default function UsersClient({ merchants }: { merchants: MerchantOption[] }) {
  const [state, formAction] = useActionState(createUserAction, INITIAL_CREATE_STATE)

  return (
    <div className="space-y-4">
      {state.created && (
        <CredentialCard email={state.created.email} password={state.created.password} />
      )}

      <CreateForm
        key={state.created?.email ?? 'new'}
        merchants={merchants}
        formAction={formAction}
        error={state.error}
      />
    </div>
  )
}
