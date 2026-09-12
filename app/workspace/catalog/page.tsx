import { AlertCircle, Boxes } from 'lucide-react'
import WorkspaceShell from '@/components/WorkspaceShell'
import CatalogManager from '@/components/CatalogManager'
import {
  CouponsSection,
  BusinessAndDeliverySections,
} from '@/components/MerchantSettingsSections'
import { listMerchantsWithPlan, loadMerchantEntitlements } from '@/lib/entitlements'
import { formatArabicNumber } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ merchant?: string }>
}) {
  const { merchant: requestedId } = await searchParams

  let merchants: { id: string; name: string; planName: string | null }[] = []
  let ent = null
  let loadError: string | null = null

  try {
    merchants = await listMerchantsWithPlan()
    const activeId =
      requestedId && merchants.some((m) => m.id === requestedId) ? requestedId : merchants[0]?.id
    if (activeId) ent = await loadMerchantEntitlements(activeId)
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : 'تعذّر تحميل بيانات التاجر'
    console.error('[CATALOG_PAGE][LOAD_ERROR]', loadError)
  }

  const body = loadError ? (
    <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span>{loadError}</span>
    </div>
  ) : !ent ? (
    <div className="p-8 rounded-2xl bg-white border border-amber-200 text-center">
      <AlertCircle size={28} className="mx-auto text-amber-500 mb-3" />
      <p className="text-sm font-bold text-[#0F172A]">لا يوجد اشتراك فعّال</p>
      <p className="text-xs text-[#64748B] mt-1">قاعدة المعرفة تحتاج باقة مفعّلة.</p>
    </div>
  ) : (
    <div className="space-y-5">
      {/* عدّاد سعة الباقة */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#253765]/10 text-[#253765] flex items-center justify-center shrink-0">
              <Boxes size={19} />
            </div>
            <div>
              <h2 className="font-black text-sm text-[#0F172A]">المنتجات والخدمات</h2>
              <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed max-w-xl">
                على مستوى حسابك كلّه — كل الكتالوجات تتشارك هذا العدد.
              </p>
            </div>
          </div>
          <div className="text-left shrink-0">
            <p className="text-2xl font-black text-[#0F172A] font-mono">
              {formatArabicNumber(ent.usage.products.used ?? 0)}
              <span className="text-sm text-slate-400">
                {' / '}
                {formatArabicNumber(ent.plan.max_products)}
              </span>
            </p>
            <p className="text-[10px] text-[#64748B] mt-0.5">
              بإمكانك إضافة{' '}
              {formatArabicNumber(
                Math.max(ent.plan.max_products - (ent.usage.products.used ?? 0), 0)
              )}{' '}
              على باقة {ent.plan.name_en}
            </p>
          </div>
        </div>
      </div>

      <CatalogManager
        merchantId={ent.merchant.id}
        planName={ent.plan.name_en}
        productLimit={ent.plan.max_products}
      />

      <CouponsSection merchantId={ent.merchant.id} />
      <BusinessAndDeliverySections merchantId={ent.merchant.id} />
    </div>
  )

  return (
    <WorkspaceShell
      merchantId={ent?.merchant.id ?? ''}
      merchantName={ent?.merchant.name ?? 'التاجر'}
      planName={ent?.plan.name_en ?? null}
      merchants={merchants}
    >
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] tracking-tight">
            المنتجات / الخدمات
          </h1>
          <p className="text-xs text-[#64748B] mt-1">
            قاعدة المعرفة التي يجيب منها موظفك الذكي — لا من التخمين
          </p>
        </div>
        {body}
      </div>
    </WorkspaceShell>
  )
}
