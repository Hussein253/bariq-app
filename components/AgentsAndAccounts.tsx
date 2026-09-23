'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bot, Plug, Plus, RefreshCw, Trash2, AlertCircle, Check } from 'lucide-react'
import { localizeDigits } from '@/lib/formatters'
import { fill, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'

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

type AgentsCopy = Dictionary['app']['agents']
type ChannelLabels = Dictionary['app']['channels']

/** المنصات المدعومة في نموذج الربط — القيمة تُرسل كما هي إلى الـ API. */
const PLATFORMS = ['whatsapp', 'instagram', 'messenger'] as const

export default function AgentsAndAccounts({
  merchantId,
  agentLimit,
  accountLimit,
  catalogs,
  locale,
  t,
  channels,
}: {
  merchantId: string
  agentLimit: number
  accountLimit: number
  catalogs: { id: string; name: string }[]
  locale: Locale
  /** ⚠️ خاصية لا استيراد: مكوّن عميل، والقاموس كله لا يعبر إلى المتصفّح. */
  t: AgentsCopy
  channels: ChannelLabels
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
      if (!aRes.ok || !aJson.success) throw new Error(aJson.error || t.loadFailedAgents)
      if (!sRes.ok || !sJson.success) throw new Error(sJson.error || t.loadFailedAccounts)
      setAgents(aJson.agents)
      setAccounts(sJson.accounts)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [merchantId, t.loadFailedAgents, t.loadFailedAccounts, t.loadFailed])

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
      if (!res.ok || !json.success) throw new Error(json.error || t.saveFailed)
      await load()
      flash(okText, 'ok')
      return true
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : t.saveFailed, 'err')
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
      if (!res.ok || !json.success) throw new Error(json.error || t.deleteFailed)
      await load()
      flash(okText, 'ok')
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : t.deleteFailed, 'err')
    } finally {
      setBusy(false)
    }
  }

  const agentsFull = agents.length >= agentLimit
  const accountsFull = accounts.length >= accountLimit

  if (loading) {
    return (
      <div className="p-10 text-center text-ink-muted bg-surface rounded-2xl border border-line">
        <RefreshCw size={18} className="animate-spin inline-block me-2" />
        {t.loading}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
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
              ? 'bg-success-bg text-success-ink border border-success-line'
              : 'bg-danger-bg text-danger-ink border border-danger-line'
          }`}
        >
          {notice.kind === 'ok' ? <Check size={14} /> : <AlertCircle size={14} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* ===== الموظفون الأذكياء ===== */}
      <section className="bg-surface rounded-2xl border border-line overflow-hidden">
        <header className="p-4 border-b border-line bg-surface-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bot size={17} className="text-brand-text" />
            <h2 className="text-sm font-black text-ink">{t.agentsTitle}</h2>
            <span className="text-[11px] font-bold text-ink-muted">
              {fill(t.countOf, {
                used: localizeDigits(agents.length, locale),
                limit: localizeDigits(agentLimit, locale),
              })}
            </span>
          </div>
          <button
            onClick={() => setShowAgentForm((v) => !v)}
            disabled={agentsFull || busy}
            title={agentsFull ? t.atPlanLimit : undefined}
            className="px-3 py-1.5 rounded-xl bg-brand text-on-brand text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            <span>{t.newAgent}</span>
          </button>
        </header>

        {agentsFull && (
          <p className="px-4 py-2 bg-warn-bg border-b border-warn-line text-[11px] font-bold text-warn-ink">
            {fill(t.agentsFull, { n: localizeDigits(agentLimit, locale) })}
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
                t.agentCreated
              )
              if (ok) setShowAgentForm(false)
            }}
            className="p-4 border-b border-line bg-surface-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
          >
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.agentName}</label>
              <input
                required
                name="name"
                placeholder={t.agentNamePlaceholder}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand text-ink"
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.agentRole}</label>
              <input
                name="role"
                placeholder={t.agentRolePlaceholder}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand text-ink"
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.agentCatalog}</label>
              <select
                name="catalog_id"
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand text-ink"
              >
                <option value="">{t.noCatalog}</option>
                {catalogs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block mb-1 font-bold text-ink-muted">{t.agentPrompt}</label>
              <textarea
                name="system_prompt"
                rows={2}
                placeholder={t.agentPromptPlaceholder}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand resize-y text-ink"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-xl bg-brand text-on-brand font-bold disabled:opacity-50"
              >
                {t.save}
              </button>
              <button
                type="button"
                onClick={() => setShowAgentForm(false)}
                className="px-4 py-2 rounded-xl bg-surface-3 text-ink-muted font-bold"
              >
                {t.cancel}
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-line">
          {agents.length === 0 && (
            <p className="p-8 text-center text-xs text-ink-muted">{t.noAgents}</p>
          )}
          {agents.map((a) => (
            <div key={a.id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-ink">{a.name}</p>
                  {a.role && (
                    <span className="px-2 py-0.5 rounded-full bg-surface-3 text-ink-muted text-[10px] font-bold">
                      {a.role}
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      a.is_active
                        ? 'bg-success-bg text-success-ink'
                        : 'bg-surface-3 text-ink-muted'
                    }`}
                  >
                    {a.is_active ? t.agentActive : t.agentPaused}
                  </span>
                </div>
                <p className="text-[11px] text-ink-muted mt-1">
                  {a.catalogs ? fill(t.answersFrom, { name: a.catalogs.name }) : t.noCatalog}
                  {' • '}
                  {fill(t.linkedAccounts, {
                    n: localizeDigits(a.social_accounts?.length ?? 0, locale),
                  })}
                </p>
              </div>
              <button
                onClick={() =>
                  remove(`/api/ai-agents?id=${a.id}&merchant_id=${merchantId}`, t.agentDeleted)
                }
                disabled={busy}
                className="p-2 rounded-lg text-danger-ink hover:bg-danger-bg disabled:opacity-40"
                title={t.deleteAgent}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ===== حسابات التواصل ===== */}
      <section className="bg-surface rounded-2xl border border-line overflow-hidden">
        <header className="p-4 border-b border-line bg-surface-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Plug size={17} className="text-brand-text" />
            <h2 className="text-sm font-black text-ink">{t.accountsTitle}</h2>
            <span className="text-[11px] font-bold text-ink-muted">
              {fill(t.countOf, {
                used: localizeDigits(accounts.length, locale),
                limit: localizeDigits(accountLimit, locale),
              })}
            </span>
          </div>
          <button
            onClick={() => setShowAccountForm((v) => !v)}
            disabled={accountsFull || busy}
            title={accountsFull ? t.atPlanLimit : undefined}
            className="px-3 py-1.5 rounded-xl bg-brand text-on-brand text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus size={14} />
            <span>{t.linkAccount}</span>
          </button>
        </header>

        {accountsFull && (
          <p className="px-4 py-2 bg-warn-bg border-b border-warn-line text-[11px] font-bold text-warn-ink">
            {fill(t.accountsFull, { n: localizeDigits(accountLimit, locale) })}
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
                t.accountLinked
              )
              if (ok) setShowAccountForm(false)
            }}
            className="p-4 border-b border-line bg-surface-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"
          >
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.platform}</label>
              <select
                required
                name="platform"
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand text-ink"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {channels[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.externalId}</label>
              <input
                required
                name="external_id"
                dir="ltr"
                placeholder="1234567890"
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand font-mono text-ink"
              />
              <p className="mt-1 text-[10px] text-ink-faint">
                {PLATFORMS.map((p) => t.idHints[p]).join(' · ')}
              </p>
            </div>
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.displayName}</label>
              <input
                name="display_name"
                placeholder={t.displayNamePlaceholder}
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand text-ink"
              />
            </div>
            <div>
              <label className="block mb-1 font-bold text-ink-muted">{t.responsibleAgent}</label>
              <select
                name="ai_agent_id"
                className="w-full bg-surface border border-line rounded-xl px-3 py-2 outline-none focus:border-brand text-ink"
              >
                <option value="">{t.noAgent}</option>
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
                className="px-4 py-2 rounded-xl bg-brand text-on-brand font-bold disabled:opacity-50"
              >
                {t.linkButton}
              </button>
              <button
                type="button"
                onClick={() => setShowAccountForm(false)}
                className="px-4 py-2 rounded-xl bg-surface-3 text-ink-muted font-bold"
              >
                {t.cancel}
              </button>
            </div>
          </form>
        )}

        <div className="divide-y divide-line">
          {accounts.length === 0 && (
            <p className="p-8 text-center text-xs text-ink-muted">{t.noAccounts}</p>
          )}
          {accounts.map((acc) => {
            const channelLabel =
              channels[acc.platform as keyof ChannelLabels] ?? acc.platform
            const statusLabel =
              t.accountStatus[acc.status as keyof AgentsCopy['accountStatus']] ?? acc.status
            return (
              <div key={acc.id} className="p-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-ink">
                      {acc.display_name || channelLabel}
                    </p>
                    <span className="px-2 py-0.5 rounded-full bg-surface-3 text-ink-muted text-[10px] font-bold">
                      {channelLabel}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        acc.status === 'connected'
                          ? 'bg-success-bg text-success-ink'
                          : 'bg-warn-bg text-warn-ink'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-1">
                    <span className="font-mono" dir="ltr">
                      {acc.external_id}
                    </span>
                    {' • '}
                    {acc.ai_agents
                      ? fill(t.answeredBy, { name: acc.ai_agents.name })
                      : t.noAgentOnAccount}
                  </p>
                </div>
                <button
                  onClick={() =>
                    remove(
                      `/api/social-accounts?id=${acc.id}&merchant_id=${merchantId}`,
                      t.accountUnlinked
                    )
                  }
                  disabled={busy}
                  className="p-2 rounded-lg text-danger-ink hover:bg-danger-bg disabled:opacity-40"
                  title={t.unlink}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
