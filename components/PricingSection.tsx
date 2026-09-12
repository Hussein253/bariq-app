'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Sparkles, ArrowLeft } from 'lucide-react'
import { formatArabicNumber, toArabicDigits } from '@/lib/formatters'
import { type Plan, planSpecLines, recommendPlan } from '@/lib/plans'

function PriceDisplay({ plan }: { plan: Plan }) {
  if (plan.price_iqd_monthly === null) {
    return (
      <div className="mt-4">
        <p className="text-2xl font-black text-[#253765]">قريباً</p>
        <p className="text-[11px] text-slate-500 mt-1">سعر هذه الباقة قيد الاعتماد</p>
      </div>
    )
  }

  if (plan.price_iqd_monthly === 0) {
    return (
      <div className="mt-4">
        <p className="text-3xl font-black text-[#0F172A]">
          ٠ <span className="text-base font-bold text-slate-500">د.ع</span>
        </p>
        <p className="text-[11px] text-emerald-700 font-bold mt-1">مجاناً للأبد</p>
      </div>
    )
  }

  const hasDiscount =
    plan.list_price_iqd_monthly !== null && plan.list_price_iqd_monthly > plan.price_iqd_monthly

  return (
    <div className="mt-4">
      {hasDiscount && (
        <p className="text-sm text-slate-400 line-through font-semibold">
          {formatArabicNumber(plan.list_price_iqd_monthly)} د.ع
        </p>
      )}
      <p className="text-3xl font-black text-[#0F172A]">
        {formatArabicNumber(plan.price_iqd_monthly)}{' '}
        <span className="text-base font-bold text-slate-500">د.ع</span>
      </p>
      <p className="text-[11px] text-slate-500 mt-1">شهرياً</p>
    </div>
  )
}

function PlanCard({ plan, isRecommended }: { plan: Plan; isRecommended: boolean }) {
  const highlight = plan.is_featured || isRecommended

  return (
    <div
      className={`relative rounded-2xl bg-white p-6 flex flex-col transition ${
        highlight
          ? 'border-2 border-[#253765] shadow-xl shadow-[#253765]/10'
          : 'border border-[#E2E8F0] shadow-sm'
      }`}
    >
      {highlight && (
        <span className="absolute -top-3 right-6 px-3 py-1 rounded-full bg-[#253765] text-white text-[10px] font-black shadow-md">
          {isRecommended ? 'المناسبة لحجمك' : 'الأكثر شيوعاً'}
        </span>
      )}

      <h3 className="text-xl font-black text-[#253765] tracking-tight">{plan.name_en}</h3>
      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed min-h-[32px]">{plan.tagline_ar}</p>

      <PriceDisplay plan={plan} />

      <ul className="mt-5 space-y-2.5 flex-1">
        {planSpecLines(plan).map((line) => (
          <li key={line} className="flex items-start gap-2 text-[11px] text-[#0F172A]">
            <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" />
            <span>{toArabicDigits(line)}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/operations"
        className={`mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition active:scale-95 ${
          highlight
            ? 'bg-[#253765] hover:bg-[#1D2B50] text-white shadow-md'
            : 'bg-white border border-[#253765]/30 text-[#253765] hover:bg-[#253765]/5'
        }`}
      >
        <span>{plan.price_iqd_monthly === 0 ? 'ابدأ مجاناً' : 'ابدأ الآن'}</span>
        <ArrowLeft size={14} />
      </Link>
    </div>
  )
}

export default function PricingSection({ plans }: { plans: Plan[] }) {
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
        <p className="text-sm text-slate-500">لم تُنشر أي باقة بعد.</p>
      </section>
    )
  }

  return (
    <section id="pricing" className="w-full py-20">
      <div className="text-center mb-10">
        <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
          الأسعار · بالدينار العراقي
        </p>
        <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
          أسعار بسيطة وشفّافة
        </h2>
        <p className="mt-3 text-sm text-[#64748B] max-w-xl mx-auto leading-relaxed">
          ابدأ مجاناً على باقة Spark، وارقَ حين يصبح حجم رسائلك جاهزاً للخطوة التالية.
        </p>
      </div>

      {/* حاسبة الباقة المناسبة */}
      <div className="max-w-3xl mx-auto mb-12 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm p-6">
        <p className="text-sm font-bold text-[#0F172A] mb-1 flex items-center gap-2">
          <Sparkles size={15} className="text-[#253765]" />
          غير متأكّد أيّ باقة تناسبك؟
        </p>
        <p className="text-[11px] text-slate-500 mb-5">
          أخبرنا بحجم نشاطك اليومي وسنرشّح لك الباقة المناسبة.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="flex items-center justify-between text-[11px] font-bold text-[#64748B] mb-2">
              <span>زبائن جدد يومياً</span>
              <span className="text-[#253765] font-black text-sm">{toArabicDigits(dailyCustomers)}</span>
            </label>
            <input
              type="range"
              min={1}
              max={200}
              value={dailyCustomers}
              onChange={(e) => setDailyCustomers(Number(e.target.value))}
              className="w-full accent-[#253765]"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-[11px] font-bold text-[#64748B] mb-2">
              <span>متوسّط الرسائل لكل محادثة</span>
              <span className="text-[#253765] font-black text-sm">{toArabicDigits(messagesPerChat)}</span>
            </label>
            <input
              type="range"
              min={1}
              max={30}
              value={messagesPerChat}
              onChange={(e) => setMessagesPerChat(Number(e.target.value))}
              className="w-full accent-[#253765]"
            />
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] text-slate-500">الإجراءات المُقدّرة شهرياً</p>
            <p className="text-2xl font-black text-[#0F172A] font-mono">
              {formatArabicNumber(monthlyActions)}
            </p>
          </div>
          {recommended && (
            <div className="text-left sm:text-right">
              <p className="text-[11px] text-slate-500">الباقة المُوصى بها</p>
              <p className="text-2xl font-black text-[#253765]">{recommended.name_en}</p>
            </div>
          )}
        </div>
      </div>

      {/* بطاقات الباقات */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 items-stretch">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} isRecommended={recommended?.id === plan.id} />
        ))}
      </div>

      <div className="mt-8 max-w-3xl mx-auto text-center space-y-2">
        <p className="text-[11px] text-slate-500 leading-relaxed">
          الإجراء الواحد = رسالة واحدة يعالجها الموظف الذكي نيابةً عنك.
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          عدد المنتجات والخدمات رصيد واحد لحسابك كله، وزّعه على قواعد بياناتك كما تشاء. وإذا انتقلت إلى
          باقة أصغر يبقى كل ما أضفته كما هو — فقط تتوقف الإضافة حتى تعود تحت الحدّ.
        </p>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          بلا عقود ولا رسوم إلغاء — أوقِف موظفك الذكي بنقرة واحدة متى شئت.
        </p>
      </div>
    </section>
  )
}
