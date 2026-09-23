import LocaleSwitcher from '@/components/LocaleSwitcher'
import ThemeToggle from '@/components/ThemeToggle'
import type { Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n'

/**
 * ضابطا الواجهة: اللغة والمظهر، معاً وفي مكان واحد
 * ==================================================
 * يُوضعان جنباً إلى جنب في كل شاشة يراها زائر لم يسجّل بعد — لأن من يبحث عن
 * أحدهما يبحث عن الآخر غالباً، ولأن تكرارهما في كل صفحة بأسلوب مختلف يجعلهما
 * يبدوان إعدادين مختلفين لا ضابطين لواجهة واحدة.
 *
 * مكوّن خادم يمرّر النصوص إلى مكوّنَي العميل: القاموس كله لا يعبر إلى
 * المتصفّح، تعبره الكلمات الأربع التي يحتاجها الزرّان.
 */

/** الشريط الداكن يحتاج زرّين شفّافين صغيرين، لا زرّي بطاقة على سطح فاتح. */
const BAR_TRIGGER =
  'inline-flex items-center justify-center gap-1.5 h-7 min-w-7 px-2 rounded-lg bg-white/10 text-on-bar/80 hover:text-amber-300 transition-colors'

export default function InterfaceControls({
  locale,
  t,
  variant = 'surface',
  className = '',
}: {
  locale: Locale
  t: Dictionary
  variant?: 'surface' | 'bar'
  className?: string
}) {
  const trigger = variant === 'bar' ? BAR_TRIGGER : undefined

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LocaleSwitcher
        locale={locale}
        label={t.ui.language}
        chooseLabel={t.ui.chooseLanguage}
        triggerClassName={trigger}
      />
      <ThemeToggle
        toDarkLabel={t.ui.darkMode}
        toLightLabel={t.ui.lightMode}
        className={trigger}
      />
    </div>
  )
}
