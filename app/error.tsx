'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * حدّ الخطأ لمسارات التطبيق.
 * بدونه يرى التاجر شاشة بيضاء عند أي استثناء، فيظن أن المنصة سقطت ويتصل
 * بالدعم بلا معلومة تُفيد. هنا رسالة عربية واضحة + معرّف يربط شكواه بالسجل.
 *
 * ⚠️ نص الاستثناء نفسه لا يُعرض: رسائل PostgreSQL تكشف أسماء الجداول
 * والأعمدة لمن لا يحتاجها. المعروض هو digest الذي يولّده Next للسجل.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({ level: 'ERROR', event: 'APP_BOUNDARY', digest: error.digest ?? null })
    )
  }, [error])

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4" dir="rtl">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <AlertTriangle className="text-amber-600" size={22} />
        </div>
        <h1 className="text-lg font-bold text-slate-900 mb-2">تعذّر عرض هذه الصفحة</h1>
        <p className="text-sm text-slate-600 leading-relaxed mb-5">
          حدث خطأ غير متوقّع. بياناتك سليمة ولم يُفقد شيء — أعد المحاولة، وإن تكرّر
          الخطأ أرسل الرمز أدناه للدعم.
        </p>

        {error.digest && (
          <p className="text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 mb-5 select-all">
            {error.digest}
          </p>
        )}

        <button
          onClick={reset}
          className="inline-flex items-center gap-2 bg-[#253765] hover:bg-[#1D2B50] text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
        >
          <RotateCcw size={16} />
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}
