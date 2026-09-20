'use client'

import { useState } from 'react'
import LoginForm from './LoginForm'
import SignUpForm from './SignUpForm'

/**
 * كلمة المرور أولاً، والإنشاء خلف رابط صريح
 * ============================================
 * حلّ هذا محلّ «رابط البريد أولاً». والسبب تشغيلي لا ذوقي: رابط الدخول كان
 * يعلّق كل دخول على وصول بريد، وخادم Supabase المدمج يسمح برسالتين في
 * الساعة — فثالث تاجر يسجّل في الساعة لا يصله شيء، ويرى رسالة نجاح. الدخول
 * بكلمة مرور لا يلمس البريد إطلاقاً، فيبقى البريد للاستعادة وحدها.
 *
 * ⚠️ والإنشاء نموذج مستقل لا تبديلاً تلقائياً داخل نموذج واحد: النموذج
 * الموحّد يحوّل خطأً مطبعياً في البريد إلى متجر جديد فارغ بدل «كلمة المرور
 * خاطئة» (انظر التعليل في actions.ts).
 */
export default function LoginPanels({
  next,
  initialError,
}: {
  next: string | null
  initialError?: string | null
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  if (mode === 'signup') {
    return <SignUpForm onSwitchToLogin={() => setMode('login')} />
  }

  return (
    <div className="space-y-4">
      <LoginForm next={next} initialError={initialError} />
      <div className="pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setMode('signup')}
          className="w-full text-[11px] font-bold text-[#253765] hover:underline transition-colors"
        >
          ليس لديك حساب؟ أنشئ حساباً جديداً
        </button>
      </div>
    </div>
  )
}
