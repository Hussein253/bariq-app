import { AlertCircle } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentsAndAccounts from '@/components/AgentsAndAccounts'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { supabaseServer } from '@/lib/supabase-server'
import { loadWorkspaceContext } from '@/lib/workspace-context'
import { getTranslations } from '@/lib/i18n/server'

export const dynamic = 'force-dynamic'

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams

  const ctx = await loadWorkspaceContext(requestedId)
  const { locale, t } = await getTranslations()
  const merchants = ctx.merchants
  let ent = null
  let catalogs: { id: string; name: string }[] = []
  let loadError: string | null = null

  try {
    const activeId = ctx.merchantId
    if (activeId) {
      ent = await loadMerchantEntitlements(activeId)
      const { data } = await supabaseServer
        .from('catalogs')
        .select('id, name')
        .eq('merchant_id', activeId)
        .order('created_at', { ascending: true })
      catalogs = (data ?? []) as { id: string; name: string }[]
    }
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : t.app.pages.loadErrorMerchant
    console.error('[AGENTS_PAGE][LOAD_ERROR]', loadError)
  }

  const body = loadError ? (
    <div className="p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{loadError}</span>
    </div>
  ) : !ent ? (
    <div className="p-8 rounded-2xl bg-surface border border-warn-line text-center">
      <AlertCircle size={28} className="mx-auto text-warn-ink mb-3" />
      <p className="text-sm font-bold text-ink">{t.app.pages.noSubscription}</p>
      <p className="text-xs text-ink-muted mt-1">{t.app.pages.noSubscriptionAgents}</p>
    </div>
  ) : (
    <>
      <header className="mb-5">
        <h1 className="text-lg font-black text-ink">{t.app.agentsPage.title}</h1>
        <p className="text-xs text-ink-muted mt-1">{t.app.agentsPage.subtitle}</p>
      </header>
      <AgentsAndAccounts
        merchantId={ent.merchant.id}
        agentLimit={ent.plan.max_ai_agents}
        accountLimit={ent.plan.max_social_accounts}
        catalogs={catalogs}
        locale={locale}
        t={t.app.agents}
        channels={t.app.channels}
      />
    </>
  )

  return (
    <WorkspaceShell
      merchantId={ent?.merchant.id ?? ''}
      merchantName={ent?.merchant.name ?? t.app.workspace.merchantFallback}
      planName={ent?.plan.name_en ?? null}
      merchants={merchants}
      impersonating={ctx.impersonating}
      t={{ ...t.app.nav, soon: t.app.common.soon }}
    >
      {body}
    </WorkspaceShell>
  )
}
