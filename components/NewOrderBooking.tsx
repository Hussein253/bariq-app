'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, PackagePlus, RefreshCw, AlertCircle } from 'lucide-react'
import type { Shipment } from '@/lib/shipments'
import { formatArabicCurrency } from '@/lib/formatters'
import { PrintStickerButton } from '@/components/ShipmentSticker'

/**
 * نموذج حجز طلب جديد
 * ===================
 * يُدرج عبر POST /api/orders/book (خادم بمفتاح service_role) لا من المتصفح:
 * صلاحيات anon على orders و shipments مسحوبة بالترحيلات 005–007.
 * رقم التتبع BRQ-XXXXXX تولّده قاعدة البيانات، لا الواجهة.
 */

const GOVERNORATES = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك',
  'ديالى', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'واسط', 'ميسان',
  'ذي قار', 'المثنى', 'القادسية', 'صلاح الدين',
]

const CONTENT_SUGGESTIONS = ['ملابس', 'عطور', 'إلكترونيات', 'مستحضرات تجميل', 'أحذية', 'إكسسوارات']

interface BookedResult {
  shipment: Shipment
  orderContent: string
}

const EMPTY_FORM = {
  customer_name: '',
  phone_number: '',
  governorate: 'بغداد',
  district: '',
  full_address: '',
  nearest_landmark: '',
  order_content: '',
  cod_amount_iqd: '',
  delivery_fee_iqd: '',
  notes: '',
}

export default function NewOrderBooking() {
  const router = useRouter()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<BookedResult | null>(null)

  const set = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/orders/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          cod_amount_iqd: Number(form.cod_amount_iqd || 0),
          delivery_fee_iqd: Number(form.delivery_fee_iqd || 0),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذر حجز الطلب')

      setBooked({ shipment: json.shipment as Shipment, orderContent: json.order_content })
      setForm({ ...EMPTY_FORM })
      router.refresh() // تحديث قائمة الشحنات في اللوحة
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'تعذر حجز الطلب'
      console.error('[NEW_ORDER][SUBMIT]', msg)
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ==================================================================
  // شاشة النجاح — رقم التتبع + طباعة فورية للستيكر
  // ==================================================================
  if (booked) {
    return (
      <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-[#0F172A]">تم حجز الطلب بنجاح</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              الشحنة جاهزة — اطبع الستيكر وألصقه على الطرد قبل تسليمه للمندوب.
            </p>
          </div>
        </div>

        <div className="rounded-xl border-2 border-[#253765] bg-[#253765]/5 p-4 text-center mb-4">
          <p className="text-[10px] font-bold text-[#253765] mb-1">رقم التتبع</p>
          <p className="text-2xl font-black text-[#253765] font-mono tracking-wider" dir="ltr">
            {booked.shipment.tracking_number}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] mb-4">
          <Cell label="الزبون" value={booked.shipment.recipient_name} />
          <Cell label="الهاتف" value={booked.shipment.recipient_phone} ltr />
          <Cell
            label="الوجهة"
            value={`${booked.shipment.governorate}${booked.shipment.district ? ' — ' + booked.shipment.district : ''}`}
          />
          <Cell label="محتوى الطلب" value={booked.orderContent} />
          <Cell label="مبلغ الطلب" value={formatArabicCurrency(booked.shipment.cod_amount_iqd)} />
          <Cell label="أجرة التوصيل" value={formatArabicCurrency(booked.shipment.delivery_fee_iqd)} />
        </div>

        <div className="space-y-2">
          <PrintStickerButton
            shipment={booked.shipment}
            merchantName={booked.shipment.merchant_name}
            orderContent={booked.orderContent}
            label="طباعة ستيكر الشحنة"
          />
          <button
            onClick={() => setBooked(null)}
            className="w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] text-xs font-bold text-[#253765] hover:bg-[#F1F5F9] transition"
          >
            حجز طلب آخر
          </button>
        </div>
      </div>
    )
  }

  // ==================================================================
  // النموذج
  // ==================================================================
  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E2E8F0] bg-[#FAFAFA] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#253765] text-white flex items-center justify-center shrink-0">
          <PackagePlus size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-[#0F172A]">حجز طلب جديد</h3>
          <p className="text-[10px] text-slate-500">
            يُنشئ الطلب والشحنة معاً، ويولّد رقم التتبع تلقائياً
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] font-semibold text-rose-800">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="اسم الزبون" required>
            <input
              value={form.customer_name}
              onChange={(e) => set('customer_name', e.target.value)}
              placeholder="مثال: ياسر محمد"
              className={inputClass}
            />
          </Field>

          <Field label="رقم الهاتف" required hint="صيغة عراقية: ٠٧٧٢٧٨٦٩٥٧١">
            <input
              value={form.phone_number}
              onChange={(e) => set('phone_number', e.target.value)}
              placeholder="07XXXXXXXXX"
              dir="ltr"
              inputMode="tel"
              className={`${inputClass} text-left font-mono`}
            />
          </Field>

          <Field label="المحافظة" required>
            <select
              value={form.governorate}
              onChange={(e) => set('governorate', e.target.value)}
              className={inputClass}
            >
              {GOVERNORATES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>

          <Field label="القضاء / المنطقة">
            <input
              value={form.district}
              onChange={(e) => set('district', e.target.value)}
              placeholder="مثال: العامرية"
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="العنوان الكامل" required>
          <input
            value={form.full_address}
            onChange={(e) => set('full_address', e.target.value)}
            placeholder="الحي، المحلة، الزقاق، رقم الدار"
            className={inputClass}
          />
        </Field>

        <Field label="أقرب نقطة دالة">
          <input
            value={form.nearest_landmark}
            onChange={(e) => set('nearest_landmark', e.target.value)}
            placeholder="مثال: قرب المركز الصحي"
            className={inputClass}
          />
        </Field>

        {/* ===== محتوى الطلب — الحقل البارز ===== */}
        <div className="rounded-xl border-2 border-[#253765]/30 bg-[#253765]/5 p-3.5">
          <label className="block text-xs font-black text-[#253765] mb-2">
            محتوى الطلب <span className="text-rose-600">*</span>
          </label>
          <input
            value={form.order_content}
            onChange={(e) => set('order_content', e.target.value)}
            placeholder="مثال: ملابس، عطور، إلكترونيات"
            className="w-full px-3 py-2.5 rounded-xl border border-[#253765]/30 bg-white text-sm font-bold text-[#0F172A] outline-none focus:border-[#253765] transition"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CONTENT_SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('order_content', c)}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#253765]/20 text-[10px] font-bold text-[#253765] hover:bg-[#253765] hover:text-white transition"
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">يُطبع على ستيكر الشحنة ليعرف المندوب طبيعة الطرد.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="مبلغ الطلب (COD)" required hint="المبلغ الذي يستلمه المندوب من الزبون">
            <input
              value={form.cod_amount_iqd}
              onChange={(e) => set('cod_amount_iqd', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="35000"
              dir="ltr"
              inputMode="numeric"
              className={`${inputClass} text-left font-mono`}
            />
          </Field>

          <Field label="أجرة التوصيل" hint="٣٠٠٠ لبغداد · ٥٠٠٠ لباقي المحافظات">
            <input
              value={form.delivery_fee_iqd}
              onChange={(e) => set('delivery_fee_iqd', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="5000"
              dir="ltr"
              inputMode="numeric"
              className={`${inputClass} text-left font-mono`}
            />
          </Field>
        </div>

        <Field label="ملاحظات للمندوب">
          <input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="مثال: الاتصال قبل الوصول"
            className={inputClass}
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#253765] text-white text-sm font-bold hover:bg-[#1D2B50] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <RefreshCw size={16} className="animate-spin" /> : <PackagePlus size={16} />}
          {submitting ? 'جارِ الحجز...' : 'حجز الطلب وإصدار رقم التتبع'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-[#E2E8F0] bg-white text-xs text-[#0F172A] outline-none focus:border-[#253765] transition'

function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-[#64748B] mb-1.5">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}

function Cell({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] px-2.5 py-2">
      <p className="text-[9px] text-slate-400 font-bold">{label}</p>
      <p className={`font-bold text-[#0F172A] truncate ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  )
}
