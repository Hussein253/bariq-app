import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  Inbox,
  Languages,
  Layers,
  MapPin,
  MessageCircle,
  Package,
  Radar,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  TrendingDown,
  Truck,
  Users,
} from 'lucide-react'
import PricingSection from '@/components/PricingSection'
import InterfaceControls from '@/components/InterfaceControls'
import { loadActivePlans } from '@/lib/plans-server'
import { type Plan } from '@/lib/plans'
import { localizeDigits } from '@/lib/formatters'
import { getTranslations } from '@/lib/i18n/server'
import { fill } from '@/lib/i18n'
import { LOCALE_DIR } from '@/lib/i18n/config'

// الباقات تُقرأ من Supabase في كل زيارة كي يسري تعديل السعر فوراً بلا إعادة نشر.
export const dynamic = 'force-dynamic'

/** عدد مناطق التوصيل في الدليل — رقم واحد يُعرض بأرقام اللغة المختارة. */
const DELIVERY_AREAS = 208
const SETUP_MINUTES = 10

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  brain: Brain,
  inbox: Inbox,
  clipboard: ClipboardList,
  truck: Truck,
  ticket: Ticket,
  mapPin: MapPin,
  radar: Radar,
  activity: Activity,
  store: Store,
  users: Users,
  layers: Layers,
  package: Package,
  shield: ShieldCheck,
  languages: Languages,
  card: CreditCard,
}

const PROBLEM_ICONS = [TrendingDown, Clock, ClipboardList]
const TRUST_ICONS = [BadgeCheck, Languages, CreditCard, Truck]

export default async function Home() {
  const { locale, t } = await getTranslations()

  // سهم «إلى الأمام» يقلب اتجاهه مع اللغة: يسارٌ في العربية والكردية،
  // ويمينٌ في الإنجليزية. سهم ثابت يشير إلى الخلف في إحدى الحالتين.
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight

  let plans: Plan[] = []
  let plansError: string | null = null

  try {
    plans = await loadActivePlans()
  } catch (err: unknown) {
    plansError = err instanceof Error ? err.message : 'plans load failed'
    console.error('[HOME][PLANS_LOAD_ERROR]', plansError)
  }

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col font-sans">
      {/* ===== الترويسة ===== */}
      <header className="border-b border-line bg-surface/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-on-brand font-black text-xl shadow-md">
              ⚡
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-brand-text">{t.brand.name}</span>
              <span className="text-[10px] text-ink-muted block font-semibold tracking-wider">
                {t.brand.latin}
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-ink-muted">
            <a href="#about" className="hover:text-brand-text transition">{t.nav.about}</a>
            <a href="#capabilities" className="hover:text-brand-text transition">{t.nav.capabilities}</a>
            <a href="#audience" className="hover:text-brand-text transition">{t.nav.audience}</a>
            <a href="#start" className="hover:text-brand-text transition">{t.nav.start}</a>
            <a href="#pricing" className="hover:text-brand-text transition">{t.nav.pricing}</a>
            <a href="#faq" className="hover:text-brand-text transition">{t.nav.faq}</a>
          </nav>

          <div className="flex items-center gap-2">
            {/* ⚠️ ضابطا اللغة والمظهر قبل زرّ الدخول لا بعده: من لا يقرأ
                العربية يحتاج أن يبدّل لغته قبل أن يُدعى إلى التسجيل. */}
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
        {/* ===== القسم الرئيسي ===== */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-12 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-info-line bg-info-bg text-brand-text text-xs font-bold mb-8">
            <Sparkles size={14} />
            <span>{t.hero.badge}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight max-w-4xl leading-[1.15] text-ink">
            {t.hero.titleLead} <span className="text-brand-text">{t.hero.titleAccent}</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-ink-muted max-w-2xl leading-relaxed">
            {t.hero.subtitle}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/workspace"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-black text-sm shadow-xl transition active:scale-95"
            >
              <span>{t.hero.ctaPrimary}</span>
              <Forward size={18} />
            </Link>
            <Link
              href="/operations/chats"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-surface border border-brand/30 text-brand-text hover:bg-brand-soft font-bold text-sm shadow-sm transition active:scale-95"
            >
              <MessageCircle size={18} />
              <span>{t.hero.ctaSecondary}</span>
            </Link>
          </div>

          <p className="mt-5 text-[11px] text-ink-muted font-semibold">
            {fill(t.hero.note, { n: localizeDigits(SETUP_MINUTES, locale) })}
          </p>

          {/* شريط الثقة */}
          <div className="mt-14 w-full max-w-4xl grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {t.hero.trust.map((item, idx) => {
              const Icon = TRUST_ICONS[idx] ?? BadgeCheck
              return (
                <div
                  key={item.label}
                  className="p-4 rounded-2xl bg-surface border border-line shadow-sm flex flex-col items-center gap-1.5"
                >
                  <Icon size={18} className="text-brand-text" />
                  <span className="font-bold text-ink text-center">{item.label}</span>
                  <span className="text-[10px] text-ink-muted">{item.sub}</span>
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== المشكلة ===== */}
        <section className="bg-surface border-y border-line py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
                {t.problem.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">
                {t.problem.title}
              </h2>
              <p className="mt-4 text-sm text-ink-muted max-w-2xl mx-auto leading-relaxed">
                {t.problem.body}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-start">
              {t.problem.cards.map((card, idx) => {
                const Icon = PROBLEM_ICONS[idx] ?? TrendingDown
                return (
                  <div key={card.title} className="p-6 rounded-2xl bg-surface-2 border border-line">
                    <div className="w-11 h-11 rounded-xl bg-danger-bg border border-danger-line flex items-center justify-center text-danger-ink mb-4">
                      <Icon size={20} />
                    </div>
                    <h3 className="font-bold text-ink mb-2">{card.title}</h3>
                    <p className="text-xs text-ink-muted leading-relaxed">{card.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== لا حاجة إلى تطبيق ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="rounded-3xl bg-brand text-on-brand p-8 sm:p-12 text-center">
            <p className="text-xs font-black text-accent uppercase tracking-[0.2em] mb-3">
              {t.noApp.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight max-w-3xl mx-auto leading-snug">
              {t.noApp.title}
            </h2>
            <p className="mt-5 text-sm text-on-brand/85 max-w-2xl mx-auto leading-relaxed">
              {t.noApp.body}
            </p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-xs">
              {t.noApp.points.map((point) => (
                <div
                  key={point}
                  className="py-3 px-4 rounded-xl bg-white/10 border border-white/15 font-bold flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={14} className="text-accent shrink-0" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== من نحن ===== */}
        <section id="about" className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
              {t.about.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink max-w-3xl mx-auto leading-snug">
              {t.about.title}
            </h2>
            <p className="mt-5 text-sm text-ink-muted max-w-2xl mx-auto leading-relaxed">
              {t.about.body}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-start">
            {t.about.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Sparkles
              return (
                <div key={item.title} className="p-6 rounded-2xl bg-surface border border-line shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-brand-soft flex items-center justify-center text-brand-text mb-4">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-bold text-ink mb-2 text-sm">{item.title}</h3>
                  <p className="text-xs text-ink-muted leading-relaxed">{item.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== الإمكانات ===== */}
        <section id="capabilities" className="max-w-7xl mx-auto px-6 py-10">
          <div className="text-center mb-12">
            <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
              {t.capabilities.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">
              {t.capabilities.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-start">
            {t.capabilities.items.map((cap) => {
              const Icon = ICONS[cap.icon] ?? Sparkles
              const isSignature = cap.icon === 'truck'
              return (
                <div
                  key={cap.title}
                  className={`p-6 rounded-2xl bg-surface shadow-sm space-y-3 transition hover:shadow-md ${
                    isSignature ? 'border-2 border-brand' : 'border border-line'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-brand-soft flex items-center justify-center text-brand-text">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-ink">{cap.title}</h3>
                    <p className="text-[10px] text-ink-muted font-semibold tracking-wider uppercase mt-0.5">
                      {cap.subtitle}
                    </p>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">{cap.body}</p>
                  {isSignature && (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-warn-bg border border-warn-line text-warn-ink text-[10px] font-black">
                      {t.capabilities.exclusive}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== لمن صُمّم ===== */}
        <section id="audience" className="bg-surface border-y border-line py-20 mt-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
                {t.audience.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">
                {t.audience.title}
              </h2>
              <p className="mt-4 text-sm text-ink-muted max-w-2xl mx-auto leading-relaxed">
                {t.audience.body}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-start">
              {t.audience.items.map((seg) => {
                const Icon = ICONS[seg.icon] ?? Store
                return (
                  <div key={seg.title} className="p-6 rounded-2xl bg-surface-2 border border-line">
                    <div className="w-11 h-11 rounded-xl bg-surface border border-line flex items-center justify-center text-brand-text mb-4">
                      <Icon size={20} />
                    </div>
                    <h3 className="font-bold text-ink mb-2 text-sm leading-snug">{seg.title}</h3>
                    <p className="text-xs text-ink-muted leading-relaxed">{seg.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== مصمَّم للعراق ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
              {t.iraq.eyebrow}
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">
              {t.iraq.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-start">
            {t.iraq.items.map((item) => {
              const Icon = ICONS[item.icon] ?? ShieldCheck
              return (
                <div key={item.title} className="p-6 rounded-2xl bg-surface border border-line shadow-sm">
                  <div className="w-11 h-11 rounded-xl bg-success-bg border border-success-line flex items-center justify-center text-success-ink mb-4">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-bold text-ink mb-2 text-sm">{item.title}</h3>
                  <p className="text-xs text-ink-muted leading-relaxed">
                    {fill(item.body, { n: localizeDigits(DELIVERY_AREAS, locale) })}
                  </p>
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== كيف تبدأ ===== */}
        <section id="start" className="bg-surface border-y border-line py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
                {t.start.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">
                {fill(t.start.title, { n: localizeDigits(t.start.steps.length, locale) })}
              </h2>
              <p className="mt-4 text-sm text-ink-muted">
                {fill(t.start.note, { n: localizeDigits(SETUP_MINUTES, locale) })}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-start">
              {t.start.steps.map((step, idx) => (
                <div
                  key={step.title}
                  className="relative p-6 rounded-2xl bg-surface-2 border border-line"
                >
                  <span className="absolute -top-3 start-6 w-8 h-8 rounded-xl bg-brand text-on-brand font-black text-sm flex items-center justify-center shadow-md">
                    {localizeDigits(idx + 1, locale)}
                  </span>
                  <h3 className="font-bold text-ink mb-2 mt-3 text-sm">{step.title}</h3>
                  <p className="text-xs text-ink-muted leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== الأسعار ===== */}
        <div className="max-w-7xl mx-auto px-6">
          {plansError ? (
            <section id="pricing" className="py-20 text-center">
              <p className="text-sm text-danger-ink font-semibold">{t.pricing.loadError}</p>
            </section>
          ) : (
            <PricingSection plans={plans} locale={locale} t={t.pricing} />
          )}
        </div>

        {/* ===== الأسئلة الشائعة ===== */}
        <section id="faq" className="bg-surface border-y border-line py-20">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-10">
              <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
                {t.faq.eyebrow}
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">
                {t.faq.title}
              </h2>
            </div>

            <div className="space-y-3">
              {t.faq.items.map((entry) => (
                <details
                  key={entry.question}
                  className="group rounded-2xl bg-surface-2 border border-line px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-bold text-sm text-ink">
                    <span>{entry.question}</span>
                    <span className="shrink-0 w-6 h-6 rounded-lg bg-surface border border-line text-brand-text flex items-center justify-center font-black transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-xs text-ink-muted leading-relaxed">{entry.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===== الدعوة النهائية ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink max-w-2xl mx-auto leading-snug">
            {t.finalCta.title}
          </h2>
          <p className="mt-4 text-sm text-ink-muted max-w-xl mx-auto leading-relaxed">
            {t.finalCta.body}
          </p>
          <Link
            href="/workspace"
            className="mt-8 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-black text-sm shadow-xl transition active:scale-95"
          >
            <span>{t.finalCta.cta}</span>
            <Forward size={18} />
          </Link>
          <p className="mt-5 text-[11px] text-ink-muted font-semibold">
            {fill(t.finalCta.note, { n: localizeDigits(SETUP_MINUTES, locale) })}
          </p>
        </section>
      </main>

      {/* ===== التذييل ===== */}
      <footer className="border-t border-line bg-surface py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-muted">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-on-brand font-black">
              ⚡
            </div>
            <span className="font-bold text-brand-text">{t.footer.brandLine}</span>
          </div>
          <nav className="flex flex-wrap justify-center items-center gap-5 font-semibold">
            <Link href="/admin" className="hover:text-brand-text transition">{t.footer.admin}</Link>
            <Link href="/workspace" className="hover:text-brand-text transition">{t.footer.workspace}</Link>
            <Link href="/operations" className="hover:text-brand-text transition">{t.footer.operations}</Link>
            <Link href="/operations/chats" className="hover:text-brand-text transition">{t.footer.support}</Link>
            <Link href="/dashboard" className="hover:text-brand-text transition">{t.footer.tracking}</Link>
            <Link href="/status" className="hover:text-brand-text transition">{t.footer.status}</Link>
            <Link href="/terms" className="hover:text-brand-text transition">{t.footer.terms}</Link>
            <Link href="/privacy" className="hover:text-brand-text transition">{t.footer.privacy}</Link>
          </nav>
          <p>{fill(t.footer.rights, { year: localizeDigits(new Date().getFullYear(), locale) })}</p>
        </div>
      </footer>
    </div>
  )
}
