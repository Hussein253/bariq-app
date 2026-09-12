import Link from 'next/link'
import {
  Activity,
  ArrowLeft,
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
import { loadActivePlans } from '@/lib/plans-server'
import { AUDIENCE, CAPABILITIES, FAQ, ONBOARDING_STEPS, type Plan } from '@/lib/plans'
import { toArabicDigits } from '@/lib/formatters'

// الباقات تُقرأ من Supabase في كل زيارة كي يسري تعديل السعر فوراً بلا إعادة نشر.
export const dynamic = 'force-dynamic'

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
}

export default async function Home() {
  let plans: Plan[] = []
  let plansError: string | null = null

  try {
    plans = await loadActivePlans()
  } catch (err: unknown) {
    plansError = err instanceof Error ? err.message : 'تعذّر تحميل الباقات'
    console.error('[HOME][PLANS_LOAD_ERROR]', plansError)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A] flex flex-col font-sans selection:bg-[#253765]/20 selection:text-[#253765]">
      {/* ===== الترويسة ===== */}
      <header className="border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#253765] flex items-center justify-center text-white font-black text-xl shadow-md">
              ⚡
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-[#253765]">بـرق</span>
              <span className="text-[10px] text-[#64748B] block font-semibold tracking-wider">
                BARIQ PLATFORM
              </span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-xs font-bold text-[#64748B]">
            <a href="#capabilities" className="hover:text-[#253765] transition">الإمكانات</a>
            <a href="#audience" className="hover:text-[#253765] transition">لمن صُمّم</a>
            <a href="#start" className="hover:text-[#253765] transition">كيف تبدأ</a>
            <a href="#pricing" className="hover:text-[#253765] transition">الأسعار</a>
            <a href="#faq" className="hover:text-[#253765] transition">الأسئلة</a>
          </nav>

          <Link
            href="/operations"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-md shadow-[#253765]/20 transition active:scale-95"
          >
            <span>دخول المنصة</span>
            <ArrowLeft size={16} />
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ===== القسم الرئيسي ===== */}
        <section className="max-w-7xl mx-auto px-6 pt-16 pb-12 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-[#253765] text-xs font-bold mb-8">
            <Sparkles size={14} />
            <span>مصمَّم للتجارة الاجتماعية في العراق — من الرسالة إلى باب الزبون</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight max-w-4xl leading-[1.15] text-[#0F172A]">
            رسائلك الخاصة تبيع فعلاً —{' '}
            <span className="text-[#253765]">وبرق يشحنها أيضاً</span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-[#64748B] max-w-2xl leading-relaxed">
            موظف مبيعات بالذكاء الاصطناعي يردّ على زبائنك في إنستغرام وفيسبوك وواتساب باللهجة العراقية،
            يستقبل الطلبات ويحجز المواعيد على مدار الساعة — ثم يحوّل الطلب المؤكَّد إلى شحنة برقم تتبّع
            وملصق جاهز، دون أن يغادر المنصة.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/operations"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-black text-sm shadow-xl shadow-[#253765]/25 transition active:scale-95"
            >
              <span>ابدأ الآن مجاناً</span>
              <ArrowLeft size={18} />
            </Link>
            <Link
              href="/operations/chats"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white border border-[#253765]/30 text-[#253765] hover:bg-[#253765]/5 font-bold text-sm shadow-sm transition active:scale-95"
            >
              <MessageCircle size={18} />
              <span>شاهد المحادثات الحيّة</span>
            </Link>
          </div>

          <p className="mt-5 text-[11px] text-[#64748B] font-semibold">
            باقة مجانية للأبد · بلا بطاقة ائتمان · الإعداد خلال {toArabicDigits(10)} دقائق
          </p>

          {/* شريط الثقة */}
          <div className="mt-14 w-full max-w-4xl grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              { icon: BadgeCheck, label: 'واجهة Meta الرسمية', sub: 'معتمَدة' },
              { icon: Languages, label: 'لهجة عراقية', sub: 'ردود بلغة السوق' },
              { icon: CreditCard, label: 'زين كاش و كي كارد', sub: 'دفع محلي بالدينار' },
              { icon: Truck, label: 'توصيل بنفس اليوم', sub: 'كل المحافظات' },
            ].map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex flex-col items-center gap-1.5"
              >
                <Icon size={18} className="text-[#253765]" />
                <span className="font-bold text-[#0F172A] text-center">{label}</span>
                <span className="text-[10px] text-[#64748B]">{sub}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ===== المشكلة ===== */}
        <section className="bg-white border-y border-[#E2E8F0] py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
                المشكلة
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
                إدارة رسائل التواصل أمر مُرهِق
              </h2>
              <p className="mt-4 text-sm text-[#64748B] max-w-2xl mx-auto leading-relaxed">
                تتلقّى الأعمال العراقية مئات الرسائل يومياً، وكل استفسار يفوتك يعني مبيعات ضائعة. الرسائل
                الخاصة لن تختفي — بل تتوسّع وتصبح واجهة المتجر الحقيقية.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-right">
              {[
                {
                  icon: TrendingDown,
                  title: 'فرص ضائعة',
                  body: 'تضيع استفسارات الأسعار وسط الإشعارات، فينتقل الزبون المحتمل إلى المنافس الذي ردّ أسرع.',
                },
                {
                  icon: Clock,
                  title: 'وقت يُستهلك',
                  body: 'ساعات تُقضى في الردّ يدوياً على الأسئلة نفسها كل يوم، بدلاً من تنمية عملك.',
                },
                {
                  icon: ClipboardList,
                  title: 'طلبات تُكتب مرّتين',
                  body: 'الطلب يُؤخذ في المحادثة ثم يُعاد إدخاله في دفتر الشحن — خطوة مكرّرة تولّد الأخطاء.',
                },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
                  <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mb-4">
                    <Icon size={20} />
                  </div>
                  <h3 className="font-bold text-[#0F172A] mb-2">{title}</h3>
                  <p className="text-xs text-[#64748B] leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== لا حاجة إلى تطبيق ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="rounded-3xl bg-[#253765] text-white p-8 sm:p-12 text-center">
            <p className="text-xs font-black text-amber-300 uppercase tracking-[0.2em] mb-3">
              نظرة مختلفة
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight max-w-3xl mx-auto leading-snug">
              لماذا تبني تطبيقاً للتجارة الإلكترونية، ورسائلك الخاصة هي التطبيق فعلاً؟
            </h2>
            <p className="mt-5 text-sm text-slate-200 max-w-2xl mx-auto leading-relaxed">
              لست بحاجة إلى متجر إلكتروني ولا إلى مطالبة زبائنك بتحميل أي شيء. يحوّل برق محادثاتك القائمة
              على إنستغرام وفيسبوك إلى واجهة بيع وإدارة خلفية معاً — يبيع في الواجهة، ويدير الشحن خلفها.
            </p>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto text-xs">
              {['لا تطبيق تبنيه', 'لا تطبيق يحمّله زبونك', 'فقط المحادثة التي يستخدمها أصلاً'].map((t) => (
                <div
                  key={t}
                  className="py-3 px-4 rounded-xl bg-white/10 border border-white/15 font-bold flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={14} className="text-amber-300 shrink-0" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== الإمكانات ===== */}
        <section id="capabilities" className="max-w-7xl mx-auto px-6 py-10">
          <div className="text-center mb-12">
            <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
              الإمكانات
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
              كل ما تحتاجه لأتمتة تجارتك الاجتماعية
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-right">
            {CAPABILITIES.map((cap) => {
              const Icon = ICONS[cap.icon] ?? Sparkles
              const isSignature = cap.icon === 'truck'
              return (
                <div
                  key={cap.title}
                  className={`p-6 rounded-2xl bg-white shadow-sm space-y-3 transition hover:shadow-md ${
                    isSignature ? 'border-2 border-[#253765]' : 'border border-[#E2E8F0]'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-[#253765]/10 flex items-center justify-center text-[#253765]">
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0F172A]">{cap.title}</h3>
                    <p className="text-[10px] text-[#64748B] font-semibold tracking-wider uppercase mt-0.5">
                      {cap.subtitle}
                    </p>
                  </div>
                  <p className="text-xs text-[#64748B] leading-relaxed">{cap.body}</p>
                  {isSignature && (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-black">
                      حصري في برق
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* ===== لمن صُمّم ===== */}
        <section id="audience" className="bg-white border-y border-[#E2E8F0] py-20 mt-10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
                لمن صُمّم
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
                هل برق مناسب لك؟
              </h2>
              <p className="mt-4 text-sm text-[#64748B] max-w-2xl mx-auto leading-relaxed">
                سواء كنت تبيع منتجات أو خدمات، تدير صفحة واحدة أو مئة — إذا كان زبائنك يطلبون عبر الرسائل
                الخاصة، فبرق مصمَّم لك.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-right">
              {AUDIENCE.map((seg) => {
                const Icon = ICONS[seg.icon] ?? Store
                return (
                  <div key={seg.title} className="p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]">
                    <div className="w-11 h-11 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center text-[#253765] mb-4">
                      <Icon size={20} />
                    </div>
                    <h3 className="font-bold text-[#0F172A] mb-2 text-sm leading-snug">{seg.title}</h3>
                    <p className="text-xs text-[#64748B] leading-relaxed">{seg.body}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* ===== مصمَّم للعراق ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
              الدليل · مصمَّم للعراق
            </p>
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
              نفهم تحدّيات العمل في السوق العراقي
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-right">
            {[
              {
                icon: ShieldCheck,
                title: 'بياناتك في أمان',
                body: 'مشفّرة، ومحكومة الوصول عبر سياسات صفٍّ صارمة — فريقك وحده يرى زبائنك.',
              },
              {
                icon: Languages,
                title: 'عربية كاملة',
                body: 'واجهة من اليمين إلى اليسار بأرقام عربية موحّدة في كل شاشة وكل ملصق شحن.',
              },
              {
                icon: CreditCard,
                title: 'دفع محلي',
                body: 'زين كاش و كي كارد و ماستركارد، مع الدفع عند الاستلام في كل المحافظات.',
              },
              {
                icon: MapPin,
                title: 'عناوين عراقية دقيقة',
                body: `دليل يضم ${toArabicDigits(208)} منطقة توصيل يميّز الأسماء المتشابهة بين المحافظات قبل تثبيت العنوان.`,
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 mb-4">
                  <Icon size={20} />
                </div>
                <h3 className="font-bold text-[#0F172A] mb-2 text-sm">{title}</h3>
                <p className="text-xs text-[#64748B] leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== كيف تبدأ ===== */}
        <section id="start" className="bg-white border-y border-[#E2E8F0] py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
                كيف تبدأ
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
                جاهز للعمل في {toArabicDigits(4)} خطوات
              </h2>
              <p className="mt-4 text-sm text-[#64748B]">
                من التسجيل إلى موظف ذكي يعمل، خلال {toArabicDigits(10)} دقائق تقريباً.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 text-right">
              {ONBOARDING_STEPS.map((step, idx) => (
                <div
                  key={step.title}
                  className="relative p-6 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0]"
                >
                  <span className="absolute -top-3 right-6 w-8 h-8 rounded-xl bg-[#253765] text-white font-black text-sm flex items-center justify-center shadow-md">
                    {toArabicDigits(idx + 1)}
                  </span>
                  <h3 className="font-bold text-[#0F172A] mb-2 mt-3 text-sm">{step.title}</h3>
                  <p className="text-xs text-[#64748B] leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ===== الأسعار ===== */}
        <div className="max-w-7xl mx-auto px-6">
          {plansError ? (
            <section id="pricing" className="py-20 text-center">
              <p className="text-sm text-rose-700 font-semibold">
                تعذّر تحميل الباقات حالياً. يرجى المحاولة بعد قليل.
              </p>
            </section>
          ) : (
            <PricingSection plans={plans} />
          )}
        </div>

        {/* ===== الأسئلة الشائعة ===== */}
        <section id="faq" className="bg-white border-y border-[#E2E8F0] py-20">
          <div className="max-w-3xl mx-auto px-6">
            <div className="text-center mb-10">
              <p className="text-xs font-black text-[#253765] uppercase tracking-[0.2em] mb-3">
                الأسئلة الشائعة
              </p>
              <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A]">
                إجابات صريحة قبل أن تربط صفحتك
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ.map((entry) => (
                <details
                  key={entry.question}
                  className="group rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-bold text-sm text-[#0F172A]">
                    <span>{entry.question}</span>
                    <span className="shrink-0 w-6 h-6 rounded-lg bg-white border border-[#E2E8F0] text-[#253765] flex items-center justify-center font-black transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-xs text-[#64748B] leading-relaxed">{entry.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ===== الدعوة النهائية ===== */}
        <section className="max-w-7xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-[#0F172A] max-w-2xl mx-auto leading-snug">
            جاهز لأتمتة مبيعاتك وشحنك معاً؟
          </h2>
          <p className="mt-4 text-sm text-[#64748B] max-w-xl mx-auto leading-relaxed">
            ابدأ على الباقة المجانية اليوم، واترك المحادثات والشحنات تدار نفسها بينما تتفرّغ أنت للنمو.
          </p>
          <Link
            href="/operations"
            className="mt-8 inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-black text-sm shadow-xl shadow-[#253765]/25 transition active:scale-95"
          >
            <span>ابدأ مجاناً — بلا بطاقة ائتمان</span>
            <ArrowLeft size={18} />
          </Link>
          <p className="mt-5 text-[11px] text-[#64748B] font-semibold">
            الإعداد أقل من {toArabicDigits(10)} دقائق · أوقِف الخدمة متى شئت · دعم على مدار الساعة
          </p>
        </section>
      </main>

      {/* ===== التذييل ===== */}
      <footer className="border-t border-[#E2E8F0] bg-white py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#253765] flex items-center justify-center text-white font-black">
              ⚡
            </div>
            <span className="font-bold text-[#253765]">منصة برق</span>
          </div>
          <nav className="flex items-center gap-5 font-semibold">
            <Link href="/operations" className="hover:text-[#253765] transition">لوحة العمليات</Link>
            <Link href="/operations/chats" className="hover:text-[#253765] transition">خدمة العملاء</Link>
            <Link href="/dashboard" className="hover:text-[#253765] transition">تتبّع الشحنات</Link>
          </nav>
          <p>© {toArabicDigits(new Date().getFullYear())} برق — شركة المندوب للتوصيل السريع</p>
        </div>
      </footer>
    </div>
  )
}
