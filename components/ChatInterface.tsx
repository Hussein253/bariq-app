'use client'

import { useState, useMemo } from 'react'
import {
  MessageCircle,
  Send,
  Search,
  X,
  Phone,
  Clock,
  AlertCircle,
  CheckCircle2,
  Upload,
  Plus,
  Paperclip,
  Smile
} from 'lucide-react'
import { toArabicDigits, formatArabicPhone, formatDateTime } from '@/lib/formatters'

export interface ChatMessage {
  id: string
  sender: 'customer' | 'bot' | 'agent'
  text: string
  timestamp: string
  attachments?: { name: string; url: string }[]
}

export interface ChatConversation {
  id: string
  customer_name: string
  customer_phone: string
  channel: 'whatsapp' | 'messenger' | 'instagram'
  status: 'يرد تلقائيًا' | 'بانتظار رد' | 'تم التصعيد'
  last_message: string
  updated_at: string
  messages: ChatMessage[]
  merchant_name: string
  merchant_id: string
}

interface ChatInterfaceProps {
  conversations: ChatConversation[]
  channel: 'whatsapp' | 'messenger' | 'instagram'
  onClose: () => void
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'whatsapp') {
    return <span className="w-3 h-3 rounded-full bg-[#25D366]" />
  }
  if (channel === 'instagram') {
    return <span className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600" />
  }
  return <span className="w-3 h-3 rounded-full bg-[#0084FF]" />
}

function ChannelName({ channel }: { channel: string }) {
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'instagram') return 'Instagram'
  return 'Messenger'
}

export default function ChatInterface({ conversations, channel, onClose }: ChatInterfaceProps) {
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(
    conversations.length > 0 ? conversations[0] : null
  )
  const [search, setSearch] = useState('')
  const [replyText, setReplyText] = useState('')
  const [uploadingFile, setUploadingFile] = useState(false)

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    return conversations.filter((c) =>
      !q ||
      c.customer_name.toLowerCase().includes(q) ||
      c.customer_phone.includes(q) ||
      c.last_message.toLowerCase().includes(q)
    )
  }, [conversations, search])

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedConversation) return
    // سيتم ربط هذا بـ API حقيقي لاحقاً
    setReplyText('')
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
        {/* الرأس */}
        <div className="bg-gradient-to-r from-[#253765] to-[#1D2B50] px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <ChannelIcon channel={channel} />
            <h2 className="text-xl font-bold">
              محادثات {ChannelName({ channel })}
            </h2>
            <span className="px-2 py-1 rounded-full text-xs font-bold bg-white/20">
              {toArabicDigits(filteredConversations.length)} محادثة
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* المحتوى الرئيسي */}
        <div className="flex flex-1 overflow-hidden">
          {/* قائمة المحادثات */}
          <div className="w-80 border-r border-[#E2E8F0] flex flex-col bg-[#F8FAFC]">
            {/* شريط البحث */}
            <div className="p-4 border-b border-[#E2E8F0]">
              <div className="relative">
                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث عن محادثة..."
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765]"
                />
              </div>
            </div>

            {/* قائمة المحادثات */}
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  لا توجد محادثات
                </div>
              ) : (
                filteredConversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full p-4 border-b border-[#E2E8F0] text-right transition-all ${
                      selectedConversation?.id === conv.id
                        ? 'bg-[#253765] text-white'
                        : 'hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className={`font-bold text-sm ${
                          selectedConversation?.id === conv.id ? 'text-white' : 'text-[#0F172A]'
                        }`}>
                          {conv.customer_name}
                        </p>
                        <p className={`text-[11px] mt-1 line-clamp-1 ${
                          selectedConversation?.id === conv.id ? 'text-white/80' : 'text-slate-500'
                        }`}>
                          {conv.last_message}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold whitespace-nowrap flex-shrink-0 ${
                        conv.status === 'بانتظار رد'
                          ? 'text-amber-600'
                          : conv.status === 'تم التصعيد'
                          ? 'text-rose-600'
                          : 'text-emerald-600'
                      }`}>
                        {conv.status === 'بانتظار رد' ? '⏳' : conv.status === 'تم التصعيد' ? '⚠️' : '✓'}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* منطقة المحادثة */}
          {selectedConversation ? (
            <div className="flex-1 flex flex-col">
              {/* معلومات العميل */}
              <div className="px-6 py-4 border-b border-[#E2E8F0] bg-white">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-[#0F172A]">{selectedConversation.customer_name}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      📱 {formatArabicPhone(selectedConversation.customer_phone)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      🏪 {selectedConversation.merchant_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                      selectedConversation.status === 'يرد تلقائيًا'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : selectedConversation.status === 'بانتظار رد'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {selectedConversation.status === 'يرد تلقائيًا' ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                      {selectedConversation.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* رسائل المحادثة */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#F8FAFC]">
                {selectedConversation.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === 'agent' || msg.sender === 'bot' ? 'justify-start' : 'justify-end'}`}
                  >
                    <div
                      className={`max-w-xs px-4 py-2 rounded-2xl ${
                        msg.sender === 'agent' || msg.sender === 'bot'
                          ? 'bg-white border border-[#E2E8F0] text-[#0F172A]'
                          : 'bg-[#253765] text-white'
                      }`}
                    >
                      <p className="text-xs">{msg.text}</p>
                      <p className={`text-[10px] mt-1 ${
                        msg.sender === 'agent' || msg.sender === 'bot'
                          ? 'text-slate-400'
                          : 'text-white/70'
                      }`}>
                        {msg.timestamp}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* مربع الرد */}
              <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white">
                <div className="flex items-end gap-2">
                  <button className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-400">
                    <Paperclip size={18} />
                  </button>
                  <button className="p-2 hover:bg-slate-100 rounded-lg transition text-slate-400">
                    <Smile size={18} />
                  </button>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendReply()
                      }
                    }}
                    placeholder="اكتب ردك هنا..."
                    className="flex-1 px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765] resize-none max-h-20"
                    rows={2}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim()}
                    className="p-2 bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white rounded-lg transition"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400">
              <p className="text-sm">اختر محادثة لبدء الرد</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
