import { AlertCircle } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import ChatsTabsClient from '@/components/ChatsTabsClient'
import type { ChannelPlatform } from '@/components/LiveConversations'
import { loadMerchantEntitlements } from '@/lib/entitlements'
import { loadConversationsOverview } from '@/lib/conversations-server'
import type { ConversationOverview } from '@/lib/conversations'
import { loadWorkspaceContext } from '@/lib/workspace-context'
import { getTranslations } from '@/lib/i18n/server'
import { log } from '@/lib/log'

/**
 * محادثات التاجر — /workspace/chats
 * ==================================
 * قبلها كان رابط «المحادثات» في قائمة التاجر يفتح /operations/chats، وهي
 * لفريق برق وحده، فيُعاد التاجر إلى صفحته الرئيسية.
 *
 * واجهة المحادثات نفسها التي يستعملها الفريق، بـ variant="merchant":
 *   • القائمة الأولى مقيَّدة بتاجره هنا، وتحديثها الاحتياطي يحمل ?merchant
 *   • التحديث اللحظي تقيّده سياسات RLS على الجلسة (الترحيل ٠١٢)
 *   • الرد وإيقاف البوت يمرّان بفحص canActOnConversation في المسارين
 *
 * ⚠️ نسبة المحادثة إلى تاجرها اليوم من دالة المزامنة (الترحيل ٠٠٩): أقدم
 * تاجر. صحيح ما دام البوت الحي يخدم متجراً واحداً؛ وقبل تشغيل بوت لتاجر ثانٍ
 * يجب أن تُنسب المحادثة عبر social_accounts، وإلا ذهبت محادثات زبائنه للأول.
 */

export const dynamic = 'force-dynamic'

const VALID_TABS: ChannelPlatform[] = ['whatsapp', 'instagram', 'messenger']

export default async function MerchantChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string; platform?: string }>
}) {
  const { merchant: requestedId, platform } = await searchParams
  const initialTab = VALID_TABS.includes(platform as ChannelPlatform)
    ? (platform as ChannelPlatform)
    : 'whatsapp'

  const ctx = await loadWorkspaceContext(requestedId)
  const { locale, t } = await getTranslations()
  const p = t.app.chatsPage
  const w = t.app.workspace

  let ent: Awaited<ReturnType<typeof loadMerchantEntitlements>> = null
  let conversations: ConversationOverview[] = []
  let loadFailed = false

  if (ctx.merchantId) {
    try {
      const [loadedEnt, loadedConversations] = await Promise.all([
        loadMerchantEntitlements(ctx.merchantId),
        loadConversationsOverview(ctx.merchantId),
      ])
      ent = loadedEnt
      conversations = loadedConversations
    } catch (err: unknown) {
      loadFailed = true
      log.error('MERCHANT_CHATS_LOAD_FAILED', {
        merchant_id: ctx.merchantId,
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  let body: React.ReactNode
  if (!ctx.merchantId) {
    const owner = ctx.profile.role === 'platform_owner'
    body = (
      <div className="p-8 rounded-2xl bg-surface border border-line text-center">
        <AlertCircle size={28} className="mx-auto text-ink-faint mb-3" />
        <p className="text-sm font-bold text-ink">{owner ? w.noMerchantOwnerTitle : w.noMerchantUserTitle}</p>
        <p className="text-xs text-ink-muted mt-1">{owner ? w.noMerchantOwnerBody : w.noMerchantUserBody}</p>
      </div>
    )
  } else if (loadFailed) {
    body = (
      <div className="p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>{p.loadError}</span>
      </div>
    )
  } else {
    body = (
      <ChatsTabsClient
        initialConversations={conversations}
        initialTab={initialTab}
        emptyHint={p.emptyHint}
        locale={locale}
        t={t.app.chats}
        channels={t.app.channels}
        variant="merchant"
        listUrl={`/api/conversations?merchant=${ctx.merchantId}`}
      />
    )
  }

  return (
    <WorkspaceShell
      merchantId={ctx.merchantId ?? ''}
      merchantName={ent?.merchant.name ?? w.merchantFallback}
      planName={ent?.plan.name_en ?? null}
      merchants={ctx.merchants}
      impersonating={ctx.impersonating}
      t={{ ...t.app.nav, soon: t.app.common.soon }}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-black text-ink tracking-tight">{p.title}</h1>
          <p className="text-xs text-ink-muted mt-1">{p.subtitle}</p>
        </div>
        {body}
      </div>
    </WorkspaceShell>
  )
}
