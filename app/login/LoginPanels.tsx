'use client'

import { useState } from 'react'
import { KeyRound, Mail } from 'lucide-react'
import MagicLinkForm from './MagicLinkForm'
import LoginForm from './LoginForm'

/**
 * رابط البريد أولاً، كلمة المرور خيار ثانٍ مطويّ
 * =================================================
 * الزائر الجديد لا يرى نموذج كلمة مرور إطلاقاً بادئ الأمر — حقل بريد واحد
 * وزر واحد. كلمة المرور تبقى لفريق برق الداخلي (حساباتهم من /admin/users
 * ولها كلمة مرور فعلية)، خلف كشف صغير بدل أن تُحذف: البديل — إجبار الفريق
 * الداخلي على المرور برابط بريد لكل دخول — تعطيل ذاتي بلا داعٍ.
 */
export default function LoginPanels({
  next,
  initialError,
}: {
  next: string | null
  initialError?: string | null
}) {
  const [showPassword, setShowPassword] = useState(false)

  if (showPassword) {
    return (
      <div className="space-y-4">
        <LoginForm next={next} initialError={initialError} />
        <button
          type="button"
          onClick={() => setShowPassword(false)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-[#253765] transition-colors"
        >
          <Mail size={12} />
          الدخول برابط البريد بدلاً من ذلك
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MagicLinkForm next={next} />
      <button
        type="button"
        onClick={() => setShowPassword(true)}
        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-[#253765] transition-colors"
      >
        <KeyRound size={12} />
        فريق برق الداخلي — الدخول بكلمة مرور
      </button>
    </div>
  )
}
