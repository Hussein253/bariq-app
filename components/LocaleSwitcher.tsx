'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Globe } from 'lucide-react'
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_DIR,
  LOCALE_LABELS,
  LOCALE_MAX_AGE,
  LOCALE_SHORT,
  HTML_LANG,
  type Locale,
} from '@/lib/i18n/config'

/**
 * مبدّل اللغة — عربية، كردية، إنجليزية
 * =====================================
 * موضعه مقصود: أعلى كل شاشة يراها زائر لم يسجّل بعد (التعريفية، الدخول،
 * إنشاء الحساب، إكمال المتجر). التاجر الكردي أو الزائر الأجنبي يجب أن يجد
 * لغته **قبل** أن يُطلب منه بريده وكلمة مروره، لا بعد أن يدخل.
 *
 * ⚠️ الكوكي يُكتب من المتصفّح لا بإجراء خادم: التبديل يجب أن يقع في اللحظة
 * نفسها، وإجراء خادم يعني انتظار دورة شبكة كاملة لتغيير لغة. و router.refresh
 * بعده يعيد بناء مكوّنات الخادم بالقاموس الجديد بلا إعادة تحميل الصفحة.
 *
 * ⚠️ وسمتا lang و dir تُضبطان يدوياً قبل الـ refresh: التخطيط ينقلب من
 * اليمين إلى اليسار (أو العكس) لحظة الضغط، فلا يرى المستخدم فقرة إنجليزية
 * مصفوفة يميناً ريثما يصل ردّ الخادم.
 */
/**
 * أثر التبديل على المستند — خارج المكوّن عمداً.
 * ------------------------------------------
 * كتابة الكوكي وسمتَي lang و dir أثرٌ على DOM لا حالةٌ لـ React، ووضعُها
 * داخل جسم المكوّن يخالف قاعدة react-hooks/immutability التي تمنع تعديل ما
 * عُرّف خارجه. إخراجها إلى دالّة وحدة يُبقي المكوّن نقيّاً ويُبقي الأثر
 * حيث يقع فعلاً: في المستند.
 */
function applyLocaleToDocument(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${LOCALE_MAX_AGE};samesite=lax`
  document.documentElement.lang = HTML_LANG[next]
  document.documentElement.dir = LOCALE_DIR[next]
}

/** أصناف زرّ الفتح الافتراضية — تُستبدل كلياً في الشريط الداكن. */
const DEFAULT_TRIGGER =
  'inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl border border-line bg-surface text-ink-muted hover:text-brand-text hover:border-line-strong transition-colors'

export default function LocaleSwitcher({
  locale,
  label,
  chooseLabel,
  triggerClassName,
}: {
  locale: Locale
  label: string
  chooseLabel: string
  /** ⚠️ يخصّ زرّ الفتح وحده — قائمة الخيارات تبقى على أسطح المنصة مهما كان
   *  ما حولها، وإلا ورثت عناصرها لون الشريط الداكن فلم تُقرأ. */
  triggerClassName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // ⚠️ إعادة بناء مكوّنات الخادم ليست فورية — تستغرق دورة شبكة. بلا مؤشّر
  // انتظار يظن الضاغط أن ضغطته ضاعت فيضغط ثانية وثالثة.
  const [pending, startTransition] = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)

  // الإغلاق بالضغط خارج القائمة أو بمفتاح Escape — قائمة تبقى مفتوحة فوق
  // المحتوى تحجب ما تحتها على الهاتف.
  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function choose(next: Locale) {
    setOpen(false)
    if (next === locale) return

    applyLocaleToDocument(next)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        aria-busy={pending}
        className={`${triggerClassName ?? DEFAULT_TRIGGER}${pending ? ' opacity-60' : ''}`}
      >
        <Globe size={16} className={pending ? 'animate-pulse' : undefined} />
        <span className="text-[11px] font-bold">{LOCALE_SHORT[locale]}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={chooseLabel}
          className="absolute top-full mt-2 end-0 min-w-[10rem] rounded-2xl border border-line bg-surface shadow-xl shadow-black/5 overflow-hidden z-50 animate-fadeIn"
        >
          {LOCALES.map((code) => {
            const active = code === locale
            return (
              <button
                key={code}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(code)}
                lang={HTML_LANG[code]}
                dir={LOCALE_DIR[code]}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? 'text-brand-text font-bold bg-brand-soft'
                    : 'text-ink hover:bg-surface-2'
                }`}
              >
                <span>{LOCALE_LABELS[code]}</span>
                {active && <Check size={15} className="shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
