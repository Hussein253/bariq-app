'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Loader,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { displayStatus, validateProduct, type Product } from '@/lib/catalog'
import { formatArabicCurrency, formatArabicNumber, toArabicDigits } from '@/lib/formatters'

type Toast = { message: string; type: 'success' | 'error' }

const EMPTY_DRAFT = { name: '', color: '', size: '', price_iqd: '', stock: '' }

export default function CatalogManager({
  merchantId,
  planName,
  productLimit,
}: {
  merchantId: string
  planName: string
  productLimit: number
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = (message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/catalog?merchant=${merchantId}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذّر التحميل')
      setProducts(json.products as Product[])
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'تعذّر تحميل قاعدة المعرفة')
    } finally {
      setLoading(false)
    }
  }, [merchantId])

  useEffect(() => {
    load()
  }, [load])

  const atLimit = products.length >= productLimit

  const handleAdd = async () => {
    const parsed = {
      name: draft.name,
      color: draft.color,
      size: draft.size,
      price_iqd: draft.price_iqd === '' ? NaN : Number(draft.price_iqd),
      stock: draft.stock === '' ? NaN : Number(draft.stock),
    }

    const errors = validateProduct(parsed)
    if (errors.length > 0) {
      showToast(errors[0].message, 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, ...parsed }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذّرت الإضافة')

      setProducts((prev) => [json.product as Product, ...prev])
      setDraft(EMPTY_DRAFT)
      setShowForm(false)
      showToast('أُضيف المنتج إلى قاعدة المعرفة')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تعذّرت الإضافة', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePatch = async (id: number, patch: { price_iqd?: number; stock?: number }) => {
    setBusyId(id)
    try {
      const res = await fetch('/api/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, merchantId, ...patch }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذّر التحديث')

      setProducts((prev) => prev.map((p) => (p.id === id ? (json.product as Product) : p)))
      showToast('حُدِّث المنتج')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تعذّر التحديث', 'error')
      load()
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (p: Product) => {
    if (!confirm(`حذف "${p.name}" من قاعدة المعرفة؟ لن يعود الموظف الذكي يذكره للزبائن.`)) return

    setBusyId(p.id)
    try {
      const res = await fetch(`/api/catalog?id=${p.id}&merchant=${merchantId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذّر الحذف')

      setProducts((prev) => prev.filter((x) => x.id !== p.id))
      showToast('حُذف المنتج')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تعذّر الحذف', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase()
    return (
      !q ||
      (p.name || '').toLowerCase().includes(q) ||
      (p.color || '').toLowerCase().includes(q) ||
      (p.size || '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl ${
            toast.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-700 mr-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* شريط السعة والإجراءات */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-xs">
            <span className="text-[#64748B] font-semibold">سعة باقة {planName}: </span>
            <span className={`font-black font-mono ${atLimit ? 'text-rose-700' : 'text-[#0F172A]'}`}>
              {formatArabicNumber(products.length)} / {formatArabicNumber(productLimit)}
            </span>
          </div>
          {atLimit && (
            <span className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-black">
              بلغت الحدّ
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث في المنتجات..."
              className="w-48 pr-9 pl-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765] bg-white"
            />
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            disabled={atLimit}
            title={atLimit ? `باقة ${planName} تسمح بـ ${productLimit} منتج` : undefined}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs transition shrink-0"
          >
            <Plus size={15} />
            <span>إضافة منتج</span>
          </button>
        </div>
      </div>

      {/* نموذج الإضافة */}
      {showForm && !atLimit && (
        <div className="mb-5 p-5 rounded-2xl bg-white border-2 border-[#253765]">
          <h3 className="font-bold text-sm text-[#0F172A] mb-4">منتج جديد</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="اسم المنتج *"
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765] lg:col-span-2"
            />
            <input
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              placeholder="اللون"
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765]"
            />
            <input
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              placeholder="القياس"
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765]"
            />
            <input
              value={draft.price_iqd}
              onChange={(e) => setDraft({ ...draft, price_iqd: e.target.value })}
              type="number"
              min={0}
              placeholder="السعر (د.ع) *"
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765]"
            />
            <input
              value={draft.stock}
              onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
              type="number"
              min={0}
              placeholder="الكمية *"
              className="px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765]"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-xs transition"
            >
              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              <span>حفظ</span>
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setDraft(EMPTY_DRAFT)
              }}
              className="px-5 py-2 rounded-xl border border-[#E2E8F0] text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader size={15} className="animate-spin" />
            <span>جاري التحميل...</span>
          </div>
        ) : loadError ? (
          <div className="py-12 text-center">
            <AlertCircle size={24} className="mx-auto text-rose-400 mb-2" />
            <p className="text-xs text-rose-700 font-semibold">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm font-bold text-[#0F172A]">
              {products.length === 0 ? 'قاعدة المعرفة فارغة' : 'لا نتيجة مطابقة'}
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              {products.length === 0
                ? 'أضِف منتجاتك ليجيب الموظف الذكي عنها بدقّة بدل التخمين.'
                : 'جرّب كلمة بحث أخرى.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="text-[#64748B] bg-[#F8FAFC] border-b border-[#E2E8F0] font-semibold">
                  <th className="p-3.5">المنتج</th>
                  <th className="p-3.5">اللون والقياس</th>
                  <th className="p-3.5">السعر (د.ع)</th>
                  <th className="p-3.5">المخزون</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const st = displayStatus(p)
                  const busy = busyId === p.id
                  return (
                    <tr key={p.id} className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                      <td className="p-3.5 font-bold text-[#0F172A]">{p.name || '—'}</td>
                      <td className="p-3.5 text-slate-600">
                        {[p.color, p.size].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="p-3.5">
                        <input
                          type="number"
                          min={0}
                          defaultValue={p.price_iqd ?? 0}
                          disabled={busy}
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v !== Number(p.price_iqd)) handlePatch(p.id, { price_iqd: v })
                          }}
                          className="w-28 px-2 py-1 rounded-lg border border-transparent hover:border-[#E2E8F0] focus:border-[#253765] outline-none font-mono disabled:opacity-50"
                        />
                      </td>
                      <td className="p-3.5">
                        <input
                          type="number"
                          min={0}
                          defaultValue={p.stock ?? 0}
                          disabled={busy}
                          onBlur={(e) => {
                            const v = Number(e.target.value)
                            if (v !== Number(p.stock)) handlePatch(p.id, { stock: v })
                          }}
                          className="w-20 px-2 py-1 rounded-lg border border-transparent hover:border-[#E2E8F0] focus:border-[#253765] outline-none font-mono disabled:opacity-50"
                        />
                      </td>
                      <td className="p-3.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.className}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-left">
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                          aria-label={`حذف ${p.name}`}
                        >
                          {busy ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
        السعر والمخزون يُحفظان فور مغادرة الحقل. إجمالي القيمة المعروضة:{' '}
        <strong className="text-[#0F172A]">
          {formatArabicCurrency(
            filtered.reduce((sum, p) => sum + Number(p.price_iqd || 0) * Number(p.stock || 0), 0)
          )}
        </strong>{' '}
        عبر {toArabicDigits(filtered.length)} منتج.
      </p>
    </div>
  )
}
