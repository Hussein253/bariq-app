'use client'

import { useFormStatus } from 'react-dom'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'

function Button({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-ink-muted hover:text-rose-700 disabled:opacity-50 transition-colors"
    >
      <LogOut size={13} />
      {pending ? pendingLabel : label}
    </button>
  )
}

/**
 * الخروج عبر form + Server Action لا onClick:
 * إنهاء الجلسة يجب أن يمسح كوكي الخادم، وهذا لا يقع في المتصفح وحده.
 *
 * ⚠️ النصّ يأتي خاصيةً لا ثابتاً في الملف: هذا مكوّن عميل، واستيراده
 * للقاموس يجرّ اللغات الثلاث كلها إلى حزمة المتصفّح.
 */
export default function SignOutButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  return (
    <form action={signOut}>
      <Button label={label} pendingLabel={pendingLabel} />
    </form>
  )
}
