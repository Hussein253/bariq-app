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
import { formatNumberFor, localizeDigits } from '@/lib/formatters'
import { fill, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'

type Toast = { message: string; type: 'success' | 'error' }
type CatalogCopy = Dictionary['app']['catalog']

const EMPTY_DRAFT = { name: '', color: '', size: '', price_iqd: '', stock: '' }

/** الحدّ الأقصى لاسم المنتج — نفس الرقم المُتحقَّق منه في lib/catalog. */
const NAME_MAX = 200

export default function CatalogManager({
  merchantId,
  planName,
  productLimit,
  locale,
  currency,
  t,
}: {
  merchantId: string
  planName: string
  productLimit: number
  locale: Locale
  currency: string
  /** ⚠️ خاصية لا استيراد: مكوّن عميل، والقاموس كله لا يعبر إلى المتصفّح. */
  t: CatalogCopy
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
      if (!res.ok || !json.success) throw new Error(json.error || t.errors.loadFailed)
      setProducts(json.products as Product[])
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t.errors.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [merchantId, t.errors.loadFailed])

  // التحميل داخل دالة غير متزامنة لا في جسم الـ effect مباشرة:
  // setState متزامن هناك يُطلق دورات تصيير متتالية.
  useEffect(() => {
    void (async () => {
      await load()
    })()
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
      // ⚠️ الرمز لا الرسالة: نصّ الوحدة عربي ثابت، والتاجر قد يعمل بالكردية.
      const first = errors[0]
      showToast(
        first.code === 'nameTooLong'
          ? fill(t.errors.nameTooLong, { n: localizeDigits(NAME_MAX, locale) })
          : t.errors[first.code],
        'error'
      )
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
      if (!res.ok || !json.success) throw new Error(json.error || t.errors.addFailed)

      setProducts((prev) => [json.product as Product, ...prev])
      setDraft(EMPTY_DRAFT)
      setShowForm(false)
      showToast(t.toastAdded)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.errors.addFailed, 'error')
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
      if (!res.ok || !json.success) throw new Error(json.error || t.errors.updateFailed)

      setProducts((prev) => prev.map((p) => (p.id === id ? (json.product as Product) : p)))
      showToast(t.toastUpdated)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.errors.updateFailed, 'error')
      load()
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (p: Product) => {
    if (!confirm(fill(t.deleteConfirm, { name: p.name ?? '' }))) return

    setBusyId(p.id)
    try {
      const res = await fetch(`/api/catalog?id=${p.id}&merchant=${merchantId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || t.errors.deleteFailed)

      setProducts((prev) => prev.filter((x) => x.id !== p.id))
      showToast(t.toastDeleted)
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.errors.deleteFailed, 'error')
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

  const totalValue = filtered.reduce(
    (sum, p) => sum + Number(p.price_iqd || 0) * Number(p.stock || 0),
    0
  )

  return (
    <div>
      {toast && (
        <div
          className={`fixed bottom-6 start-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl ${
            toast.type === 'success'
              ? 'border-success-line bg-success-bg text-success-ink'
              : 'border-danger-line bg-danger-bg text-danger-ink'
          }`}
        >
          {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-ink-faint hover:text-ink ms-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* شريط السعة والإجراءات */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-xs">
            <span className="text-ink-muted font-semibold">
              {fill(t.capacity, { plan: planName })}
            </span>
            <span className={`font-black font-mono ${atLimit ? 'text-danger-ink' : 'text-ink'}`}>
              {formatNumberFor(locale, products.length)} / {formatNumberFor(locale, productLimit)}
            </span>
          </div>
          {atLimit && (
            <span className="px-2 py-0.5 rounded-full bg-danger-bg border border-danger-line text-danger-ink text-[10px] font-black">
              {t.atLimit}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-48 ps-9 pe-3 py-2 rounded-xl border border-line text-xs outline-none focus:border-brand bg-surface"
            />
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            disabled={atLimit}
            title={
              atLimit
                ? fill(t.atLimitTitle, {
                    plan: planName,
                    n: formatNumberFor(locale, productLimit),
                  })
                : undefined
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-on-brand font-bold text-xs transition shrink-0"
          >
            <Plus size={15} />
            <span>{t.addProduct}</span>
          </button>
        </div>
      </div>

      {/* نموذج الإضافة */}
      {showForm && !atLimit && (
        <div className="mb-5 p-5 rounded-2xl bg-surface border-2 border-brand">
          <h3 className="font-bold text-sm text-ink mb-4">{t.newProduct}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t.fieldName}
              className="px-3 py-2 rounded-xl border border-line text-xs outline-none focus:border-brand lg:col-span-2 bg-surface text-ink"
            />
            <input
              value={draft.color}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              placeholder={t.fieldColor}
              className="px-3 py-2 rounded-xl border border-line text-xs outline-none focus:border-brand bg-surface text-ink"
            />
            <input
              value={draft.size}
              onChange={(e) => setDraft({ ...draft, size: e.target.value })}
              placeholder={t.fieldSize}
              className="px-3 py-2 rounded-xl border border-line text-xs outline-none focus:border-brand bg-surface text-ink"
            />
            <input
              value={draft.price_iqd}
              onChange={(e) => setDraft({ ...draft, price_iqd: e.target.value })}
              type="number"
              min={0}
              placeholder={fill(t.fieldPrice, { currency })}
              className="px-3 py-2 rounded-xl border border-line text-xs outline-none focus:border-brand bg-surface text-ink"
            />
            <input
              value={draft.stock}
              onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
              type="number"
              min={0}
              placeholder={t.fieldStock}
              className="px-3 py-2 rounded-xl border border-line text-xs outline-none focus:border-brand bg-surface text-ink"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-on-brand font-bold text-xs transition"
            >
              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{t.save}</span>
            </button>
            <button
              onClick={() => {
                setShowForm(false)
                setDraft(EMPTY_DRAFT)
              }}
              className="px-5 py-2 rounded-xl border border-line text-ink-muted font-bold text-xs hover:bg-surface-2 transition"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* الجدول */}
      <div className="rounded-2xl bg-surface border border-line overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-ink-faint text-xs flex items-center justify-center gap-2">
            <Loader size={15} className="animate-spin" />
            <span>{t.loading}</span>
          </div>
        ) : loadError ? (
          <div className="py-12 text-center">
            <AlertCircle size={24} className="mx-auto text-danger-ink mb-2" />
            <p className="text-xs text-danger-ink font-semibold">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Package size={28} className="mx-auto text-ink-faint mb-3" />
            <p className="text-sm font-bold text-ink">
              {products.length === 0 ? t.emptyTitle : t.noMatchTitle}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {products.length === 0 ? t.emptyBody : t.noMatchBody}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="text-ink-muted bg-surface-2 border-b border-line font-semibold">
                  <th className="p-3.5 text-start">{t.colProduct}</th>
                  <th className="p-3.5 text-start">{t.colVariant}</th>
                  <th className="p-3.5 text-start">{fill(t.colPrice, { currency })}</th>
                  <th className="p-3.5 text-start">{t.colStock}</th>
                  <th className="p-3.5 text-start">{t.colStatus}</th>
                  <th className="p-3.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const st = displayStatus(p)
                  const busy = busyId === p.id
                  return (
                    <tr key={p.id} className="border-b border-line hover:bg-surface-2">
                      <td className="p-3.5 font-bold text-ink">{p.name || '—'}</td>
                      <td className="p-3.5 text-ink-muted">
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
                          className="w-28 px-2 py-1 rounded-lg border border-transparent hover:border-line focus:border-brand outline-none font-mono disabled:opacity-50 bg-transparent text-ink"
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
                          className="w-20 px-2 py-1 rounded-lg border border-transparent hover:border-line focus:border-brand outline-none font-mono disabled:opacity-50 bg-transparent text-ink"
                        />
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.className}`}
                        >
                          {t.status[st.key]}
                        </span>
                      </td>
                      <td className="p-3.5 text-end">
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-ink-faint hover:text-danger-ink hover:bg-danger-bg transition disabled:opacity-50"
                          aria-label={fill(t.deleteLabel, { name: p.name ?? '' })}
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

      <p className="mt-3 text-[11px] text-ink-muted leading-relaxed">
        {fill(t.footer, {
          total: `${formatNumberFor(locale, totalValue)} ${currency}`,
          n: localizeDigits(filtered.length, locale),
        })}
      </p>
    </div>
  )
}
