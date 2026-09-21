'use client'

import { useState } from 'react'
import LoginForm from './LoginForm'
import SignUpForm from './SignUpForm'
import type { Dictionary } from '@/lib/i18n'

export interface AuthCopy {
  login: Dictionary['login']
  signup: Dictionary['signup']
}

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
  t,
}: {
  next: string | null
  initialError?: string | null
  t: AuthCopy
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  if (mode === 'signup') {
    return <SignUpForm onSwitchToLogin={() => setMode('login')} t={t.signup} />
  }

  return (
    <div className="space-y-4">
      <LoginForm next={next} initialError={initialError} t={t.login} />
      <div className="pt-3 border-t border-line">
        <button
          type="button"
          onClick={() => setMode('signup')}
          className="w-full text-[11px] font-bold text-brand-text hover:underline transition-colors"
        >
          {t.login.noAccount}
        </button>
      </div>
    </div>
  )
}
