'use client'

import { useFormStatus } from 'react-dom'
import { LogOut } from 'lucide-react'
import { signOut } from '@/app/login/actions'

function Button() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 hover:text-rose-700 disabled:opacity-50 transition-colors"
    >
      <LogOut size={13} />
      {pending ? 'جارٍ الخروج…' : 'خروج'}
    </button>
  )
}

/**
 * الخروج عبر form + Server Action لا onClick:
 * إنهاء الجلسة يجب أن يمسح كوكي الخادم، وهذا لا يقع في المتصفح وحده.
 */
export default function SignOutButton() {
  return (
    <form action={signOut}>
      <Button />
    </form>
  )
}
