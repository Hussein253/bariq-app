'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, type WhatsAppMessage } from '@/lib/supabase'
import { toArabicDigits } from '@/lib/formatters'
import { MessageCircle, Phone, Send, Search, RefreshCw, Inbox } from 'lucide-react'

// ---------- أدوات مساعدة ----------

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7, 9)} ${digits.slice(9)}`
  }
  return phone
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', { day: 'numeric', month: 'long' })
  } catch {
    return ''
  }
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

// ---------- المكوّن الرئيسي ----------

export default function WhatsAppChat() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [connected, setConnected] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // جلب الرسائل الأولية
  const fetchMessages = useCallback(async () => {
    try {
      setError(null)
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1000)

      if (error) throw error
      setMessages((data as WhatsAppMessage[]) || [])
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر تحميل الرسائل'
      console.error('فشل جلب رسائل واتساب:', message)
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  // الاشتراك في Realtime
  useEffect(() => {
    let isMounted = true
    let retryCount = 0
    const MAX_RETRIES = 5

    const setupChannel = () => {
      const channel = supabase
        .channel('whatsapp_messages_changes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'whatsapp_messages' },
          (payload) => {
            const newMsg = payload.new as WhatsAppMessage
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev
              return [...prev, newMsg]
            })
          }
        )
        .subscribe((status) => {
          if (!isMounted) return

          if (status === 'SUBSCRIBED') {
            setConnected(true)
            retryCount = 0
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnected(false)
            // إعادة محاولة تلقائية عند فشل الاشتراك
            if (retryCount < MAX_RETRIES) {
              retryCount++
              console.warn(`[REALTIME] فشل الاشتراك، إعادة المحاولة ${retryCount}/${MAX_RETRIES}`)
              setTimeout(() => {
                if (isMounted) {
                  supabase.removeChannel(channel)
                  setupChannel()
                }
              }, 2000 * retryCount)
            }
          } else if (status === 'CLOSED') {
            setConnected(false)
          }
        })

      return channel
    }

    const channel = setupChannel()

    // جلب الرسائل الأولية بعد الاشتراك (غير متزامن لتجنب التحديث المتسلسل)
    const timer = setTimeout(() => {
      void fetchMessages()
    }, 0)

    return () => {
      isMounted = false
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [fetchMessages])

  // تمرير لأسفل عند وصول رسالة جديدة
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, selectedPhone])

  // تجميع الرسائل حسب رقم الهاتف
  const conversations = useMemo(() => {
    const map = new Map<string, WhatsAppMessage[]>()
    for (const msg of messages) {
      const list = map.get(msg.phone_number) || []
      list.push(msg)
      map.set(msg.phone_number, list)
    }
    return Array.from(map.entries())
      .map(([phone, msgs]) => ({
        phone,
        messages: msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      }))
      .sort((a, b) => {
        const lastA = a.messages[a.messages.length - 1]?.created_at || ''
        const lastB = b.messages[b.messages.length - 1]?.created_at || ''
        return new Date(lastB).getTime() - new Date(lastA).getTime()
      })
  }, [messages])

  // البحث
  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conversations
    return conversations.filter(
      (c) =>
        c.phone.includes(q) ||
        c.messages.some((m) => m.message_text.toLowerCase().includes(q))
    )
  }, [conversations, search])

  const selectedConversation = useMemo(
    () => conversations.find((c) => c.phone === selectedPhone) || null,
    [conversations, selectedPhone]
  )

  // إرسال رد (يُحفظ كرسالة outbound)
  const handleSend = async () => {
    const text = replyText.trim()
    if (!text || !selectedPhone) return
    setSending(true)
    try {
      // استخدام .select() لإرجاع الصف المُدرج وإضافته فوراً للحالة
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .insert({
          phone_number: selectedPhone,
          message_text: text,
          direction: 'outbound',
        })
        .select()

      if (error) throw error

      // إضافة الرسالة فوراً إلى الحالة (حتى لو لم يصل حدث Realtime)
      if (data && data[0]) {
        const newMsg = data[0] as WhatsAppMessage
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
      }

      setReplyText('')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'تعذر إرسال الرد'
      console.error('فشل إرسال الرد:', message)
      setError(message)
    } finally {
      setSending(false)
    }
  }

  // ---------- واجهة التحميل ----------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
        <RefreshCw size={32} className="animate-spin text-[#253765]" />
        <p className="text-sm font-semibold">جارِ تحميل محادثات واتساب...</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 h-[calc(100vh-220px)] min-h-[480px]">
      {/* ===== قائمة المحادثات ===== */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden flex flex-col shadow-sm">
        {/* رأس القائمة */}
        <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#25D366]/15 flex items-center justify-center">
                <MessageCircle size={16} className="text-[#25D366]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">محادثات واتساب</h3>
                <p className="text-[10px] text-slate-400">مباشر عبر Supabase Realtime</p>
              </div>
            </div>
            <span
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${
                connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {connected ? 'متصل' : 'غير متصل'}
            </span>
          </div>

          {/* البحث */}
          <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 focus-within:border-[#253765] transition">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الهاتف أو النص..."
              className="bg-transparent outline-none text-xs text-slate-800 w-full placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* قائمة المحادثات */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9]">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
              <Inbox size={36} />
              <p className="text-xs font-semibold text-slate-400">لا توجد محادثات بعد</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const last = conv.messages[conv.messages.length - 1]
              const unread = conv.messages.filter((m) => m.direction === 'inbound').length
              return (
                <button
                  key={conv.phone}
                  onClick={() => setSelectedPhone(conv.phone)}
                  className={`w-full text-right p-3.5 hover:bg-[#F8FAFC] transition flex items-start gap-3 ${
                    selectedPhone === conv.phone ? 'bg-[#F1F5F9]' : ''
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#253765] text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {conv.phone.slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#0F172A] truncate" dir="ltr">
                        {formatPhone(conv.phone)}
                      </p>
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {formatTime(last?.created_at || '')}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {last?.message_text || ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[9px] text-slate-400">
                        {toArabicDigits(conv.messages.length)} رسالة
                      </span>
                      {unread > 0 && (
                        <span className="text-[9px] bg-[#25D366] text-white rounded-full px-1.5 py-0.5 font-bold">
                          {toArabicDigits(unread)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ===== نافذة المحادثة ===== */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden flex flex-col shadow-sm">
        {!selectedConversation ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
            <div className="w-20 h-20 rounded-full bg-[#F1F5F9] flex items-center justify-center">
              <MessageCircle size={36} className="text-slate-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-bold text-slate-400">اختر محادثة للعرض</p>
              <p className="text-xs text-slate-300 mt-1">سيتم عرض الرسائل هنا فور وصولها</p>
            </div>
          </div>
        ) : (
          <>
            {/* رأس المحادثة */}
            <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center font-bold text-sm">
                  {selectedConversation.phone.slice(-2)}
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0F172A]" dir="ltr">
                    {formatPhone(selectedConversation.phone)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {toArabicDigits(selectedConversation.messages.length)} رسالة
                  </p>
                </div>
              </div>
              <a
                href={`https://wa.me/${selectedConversation.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#25D366] hover:bg-[#25D366]/10 p-2 rounded-lg transition"
                title="فتح في واتساب"
              >
                <Phone size={16} />
              </a>
            </div>

            {/* الرسائل */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
              {selectedConversation.messages.map((msg, idx) => {
                const prev = selectedConversation.messages[idx - 1]
                const showDate = !prev || !isSameDay(prev.created_at, msg.created_at)
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-3 py-1 rounded-full">
                          {formatDate(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div
                      className={`flex flex-col ${
                        msg.direction === 'outbound' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-[#253765] text-white rounded-bl-md'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-br-md'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                            msg.direction === 'outbound' ? 'text-white/60' : 'text-slate-400'
                          }`}
                        >
                          {formatTime(msg.created_at)}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* حقل الرد */}
            <div className="p-3 border-t border-[#E2E8F0] bg-white flex items-center gap-2">
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder="اكتب ردك هنا..."
                className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-[#253765] transition"
              />
              <button
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                className="p-2.5 rounded-xl bg-[#25D366] text-white hover:bg-[#1fb959] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}