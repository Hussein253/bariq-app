import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ChatsTabsClient from '@/components/ChatsTabsClient'
import ConfirmedOrdersPanel from '@/components/ConfirmedOrdersPanel'
import BulkOrderUpload from '@/components/BulkOrderUpload'
import { loadConversationsOverview } from '@/lib/conversations-server'
import type { ConversationOverview } from '@/lib/conversations'
import type { ChannelPlatform } from '@/components/LiveConversations'

// بيانات حقيقية من Supabase — تُجلب في كل زيارة، بلا تخزين مؤقت
export const dynamic = 'force-dynamic'

const VALID_TABS: ChannelPlatform[] = ['whatsapp', 'instagram', 'messenger']

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string }>
}) {
  const { platform } = await searchParams
  const initialTab = VALID_TABS.includes(platform as ChannelPlatform)
    ? (platform as ChannelPlatform)
    : 'whatsapp'

  let conversations: ConversationOverview[] = []
  let loadError: string | null = null

  try {
    conversations = await loadConversationsOverview()
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : 'تعذر تحميل المحادثات'
    console.error('[CHATS_PAGE][LOAD_ERROR]', loadError)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        {/* الرأس */}
        <div className="mb-6">
          <Link
            href="/operations"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#253765] transition mb-2"
          >
            <ArrowLeft size={14} />
            العودة
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0F172A] tracking-tight">
            خدمة العملاء 💬
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            محادثات WhatsApp و Instagram و Messenger مباشرةً عبر Supabase Realtime، والطلبات المؤكدة الجاهزة للشحن
          </p>
        </div>

        {/* تبويبات القنوات + المحادثات الحية */}
        <div className="mb-8">
          <ChatsTabsClient initialConversations={conversations} loadError={loadError} initialTab={initialTab} />
        </div>

        {/* الطلبات المؤكدة */}
        <div className="mb-8">
          <ConfirmedOrdersPanel />
        </div>

        {/* رفع الطلبات بالجملة */}
        <div className="mb-8">
          <BulkOrderUpload />
        </div>
      </div>
    </div>
  )
}
