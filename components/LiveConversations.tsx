'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Check,
  Inbox,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Send,
  UserRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toArabicDigits } from '@/lib/formatters'
import {
  type Conversation,
  type ConversationOverview,
  type Message,
  displayPhone,
  formatDayLabel,
  formatTime,
  isSameDay,
  phoneInitials,
  platformLabel,
  relativeTime,
  senderLabel,
  waLink,
} from '@/lib/conversations'

type BotFilter = 'all' | 'bot' | 'human'

interface Props {
  initialConversations: ConversationOverview[]
  loadError?: string | null
}

export default function LiveConversations({ initialConversations, loadError }: Props) {
  const [conversations, setConversations] = useState<ConversationOverview[]>(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMessages, setLoadingMessages] = useState(initialConversations.length > 0)
  const [search, setSearch] = useState('')
  const [botFilter, setBotFilter] = useState<BotFilter>('all')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [togglingBot, setTogglingBot] = useState(false)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(loadError ?? null)

  const bottomRef = useRef<HTMLDivElement>(null)
  // نحتفظ بالمحادثة المختارة في ref حتى يقرأ مستمع Realtime القيمة الحالية دائماً
  const selectedIdRef = useRef<string | null>(selectedId)
  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  // مجموعة معرّفات المحادثات المعروفة — يقرأها مستمع Realtime بلا إعادة اشتراك
  const knownIdsRef = useRef<Set<string>>(new Set(initialConversations.map((c) => c.id)))
  useEffect(() => {
    knownIdsRef.current = new Set(conversations.map((c) => c.id))
  }, [conversations])

  // مرجع لدالة إعادة التحميل، حتى لا يعتمد المستمع عليها في مصفوفة التبعيات
  const refreshConversationsRef = useRef<(() => Promise<void>) | null>(null)

  // ------------------------------------------------------------------
  // جلب رسائل المحادثة المختارة
  // كل setState يقع بعد await حتى لا تتسبب بإعادة تصيير متتالية
  // ------------------------------------------------------------------
  useEffect(() => {
    const conversationId = selectedId
    if (!conversationId) return

    let cancelled = false

    const load = async () => {
      const { data, error: qErr } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(500)

      if (cancelled) return // تجاهل نتيجة محادثة تم تركها

      if (qErr) {
        console.error('[LIVE_CONVERSATIONS][FETCH_MESSAGES]', qErr.message)
        setError(qErr.message)
        setLoadingMessages(false)
        return
      }

      setMessages((data as Message[]) || [])
      setError(null)
      setLoadingMessages(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [selectedId])

  // اختيار محادثة: نفرّغ الرسائل فوراً حتى لا تظهر رسائل المحادثة السابقة أثناء التحميل
  const selectConversation = useCallback((conversationId: string) => {
    setSelectedId((current) => {
      if (current !== conversationId) {
        setMessages([])
        setLoadingMessages(true)
      }
      return conversationId
    })
  }, [])

  // ------------------------------------------------------------------
  // معالج الحدث الوحيد الذي يقود الواجهة: INSERT على جدول messages
  // ------------------------------------------------------------------
  // مسارات n8n الحية تكتب في conversation_log، ومحفّز sync_live_n8n_messages
  // يعكسها إلى messages. لذلك حدث INSERT على messages هو المصدر الوحيد
  // الذي تحتاجه الواجهة — وهو مكتفٍ ذاتياً حتى لمحادثة لم تكن معروفة
  // (زبون جديد يراسل لأول مرة)، فلا يحتاج المستخدم لأي إعادة تنشيط.
  const applyIncomingMessage = useCallback((msg: Message) => {
    if (!msg.conversation_id) return

    // هل المحادثة معروفة؟ نقرأ من ref لا من الحالة، ليعمل داخل مستمع Realtime
    const isKnown = knownIdsRef.current.has(msg.conversation_id)

    if (!isKnown) {
      // زبون جديد: نجلب بطاقة المحادثة كاملة من الخادم (اسم التاجر + الإحصاءات)
      knownIdsRef.current.add(msg.conversation_id)
      void refreshConversationsRef.current?.()
    } else {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === msg.conversation_id)
        if (idx === -1) return prev
        const updated: ConversationOverview = {
          ...prev[idx],
          message_count: prev[idx].message_count + 1,
          last_message: msg.content,
          last_message_at: msg.created_at,
          last_sender_type: msg.sender_type,
          updated_at: msg.created_at,
        }
        const rest = prev.filter((_, i) => i !== idx)
        return [updated, ...rest] // ترتيب: الأحدث أولاً
      })
    }

    // إضافة الرسالة لنافذة المحادثة المفتوحة (مع حماية من الازدواج)
    if (msg.conversation_id === selectedIdRef.current) {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
    }
  }, [])

  // ------------------------------------------------------------------
  // إعادة تحميل القائمة من الخادم (احتياطي عند انقطاع Realtime)
  // ------------------------------------------------------------------
  const refreshConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      const json = await res.json()
      if (json?.success) {
        setConversations(json.conversations as ConversationOverview[])
        setError(null)
      }
    } catch (err: unknown) {
      console.error('[LIVE_CONVERSATIONS][REFRESH]', err)
    }
  }, [])

  useEffect(() => {
    refreshConversationsRef.current = refreshConversations
  }, [refreshConversations])

  // ------------------------------------------------------------------
  // الاشتراك في Realtime
  // ------------------------------------------------------------------
  // • INSERT على messages  → المحرّك الأساسي للواجهة (رسائل البوت والزبون)
  // • UPDATE على conversations → مزامنة حالة bot_active بين الأجهزة فقط
  // لا نستمع لـ INSERT على conversations: معالج messages يغطّيه ذاتياً.
  useEffect(() => {
    let mounted = true
    let retries = 0
    const MAX_RETRIES = 5
    let channel: ReturnType<typeof supabase.channel> | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const subscribe = () => {
      channel = supabase
        .channel('bariq_live_conversations')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => applyIncomingMessage(payload.new as Message)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversations' },
          (payload) => {
            const row = payload.new as Conversation
            setConversations((prev) =>
              prev.map((c) =>
                c.id === row.id
                  ? { ...c, bot_active: row.bot_active, updated_at: row.updated_at }
                  : c
              )
            )
          }
        )
        .subscribe((status) => {
          if (!mounted) return
          if (status === 'SUBSCRIBED') {
            setConnected(true)
            retries = 0
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setConnected(false)
            if (retries < MAX_RETRIES) {
              retries++
              console.warn(`[LIVE_CONVERSATIONS][REALTIME] إعادة المحاولة ${retries}/${MAX_RETRIES}`)
              retryTimer = setTimeout(() => {
                if (!mounted) return
                if (channel) supabase.removeChannel(channel)
                subscribe()
              }, 2000 * retries)
            }
          } else if (status === 'CLOSED') {
            setConnected(false)
          }
        })
    }

    subscribe()

    return () => {
      mounted = false
      if (retryTimer) clearTimeout(retryTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [applyIncomingMessage])

  // التمرير لآخر رسالة
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, selectedId])

  // ------------------------------------------------------------------
  // التصفية والبحث
  // ------------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return conversations.filter((c) => {
      if (botFilter === 'bot' && !c.bot_active) return false
      if (botFilter === 'human' && c.bot_active) return false
      if (!q) return true
      return (
        c.customer_phone.includes(q) ||
        (c.last_message || '').toLowerCase().includes(q) ||
        (c.merchant_name || '').toLowerCase().includes(q)
      )
    })
  }, [conversations, search, botFilter])

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) || null,
    [conversations, selectedId]
  )

  const botActiveCount = useMemo(
    () => conversations.filter((c) => c.bot_active).length,
    [conversations]
  )

  // ------------------------------------------------------------------
  // زر التحكم بالبوت
  // ------------------------------------------------------------------
  const handleToggleBot = async () => {
    if (!selected || togglingBot) return
    const next = !selected.bot_active
    setTogglingBot(true)

    // تحديث تفاؤلي
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, bot_active: next } : c))
    )

    try {
      const res = await fetch(`/api/conversations/${selected.id}/bot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_active: next }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذر تحديث حالة البوت')
      setError(null)
    } catch (err: unknown) {
      // التراجع عند الفشل
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, bot_active: !next } : c))
      )
      const msg = err instanceof Error ? err.message : 'تعذر تحديث حالة البوت'
      console.error('[LIVE_CONVERSATIONS][TOGGLE_BOT]', msg)
      setError(msg)
    } finally {
      setTogglingBot(false)
    }
  }

  // ------------------------------------------------------------------
  // إرسال رد الموظف
  // ------------------------------------------------------------------
  const handleSend = async () => {
    const text = replyText.trim()
    if (!text || !selected || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: selected.customer_phone, message_text: text }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذر إرسال الرد')

      // إضافة فورية حتى لو تأخر حدث Realtime
      if (json.live_message) applyIncomingMessage(json.live_message as Message)

      // الرد اليدوي يوقف البوت — نعكس ذلك مباشرةً
      setConversations((prev) =>
        prev.map((c) => (c.id === selected.id ? { ...c, bot_active: false } : c))
      )

      setReplyText('')
      setError(json.n8n_sent ? null : json.n8n_error || 'تم الحفظ لكن فشل الإرسال عبر n8n')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر إرسال الرد'
      console.error('[LIVE_CONVERSATIONS][SEND]', msg)
      setError(msg)
    } finally {
      setSending(false)
    }
  }

  // ==================================================================
  // العرض
  // ==================================================================
  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-amber-600 hover:text-amber-900 shrink-0">
            إخفاء
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 h-[calc(100vh-240px)] min-h-[520px]">
        {/* ================= قائمة المحادثات ================= */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden flex flex-col shadow-sm">
          <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#25D366]/15 flex items-center justify-center">
                  <MessageCircle size={16} className="text-[#25D366]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F172A]">المحادثات الحية</h3>
                  <p className="text-[10px] text-slate-400">
                    {toArabicDigits(conversations.length)} محادثة · {toArabicDigits(botActiveCount)} بالبوت
                  </p>
                </div>
              </div>
              <span
                className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${
                  connected
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    connected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`}
                />
                {connected ? 'مباشر' : 'غير متصل'}
              </span>
            </div>

            <div className="flex items-center gap-2 bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 focus-within:border-[#253765] transition">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث برقم الزبون أو نص الرسالة..."
                className="bg-transparent outline-none text-xs text-slate-800 w-full placeholder:text-slate-400"
              />
            </div>

            {/* مرشّحات حالة البوت */}
            <div className="flex items-center gap-1.5">
              {([
                ['all', 'الكل'],
                ['bot', 'البوت مفعّل'],
                ['human', 'بإدارة موظف'],
              ] as [BotFilter, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setBotFilter(key)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                    botFilter === key
                      ? 'bg-[#253765] text-white border-[#253765]'
                      : 'bg-white text-slate-500 border-[#E2E8F0] hover:border-[#253765]/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#F1F5F9]">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-300 gap-3">
                <Inbox size={36} />
                <p className="text-xs font-semibold text-slate-400">لا توجد محادثات مطابقة</p>
              </div>
            ) : (
              filtered.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={`w-full text-right p-3.5 hover:bg-[#F8FAFC] transition flex items-start gap-3 ${
                    selectedId === conv.id ? 'bg-[#F1F5F9]' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-[#253765] text-white flex items-center justify-center font-bold text-sm">
                      {phoneInitials(conv.customer_phone)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center ${
                        conv.bot_active ? 'bg-[#253765]' : 'bg-emerald-500'
                      }`}
                      title={conv.bot_active ? 'البوت مفعّل' : 'بإدارة موظف'}
                    >
                      {conv.bot_active ? (
                        <Bot size={8} className="text-white" />
                      ) : (
                        <UserRound size={8} className="text-white" />
                      )}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#0F172A] truncate" dir="ltr">
                        {displayPhone(conv.customer_phone)}
                      </p>
                      <span className="text-[9px] text-slate-400 shrink-0">
                        {relativeTime(conv.last_message_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {conv.last_sender_type && conv.last_sender_type !== 'customer' && (
                        <span className="text-slate-400">✓ </span>
                      )}
                      {conv.last_message || 'لا توجد رسائل بعد'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[9px] text-slate-400">
                        {toArabicDigits(conv.message_count)} رسالة
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">
                        {platformLabel(conv.platform)}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          conv.bot_active
                            ? 'bg-[#253765]/10 text-[#253765]'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {conv.bot_active ? 'بوت' : 'موظف'}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ================= نافذة المحادثة ================= */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] overflow-hidden flex flex-col shadow-sm">
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4">
              <div className="w-20 h-20 rounded-full bg-[#F1F5F9] flex items-center justify-center">
                <MessageCircle size={36} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-slate-400">اختر محادثة للعرض</p>
                <p className="text-xs text-slate-300 mt-1">تصل الرسائل الجديدة هنا فوراً</p>
              </div>
            </div>
          ) : (
            <>
              {/* رأس المحادثة + زر التحكم بالبوت */}
              <div className="p-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#25D366] text-white flex items-center justify-center font-bold text-sm">
                    {phoneInitials(selected.customer_phone)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0F172A]" dir="ltr">
                      {displayPhone(selected.customer_phone)}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {selected.merchant_name || 'تاجر غير محدد'} ·{' '}
                      {toArabicDigits(selected.message_count)} رسالة
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* مفتاح تشغيل/إيقاف البوت */}
                  <div
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border transition ${
                      selected.bot_active
                        ? 'bg-[#253765]/5 border-[#253765]/25'
                        : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <span
                      className={`text-[10px] font-bold ${
                        selected.bot_active ? 'text-[#253765]' : 'text-emerald-700'
                      }`}
                    >
                      {selected.bot_active ? 'البوت يرد تلقائياً' : 'المحادثة بإدارة موظف'}
                    </span>
                    <button
                      onClick={handleToggleBot}
                      disabled={togglingBot}
                      role="switch"
                      aria-checked={selected.bot_active}
                      aria-label="تشغيل أو إيقاف الرد التلقائي للبوت"
                      title={selected.bot_active ? 'إيقاف البوت وتسليم المحادثة للموظف' : 'إعادة تشغيل البوت'}
                      className={`relative w-11 h-6 rounded-full transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        selected.bot_active ? 'bg-[#253765]' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center transition-all ${
                          selected.bot_active ? 'right-0.5' : 'right-[22px]'
                        }`}
                      >
                        {togglingBot ? (
                          <RefreshCw size={10} className="animate-spin text-slate-500" />
                        ) : selected.bot_active ? (
                          <Check size={10} className="text-[#253765]" />
                        ) : (
                          <UserRound size={10} className="text-slate-500" />
                        )}
                      </span>
                    </button>
                  </div>

                  <a
                    href={waLink(selected.customer_phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#25D366] hover:bg-[#25D366]/10 p-2 rounded-lg transition"
                    title="فتح في واتساب"
                  >
                    <Phone size={16} />
                  </a>
                </div>
              </div>

              {/* الرسائل */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8FAFC]">
                {loadingMessages ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                    <RefreshCw size={28} className="animate-spin text-[#253765]" />
                    <p className="text-xs font-semibold">جارِ تحميل الرسائل...</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-2">
                    <Inbox size={32} />
                    <p className="text-xs font-semibold text-slate-400">لا توجد رسائل في هذه المحادثة</p>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const prev = messages[idx - 1]
                    const showDate = !prev || !isSameDay(prev.created_at, msg.created_at)
                    const fromCustomer = msg.sender_type === 'customer'
                    const fromAgent = msg.sender_type === 'agent'

                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-3 py-1 rounded-full">
                              {formatDayLabel(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex flex-col ${fromCustomer ? 'items-start' : 'items-end'}`}>
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                              fromCustomer
                                ? 'bg-white text-slate-800 border border-slate-200 rounded-br-md'
                                : fromAgent
                                  ? 'bg-[#25D366] text-white rounded-bl-md'
                                  : 'bg-[#253765] text-white rounded-bl-md'
                            }`}
                          >
                            {!fromCustomer && (
                              <div className="flex items-center gap-1 mb-1 text-[9px] font-bold text-white/70">
                                {fromAgent ? <UserRound size={9} /> : <Bot size={9} />}
                                {senderLabel(msg.sender_type)}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            <div
                              className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                                fromCustomer ? 'text-slate-400' : 'text-white/60'
                              }`}
                            >
                              {formatTime(msg.created_at)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* حقل الرد */}
              <div className="border-t border-[#E2E8F0] bg-white">
                {selected.bot_active && (
                  <p className="px-4 pt-2.5 text-[10px] text-slate-400">
                    إرسال رد يدوي سيوقف البوت تلقائياً في هذه المحادثة.
                  </p>
                )}
                <div className="p-3 flex items-center gap-2">
                  <input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        void handleSend()
                      }
                    }}
                    placeholder="اكتب ردك هنا..."
                    className="flex-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-[#253765] transition"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !replyText.trim()}
                    className="p-2.5 rounded-xl bg-[#25D366] text-white hover:bg-[#1fb959] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    title="إرسال"
                  >
                    {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
