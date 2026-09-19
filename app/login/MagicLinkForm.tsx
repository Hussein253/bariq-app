'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, MailCheck, Send } from 'lucide-react'
import { requestMagicLinkAction, type MagicLinkState } from './actions'

const INITIAL: MagicLinkState = { sent: false, error: null }

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
        <Send size={16} />
      )}
      {pending ? 'جارٍ الإرسال…' : 'أرسل رابط الدخول'}
    </button>
  )
}

/**
 * التسجيل والدخول برابط بريد — لا كلمة مرور، لا كود يُكتب يدوياً
 * ================================================================
 * نفس النموذج لبريد جديد (يُنشأ له حساب تاجر) وبريد عائد (يُدخله رابط
 * لمساحته الحالية). الفرق يُحسم بعد الضغط على الرابط لا هنا.
 */
export default function MagicLinkForm({ next }: { next: string | null }) {
  const [state, formAction] = useActionState(requestMagicLinkAction, INITIAL)

  if (state.sent) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
        <MailCheck size={26} className="mx-auto text-emerald-700 mb-2" />
        <p className="font-black text-sm text-emerald-900">تفقّد بريدك</p>
        <p className="text-[11px] text-emerald-800 leading-relaxed mt-1.5">
          أرسلنا رابطاً يدخلك مباشرة — بلا كلمة مرور ولا رمز تكتبه. أول بريد
          يفتح لك مساحة تاجر جديدة تلقائياً؛ بريد له حساب يعيدك إلى مساحتك.
        </p>
        <p className="text-[10px] text-emerald-700/80 mt-2">
          لم تصل؟ افحص مجلد البريد غير المرغوب.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-1.5">
        <label htmlFor="magic-email" className="block text-xs font-bold text-slate-700">
          البريد الإلكتروني
        </label>
        <input
          id="magic-email"
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          dir="ltr"
          placeholder="name@example.com"
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
