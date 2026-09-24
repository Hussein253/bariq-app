'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

/**
 * فهرس المستند القانوني — يُبرز البند الذي يقرؤه الزائر الآن
 * ==========================================================
 * مكوّن عميل لأن «البند الحالي» يتبع التمرير. نصوصه تصله خصائصَ من
 * LegalPage، فلا يعبر القاموس إلى المتصفح (docs/i18n-and-theming.md).
 *
 * البند الحالي هو آخر بند تجاوز عنوانُه خطَّ القراءة تحت الترويسة اللاصقة.
 * ⚠️ والبند الأخير قصير: تبلغ الصفحة نهايتها قبل أن يصل عنوانه إلى ذلك الخط،
 * فيبقى الذي قبله مُبرَزاً والقارئ أمام الأخير. لذا من بلغ نهاية الصفحة
 * يُبرَز له الأخير.
 */

/**
 * بُعد خطّ القراءة عن أعلى النافذة: الترويسة اللاصقة وشريط الجلسة فوقها،
 * وأبعد قليلاً من scroll-mt في الصفحة — فالبند الذي يُقفز إليه من الفهرس
 * يُبرَز فور وصوله.
 */
const READ_LINE = 140

export type TocItem = { id: string; number: string; title: string }

export default function LegalToc({
  heading,
  backToTop,
  items,
}: {
  heading: string
  backToTop: string
  items: TocItem[]
}) {
  const [activeId, setActiveId] = useState(items[0]?.id)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const root = document.documentElement
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) {
        setActiveId(items[items.length - 1]?.id)
        return
      }
      let current = items[0]?.id
      for (const item of items) {
        const top = document.getElementById(item.id)?.getBoundingClientRect().top
        if (top !== undefined && top <= READ_LINE) current = item.id
      }
      setActiveId(current)
    }

    // إطار رسم واحد لكل دفعة تمرير، لا حساب مع كل حدث
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }

    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [items])

  return (
    <nav aria-label={heading}>
      <p className="text-sm font-bold text-ink-muted mb-4">{heading}</p>

      <ol className="border-s border-line">
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? 'location' : undefined}
                className={`-ms-px flex items-baseline gap-2 border-s-2 ps-4 py-2 text-sm transition-colors ${
                  active
                    ? 'border-brand text-ink font-bold'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                <span className="tabular-nums text-xs text-ink-faint">{item.number}</span>
                <span aria-hidden className="text-ink-faint">·</span>
                <span>{item.title}</span>
              </a>
            </li>
          )
        })}
      </ol>

      {/* #top لا يحتاج عنصراً بهذا المعرّف: المتصفّح يصعد به إلى رأس الصفحة */}
      <div className="mt-6 pt-5 border-t border-line">
        <a
          href="#top"
          className="inline-flex items-center gap-2 text-xs font-bold text-ink-muted hover:text-brand-text transition"
        >
          <ArrowUp size={14} />
          <span>{backToTop}</span>
        </a>
      </div>
    </nav>
  )
}
