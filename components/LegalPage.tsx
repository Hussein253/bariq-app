import { Fragment } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import InterfaceControls from '@/components/InterfaceControls'
import LegalToc from '@/components/LegalToc'
import { localizeDigits } from '@/lib/formatters'
import { fill, type Dictionary } from '@/lib/i18n'
import { LOCALE_DIR, type Locale } from '@/lib/i18n/config'

/**
 * صفحة مستند قانوني — شروط الخدمة وسياسة الخصوصية بقالب واحد
 * ============================================================
 * المستندان يتشاركان كل شيء عدا النصّ: الترويسة، وتبويبا التنقّل بينهما،
 * والفهرس، وبند «تواصل معنا»، والتذييل. النصّ في القواميس (t.terms و
 * t.privacy) بشكل واحد، ولكل مستند تاريخ نفاذه في ملف صفحته.
 */

/**
 * بريد التواصل في المستندين معاً. فارغ إلى أن يُعتمد بريد عام للمنصة، وضبطه
 * هنا وحده يُظهر سطر «راسلنا على …» في بند «تواصل معنا» من الصفحتين — نصّه
 * جاهز في القواميس الثلاثة (contact.emailLine).
 */
const CONTACT_EMAIL: string | null = null

/** الحدّ الأدنى للعمر في شروط الخدمة — رقم يُحقن بأرقام اللغة لا يُكتب في الجملة. */
const MIN_AGE = 18

/** معرّف البند الأخير — رابط يُشارَك، فهو ثابت بين اللغات كمعرّفات بقية البنود. */
const CONTACT_ID = 'contact'

/** أسماء الأشهر بلغة القارئ: ckb للكردية، وإلا ظهرت أشهر عربية في صفحة كردية. */
const DATE_LOCALE: Record<Locale, string> = { ar: 'ar-IQ', ku: 'ckb-IQ', en: 'en-US' }

export type LegalDoc = 'terms' | 'privacy'

/** التبويبان بترتيبهما: الأول في بداية السطر — يميناً في العربية ويساراً في الإنجليزية. */
const DOCS: { key: LegalDoc; href: string }[] = [
  { key: 'terms', href: '/terms' },
  { key: 'privacy', href: '/privacy' },
]

/**
 * كـ fill لكن القيم عناصر React: البريد رابط واسم الشركة بخطّ عريض،
 * و fill تعيد نصّاً مسطّحاً لا يحمل أيّاً منهما.
 */
function fillNodes(template: string, nodes: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/).map((part, idx) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1]
    return key && Object.prototype.hasOwnProperty.call(nodes, key) ? (
      <Fragment key={idx}>{nodes[key]}</Fragment>
    ) : (
      part
    )
  })
}

function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string
  number: string
  title: string
  children: React.ReactNode
}) {
  // scroll-mt يُنزل العنوان تحت الترويسة اللاصقة حين يُقفز إليه من الفهرس
  return (
    <section id={id} className="mt-14 scroll-mt-32">
      <h2 className="flex items-baseline gap-3 text-xl sm:text-2xl font-bold text-ink">
        <span className="tabular-nums text-sm font-semibold text-ink-faint">{number}</span>
        <span>{title}</span>
      </h2>
      <div className="mt-5 space-y-4 text-base leading-loose text-ink-muted">{children}</div>
    </section>
  )
}

export default function LegalPage({
  locale,
  t,
  doc,
  updatedAt,
}: {
  locale: Locale
  t: Dictionary
  doc: LegalDoc
  /** تاريخ نفاذ النصّ بصيغة YYYY-MM-DD. */
  updatedAt: string
}) {
  const content = t[doc]

  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight
  const numberOf = (idx: number) => localizeDigits(String(idx + 1).padStart(2, '0'), locale)
  const updatedLabel = localizeDigits(
    new Intl.DateTimeFormat(DATE_LOCALE[locale], { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(updatedAt)
    ),
    locale
  )
  const values = { age: localizeDigits(MIN_AGE, locale) }
  const contactNumber = numberOf(content.sections.length)

  const toc = [
    ...content.sections.map((section, idx) => ({
      id: section.id,
      number: numberOf(idx),
      title: section.title,
    })),
    { id: CONTACT_ID, number: contactNumber, title: content.contact.title },
  ]

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col font-sans">
      <header className="border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/platform" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-on-brand font-black text-xl shadow-md">
              ⚡
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-brand-text">{t.brand.name}</span>
              <span className="text-[10px] text-ink-muted block font-semibold tracking-wider">
                {t.brand.latin}
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <InterfaceControls locale={locale} t={t} />
            <Link
              href="/workspace"
              className="inline-flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-bold text-xs shadow-md transition active:scale-95"
            >
              <span className="hidden sm:inline">{t.nav.enterPlatform}</span>
              <Forward size={16} />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="border-b border-line">
          <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
            <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
              {t.legal.eyebrow}
            </p>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-ink">{content.title}</h1>
            <p className="mt-5 text-sm text-ink-muted">
              {t.legal.lastUpdated}
              <span aria-hidden className="mx-2 text-ink-faint">·</span>
              <time dateTime={updatedAt} className="font-bold text-ink">
                {updatedLabel}
              </time>
            </p>

            <nav
              aria-label={t.legal.documents}
              className="mt-8 inline-flex rounded-xl border border-line bg-surface p-1"
            >
              {DOCS.map(({ key, href }) => (
                <Link
                  key={key}
                  href={href}
                  aria-current={key === doc ? 'page' : undefined}
                  className={`px-4 sm:px-6 py-2.5 rounded-lg text-sm font-bold transition ${
                    key === doc ? 'bg-brand text-on-brand shadow-sm' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {t[key].title}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-12 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
          <aside className="mb-14 lg:mb-0 lg:sticky lg:top-28 lg:self-start">
            <LegalToc heading={t.legal.onThisPage} backToTop={t.legal.backToTop} items={toc} />
          </aside>

          <article className="max-w-3xl">
            <p className="text-base sm:text-lg leading-loose text-ink">{content.intro}</p>

            {content.sections.map((section, idx) => (
              <LegalSection key={section.id} id={section.id} number={numberOf(idx)} title={section.title}>
                {section.body.map((block, blockIdx) =>
                  typeof block === 'string' ? (
                    <p key={blockIdx}>{fill(block, values)}</p>
                  ) : (
                    <ul key={blockIdx} className="list-disc ps-5 space-y-2 marker:text-ink-faint">
                      {block.map((item) => (
                        <li key={item}>{fill(item, values)}</li>
                      ))}
                    </ul>
                  )
                )}
              </LegalSection>
            ))}

            <LegalSection id={CONTACT_ID} number={contactNumber} title={content.contact.title}>
              {CONTACT_EMAIL && (
                <p>
                  {fillNodes(content.contact.emailLine, {
                    email: (
                      <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        dir="ltr"
                        className="font-bold text-ink hover:text-brand-text transition"
                      >
                        {CONTACT_EMAIL}
                      </a>
                    ),
                  })}
                </p>
              )}
              <p>
                {fillNodes(content.contact.operator, {
                  company: <strong className="font-bold text-ink">{t.legal.company}</strong>,
                })}
              </p>
            </LegalSection>
          </article>
        </div>
      </main>

      <footer className="border-t border-line bg-surface py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-on-brand font-black">
              ⚡
            </div>
            <span className="font-bold text-brand-text">{t.footer.brandLine}</span>
          </div>
          <nav className="flex flex-wrap justify-center items-center gap-5 font-semibold">
            <Link href="/platform#about" className="hover:text-brand-text transition">{t.nav.about}</Link>
            <Link href="/status" className="hover:text-brand-text transition">{t.footer.status}</Link>
            {DOCS.map(({ key, href }) => (
              <Link
                key={key}
                href={href}
                aria-current={key === doc ? 'page' : undefined}
                className={key === doc ? 'text-brand-text' : 'hover:text-brand-text transition'}
              >
                {t.footer[key]}
              </Link>
            ))}
          </nav>
          <p>{fill(t.footer.rights, { year: localizeDigits(new Date().getFullYear(), locale) })}</p>
        </div>
      </footer>
    </div>
  )
}
