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
import type { Dictionary } from '@/lib/i18n'
import { fill } from '@/lib/i18n'

type NavCopy = Dictionary['app']['nav']

type Item = {
  label: string
  href?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  /** بند لم يُبنَ بعد: يُعرض معطّلاً بوسم "قريباً" بدل رابط مكسور. */
  soon?: boolean
}

type Section = { title?: string; items: Item[] }

function buildNav(merchantId: string, t: NavCopy): Section[] {
  const q = merchantId ? `?merchant=${merchantId}` : ''
  return [
    {
      items: [
        { label: t.home, href: `/workspace${q}`, icon: Home },
        { label: t.analytics, icon: BarChart3, soon: true },
      ],
    },
    {
      title: t.shortcutsSection,
      items: [
        { label: t.catalog, href: `/workspace/catalog${q}`, icon: Boxes },
        { label: t.orders, href: `/workspace/orders${q}`, icon: Package },
        { label: t.shipments, href: `/workspace/shipments${q}`, icon: Truck },
        { label: t.agents, href: `/workspace/agents${q}`, icon: Bot },
      ],
    },
    {
      title: t.operationsSection,
      items: [
        { label: t.chats, href: '/operations/chats', icon: MessageCircle },
        { label: t.customers, icon: Users, soon: true },
        { label: t.team, icon: UserCog, soon: true },
      ],
    },
    {
      title: t.setupSection,
      items: [
        { label: t.connections, href: `/workspace/agents${q}`, icon: Plug },
        { label: t.developers, icon: Code2, soon: true },
      ],
    },
    {
      title: t.accountSection,
      items: [
        { label: t.subscription, href: '/platform#pricing', icon: CreditCard },
        { label: t.settings, icon: Settings, soon: true },
      ],
    },
    {
      title: t.resourcesSection,
      items: [
        { label: t.academy, icon: GraduationCap, soon: true },
        { label: t.help, icon: LifeBuoy, soon: true },
      ],
    },
  ]
}

function NavList({
  sections,
  pathname,
  notBuiltTitle,
  soonLabel,
  onNavigate,
}: {
  sections: Section[]
  pathname: string
  notBuiltTitle: string
  soonLabel: string
  onNavigate?: () => void
}) {
  return (
    <nav className="space-y-5">
      {sections.map((section, i) => (
        <div key={section.title ?? `s${i}`}>
          {section.title && (
            <p className="text-[10px] font-black text-ink-faint px-3 mb-1.5 tracking-wider">
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
                      className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl text-xs font-bold text-ink-faint cursor-default select-none"
                      title={notBuiltTitle}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <item.icon size={16} className="shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface-3 text-ink-faint font-bold shrink-0">
                        {soonLabel}
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
                        ? 'bg-brand text-on-brand'
                        : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
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
  impersonating = false,
  t,
  children,
}: {
  merchantId: string
  merchantName: string
  planName: string | null
  merchants: { id: string; name: string; planName: string | null }[]
  /** مالك المنصة يفتح مساحة تاجر ليست له — يُعلَن صراحةً لا يُخفى. */
  impersonating?: boolean
  /** ⚠️ خاصية لا استيراد: هذا مكوّن عميل، واستيراده للقاموس يجرّ اللغات
   *  الثلاث كلها إلى حزمة المتصفّح. */
  t: NavCopy & { soon: string }
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const sections = buildNav(merchantId, t)

  return (
    <div className="min-h-screen bg-page flex flex-col">
      {/* ⚠️ كان هنا شريط يقول «لا يوجد تسجيل دخول بعد — تبديل عرض لا حماية».
          حُذف لأنه صار كذباً: الدخول قائم (app/login)، و proxy.ts يحرس
          /workspace وأخواتها، و requireRole يفحص الدور في كل صفحة. إبقاؤه
          كان يُقلق التاجر بلا سبب ويُضعف ثقته بما يراه.
          ورابط «لوحة المالك» الذي كان فيه لم يُفقد: شريط الجلسة في التخطيط
          الجذري (components/SessionBar) يعرض رابطاً يعرف دور صاحبه فيذهب
          بالمالك إلى /admin وبالتاجر إلى مساحته. */}

      {/* ترويسة الهاتف */}
      <header className="lg:hidden sticky top-0 z-40 bg-surface border-b border-line px-4 py-3 flex items-center justify-between gap-3">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 -ms-2 rounded-lg hover:bg-surface-3 transition"
          aria-label={t.openMenu}
        >
          <Menu size={20} className="text-brand-text" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-black text-sm text-ink truncate">{merchantName}</span>
          {planName && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-soft text-brand-text font-black shrink-0">
              {planName}
            </span>
          )}
        </div>
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-on-brand font-black shrink-0">
          ⚡
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* الشريط الجانبي — الشاشات الكبيرة */}
        <aside className="hidden lg:flex w-64 shrink-0 flex-col border-e border-line bg-surface p-4 overflow-y-auto">
          <MerchantHeader
            merchantId={merchantId}
            merchantName={merchantName}
            planName={planName}
            merchants={merchants}
            noPlanLabel={t.noPlan}
          />
          <div className="mt-5 flex-1">
            <NavList
              sections={sections}
              pathname={pathname}
              notBuiltTitle={t.notBuilt}
              soonLabel={t.soon}
            />
          </div>
          <p className="pt-4 mt-4 border-t border-line text-[10px] text-ink-faint text-center tracking-widest font-bold">
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
            <div className="relative w-72 max-w-[85vw] bg-surface h-full overflow-y-auto p-4 me-auto shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <span className="font-black text-sm text-brand-text">{t.menu}</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-surface-3 transition"
                  aria-label={t.closeMenu}
                >
                  <X size={18} />
                </button>
              </div>
              <MerchantHeader
                merchantId={merchantId}
                merchantName={merchantName}
                planName={planName}
                merchants={merchants}
                noPlanLabel={t.noPlan}
              />
              <div className="mt-5">
                <NavList
                  sections={sections}
                  pathname={pathname}
                  notBuiltTitle={t.notBuilt}
                  soonLabel={t.soon}
                  onNavigate={() => setDrawerOpen(false)}
                />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-y-auto">
          {impersonating && (
            <div className="bg-warn-bg border-b border-warn-line px-4 py-2 text-[11px] font-bold text-warn-ink flex items-center gap-2">
              <ShieldAlert size={14} className="shrink-0" />
              {fill(t.impersonating, { name: merchantName })}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}

function MerchantHeader({
  merchantId,
  merchantName,
  planName,
  merchants,
  noPlanLabel,
}: {
  merchantId: string
  merchantName: string
  planName: string | null
  merchants: { id: string; name: string; planName: string | null }[]
  noPlanLabel: string
}) {
  const router = useRouter()

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center text-on-brand font-black text-sm shrink-0">
          {merchantName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="font-black text-xs text-ink truncate">{merchantName}</p>
          <p className="text-[10px] text-ink-muted">{planName ?? noPlanLabel}</p>
        </div>
      </div>

      {merchants.length > 1 && (
        <div className="relative">
          <select
            value={merchantId}
            onChange={(e) => router.push(`/workspace?merchant=${e.target.value}`)}
            className="w-full appearance-none bg-surface border border-line rounded-lg ps-7 pe-2.5 py-1.5 text-[11px] font-bold text-brand-text outline-none focus:border-brand"
          >
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="absolute start-2 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"
          />
        </div>
      )}
    </div>
  )
}
