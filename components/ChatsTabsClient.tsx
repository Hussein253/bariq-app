'use client'

import { useMemo, useState } from 'react'
import { MessageCircle, RefreshCw } from 'lucide-react'
import LiveConversations, { type ChannelPlatform } from '@/components/LiveConversations'
import { toArabicDigits } from '@/lib/formatters'
import type { ConversationOverview } from '@/lib/conversations'

interface Props {
  initialConversations: ConversationOverview[]
  loadError?: string | null
  /** التبويب الأولي عند فتح الصفحة (مثلاً عبر رابط ?platform=instagram) — واتساب افتراضياً */
  initialTab?: ChannelPlatform
}

const TABS: { key: ChannelPlatform; label: string; activeClass: string; dotClass: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', activeClass: 'bg-[#25D366] text-white', dotClass: 'bg-[#25D366]' },
  {
    key: 'instagram',
    label: 'Instagram',
    activeClass: 'bg-gradient-to-r from-pink-500 to-purple-600 text-white',
    dotClass: 'bg-gradient-to-r from-pink-500 to-purple-600',
  },
  { key: 'messenger', label: 'Messenger', activeClass: 'bg-[#0084FF] text-white', dotClass: 'bg-[#0084FF]' },
]

/** لوحة "خدمة العملاء": تبويبات صريحة لكل قناة، مع لوحة محادثات حية واحدة تُعاد تصفيتها حسب التبويب */
export default function ChatsTabsClient({ initialConversations, loadError, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<ChannelPlatform>(initialTab || 'whatsapp')

  const counts = useMemo(() => {
    const byPlatform = (p: ChannelPlatform) =>
      initialConversations.filter((c) => (c.platform || 'whatsapp').toLowerCase() === p).length
    return {
      whatsapp: byPlatform('whatsapp'),
      instagram: byPlatform('instagram'),
      messenger: byPlatform('messenger'),
    }
  }, [initialConversations])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs whitespace-nowrap transition ${
              activeTab === tab.key
                ? `${tab.activeClass} shadow-md`
                : 'bg-white border border-[#E2E8F0] text-slate-600 hover:border-[#253765]'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === tab.key ? 'bg-white/70' : tab.dotClass}`} />
            {tab.label}
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {toArabicDigits(counts[tab.key])}
            </span>
          </button>
        ))}
      </div>

      {initialConversations.length === 0 && !loadError ? (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
          <MessageCircle size={36} />
          <p className="text-xs font-semibold text-slate-400">لا توجد محادثات بعد</p>
        </div>
      ) : (
        <LiveConversations
          key={activeTab}
          initialConversations={initialConversations}
          loadError={loadError}
          platform={activeTab}
        />
      )}
    </div>
  )
}
