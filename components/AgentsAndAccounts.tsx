'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Plug, Plus, RefreshCw, Trash2, AlertCircle, Check } from 'lucide-react'
import { toArabicDigits } from '@/lib/formatters'

/**
 * إدارة الموظفين الأذكياء وحسابات التواصل المربوطة بهم.
 * الحدّان مفروضان بمُحفّز في قاعدة البيانات؛ الواجهة تعطّل الزر عند الحدّ
 * لتوفّر رحلة فاشلة، والخادم هو الفاصل.
 */

interface Agent {
  id: string
  name: string
  role: string | null
  is_active: boolean
  catalog_id: string | null
  catalogs: { id: string; name: string } | null
  social_accounts: { id: string; platform: string }[]
}

interface Account {
  id: string
  platform: string
  external_id: string
  display_name: string | null
  handle: string | null
  status: string
  ai_agent_id: string | null
  ai_agents: { id: string; name: string } | null
}

const PLATFORM_LABELS: Record<string, string> = {
  whatsapp: 'واتساب',
  instagram: 'إنستغرام',
  messenger: 'ماسنجر',
}

const STATUS_LABELS: Record<string, string> = {
  connected: 'مربوط',
  needs_reauth: 'يحتاج إعادة ربط',
  disconnected: 'مفصول',
}

const PLATFORM_ID_HINT: Record<string, string> = {
  whatsapp: 'phone_number_id من WhatsApp Cloud API',
  instagram: 'ig_user_id من حساب الأعمال',
  messenger: 'page_id من صفحة فيسبوك',
}

export default function AgentsAndAccounts({
  merchantId,
  agentLimit,
  accountLimit,
  catalogs,
}: {
  merchantId: string
  agentLimit: number
  accountLimit: number
  catalogs: { id: string; name: string }[]
}) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [showAgentForm, setShowAgentForm] = useState(false)
  const [showAccountForm, setShowAccountForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/ai-agents?merchant_id=${merchantId}`, { cache: 'no-store' }),
        fetch(`/api/social-accounts?merchant_id=${merchantId}`, { cache: 'no-store' }),
      ])
      const [aJson, sJson] = await Promise.all([aRes.json(), sRes.json()])
      if (!aRes.ok || !aJson.success) throw new Error(aJson.error || 'تعذّر تحميل الموظفين')
      if (!sRes.ok || !sJson.success) throw new Error(sJson.error || 'تعذّر تحميل الحسابات')
      setAgents(aJson.agents)
      setAccounts(sJson.accounts)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'تعذّر التحميل')
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await load()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const flash = (text: string, kind: 'ok' | 'err') => {
    setNotice({ text, kind })
    setTimeout(() => setNotice(null), 4000)
  }

  const submit = async (url: string, body: Record<string, unknown>, okText: string) => {
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, merchant_id: merchantId }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل الحفظ')
      await load()
      flash(okText, 'ok')
      return true
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'فشل الحفظ', 'err')
      return false
    } finally {
      setBusy(false)
    }
  }

  const remove = async (url: string, okText: string) => {
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل الحذف')
      await load()
      flash(okText, 'ok')
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : 'فشل الحذف', 'err')
    } finally {
      setBusy(false)
    }
  }

  const agentsFull = agents.length >= agentLimit
  const accountsFull = accounts.length >= accountLimit

  if (loading) {
    return (
      <div className="p-10 text-center text-[#64748B] bg-white rounded-2xl border border-[#E2E8F0]">
        <RefreshCw size={18} className="animate-spin inline-block ml-2" />
        جارِ التحميل...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            notice.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {notice.kind === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* ===== الموظفون الأذكياء ===== */}
      <section className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
        <header className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bot size={17} className="text-[#253765]" />
            <h2 className="text-sm font-black text-[#0F172A]">الموظفون الأذكياء</h2>
            <span className="text-[11px] font-bold text-[#64748B]">
              {toArabicDigits(agents.length)} من {toArabicDigits(agentLimit)}
            </span>
          </div>
          <button
            onClick={() => setShowAgentForm((v) => !v)}
            disabled={agentsFull || busy}
            title={agentsFull ? 'بلغت حدّ باقتك — الترقية تفتح المزيد' : undefined}
            className="px-3 py-1.5 rounded-xl bg-[#253765] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            <span>موظف جديد</span>
          </button>
        </header>

        {agentsFull && (
          <p className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-800">
            بلغت حدّ باقتك: {toArabicDigits(agentLimit)} موظف. احذف واحداً أو رقّ باقتك.
          </p>
        )}

        {showAgentForm && !agentsFull && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const ok = await submit(
                '/api/ai-agents',
                {
                  name: fd.get('name'),
                  role: fd.get('role'),
                  catalog_id: fd.get('catalog_id') || null,
                  system_prompt: fd.get('system_prompt'),
                },
                'أُنشئ الموظف الذكي'
              )
              if (ok) setShowAgentForm(false)
            }}
            className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
          >
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">اسم الموظف *</label>
              <input
                required
                name="name"
                placeholder="مثال: موظف المبيعات"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765]"
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">الدور</label>
              <input
                name="role"
                placeholder="مبيعات · دعم · حجوزات"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765]"
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">قاعدة المعرفة</label>
              <select
                name="catalog_id"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765]"
              >
                <option value="">بلا قاعدة معرفة</option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block mb-1 font-bold text-[#64748B]">تعليمات الموظف</label>
              <textarea
                name="system_prompt"
                rows={2}
                placeholder="نبرة الرد، ما يجيب عنه وما يحوّله لموظف بشري..."
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765] resize-y"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-[#253765] text-white font-bold disabled:opacity-50"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setShowAgentForm(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-[#E2E8F0]">
          {agents.length === 0 && (
            <p className="p-8 text-center text-xs text-[#64748B]">
              لا يوجد موظف ذكي بعد — أنشئ أولاً ليجيب عن زبائنك.
            </p>
          )}
          {agents.map((a) => (
            <div key={a.id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-[#0F172A]">{a.name}</p>
                  {a.role && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                      {a.role}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      a.is_active
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {a.is_active ? 'يعمل' : 'متوقف'}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] mt-1">
                  {a.catalogs ? `يجيب من: ${a.catalogs.name}` : 'بلا قاعدة معرفة'}
                  {' • '}
                  {toArabicDigits(a.social_accounts?.length ?? 0)} حساب مربوط
                </p>
              </div>
              <button
                onClick={() =>
                  remove(
                    `/api/ai-agents?id=${a.id}&merchant_id=${merchantId}`,
                    'حُذف الموظف وتحرّر مقعده'
                  )
                }
                disabled={busy}
                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                title="حذف"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ===== حسابات التواصل ===== */}
      <section className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden">
        <header className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Plug size={17} className="text-[#253765]" />
            <h2 className="text-sm font-black text-[#0F172A]">حسابات التواصل</h2>
            <span className="text-[11px] font-bold text-[#64748B]">
              {toArabicDigits(accounts.length)} من {toArabicDigits(accountLimit)}
            </span>
          </div>
          <button
            onClick={() => setShowAccountForm((v) => !v)}
            disabled={accountsFull || busy}
            title={accountsFull ? 'بلغت حدّ باقتك — الترقية تفتح المزيد' : undefined}
            className="px-3 py-1.5 rounded-xl bg-[#253765] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            <span>ربط حساب</span>
          </button>
        </header>

        {accountsFull && (
          <p className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold text-amber-800">
            بلغت حدّ باقتك: {toArabicDigits(accountLimit)} حساب. افصل واحداً أو رقّ باقتك.
          </p>
        )}

        {showAccountForm && !accountsFull && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const ok = await submit(
                '/api/social-accounts',
                {
                  platform: fd.get('platform'),
                  external_id: fd.get('external_id'),
                  display_name: fd.get('display_name'),
                  handle: fd.get('handle'),
                  ai_agent_id: fd.get('ai_agent_id') || null,
                },
                'رُبط الحساب'
              )
              if (ok) setShowAccountForm(false)
            }}
            className="p-4 border-b border-[#E2E8F0] bg-[#F8FAFC] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
          >
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">المنصة *</label>
              <select
                required
                name="platform"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765]"
              >
                {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">معرّف الحساب لدى Meta *</label>
              <input
                required
                name="external_id"
                dir="ltr"
                placeholder="1234567890"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765] font-mono"
              />
              <p className="mt-1 text-[10px] text-[#94A3B8]">
                {Object.values(PLATFORM_ID_HINT).join(' · ')}
              </p>
            </div>
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">الاسم المعروض</label>
              <input
                name="display_name"
                placeholder="واتساب المتجر الرئيسي"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765]"
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-[#64748B]">الموظف المسؤول</label>
              <select
                name="ai_agent_id"
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#253765]"
              >
                <option value="">بلا موظف</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-[#253765] text-white font-bold disabled:opacity-50"
              >
                ربط
              </button>
              <button
                type="button"
                onClick={() => setShowAccountForm(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-[#E2E8F0]">
          {accounts.length === 0 && (
            <p className="p-8 text-center text-xs text-[#64748B]">
              لا حساب مربوط بعد — اربط واتساب أو إنستغرام ليصل الزبائن إليك.
            </p>
          )}
          {accounts.map((acc) => (
            <div key={acc.id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-[#0F172A]">
                    {acc.display_name || PLATFORM_LABELS[acc.platform] || acc.platform}
                  </p>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                    {PLATFORM_LABELS[acc.platform] ?? acc.platform}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      acc.status === 'connected'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {STATUS_LABELS[acc.status] ?? acc.status}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] mt-1">
                  <span className="font-mono" dir="ltr">
                    {acc.external_id}
                  </span>
                  {' • '}
                  {acc.ai_agents ? `يرد عليه: ${acc.ai_agents.name}` : 'بلا موظف ذكي'}
                </p>
              </div>
              <button
                onClick={() =>
                  remove(
                    `/api/social-accounts?id=${acc.id}&merchant_id=${merchantId}`,
                    'فُكّ الربط وتحرّر مقعده'
                  )
                }
                disabled={busy}
                className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                title="فكّ الربط"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
