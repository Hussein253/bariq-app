/**
 * حالة التحميل الافتراضية لمسارات الخادم.
 * الصفحات هنا force-dynamic وتقرأ من Supabase، فبدون هذا الملف يبقى
 * المتصفح على الصفحة السابقة بلا أي إشارة أن شيئاً يحدث.
 */
export default function Loading() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center" dir="rtl">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#253765] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">جارٍ التحميل…</p>
      </div>
    </div>
  )
}
