import { AlertCircle } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import AgentsAndAccounts from '@/components/AgentsAndAccounts'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { supabaseServer } from '@/lib/supabase-server'
import { loadWorkspaceContext } from '@/lib/workspace-context'

export const dynamic = 'force-dynamic'

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams

  const ctx = await loadWorkspaceContext(requestedId)
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
    loadError = err instanceof Error ? err.message : 'تعذّر تحميل بيانات التاجر'
    console.error('[AGENTS_PAGE][LOAD_ERROR]', loadError)
  }

  const body = loadError ? (
    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{loadError}</span>
    </div>
  ) : !ent ? (
    <div className="p-8 rounded-2xl bg-white border border-amber-200 text-center">
      <AlertCircle size={28} className="mx-auto text-amber-500 mb-3" />
      <p className="text-sm font-bold text-[#0F172A]">لا يوجد اشتراك فعّال</p>
      <p className="text-xs text-[#64748B] mt-1">
        الموظف الذكي وحسابات التواصل تحتاج باقة مفعّلة.
      </p>
    </div>
  ) : (
    <>
      <header className="mb-5">
        <h1 className="text-lg font-black text-[#0F172A]">الموظفون الأذكياء والربط</h1>
        <p className="text-xs text-[#64748B] mt-1">
          كل موظف شخصية بوت مستقلة بقاعدة معرفتها. الحسابات المربوطة توجّه رسائل
          الزبائن إلى الموظف المسؤول عنها.
        </p>
      </header>
      <AgentsAndAccounts
        merchantId={ent.merchant.id}
        agentLimit={ent.plan.max_ai_agents}
        accountLimit={ent.plan.max_social_accounts}
        catalogs={catalogs}
      />
    </>
  )

  return (
    <WorkspaceShell
      merchantId={ent?.merchant.id ?? ''}
      merchantName={ent?.merchant.name ?? 'التاجر'}
      planName={ent?.plan.name_en ?? null}
      merchants={merchants}
      impersonating={ctx.impersonating}
    >
      {body}
    </WorkspaceShell>
  )
}
