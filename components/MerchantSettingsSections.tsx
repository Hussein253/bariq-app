'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Loader,
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
import { formatArabicCurrency, toArabicDigits } from '@/lib/formatters'

type Toast = { message: string; type: 'success' | 'error' }

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
      className={`fixed bottom-6 left-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl ${
        toast.type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >
      {toast.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
      <span className="text-xs font-semibold">{toast.message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-700 mr-2">
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
    <section className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
      <div className="p-5 border-b border-[#E2E8F0] bg-[#FAFAFA] flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[#253765]/10 text-[#253765] flex items-center justify-center shrink-0">
            <Icon size={19} />
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-sm text-[#0F172A]">{title}</h2>
            <p className="text-[11px] text-[#64748B] mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs outline-none focus:border-[#253765] bg-white'

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
      <span className="block text-[11px] font-bold text-[#475569] mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-slate-400 mt-1">{hint}</span>}
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

export function CouponsSection({ merchantId }: { merchantId: string }) {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [draft, setDraft] = useState(EMPTY_COUPON)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { toast, show, clear } = useToast()

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
        if (!cancelled) show(e instanceof Error ? e.message : 'تعذّر تحميل الكوبونات', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [merchantId, show])

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
      show(errors[0].message, 'error')
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
      show('أُنشئ الكوبون')
    } catch (e) {
      show(e instanceof Error ? e.message : 'تعذّر الإنشاء', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (c: Coupon) => {
    setBusyId(c.id)
    try {
      const res = await fetch('/api/coupons', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, merchantId, is_active: !c.is_active }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      setCoupons((prev) => prev.map((x) => (x.id === c.id ? (json.coupon as Coupon) : x)))
    } catch (e) {
      show(e instanceof Error ? e.message : 'تعذّر التحديث', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (c: Coupon) => {
    if (!confirm(`حذف الكوبون ${c.code}؟`)) return
    setBusyId(c.id)
    try {
      const res = await fetch(`/api/coupons?id=${c.id}&merchant=${merchantId}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error)
      setCoupons((prev) => prev.filter((x) => x.id !== c.id))
      show('حُذف الكوبون')
    } catch (e) {
      show(e instanceof Error ? e.message : 'تعذّر الحذف', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <ToastBar toast={toast} onClose={clear} />
      <SectionCard
        icon={Ticket}
        title="الكوبونات"
        description="أكواد الخصم التي يطبّقها الموظف الذكي على الطلبات داخل المحادثة."
        action={
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] text-white font-bold text-xs transition shrink-0"
          >
            <Plus size={15} />
            <span>إضافة كوبون</span>
          </button>
        }
      >
        {showForm && (
          <div className="mb-5 p-4 rounded-xl bg-[#F8FAFC] border-2 border-[#253765]">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="الرمز *" hint="حروف لاتينية وأرقام، مثل WELCOME10">
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
                  placeholder="WELCOME10"
                  className={`${inputClass} font-mono`}
                />
              </Field>
              <Field label="نوع الخصم *">
                <select
                  value={draft.discount_type}
                  onChange={(e) =>
                    setDraft({ ...draft, discount_type: e.target.value as 'percent' | 'fixed' })
                  }
                  className={inputClass}
                >
                  <option value="percent">نسبة مئوية (٪)</option>
                  <option value="fixed">مبلغ ثابت (د.ع)</option>
                </select>
              </Field>
              <Field label={draft.discount_type === 'percent' ? 'النسبة (٪) *' : 'المبلغ (د.ع) *'}>
                <input
                  type="number"
                  min={0}
                  max={draft.discount_type === 'percent' ? 100 : undefined}
                  value={draft.discount_value}
                  onChange={(e) => setDraft({ ...draft, discount_value: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="الحد الأدنى للطلب (د.ع)" hint="اتركه فارغاً لبلا حدّ">
                <input
                  type="number"
                  min={0}
                  value={draft.min_order_iqd}
                  onChange={(e) => setDraft({ ...draft, min_order_iqd: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="عدد مرات الاستخدام" hint="اتركه فارغاً لاستخدام غير محدود">
                <input
                  type="number"
                  min={1}
                  value={draft.max_uses}
                  onChange={(e) => setDraft({ ...draft, max_uses: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="تاريخ الانتهاء" hint="اتركه فارغاً لبلا انتهاء">
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
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-xs transition"
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                <span>إنشاء</span>
              </button>
              <button
                onClick={() => {
                  setShowForm(false)
                  setDraft(EMPTY_COUPON)
                }}
                className="px-5 py-2 rounded-xl border border-[#E2E8F0] text-slate-600 font-bold text-xs hover:bg-slate-50 transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader size={14} className="animate-spin" /> جاري التحميل...
          </p>
        ) : coupons.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500 leading-relaxed">
            لا توجد كوبونات بعد. أنشئ أكواد خصم يستطيع الموظف الذكي تطبيقها على الطلبات.
          </p>
        ) : (
          <ul className="space-y-2">
            {coupons.map((c) => {
              const st = couponState(c)
              const busy = busyId === c.id
              return (
                <li
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[#E2E8F0] hover:bg-[#F8FAFC] transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <code className="px-2.5 py-1 rounded-lg bg-[#253765] text-white font-mono font-bold text-xs shrink-0">
                      {c.code}
                    </code>
                    <div className="min-w-0 text-[11px]">
                      <p className="font-bold text-[#0F172A]">
                        {c.discount_type === 'percent'
                          ? `خصم ${toArabicDigits(c.discount_value)}٪`
                          : `خصم ${formatArabicCurrency(c.discount_value)}`}
                        {Number(c.min_order_iqd) > 0 && (
                          <span className="text-slate-500 font-normal">
                            {' '}· فوق {formatArabicCurrency(c.min_order_iqd)}
                          </span>
                        )}
                      </p>
                      <p className="text-slate-500">
                        استُخدم {toArabicDigits(c.used_count)}
                        {c.max_uses !== null ? ` من ${toArabicDigits(c.max_uses)}` : ' مرة'}
                        {c.expires_at &&
                          ` · ينتهي ${toArabicDigits(new Date(c.expires_at).toLocaleDateString('ar-IQ'))}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.className}`}>
                      {st.label}
                    </span>
                    <button
                      onClick={() => toggleActive(c)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-[#253765] hover:bg-slate-100 transition disabled:opacity-50"
                      aria-label={c.is_active ? 'إيقاف' : 'تفعيل'}
                    >
                      {busy ? (
                        <Loader size={14} className="animate-spin" />
                      ) : c.is_active ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => remove(c)}
                      disabled={busy}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-50"
                      aria-label="حذف"
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

export function BusinessAndDeliverySections({ merchantId }: { merchantId: string }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [delivery, setDelivery] = useState(EMPTY_DELIVERY)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingDelivery, setSavingDelivery] = useState(false)
  const { toast, show, clear } = useToast()

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

        const d = json.delivery as DeliverySettings | null
        if (d) {
          setDelivery({
            base_governorate: d.base_governorate,
            local_fee_iqd: String(d.local_fee_iqd),
            local_days: String(d.local_days),
            local_note: d.local_note ?? '',
            other_fee_iqd: String(d.other_fee_iqd),
            other_days: String(d.other_days),
            other_note: d.other_note ?? '',
          })
        }
      } catch (e) {
        if (!cancelled) show(e instanceof Error ? e.message : 'تعذّر التحميل', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [merchantId, show])

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
      show(section === 'profile' ? 'حُفظت معلومات النشاط' : 'حُفظت قواعد التوصيل')
    } catch (e) {
      show(e instanceof Error ? e.message : 'تعذّر الحفظ', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-white border border-[#E2E8F0] py-12 text-center">
        <Loader size={18} className="animate-spin mx-auto text-slate-400" />
      </div>
    )
  }

  return (
    <>
      <ToastBar toast={toast} onClose={clear} />

      <SectionCard
        icon={Store}
        title="معلومات النشاط"
        description="تفاصيل يشاركها موظفك الذكي حين يسأل الزبائن عن نشاطك — الدوام والموقع والعروض ومنطقة التوصيل."
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="lg:col-span-2">
            <Field label="نبذة عن نشاطك">
              <textarea
                rows={3}
                value={profile.about}
                onChange={(e) => setProfile({ ...profile, about: e.target.value })}
                placeholder="ماذا تقدّم، تخصصك، أي شيء يهم الزبون…"
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>
          <Field label="ساعات الدوام">
            <input
              value={profile.working_hours}
              onChange={(e) => setProfile({ ...profile, working_hours: e.target.value })}
              placeholder="مثال: السبت–الخميس، ١٠ص–١٠م"
              className={inputClass}
            />
          </Field>
          <Field label="هاتف التواصل">
            <input
              value={profile.contact_phone}
              onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
              placeholder="مثال: ٠٧٧٠…"
              className={inputClass}
            />
          </Field>
          <Field label="الموقع">
            <input
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              placeholder="مثال: بغداد، الكرادة، قرب…"
              className={inputClass}
            />
          </Field>
          <Field label="رابط الخرائط">
            <input
              value={profile.maps_url}
              onChange={(e) => setProfile({ ...profile, maps_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/…"
              dir="ltr"
              className={`${inputClass} text-left`}
            />
          </Field>
          <Field label="منطقة التوصيل">
            <input
              value={profile.delivery_zone}
              onChange={(e) => setProfile({ ...profile, delivery_zone: e.target.value })}
              placeholder="مثال: كل العراق / بغداد فقط"
              className={inputClass}
            />
          </Field>
          <Field label="العروض الحالية">
            <input
              value={profile.current_offers}
              onChange={(e) => setProfile({ ...profile, current_offers: e.target.value })}
              placeholder="مثال: خصم ١٠٪ هذا الأسبوع، توصيل مجاني فوق ٥٠,٠٠٠ د.ع"
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-5 pt-4 border-t border-[#F1F5F9] flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            يستعمل موظفك الذكي هذه المعلومات للإجابة عن الأسئلة حول نشاطك.
          </p>
          <button
            onClick={() => save('profile')}
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-xs transition shrink-0"
          >
            {savingProfile ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            <span>حفظ معلومات النشاط</span>
          </button>
        </div>
      </SectionCard>

      <SectionCard
        icon={Truck}
        title="إعدادات التوصيل"
        description="تكاليف ومدد التوصيل التي يعلنها موظفك الذكي للزبائن. مستقلة عن تسعيرة برق الداخلية للمناديب."
      >
        <Field label="محافظة الانطلاق" hint="التوصيل داخلها بالسعر الأول، وبقية المحافظات بالسعر الثاني.">
          <select
            value={delivery.base_governorate}
            onChange={(e) => setDelivery({ ...delivery, base_governorate: e.target.value })}
            className={`${inputClass} sm:max-w-xs`}
          >
            {IRAQI_GOVERNORATES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </Field>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <p className="font-bold text-xs text-[#0F172A] mb-3">
              التوصيل داخل {delivery.base_governorate}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الأجرة (د.ع)">
                <input
                  type="number"
                  min={0}
                  value={delivery.local_fee_iqd}
                  onChange={(e) => setDelivery({ ...delivery, local_fee_iqd: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="المدة (أيام)">
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
              <Field label="ملاحظة">
                <input
                  value={delivery.local_note}
                  onChange={(e) => setDelivery({ ...delivery, local_note: e.target.value })}
                  placeholder="مثال: نفس اليوم إذا تم الطلب قبل الساعة ٢ ظهراً"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <p className="font-bold text-xs text-[#0F172A] mb-3">باقي العراق (المحافظات الأخرى)</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الأجرة (د.ع)">
                <input
                  type="number"
                  min={0}
                  value={delivery.other_fee_iqd}
                  onChange={(e) => setDelivery({ ...delivery, other_fee_iqd: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="المدة (أيام)">
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
              <Field label="ملاحظة">
                <input
                  value={delivery.other_note}
                  onChange={(e) => setDelivery({ ...delivery, other_note: e.target.value })}
                  placeholder="مثال: باستثناء المناطق النائية"
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-[#F1F5F9] flex items-center justify-between gap-3">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            تُدرج هذه القواعد في توجيهات الموظف الذكي المرتبط بهذا الكتالوج.
          </p>
          <button
            onClick={() => save('delivery')}
            disabled={savingDelivery}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#253765] hover:bg-[#1D2B50] disabled:opacity-50 text-white font-bold text-xs transition shrink-0"
          >
            {savingDelivery ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
            <span>حفظ قواعد التوصيل</span>
          </button>
        </div>
      </SectionCard>
    </>
  )
}
