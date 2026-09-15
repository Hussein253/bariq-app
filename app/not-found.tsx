import Link from 'next/link'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Compass className="text-slate-500" size={22} />
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-2">الصفحة غير موجودة</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          الرابط الذي فتحته لا يقابل أي صفحة في برق. قد يكون قديماً أو فيه خطأ طباعي.
        </p>
        <Link
          href="/"
          className="inline-block bg-[#253765] hover:bg-[#1D2B50] text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
        >
          العودة للرئيسية
        </Link>
      </div>
    </div>
  )
}
