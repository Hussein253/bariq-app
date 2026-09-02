'use client'

import WhatsAppChat from '@/components/WhatsAppChat'
import { MessageCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function WhatsAppPage() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#0F172A] flex flex-col font-sans">
      {/* الترويسة */}
      <header className="bg-white border-b border-[#E2E8F0] px-4 sm:px-8 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366] text-white flex items-center justify-center shadow-md">
            <MessageCircle size={20} />
          </div>
          <div>
            <h1 className="text-lg font-black text-[#0F172A] tracking-tight">محادثات واتساب</h1>
            <p className="text-xs text-[#64748B]">عرض مباشر للرسائل الواردة والصادرة عبر Supabase Realtime</p>
          </div>
        </div>
        <Link
          href="/operations"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs shadow-sm transition"
        >
          <ArrowRight size={14} />
          <span>العودة للوحة العمليات</span>
        </Link>
      </header>

      {/* المحتوى */}
      <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl mx-auto w-full">
        <WhatsAppChat />
      </main>
    </div>
  )
}