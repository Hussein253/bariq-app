'use client'

import { Moon, Sun } from 'lucide-react'
import { THEME_COOKIE, THEME_MAX_AGE } from '@/lib/theme'

/**
 * مبدّل المظهر — فاتح أو داكن
 * ============================
 * ⚠️ لا حالة React هنا، والسبب ليس اختصاراً: المظهر قد يكون 'system' فيعرفه
 * المتصفّح ولا يعرفه الخادم، فأي أيقونة يختارها الخادم قد تخالف ما يراه
 * المستخدم — وهو ما يُسقط الترطيب (hydration mismatch) ويومض في وجهه.
 * الأيقونتان مرسومتان معاً، و CSS وحده يُظهر واحدة حسب صنف dark على <html>.
 * فما يُرسَم في الخادم مطابق لما يُرسَم في المتصفّح مهما كان المظهر.
 *
 * والضغطة تكتب اختياراً صريحاً (light أو dark) وتخرج من اتّباع الجهاز: من
 * ضغط الزرّ قصد مظهراً بعينه، لا أن يتبدّل عليه حين يحلّ الليل على هاتفه.
 */
const DEFAULT_TRIGGER =
  'inline-flex items-center justify-center w-9 h-9 rounded-xl border border-line bg-surface text-ink-muted hover:text-brand-text hover:border-line-strong transition-colors'

export default function ThemeToggle({
  toDarkLabel,
  toLightLabel,
  className,
}: {
  toDarkLabel: string
  toLightLabel: string
  className?: string
}) {
  function toggle() {
    const root = document.documentElement
    const next = root.classList.contains('dark') ? 'light' : 'dark'

    root.classList.toggle('dark', next === 'dark')
    root.style.colorScheme = next

    // الكوكي ليرسمه الخادم صحيحاً في الطلب التالي بلا ومضة بيضاء،
    // و localStorage احتياطاً لمن حُظرت عنه الكوكيز في متصفّحه.
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=${THEME_MAX_AGE};samesite=lax`
    try {
      localStorage.setItem(THEME_COOKIE, next)
    } catch {
      // متصفّح يمنع التخزين — الكوكي وحده يكفي
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={className ?? DEFAULT_TRIGGER}
    >
      <Moon size={16} className="dark:hidden" />
      <Sun size={16} className="hidden dark:block" />
      <span className="sr-only dark:hidden">{toDarkLabel}</span>
      <span className="sr-only hidden dark:inline">{toLightLabel}</span>
    </button>
  )
}
