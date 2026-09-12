'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Home,
  BarChart3,
  Boxes,
  Package,
  Bot,
  MessageCircle,
  Users,
  UserCog,
  Plug,
  Code2,
  CreditCard,
  Settings,
  GraduationCap,
  LifeBuoy,
  Truck,
  Menu,
  X,
  ShieldAlert,
  ChevronDown,
} from 'lucide-react'

type Item = {
  label: string
  href?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** بند لم يُبنَ بعد: يُعرض معطّلاً بوسم "قريباً" بدل رابط مكسور. */
  soon?: boolean
}

type Section = { title?: string; items: Item[] }

function buildNav(merchantId: string): Section[] {
  const q = merchantId ? `?merchant=${merchantId}` : ''
  return [
    {
      items: [
        { label: 'الرئيسية', href: `/workspace${q}`, icon: Home },
        { label: 'التحليلات', icon: BarChart3, soon: true },
      ],
    },
    {
      title: 'الاختصارات',
      items: [
        { label: 'المنتجات / الخدمات', href: `/workspace/catalog${q}`, icon: Boxes },
        { label: 'الطلبات', href: '/operations', icon: Package },
        { label: 'الشحنات', href: '/dashboard', icon: Truck },
        { label: 'الموظفون الأذكياء', icon: Bot, soon: true },
      ],
    },
    {
      title: 'التشغيل',
      items: [
        { label: 'المحادثات', href: '/operations/chats', icon: MessageCircle },
        { label: 'العملاء', icon: Users, soon: true },
        { label: 'الفريق', icon: UserCog, soon: true },
      ],
    },
    {
      title: 'التهيئة',
      items: [
        { label: 'الربط', icon: Plug, soon: true },
        { label: 'المطوّرون', icon: Code2, soon: true },
      ],
    },
    {
      title: 'الحساب',
      items: [
        { label: 'الاشتراك', href: '/#pricing', icon: CreditCard },
        { label: 'الإعدادات', icon: Settings, soon: true },
      ],
    },
    {
      title: 'الموارد',
      items: [
        { label: 'الأكاديمية', icon: GraduationCap, soon: true },
        { label: 'المساعدة', icon: LifeBuoy, soon: true },
      ],
    },
  ]
}

function NavList({
  sections,
  pathname,
  onNavigate,
}: {
  sections: Section[]
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <nav className="space-y-5">
      {sections.map((section, i) => (
        <div key={section.title ?? `s${i}`}>
          {section.title && (
            <p className="text-[10px] font-black text-[#94A3B8] px-3 mb-1.5 tracking-wider">
              {section.title}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                item.href && pathname === item.href.split('?')[0].split('#')[0]

              if (item.soon || !item.href) {
                return (
                  <li key={item.label}>
                    <span
                      className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl text-xs font-bold text-slate-300 cursor-default select-none"
                      title="لم يُبنَ هذا القسم بعد"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <item.icon size={16} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400 font-bold shrink-0">
                        قريباً
                      </span>
                    </span>
                  </li>
                )
              }

              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`w-full flex items-center gap-2.5 py-2 px-3 rounded-xl text-xs font-bold transition ${
                      active
                        ? 'bg-[#253765] text-white'
                        : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                    }`}
                  >
                    <item.icon size={16} className="shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export default function WorkspaceShell({
  merchantId,
  merchantName,
  planName,
  merchants,
  children,
}: {
  merchantId: string
  merchantName: string
  planName: string | null
  merchants: { id: string; name: string; planName: string | null }[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sections = buildNav(merchantId)

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* شريط انعدام تسجيل الدخول */}
      <div className="bg-[#253765] text-white px-4 py-2 flex items-center justify-between gap-3 text-[11px]">
        <span className="flex items-center gap-1.5 min-w-0">
          <ShieldAlert size={13} className="text-amber-300 shrink-0" />
          <span className="font-bold truncate">لا يوجد تسجيل دخول بعد — تبديل عرض لا حماية</span>
        </span>
        <Link
          href="/admin"
          className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 font-bold transition whitespace-nowrap shrink-0"
        >
          لوحة المالك
        </Link>
      </div>

      {/* ترويسة الهاتف */}
      <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-[#E2E8F0] px-4 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -mr-2 rounded-lg hover:bg-slate-100 transition"
          aria-label="فتح القائمة"
        >
          <Menu size={20} className="text-[#253765]" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black text-sm text-[#0F172A] truncate">{merchantName}</span>
          {planName && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#253765]/10 text-[#253765] font-black shrink-0">
              {planName}
            </span>
          )}
        </div>
        <div className="w-8 h-8 rounded-lg bg-[#253765] flex items-center justify-center text-white font-black shrink-0">
          ⚡
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* الشريط الجانبي — الشاشات الكبيرة */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-l border-[#E2E8F0] bg-white p-4 overflow-y-auto">
          <MerchantHeader
            merchantId={merchantId}
            merchantName={merchantName}
            planName={planName}
            merchants={merchants}
          />
          <div className="mt-5 flex-1">
            <NavList sections={sections} pathname={pathname} />
          </div>
          <p className="pt-4 mt-4 border-t border-[#E2E8F0] text-[10px] text-[#94A3B8] text-center tracking-widest font-bold">
            BARIQ ⚡ {new Date().getFullYear()}
          </p>
        </aside>

        {/* درج الهاتف */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className="relative w-72 max-w-[85vw] bg-white h-full overflow-y-auto p-4 mr-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="font-black text-sm text-[#253765]">القائمة</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 transition"
                  aria-label="إغلاق القائمة"
                >
                  <X size={18} />
                </button>
              </div>
              <MerchantHeader
                merchantId={merchantId}
                merchantName={merchantName}
                planName={planName}
                merchants={merchants}
              />
              <div className="mt-5">
                <NavList
                  sections={sections}
                  pathname={pathname}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}

function MerchantHeader({
  merchantId,
  merchantName,
  planName,
  merchants,
}: {
  merchantId: string
  merchantName: string
  planName: string | null
  merchants: { id: string; name: string; planName: string | null }[]
}) {
  const router = useRouter()

  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[#253765] flex items-center justify-center text-white font-black text-sm shrink-0">
          {merchantName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-black text-xs text-[#0F172A] truncate">{merchantName}</p>
          <p className="text-[10px] text-[#64748B]">{planName ?? 'بلا اشتراك'}</p>
        </div>
      </div>

      {merchants.length > 1 && (
        <div className="relative">
          <select
            value={merchantId}
            onChange={(e) => router.push(`/workspace?merchant=${e.target.value}`)}
            className="w-full appearance-none bg-white border border-[#E2E8F0] rounded-lg pr-2.5 pl-7 py-1.5 text-[11px] font-bold text-[#253765] outline-none focus:border-[#253765]"
          >
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </div>
      )}
    </div>
  )
}
