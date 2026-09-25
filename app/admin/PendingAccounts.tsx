'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, BadgeCheck, Check, ShieldAlert } from 'lucide-react'
import { fill } from '@/lib/i18n/fill'
import { localizeDigits } from '@/lib/formatters'
import type { Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import type { PendingSocialAccount } from '@/lib/admin-server'

type PendingCopy = Dictionary['app']['admin']['pendingAccounts']
type ChannelLabels = Dictionary['app']['channels']

/**
 * حسابات التواصل بانتظار اعتماد مالك المنصة (الترحيل ٠١٩).
 *
 * القائمة من الخادم؛ بعد الاعتماد يُعاد رسم الصفحة (router.refresh) فيخرج
 * الحساب منها. لذلك تُركَّب هذه دائماً ولا ترسم شيئاً حين لا شيء لديها: لو
 * أخفتها الصفحة بعد اعتماد آخر حساب، لاختفى إشعار النجاح معها قبل أن يُقرأ.
 */
export default function PendingAccounts({
  accounts,
  locale,
  t,
  channels,
}: {
  accounts: PendingSocialAccount[]
  locale: Locale
  /** ⚠️ خاصية لا استيراد: مكوّن عميل، والقاموس كله لا يعبر إلى المتصفّح. */
  t: PendingCopy
  channels: ChannelLabels
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null)

  const flash = (text: string, kind: 'ok' | 'err') => {
    setNotice({ text, kind })
    setTimeout(() => setNotice(null), 6000)
  }

  async function verify(account: PendingSocialAccount) {
    const question = fill(t.confirm, { account: account.externalId, merchant: account.merchantName })
    if (!confirm(question)) return

    setBusyId(account.id)
    try {
      const res = await fetch(`/api/social-accounts/${account.id}/verify`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.success) throw new Error(json.error || t.failed)

      const attached = Number(json.attached_conversations) || 0
      flash(
        attached > 0
          ? fill(t.verifiedAttached, { n: localizeDigits(attached, locale) })
          : t.verified,
        'ok'
      )
      router.refresh()
    } catch (err: unknown) {
      flash(err instanceof Error ? err.message : t.failed, 'err')
    } finally {
      setBusyId(null)
    }
  }

  if (accounts.length === 0 && !notice) return null

  return (
    <div className="mb-8 space-y-3">
      {notice && (
        <div
          role="status"
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

      {accounts.length > 0 && (
        <section className="rounded-2xl bg-surface border border-warn-line overflow-hidden">
          <header className="p-4 bg-warn-bg border-b border-warn-line">
            <h2 className="text-sm font-black text-warn-ink flex items-center gap-2">
              <ShieldAlert size={16} className="shrink-0" />
              {fill(t.title, { n: localizeDigits(accounts.length, locale) })}
            </h2>
            <p className="mt-1.5 text-[11px] text-warn-ink/90 leading-relaxed">{t.hint}</p>
          </header>

          <ul className="divide-y divide-line">
            {accounts.map((account) => {
              const channelLabel =
                channels[account.platform as keyof ChannelLabels] ?? account.platform
              return (
                <li key={account.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink">{account.merchantName}</p>
                    <p className="mt-1 text-[11px] text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="px-2 py-0.5 rounded-full bg-surface-3 text-[10px] font-bold">
                        {channelLabel}
                      </span>
                      <span className="font-mono break-all" dir="ltr">
                        {account.externalId}
                      </span>
                      {account.displayName && <span>· {account.displayName}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => verify(account)}
                    disabled={busyId !== null}
                    className="px-3 py-1.5 rounded-xl bg-brand hover:bg-brand-hover text-on-brand text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                  >
                    <BadgeCheck size={14} />
                    <span>{busyId === account.id ? t.verifying : t.verify}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
