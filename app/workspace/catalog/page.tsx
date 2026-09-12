import Link from 'next/link'
import { AlertCircle, ArrowLeft, Brain } from 'lucide-react'
import CatalogManager from '@/components/CatalogManager'
import { listMerchantsWithPlan, loadMerchantEntitlements } from '@/lib/entitlements'

export const dynamic = 'force-dynamic'

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams

  let ent = null
  let loadError: string | null = null

  try {
    const merchants = await listMerchantsWithPlan()
    const activeId =
      requestedId && merchants.some((m) => m.id === requestedId) ? requestedId : merchants[0]?.id
    if (activeId) ent = await loadMerchantEntitlements(activeId)
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : 'تعذّر تحميل بيانات التاجر'
    console.error('[CATALOG_PAGE][LOAD_ERROR]', loadError)
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="mb-7">
          <Link
            href={ent ? `/workspace?merchant=${ent.merchant.id}` : '/workspace'}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#253765] transition mb-2"
          >
            <ArrowLeft size={14} />
            مساحة التاجر
          </Link>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#253765]/10 text-[#253765] flex items-center justify-center shrink-0">
              <Brain size={21} />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#0F172A] tracking-tight">
                العقل المعرفي
              </h1>
              <p className="text-xs text-[#64748B] mt-0.5">
                المنتجات والخدمات التي يجيب منها موظفك الذكي — لا من التخمين
                {ent ? ` · ${ent.merchant.name}` : ''}
              </p>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {!loadError && !ent && (
          <div className="p-8 rounded-2xl bg-white border border-amber-200 text-center">
            <AlertCircle size={28} className="mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-bold text-[#0F172A]">لا يوجد اشتراك فعّال</p>
            <p className="text-xs text-[#64748B] mt-1">قاعدة المعرفة تحتاج باقة مفعّلة.</p>
          </div>
        )}

        {ent && (
          <CatalogManager
            merchantId={ent.merchant.id}
            planName={ent.plan.name_en}
            productLimit={ent.plan.max_products}
          />
        )}
      </div>
    </div>
  )
}
