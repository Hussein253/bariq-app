import Link from 'next/link'
import {
  Package,
  ShieldCheck,
  Zap,
  CreditCard,
  Bot,
  Truck,
  ArrowLeft,
  Store,
  Layers,
  Sparkles,
  CheckCircle2,
  Megaphone
} from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A] flex flex-col font-sans selection:bg-[#253765]/20 selection:text-[#253765]">
      {/* ===== الترويسة الفاخرة (Header) ===== */}
      <header className="border-b border-[#E2E8F0] bg-white/90 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#253765] flex items-center justify-center text-white font-black text-xl shadow-md">
              ⚡
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-[#253765]">بـرق</span>
              <span className="text-xs text-[#64748B] block font-semibold">BARIQ PLATFORM</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/operations"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-md shadow-[#253765]/20 transition active:scale-95"
            >
              <span>دخول لوحة العمليات</span>
              <ArrowLeft size={16} />
            </Link>
          </div>
        </div>
      </header>

      {/* ===== القسم الرئيسي (Hero Section) ===== */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-16 flex flex-col items-center text-center">
        {/* شارة التميز */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-[#253765] text-xs font-bold mb-8 shadow-xs">
          <Sparkles size={14} className="text-[#253765]" />
          <span>المنظومة المتكاملة للشحن الذكي، الحملات الإعلانية، وبوابات الدفع في العراق</span>
        </div>

        {/* العنوان الرئيسي */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight max-w-4xl leading-tight text-[#0F172A]">
          السرعة والذكاء في إدارة{' '}
          <span className="text-[#253765]">الشحنات، الإعلانات، والمدفوعات</span>
        </h1>

        <p className="mt-6 text-base sm:text-lg text-[#64748B] max-w-2xl leading-relaxed">
          حلول متكاملة لربط المتاجر الإلكترونية مع حملات السوشيال ميديا الممولة، بوتات المحادثة الذكية، التوصيل السريع، وبوابات الدفع الإلكتروني العراقية (زين كاش وكي كارد).
        </p>

        {/* أزرار الإجراءات */}
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/operations"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-black text-sm shadow-xl shadow-[#253765]/25 transition active:scale-95"
          >
            <span>فتح لوحة العمليات والتحكم</span>
            <ArrowLeft size={18} />
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white border border-[#253765]/30 text-[#253765] hover:bg-[#253765]/5 font-bold text-sm shadow-sm transition active:scale-95"
          >
            <Truck size={18} />
            <span>لوحة الشحنات الحقيقية</span>
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white border border-[#CBD5E1] text-[#0F172A] hover:bg-slate-50 font-bold text-sm shadow-sm transition"
          >
            <span>استكشاف الميزات والخدمات</span>
          </a>
        </div>

        {/* بوابات الدفع والخدمات */}
        <div className="mt-16 w-full pt-10 border-t border-[#E2E8F0] max-w-4xl">
          <p className="text-xs text-[#64748B] font-bold uppercase tracking-widest mb-6">
            منظومة مدعومة ببوابات الدفع الوطنية وأقوى منصات الإعلانات
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-semibold">
            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex flex-col items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-black">
                Z
              </span>
              <span className="text-[#0F172A]">Zain Cash Iraq</span>
              <span className="text-[10px] text-emerald-700 font-bold">محفظة زين كاش</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex flex-col items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-black">
                Qi
              </span>
              <span className="text-[#0F172A]">Qi Card & Master</span>
              <span className="text-[10px] text-emerald-700 font-bold">كي كارد وماستركارد</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex flex-col items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[#253765] text-white flex items-center justify-center font-black">
                Ads
              </span>
              <span className="text-[#0F172A]">Social Ads Center</span>
              <span className="text-[10px] text-amber-700 font-bold">انستغرام وتيك توك</span>
            </div>
            <div className="p-4 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm flex flex-col items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-sky-600 text-white flex items-center justify-center font-black">
                ⚡
              </span>
              <span className="text-[#0F172A]">Fast Logistics</span>
              <span className="text-[10px] text-sky-700 font-bold">توصيل ذكي ومباشر</span>
            </div>
          </div>
        </div>

        {/* كروت الميزات */}
        <section id="features" className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-right">
          <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#253765]/10 flex items-center justify-center text-[#253765]">
              <Megaphone size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">داشبورد الحملات الإعلانية</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              خانة مخصصة للزبون لمراقبة الحملات والعائد المالي (ROAS)، ولوحة تحكم متطورة للمروج لإدارة الميزانيات ونشر الإعلانات عبر المنصات.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#253765]/10 flex items-center justify-center text-[#253765]">
              <CreditCard size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">الدفع الإلكتروني العراقي</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              تكامل مع بوابات الدفع الوطنية (زين كاش وكي كارد) مع مسح رموز QR وتأكيد فوري للعمليات وإيداع الأرصدة.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-white border border-[#E2E8F0] shadow-sm space-y-3">
            <div className="w-12 h-12 rounded-xl bg-[#253765]/10 flex items-center justify-center text-[#253765]">
              <Truck size={24} />
            </div>
            <h3 className="text-lg font-bold text-[#0F172A]">شحن سريع وبوالص حرارية</h3>
            <p className="text-xs text-[#64748B] leading-relaxed">
              إدارة دقيقة للشحنات وحركات المناديب مع طباعة بوالص الشحن الحرارية بضغطة زر وتحديث حالات التسليم لحظياً.
            </p>
          </div>
        </section>
      </main>

      {/* ===== التذييل (Footer) ===== */}
      <footer className="border-t border-[#E2E8F0] bg-white py-8 text-center text-xs text-[#64748B]">
        <p>منصة برق للخدمات اللوجستية والتقنية والتسويقية © {new Date().getFullYear()} — جميع الحقوق محفوظة</p>
      </footer>
    </div>
  )
}
