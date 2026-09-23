'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Loader,
  Package,
  Pause,
  Play,
  Plus,
  Store,
  Ticket,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import {
  couponState,
  IRAQI_GOVERNORATES,
  validateCoupon,
  type Coupon,
  type DeliverySettings,
  type MerchantProfile,
} from '@/lib/merchant-settings'
import { formatNumberFor, localizeDigits } from '@/lib/formatters'
import { fill, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'

type Toast = { message: string; type: 'success' | 'error' }

type SettingsCopy = Dictionary['app']['settings']
type GovernorateLabels = Dictionary['app']['booking']['governorates']

/**
 * ⚠️ اللغة تصل خاصيةً لا استيراداً: هذه مكوّنات عميل، والقاموس كله لا يعبر
 * إلى حزمة المتصفّح. و`currency` و`governorates` تأتيان من قاموس الأسعار
 * والحجز فلا يُكتب الرمز ولا أسماء المحافظات في مكانين.
 */
export interface SettingsProps {
  merchantId: string
  locale: Locale
  currency: string
  t: SettingsCopy
  governorates: GovernorateLabels
}

function useToast() {
  const [toast, setToast] = useState<Toast | null>(null)
  const show = useCallback((message: string, type: Toast['type'] = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])
  return { toast, show, clear: () => setToast(null) }
}

function ToastBar({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null
  return (
    <div
      className={`fixed bottom-6 start-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl ${
        toast.type === 'success'
          ? 'border-success-line bg-success-bg text-success-ink'
          : 'border-danger-line bg-danger-bg text-danger-ink'
      }`}
    >
      {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className="text-xs font-semibold">{toast.message}</span>
      <button onClick={onClose} className="text-ink-faint hover:text-ink ms-2">
        <X size={14} />
      </button>
    </div>
  )
}

function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl bg-surface border border-line overflow-hidden">
      <div className="p-5 border-b border-line bg-surface-2 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-text flex items-center justify-center shrink-0">
            <Icon size={19} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-sm text-ink">{title}</h2>
            <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-line text-xs text-ink outline-none focus:border-brand bg-surface'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-ink-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-ink-faint mt-1">{hint}</span>}
    </label>
  )
}

// ============================ الكوبونات ============================

const EMPTY_COUPON = {
  code: '',
  discount_type: 'percent' as 'percent' | 'fixed',
  discount_value: '',
  min_order_iqd: '',
  max_uses: '',
  expires_at: '',
}

/**
 * سجلات الطلبات — خط استقبال مستقل لكل فرع أو نشاط تجاري.
 * الحدّ مفروض بمُحفّز في قاعدة البيانات (plans.max_order_books).
 */
export function OrderBooksSection({
  merchantId,
  limit,
  locale,
  t,
}: {
  merchantId: string
  limit: number
  locale: Locale
  t: SettingsCopy
}) {
  const [books, setBooks] = useState<
    { id: string; name: string; is_default: boolean; orders_count: number }[]
  >([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const { toast, show, clear } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/order-books?merchant_id=${merchantId}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || t.loadFailed)
      setBooks(json.books)
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : t.loadFailed, 'error')
    } finally {
      setLoading(false)
    }
  }, [merchantId, show, t.loadFailed])

  useEffect(() => {
    void (async () => {
      await load()
    })()
  }, [load])

  const full = books.length >= limit

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const res = await fetch('/api/order-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant_id: merchantId, name }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || t.createFailed)
      setNewName('')
      await load()
      show(t.books.created)
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : t.createFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/order-books?id=${id}&merchant_id=${merchantId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || t.deleteFailed)
      await load()
      show(t.books.deleted)
    } catch (err: unknown) {
      show(err instanceof Error ? err.message : t.deleteFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <ToastBar toast={toast} onClose={clear} />
      <SectionCard
        icon={Package}
        title={t.books.title}
        description={fill(t.books.description, {
          used: localizeDigits(books.length, locale),
          limit: localizeDigits(limit, locale),
        })}
      >
        {loading ? (
          <p className="text-xs text-ink-muted py-4 text-center">{t.loading}</p>
        ) : (
          <div className="space-y-3">
            {books.length === 0 && (
              <p className="text-xs text-ink-muted py-2">{t.books.empty}</p>
            )}
            {books.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-line bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-bold text-ink">{b.name}</p>
                    {b.is_default && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand-text text-[10px] font-bold">
                        {t.books.default}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-ink-muted mt-0.5">
                    {fill(t.books.ordersCount, { n: localizeDigits(b.orders_count, locale) })}
                  </p>
                </div>
                <button
                  onClick={() => remove(b.id)}
                  disabled={busy}
                  className="p-2 rounded-lg text-danger-ink hover:bg-danger-bg disabled:opacity-40"
                  title={t.delete}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            {full ? (
              <p className="text-[11px] font-bold text-warn-ink bg-warn-bg border border-warn-line rounded-xl px-3 py-2">
                {fill(t.books.full, { n: localizeDigits(limit, locale) })}
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t.books.newNamePlaceholder}
                  className="flex-1 bg-surface-2 border border-line rounded-xl px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
                <button
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="px-4 py-2 rounded-xl bg-brand text-on-brand text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Plus size={14} />
                  <span>{t.add}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </>
  )
}

export function CouponsSection({ merchantId, locale, currency, t }: Omit<SettingsProps, 'governorates'>) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState(EMPTY_COUPON)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { toast, show, clear } = useToast()
  const c = t.coupons

  const money = (value: number | string | null | undefined) =>
    `${formatNumberFor(locale, Number(value ?? 0))} ${currency}`

  // التحميل داخل دالة غير متزامنة لا في جسم الـ effect مباشرة:
  // setState متزامن هناك يُطلق دورات تصيير متتالية.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/coupons?merchant=${merchantId}`)
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error)
        if (!cancelled) setCoupons(json.coupons as Coupon[])
      } catch (e) {
        if (!cancelled) show(e instanceof Error ? e.message : t.loadFailed, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [merchantId, show, t.loadFailed])

  const handleCreate = async () => {
    const payload = {
      merchantId,
      code: draft.code,
      discount_type: draft.discount_type,
      discount_value: draft.discount_value === '' ? NaN : Number(draft.discount_value),
      min_order_iqd: draft.min_order_iqd === '' ? 0 : Number(draft.min_order_iqd),
      max_uses: draft.max_uses === '' ? null : Number(draft.max_uses),
      expires_at: draft.expires_at || null,
    }

    const errors = validateCoupon(payload)
    if (errors.length > 0) {
      // ⚠️ الرمز لا الرسالة: نصّ الوحدة عربي ثابت، والتاجر قد يعمل بالكردية.
      show(c.errors[errors[0].code], 'error')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      setCoupons((prev) => [json.coupon as Coupon, ...prev])
      setDraft(EMPTY_COUPON)
      setShowForm(false)
      show(c.created)
    } catch (e) {
      show(e instanceof Error ? e.message : t.createFailed, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (coupon: Coupon) => {
    setBusyId(coupon.id)
    try {
      const res = await fetch('/api/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: coupon.id, merchantId, is_active: !coupon.is_active }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      setCoupons((prev) => prev.map((x) => (x.id === coupon.id ? (json.coupon as Coupon) : x)))
    } catch (e) {
      show(e instanceof Error ? e.message : t.updateFailed, 'error')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (coupon: Coupon) => {
    if (!confirm(fill(c.deleteConfirm, { code: coupon.code }))) return
    setBusyId(coupon.id)
    try {
      const res = await fetch(`/api/coupons?id=${coupon.id}&merchant=${merchantId}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      setCoupons((prev) => prev.filter((x) => x.id !== coupon.id))
      show(c.deleted)
    } catch (e) {
      show(e instanceof Error ? e.message : t.deleteFailed, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ToastBar toast={toast} onClose={clear} />
      <SectionCard
        icon={Ticket}
        title={c.title}
        description={c.description}
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-on-brand font-bold text-xs transition shrink-0"
          >
            <Plus size={15} />
            <span>{c.addCoupon}</span>
          </button>
        }
      >
        {showForm && (
          <div className="mb-5 p-4 rounded-xl bg-surface-2 border-2 border-brand">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label={c.code} hint={c.codeHint}>
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME10"
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <Field label={c.discountType}>
                <select
                  value={draft.discount_type}
                  onChange={(e) =>
                    setDraft({ ...draft, discount_type: e.target.value as 'percent' | 'fixed' })
                  }
                  className={inputClass}
                >
                  <option value="percent">{c.typePercent}</option>
                  <option value="fixed">{fill(c.typeFixed, { currency })}</option>
                </select>
              </Field>
              <Field
                label={
                  draft.discount_type === 'percent'
                    ? c.valuePercent
                    : fill(c.valueFixed, { currency })
                }
              >
                <input
                  type="number"
                  min={0}
                  max={draft.discount_type === 'percent' ? 100 : undefined}
                  value={draft.discount_value}
                  onChange={(e) => setDraft({ ...draft, discount_value: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={fill(c.minOrder, { currency })} hint={c.minOrderHint}>
                <input
                  type="number"
                  min={0}
                  value={draft.min_order_iqd}
                  onChange={(e) => setDraft({ ...draft, min_order_iqd: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={c.maxUses} hint={c.maxUsesHint}>
                <input
                  type="number"
                  min={1}
                  value={draft.max_uses}
                  onChange={(e) => setDraft({ ...draft, max_uses: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={c.expiresAt} hint={c.expiresAtHint}>
                <input
                  type="date"
                  value={draft.expires_at}
                  onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleCreate}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-on-brand font-bold text-xs transition"
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                <span>{c.create}</span>
              </button>
              <button
                onClick={() => {
                  setShowForm(false)
                  setDraft(EMPTY_COUPON)
                }}
                className="px-5 py-2 rounded-xl border border-line text-ink-muted font-bold text-xs hover:bg-surface-2 transition"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-xs text-ink-faint flex items-center justify-center gap-2">
            <Loader size={14} className="animate-spin" /> {t.loading}
          </p>
        ) : coupons.length === 0 ? (
          <p className="py-8 text-center text-xs text-ink-muted leading-relaxed">{c.empty}</p>
        ) : (
          <ul className="space-y-2">
            {coupons.map((coupon) => {
              const st = couponState(coupon)
              const busy = busyId === coupon.id
              return (
                <li
                  key={coupon.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-line hover:bg-surface-2 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <code className="px-2.5 py-1 rounded-lg bg-brand text-on-brand font-mono font-bold text-xs shrink-0">
                      {coupon.code}
                    </code>
                    <div className="min-w-0 text-[11px]">
                      <p className="font-bold text-ink">
                        {coupon.discount_type === 'percent'
                          ? fill(c.discountPercent, {
                              value: localizeDigits(coupon.discount_value, locale),
                            })
                          : fill(c.discountFixed, { value: money(coupon.discount_value) })}
                        {Number(coupon.min_order_iqd) > 0 && (
                          <span className="text-ink-muted font-normal">
                            {fill(c.aboveAmount, { amount: money(coupon.min_order_iqd) })}
                          </span>
                        )}
                      </p>
                      <p className="text-ink-muted">
                        {fill(c.usedCount, { used: localizeDigits(coupon.used_count, locale) })}
                        {coupon.max_uses !== null
                          ? fill(c.usedOf, { max: localizeDigits(coupon.max_uses, locale) })
                          : c.usedTimes}
                        {coupon.expires_at &&
                          fill(c.expiresOn, {
                            date: localizeDigits(
                              new Date(coupon.expires_at).toISOString().slice(0, 10),
                              locale
                            ),
                          })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.className}`}
                    >
                      {c.state[st.key]}
                    </span>
                    <button
                      onClick={() => toggleActive(coupon)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-ink-faint hover:text-brand-text hover:bg-surface-3 transition disabled:opacity-50"
                      aria-label={coupon.is_active ? c.pause : c.activate}
                    >
                      {busy ? (
                        <Loader size={14} className="animate-spin" />
                      ) : coupon.is_active ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => remove(coupon)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-ink-faint hover:text-danger-ink hover:bg-danger-bg transition disabled:opacity-50"
                      aria-label={t.delete}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </SectionCard>
    </>
  )
}

// ==================== معلومات النشاط والتوصيل ====================

const EMPTY_PROFILE = {
  about: '',
  working_hours: '',
  contact_phone: '',
  address: '',
  maps_url: '',
  delivery_zone: '',
  current_offers: '',
}

const EMPTY_DELIVERY = {
  base_governorate: 'بغداد',
  local_fee_iqd: '0',
  local_days: '1',
  local_note: '',
  other_fee_iqd: '0',
  other_days: '2',
  other_note: '',
}

export function BusinessAndDeliverySections({
  merchantId,
  currency,
  t,
  governorates,
}: SettingsProps) {
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const { toast, show, clear } = useToast()
  const b = t.business
  const d = t.delivery

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/merchant-settings?merchant=${merchantId}`)
        const json = await res.json()
        if (!res.ok || !json.success) throw new Error(json.error)
        if (cancelled) return

        const p = json.profile as MerchantProfile | null
        if (p) {
          setProfile({
            about: p.about ?? '',
            working_hours: p.working_hours ?? '',
            contact_phone: p.contact_phone ?? '',
            address: p.address ?? '',
            maps_url: p.maps_url ?? '',
            delivery_zone: p.delivery_zone ?? '',
            current_offers: p.current_offers ?? '',
          })
        }

        const del = json.delivery as DeliverySettings | null
        if (del) {
          setDelivery({
            base_governorate: del.base_governorate,
            local_fee_iqd: String(del.local_fee_iqd),
            local_days: String(del.local_days),
            local_note: del.local_note ?? '',
            other_fee_iqd: String(del.other_fee_iqd),
            other_days: String(del.other_days),
            other_note: del.other_note ?? '',
          })
        }
      } catch (e) {
        if (!cancelled) show(e instanceof Error ? e.message : t.loadFailed, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [merchantId, show, t.loadFailed])

  const save = async (section: 'profile' | 'delivery') => {
    const setBusy = section === 'profile' ? setSavingProfile : setSavingDelivery
    setBusy(true)
    try {
      const data =
        section === 'profile'
          ? profile
          : {
              ...delivery,
              local_fee_iqd: Number(delivery.local_fee_iqd || 0),
              local_days: Number(delivery.local_days || 0),
              other_fee_iqd: Number(delivery.other_fee_iqd || 0),
              other_days: Number(delivery.other_days || 0),
            }

      const res = await fetch('/api/merchant-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, section, data }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      show(section === 'profile' ? b.saved : d.saved)
    } catch (e) {
      show(e instanceof Error ? e.message : t.saveFailed, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-surface border border-line py-12 text-center">
        <Loader size={18} className="animate-spin mx-auto text-ink-faint" />
      </div>
    )
  }

  const baseLabel =
    governorates[delivery.base_governorate as keyof GovernorateLabels] ??
    delivery.base_governorate

  return (
    <>
      <ToastBar toast={toast} onClose={clear} />

      <SectionCard icon={Store} title={b.title} description={b.description}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
            <Field label={b.about}>
              <textarea
                rows={3}
                value={profile.about}
                onChange={(e) => setProfile({ ...profile, about: e.target.value })}
                placeholder={b.aboutPlaceholder}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>
          <Field label={b.hours}>
            <input
              value={profile.working_hours}
              onChange={(e) => setProfile({ ...profile, working_hours: e.target.value })}
              placeholder={b.hoursPlaceholder}
              className={inputClass}
            />
          </Field>
          <Field label={b.phone}>
            <input
              value={profile.contact_phone}
              onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
              placeholder={b.phonePlaceholder}
              className={inputClass}
            />
          </Field>
          <Field label={b.address}>
            <input
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              placeholder={b.addressPlaceholder}
              className={inputClass}
            />
          </Field>
          <Field label={b.mapsUrl}>
            <input
              value={profile.maps_url}
              onChange={(e) => setProfile({ ...profile, maps_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/…"
              dir="ltr"
              className={`${inputClass} text-left`}
            />
          </Field>
          <Field label={b.deliveryZone}>
            <input
              value={profile.delivery_zone}
              onChange={(e) => setProfile({ ...profile, delivery_zone: e.target.value })}
              placeholder={b.deliveryZonePlaceholder}
              className={inputClass}
            />
          </Field>
          <Field label={b.offers}>
            <input
              value={profile.current_offers}
              onChange={(e) => setProfile({ ...profile, current_offers: e.target.value })}
              placeholder={b.offersPlaceholder}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-3">
          <p className="text-[10px] text-ink-faint leading-relaxed">{b.footnote}</p>
          <button
            onClick={() => save('profile')}
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-on-brand font-bold text-xs transition shrink-0"
          >
            {savingProfile ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            <span>{b.save}</span>
          </button>
        </div>
      </SectionCard>

      <SectionCard icon={Truck} title={d.title} description={d.description}>
        <Field label={d.baseGovernorate} hint={d.baseGovernorateHint}>
          <select
            value={delivery.base_governorate}
            onChange={(e) => setDelivery({ ...delivery, base_governorate: e.target.value })}
            className={`${inputClass} sm:max-w-xs`}
          >
            {IRAQI_GOVERNORATES.map((g) => (
              <option key={g} value={g}>
                {governorates[g as keyof GovernorateLabels] ?? g}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="p-4 rounded-xl bg-surface-2 border border-line">
            <p className="font-bold text-xs text-ink mb-3">
              {fill(d.insideBase, { name: baseLabel })}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={fill(d.fee, { currency })}>
                <input
                  type="number"
                  min={0}
                  value={delivery.local_fee_iqd}
                  onChange={(e) => setDelivery({ ...delivery, local_fee_iqd: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={d.days}>
                <input
                  type="number"
                  min={0}
                  value={delivery.local_days}
                  onChange={(e) => setDelivery({ ...delivery, local_days: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={d.note}>
                <input
                  value={delivery.local_note}
                  onChange={(e) => setDelivery({ ...delivery, local_note: e.target.value })}
                  placeholder={d.localNotePlaceholder}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-surface-2 border border-line">
            <p className="font-bold text-xs text-ink mb-3">{d.restOfIraq}</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={fill(d.fee, { currency })}>
                <input
                  type="number"
                  min={0}
                  value={delivery.other_fee_iqd}
                  onChange={(e) => setDelivery({ ...delivery, other_fee_iqd: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label={d.days}>
                <input
                  type="number"
                  min={0}
                  value={delivery.other_days}
                  onChange={(e) => setDelivery({ ...delivery, other_days: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label={d.note}>
                <input
                  value={delivery.other_note}
                  onChange={(e) => setDelivery({ ...delivery, other_note: e.target.value })}
                  placeholder={d.otherNotePlaceholder}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-3">
          <p className="text-[10px] text-ink-faint leading-relaxed">{d.footnote}</p>
          <button
            onClick={() => save('delivery')}
            disabled={savingDelivery}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-on-brand font-bold text-xs transition shrink-0"
          >
            {savingDelivery ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            <span>{d.save}</span>
          </button>
        </div>
      </SectionCard>
    </>
  )
}
