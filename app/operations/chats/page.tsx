'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MessageCircle,
  ArrowLeft,
  MessageSquare,
  Loader,
  Plus,
  RefreshCw
} from 'lucide-react'
import ChatInterface from '@/components/ChatInterface'
import BulkOrderUpload from '@/components/BulkOrderUpload'
import { toArabicDigits, formatDateTime } from '@/lib/formatters'

interface ChatMessage {
  id: string
  sender: 'customer' | 'bot' | 'agent'
  text: string
  timestamp: string
}

interface ChatConversation {
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

// بيانات حقيقية للمحادثات (سيتم استبدالها بـ API real-time لاحقاً)
const REAL_CONVERSATIONS: ChatConversation[] = [
  {
    id: 'wc1',
    customer_name: 'أحمد الجبوري',
    customer_phone: '07701234567',
    channel: 'whatsapp',
    status: 'بانتظار رد',
    last_message: 'وين وصل الطلب رقم BRQ-1001؟',
    updated_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    merchant_name: 'متجر دجلة',
    merchant_id: 'm1',
    messages: [
      { id: 'msg1', sender: 'customer', text: 'السلام عليكم، أهلا بشركة برق ⚡', timestamp: '١٠:٣٠ ص' },
      { id: 'msg2', sender: 'bot', text: 'وعليكم السلام ورحمة الله وبركاته 👋 أهلا وسهلا بك في متجر دجلة', timestamp: '١٠:٣٠ ص' },
      { id: 'msg3', sender: 'customer', text: 'أنا سويت طلب الصبح رقمه BRQ-1001، كم قد يتأخر التوصيل؟', timestamp: '١١:١٥ ص' },
      { id: 'msg4', sender: 'agent', text: 'السلام عليكم يا أحمد 👋\n\nطلبك قيد الشحن الآن ✅\nالمندوب: حيدر السعدي\nرقم الهاتف: 07709988771\nالوقت المتوقع: ساعتين كحد أقصى\n\nشكراً لاختيارك برق ⚡', timestamp: '١١:١٧ ص' },
      { id: 'msg5', sender: 'customer', text: 'وين وصل الطلب مالتي الحين؟', timestamp: '١٢:٤٥ ص' }
    ]
  },
  {
    id: 'ic1',
    customer_name: 'حيدر الكعبي',
    customer_phone: '07723456789',
    channel: 'instagram',
    status: 'يرد تلقائيًا',
    last_message: 'هل في عطر بتركيز أقوى؟',
    updated_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    merchant_name: 'متجر دجلة',
    merchant_id: 'm1',
    messages: [
      { id: 'msg1', sender: 'customer', text: 'شفت الإعلان بريلز انستا، كيف أطلب؟ 📸', timestamp: '٠٩:٠٠ ص' },
      { id: 'msg2', sender: 'bot', text: 'أهلا وسهلا! 🎉\n\nيمكنك الطلب مباشرة عبر Instagram Direct أو الضغط على زر الشراء ⚡\nندعم جميع طرق الدفع (COD, Zain Cash, Qi Card)', timestamp: '٠٩:٠١ ص' },
      { id: 'msg3', sender: 'customer', text: 'أنا أبغي عطر شرقي 100 مل بـ 50 ألف، هل متوفر الآن؟', timestamp: '٠٩:٣٠ ص' },
      { id: 'msg4', sender: 'bot', text: '✅ نعم متوفر الآن!\n\nالعطر الشرقي الليلي 100 مل - سعر: ٥٠,٠٠٠ دينار\nالتوصيل: بنفس اليوم لبغداد\nالدفع: عند الاستلام أو إلكتروني\n\nهل تريد المتابعة؟', timestamp: '٠٩:٣٢ ص' },
      { id: 'msg5', sender: 'customer', text: 'هل في عطر بتركيز أقوى؟', timestamp: '١٠:١٥ ص' }
    ]
  },
  {
    id: 'mc1',
    customer_name: 'زينب العبيدي',
    customer_phone: '07809876543',
    channel: 'messenger',
    status: 'تم التصعيد',
    last_message: 'أريد التحدث مع موظف عن موضوع العنوان الخاطئ',
    updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    merchant_name: 'ستايل بغداد',
    merchant_id: 'm2',
    messages: [
      { id: 'msg1', sender: 'customer', text: 'مساء الخير، أنا سويت طلب بالغلط', timestamp: '١١:٠٠ ص' },
      { id: 'msg2', sender: 'bot', text: 'مساء الخير يا زينب 😊\n\nكيف نساعدك؟ نحن هنا لخدمتك!', timestamp: '١١:٠١ ص' },
      { id: 'msg3', sender: 'customer', text: 'كتبت العنوان خطأ في الطلب، أبغى أصححه قبل ما يوصل المندوب', timestamp: '١١:٠٥ ص' },
      { id: 'msg4', sender: 'agent', text: 'لا تقلقي يا زينب! 👍\n\nنحن نساعدك في تصحيح العنوان\nاكتبي العنوان الصحيح وسنحدثه فوراً ✅', timestamp: '١١:٠٨ ص' },
      { id: 'msg5', sender: 'customer', text: 'العنوان الصحيح: الجزائر، شارع 14 تموز، مقابل مجمع النور، الطابق الثاني', timestamp: '١١:١٠ ص' }
    ]
  },
  {
    id: 'wc2',
    customer_name: 'مصطفى الحسيني',
    customer_phone: '07505551234',
    channel: 'whatsapp',
    status: 'يرد تلقائيًا',
    last_message: 'شكراً على التوصيل السريع ⚡',
    updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    merchant_name: 'متجر دجلة',
    merchant_id: 'm1',
    messages: [
      { id: 'msg1', sender: 'customer', text: 'أنا استلمت الطلب مالتي، شكراً على التوصيل السريع ⚡', timestamp: '٠٧:٤٥ م' },
      { id: 'msg2', sender: 'bot', text: 'الحمد لله على سلامتك 😊\n\nشكراً لاختيارك برق!\nهل المنتج بالحالة الجيدة؟', timestamp: '٠٧:٤٦ م' }
    ]
  }
]

type ChatTab = 'whatsapp' | 'instagram' | 'messenger' | 'all'

export default function ChatsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ChatTab>('all')
  const [selectedChatTab, setSelectedChatTab] = useState<'whatsapp' | 'instagram' | 'messenger' | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const filteredConversations = useMemo(() => {
    if (activeTab === 'all') return REAL_CONVERSATIONS
    return REAL_CONVERSATIONS.filter((c) => c.channel === activeTab)
  }, [activeTab])

  const stats = useMemo(() => {
    return {
      total: REAL_CONVERSATIONS.length,
      whatsapp: REAL_CONVERSATIONS.filter((c) => c.channel === 'whatsapp').length,
      instagram: REAL_CONVERSATIONS.filter((c) => c.channel === 'instagram').length,
      messenger: REAL_CONVERSATIONS.filter((c) => c.channel === 'messenger').length,
      pending: REAL_CONVERSATIONS.filter((c) => c.status === 'بانتظار رد').length,
      escalated: REAL_CONVERSATIONS.filter((c) => c.status === 'تم التصعيد').length
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        {/* الرأس */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/operations"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#253765] transition"
              >
                <ArrowLeft size={14} />
                العودة
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0F172A] tracking-tight">
              محادثات المحادثات الحية 💬
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              جميع المحادثات من WhatsApp و Instagram و Messenger في مكان واحد
            </p>
          </div>
          <button
            onClick={() => setIsLoading(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-xs transition"
          >
            {isLoading ? (
              <>
                <Loader size={14} className="animate-spin" />
                <span>جاري التحديث...</span>
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                <span>تحديث</span>
              </>
            )}
          </button>
        </div>

        {/* البطاقات الإحصائية */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold">إجمالي المحادثات</p>
              <MessageCircle size={16} className="text-[#253765]" />
            </div>
            <p className="text-2xl font-black text-[#0F172A]">{toArabicDigits(stats.total)}</p>
          </div>

          <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold">محادثات واتساب</p>
              <span className="w-3 h-3 rounded-full bg-[#25D366]" />
            </div>
            <p className="text-2xl font-black text-emerald-600">{toArabicDigits(stats.whatsapp)}</p>
          </div>

          <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold">محادثات إنستغرام</p>
              <span className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600" />
            </div>
            <p className="text-2xl font-black text-pink-600">{toArabicDigits(stats.instagram)}</p>
          </div>

          <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold">محادثات ماسنجر</p>
              <span className="w-3 h-3 rounded-full bg-[#0084FF]" />
            </div>
            <p className="text-2xl font-black text-blue-600">{toArabicDigits(stats.messenger)}</p>
          </div>

          <div className="card-luxury rounded-2xl p-4 bg-white border border-[#E2E8F0]">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs text-slate-500 font-semibold">بانتظار الرد</p>
              <span className="text-amber-600">⏳</span>
            </div>
            <p className="text-2xl font-black text-amber-600">{toArabicDigits(stats.pending)}</p>
          </div>
        </div>

        {/* قائمة التبويبات */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {(['all', 'whatsapp', 'instagram', 'messenger'] as ChatTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                if (tab !== 'all') {
                  setSelectedChatTab(tab as 'whatsapp' | 'instagram' | 'messenger')
                }
              }}
              className={`px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition ${
                activeTab === tab
                  ? 'bg-[#253765] text-white shadow-md'
                  : 'bg-white border border-[#E2E8F0] text-slate-600 hover:border-[#253765]'
              }`}
            >
              {tab === 'all' && `كل المحادثات (${toArabicDigits(stats.total)})`}
              {tab === 'whatsapp' && `WhatsApp (${toArabicDigits(stats.whatsapp)})`}
              {tab === 'instagram' && `Instagram (${toArabicDigits(stats.instagram)})`}
              {tab === 'messenger' && `Messenger (${toArabicDigits(stats.messenger)})`}
            </button>
          ))}
        </div>

        {/* قائمة المحادثات */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {filteredConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelectedChatTab(conv.channel)}
              className="card-luxury rounded-2xl bg-white border border-[#E2E8F0] p-4 text-right hover:shadow-md transition text-left"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center flex-shrink-0">
                  {conv.channel === 'whatsapp' && <span className="text-lg">💬</span>}
                  {conv.channel === 'instagram' && <span className="text-lg">📸</span>}
                  {conv.channel === 'messenger' && <span className="text-lg">💭</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-[#0F172A] truncate">{conv.customer_name}</h3>
                  <p className="text-xs text-slate-500 truncate">{conv.customer_phone}</p>
                  <p className="text-xs text-slate-400 mt-1 truncate">{conv.last_message}</p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className={`text-[10px] font-bold ${
                      conv.status === 'بانتظار رد'
                        ? 'text-amber-600'
                        : conv.status === 'تم التصعيد'
                        ? 'text-rose-600'
                        : 'text-emerald-600'
                    }`}>
                      {conv.status}
                    </span>
                    <span className="text-[10px] text-slate-400">{conv.updated_at}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* قسم رفع الطلبات */}
        <div className="mb-8">
          <BulkOrderUpload />
        </div>
      </div>

      {/* نافذة المحادثات */}
      {selectedChatTab && (
        <ChatInterface
          conversations={REAL_CONVERSATIONS.filter((c) => c.channel === selectedChatTab)}
          channel={selectedChatTab}
          onClose={() => setSelectedChatTab(null)}
        />
      )}
    </div>
  )
}
