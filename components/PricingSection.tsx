'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { formatNumberFor, localizeDigits } from '@/lib/formatters'
import { type Plan, planSpecLines, recommendPlan } from '@/lib/plans'
import { LOCALE_DIR, type Locale } from '@/lib/i18n/config'
import type { Dictionary } from '@/lib/i18n'

/**
 * ⚠️ نصوص هذا المكوّن تصل خاصيةً لا استيراداً: هو مكوّن عميل، واستيراده
 * للقاموس يجرّ العربية والكردية والإنجليزية كلها إلى حزمة كل زائر. الصفحة
 * (مكوّن خادم) تقرأ القاموس وتمرّر قسم الأسعار وحده.
 */
type PricingCopy = Dictionary['pricing']

function PriceDisplay({
  plan,
  locale,
  t,
}: {
  plan: Plan
  locale: Locale
  t: PricingCopy
}) {
  if (plan.price_iqd_monthly === null) {
    return (
      <div className="mt-4">
        <p className="text-2xl font-black text-brand-text">{t.price.soon}</p>
        <p className="text-[11px] text-ink-muted mt-1">{t.price.soonHint}</p>
      </div>
    )
  }

  if (plan.price_iqd_monthly === 0) {
    return (
      <div className="mt-4">
        <p className="text-3xl font-black text-ink">
          {localizeDigits(0, locale)}{' '}
          <span className="text-base font-bold text-ink-muted">{t.price.currency}</span>
        </p>
        <p className="text-[11px] text-success-ink font-bold mt-1">{t.price.freeForever}</p>
      </div>
    )
  }

  const hasDiscount =
    plan.list_price_iqd_monthly !== null && plan.list_price_iqd_monthly > plan.price_iqd_monthly

  return (
    <div className="mt-4">
      {hasDiscount && (
        <p className="text-sm text-ink-faint line-through font-semibold">
          {formatNumberFor(locale, plan.list_price_iqd_monthly)} {t.price.currency}
        </p>
      )}
      <p className="text-3xl font-black text-ink">
        {formatNumberFor(locale, plan.price_iqd_monthly)}{' '}
        <span className="text-base font-bold text-ink-muted">{t.price.currency}</span>
      </p>
      <p className="text-[11px] text-ink-muted mt-1">{t.price.monthly}</p>
    </div>
  )
}

function PlanCard({
  plan,
  isRecommended,
  locale,
  t,
}: {
  plan: Plan
  isRecommended: boolean
  locale: Locale
  t: PricingCopy
}) {
  const highlight = plan.is_featured || isRecommended
  const Forward = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight
  const specs = planSpecLines(plan, t.specs, (value) => formatNumberFor(locale, value))

  return (
    <div
      className={`relative rounded-2xl bg-surface p-6 flex flex-col transition ${
        highlight ? 'border-2 border-brand shadow-xl' : 'border border-line shadow-sm'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 start-6 px-3 py-1 rounded-full bg-brand text-on-brand text-[10px] font-black shadow-md">
          {isRecommended ? t.badge.recommended : t.badge.popular}
        </span>
      )}

      <h3 className="text-xl font-black text-brand-text tracking-tight">{plan.name_en}</h3>
      <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed min-h-[32px]">
        {plan.tagline_ar}
      </p>

      <PriceDisplay plan={plan} locale={locale} t={t} />

      <ul className="mt-5 space-y-2.5 flex-1">
        {specs.map((line) => (
          <li key={line} className="flex items-start gap-2 text-[11px] text-ink">
            <Check size={13} className="text-success-ink shrink-0 mt-0.5" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/workspace"
        className={`mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition active:scale-95 ${
          highlight
            ? 'bg-brand hover:bg-brand-hover text-on-brand shadow-md'
            : 'bg-surface border border-brand/30 text-brand-text hover:bg-brand-soft'
        }`}
      >
        <span>{plan.price_iqd_monthly === 0 ? t.cta.free : t.cta.start}</span>
        <Forward size={14} />
      </Link>
    </div>
  )
}

export default function PricingSection({
  plans,
  locale,
  t,
}: {
  plans: Plan[]
  locale: Locale
  t: PricingCopy
}) {
  const [dailyCustomers, setDailyCustomers] = useState(20)
  const [messagesPerChat, setMessagesPerChat] = useState(6)

  const monthlyActions = dailyCustomers * messagesPerChat * 30
  const recommended = useMemo(
    () => recommendPlan(monthlyActions, plans),
    [monthlyActions, plans]
  )

  if (plans.length === 0) {
    return (
      <section id="pricing" className="w-full py-16 text-center">
        <p className="text-sm text-ink-muted">{t.empty}</p>
      </section>
    )
  }

  return (
    <section id="pricing" className="w-full py-20">
      <div className="text-center mb-10">
        <p className="text-xs font-black text-brand-text uppercase tracking-[0.2em] mb-3">
          {t.eyebrow}
        </p>
        <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-ink">{t.title}</h2>
        <p className="mt-3 text-sm text-ink-muted max-w-xl mx-auto leading-relaxed">
          {t.subtitle}
        </p>
      </div>

      {/* حاسبة الباقة المناسبة */}
      <div className="max-w-3xl mx-auto mb-12 rounded-2xl bg-surface border border-line shadow-sm p-6">
        <p className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
          <Sparkles size={15} className="text-brand-text" />
          {t.calc.title}
        </p>
        <p className="text-[11px] text-ink-muted mb-5">{t.calc.hint}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="flex items-center justify-between text-[11px] font-bold text-ink-muted mb-2">
              <span>{t.calc.dailyCustomers}</span>
              <span className="text-brand-text font-black text-sm">
                {localizeDigits(dailyCustomers, locale)}
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={200}
              value={dailyCustomers}
              onChange={(e) => setDailyCustomers(Number(e.target.value))}
              aria-label={t.calc.dailyCustomers}
              className="w-full accent-brand"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-[11px] font-bold text-ink-muted mb-2">
              <span>{t.calc.messagesPerChat}</span>
              <span className="text-brand-text font-black text-sm">
                {localizeDigits(messagesPerChat, locale)}
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={messagesPerChat}
              onChange={(e) => setMessagesPerChat(Number(e.target.value))}
              aria-label={t.calc.messagesPerChat}
              className="w-full accent-brand"
            />
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-ink-muted">{t.calc.estimated}</p>
            <p className="text-2xl font-black text-ink font-mono">
              {formatNumberFor(locale, monthlyActions)}
            </p>
          </div>
          {recommended && (
            <div className="text-start sm:text-end">
              <p className="text-[11px] text-ink-muted">{t.calc.recommended}</p>
              <p className="text-2xl font-black text-brand-text">{recommended.name_en}</p>
            </div>
          )}
        </div>
      </div>

      {/* بطاقات الباقات */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 items-stretch">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            isRecommended={recommended?.id === plan.id}
            locale={locale}
            t={t}
          />
        ))}
      </div>

      <div className="mt-8 max-w-3xl mx-auto text-center space-y-2">
        {t.notes.map((note) => (
          <p key={note} className="text-[11px] text-ink-muted leading-relaxed">
            {note}
          </p>
        ))}
      </div>
    </section>
  )
}
