'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, PackagePlus, RefreshCw, AlertCircle } from 'lucide-react'
import type { Shipment } from '@/lib/shipments'
import { formatNumberFor, localizeDigits } from '@/lib/formatters'
import { PrintStickerButton } from '@/components/ShipmentSticker'
import { fill, type Dictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'

/**
 * نموذج حجز طلب جديد
 * ===================
 * يُدرج عبر POST /api/orders/book (خادم بمفتاح service_role) لا من المتصفح:
 * صلاحيات anon على orders و shipments مسحوبة بالترحيلات 005–007.
 * رقم التتبع BRQ-XXXXXX تولّده قاعدة البيانات، لا الواجهة.
 *
 * اختيار التاجر إلزامي (الترحيل ٠١٦: orders.merchant_id لا قيمة افتراضية
 * له). هذا النموذج يُستعمل من /operations حيث الموظف يحجز نيابةً عن أي
 * تاجر — لذا التاجر حقل يُختار صراحةً، لا يُشتق من جلسة المستخدم.
 *
 * ⚠️ ما يُخزَّن ويُطبع يبقى عربياً مهما كانت لغة الواجهة: اسم المحافظة
 * ومحتوى الطلب يُقرآن على ملصق الشحنة من مندوب عراقي، لا من صاحب الشاشة.
 * تُترجَم **التسمية المعروضة** وحدها، والقيمة المُرسَلة تبقى كما هي.
 */

export interface MerchantOption {
  id: string
  name: string
}

type BookingCopy = Dictionary['app']['booking']

/** القيم المخزَّنة — عربية دائماً. تسمياتها المعروضة في القاموس. */
const GOVERNORATES = [
  'بغداد', 'البصرة', 'نينوى', 'أربيل', 'السليمانية', 'دهوك', 'كركوك',
  'ديالى', 'الأنبار', 'بابل', 'كربلاء', 'النجف', 'واسط', 'ميسان',
  'ذي قار', 'المثنى', 'القادسية', 'صلاح الدين',
] as const

const CONTENT_SUGGESTIONS = ['ملابس', 'عطور', 'إلكترونيات', 'مستحضرات تجميل', 'أحذية', 'إكسسوارات'] as const

/** أمثلة تُعرض في التلميحات — أرقامها تتبع لغة العرض. */
const PHONE_SAMPLE = '07727869571'
const FEE_BAGHDAD = 3000
const FEE_OTHER = 5000

interface BookedResult {
  shipment: Shipment
  orderContent: string
}

const EMPTY_FORM = {
  merchant_id: '',
  customer_name: '',
  phone_number: '',
  governorate: 'بغداد',
  district: '',
  full_address: '',
  nearest_landmark: '',
  // مواصفات وتفاصيل المنتج حسب طلب الزبون
  product_type: '',
  quantity: '1',
  colors: '',
  size_volume: '',
  dimensions: '', // الطول والعرض
  capacity: '', // السعة أو الحجم
  order_content: '',
  cod_amount_iqd: '',
  delivery_fee_iqd: '',
  notes: '',
}

export default function NewOrderBooking({
  merchants,
  onBooked,
  locale,
  currency,
  t,
}: {
  merchants: MerchantOption[]
  onBooked?: (result: BookedResult) => void
  locale: Locale
  currency: string
  /** ⚠️ خاصية لا استيراد: مكوّن عميل، والقاموس كله لا يعبر إلى المتصفّح. */
  t: BookingCopy
}) {
  const router = useRouter()
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<BookedResult | null>(null)

  const set = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const money = (value: number | null | undefined) =>
    `${formatNumberFor(locale, Number(value ?? 0))} ${currency}`

  // قائمة التجار تصل عادة بعد تركيب هذه النافذة (طلب شبكة منفصل في الأب)،
  // فتخزين اختيار التاجر في useState وحده يجمّد الفراغ لو رُكِّبت النافذة
  // قبل وصول القائمة. القيمة الفعلية تُشتق هنا في كل عرض بدل تخزينها، فلا
  // سباق ممكن: تاجر واحد يُختار تلقائياً فور توفّره أياً كان توقيت الوصول،
  // واختيار المستخدم اليدوي (form.merchant_id) له الأولوية دائماً.
  const effectiveMerchantId = form.merchant_id || (merchants.length === 1 ? merchants[0].id : '')

  const handleSubmit = async () => {
    if (submitting) return
    if (!effectiveMerchantId) {
      setError(t.merchantRequired)
      return
    }
    setSubmitting(true)
    setError(null)

    // ⚠️ تجميع مواصفات المنتج بالعربية دائماً: هذا النصّ يُطبع على الملصق
    // ويقرأه المندوب، فلا يتبع لغة الشاشة التي كُتب منها.
    const specsParts: string[] = []
    if (form.product_type.trim()) specsParts.push(`المنتج: ${form.product_type.trim()}`)
    if (form.quantity.trim() && form.quantity !== '1') specsParts.push(`الكمية: ${form.quantity.trim()} قطعة`)
    else if (form.quantity.trim()) specsParts.push(`الكمية: ١ قطعة`)
    if (form.colors.trim()) specsParts.push(`اللون: ${form.colors.trim()}`)
    if (form.size_volume.trim()) specsParts.push(`القياس/الحجم: ${form.size_volume.trim()}`)
    if (form.dimensions.trim()) specsParts.push(`الأبعاد: ${form.dimensions.trim()}`)
    if (form.capacity.trim()) specsParts.push(`السعة: ${form.capacity.trim()}`)

    const generatedContent = specsParts.join(' | ')
    const finalOrderContent = form.order_content.trim()
      ? (specsParts.length > 0 ? `${form.order_content.trim()} (${generatedContent})` : form.order_content.trim())
      : (generatedContent || 'بضاعة عامة')

    try {
      const res = await fetch('/api/orders/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          merchant_id: effectiveMerchantId,
          order_content: finalOrderContent,
          cod_amount_iqd: Number(form.cod_amount_iqd || 0),
          delivery_fee_iqd: Number(form.delivery_fee_iqd || 0),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || t.failed)

      const result: BookedResult = { shipment: json.shipment as Shipment, orderContent: json.order_content }
      setBooked(result)
      setForm({ ...EMPTY_FORM })
      onBooked?.(result)
      router.refresh() // تحديث قائمة الشحنات في اللوحة
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t.failed
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
      <div className="bg-surface rounded-2xl border border-line shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-success-bg border border-success-line flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-success-ink" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-ink">{t.successTitle}</h3>
            <p className="text-[11px] text-ink-muted mt-0.5">{t.successBody}</p>
          </div>
        </div>

        <div className="rounded-xl border-2 border-brand bg-brand-soft p-4 text-center mb-4">
          <p className="text-[10px] font-bold text-brand-text mb-1">{t.trackingNumber}</p>
          <p className="text-2xl font-black text-brand-text font-mono tracking-wider" dir="ltr">
            {booked.shipment.tracking_number}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] mb-4">
          <Cell label={t.cellCustomer} value={booked.shipment.recipient_name} />
          <Cell label={t.cellPhone} value={booked.shipment.recipient_phone} ltr />
          <Cell
            label={t.cellDestination}
            value={`${booked.shipment.governorate}${booked.shipment.district ? ' — ' + booked.shipment.district : ''}`}
          />
          <Cell label={t.cellContent} value={booked.orderContent} />
          <Cell label={t.cellAmount} value={money(booked.shipment.cod_amount_iqd)} />
          <Cell label={t.cellFee} value={money(booked.shipment.delivery_fee_iqd)} />
        </div>

        <div className="space-y-2">
          <PrintStickerButton
            shipment={booked.shipment}
            merchantName={booked.shipment.merchant_name}
            orderContent={booked.orderContent}
            label={t.printSticker}
          />
          <button
            onClick={() => setBooked(null)}
            className="w-full px-3 py-2.5 rounded-xl border border-line text-xs font-bold text-brand-text hover:bg-surface-3 transition"
          >
            {t.bookAnother}
          </button>
        </div>
      </div>
    )
  }

  // ==================================================================
  // النموذج
  // ==================================================================
  return (
    <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-line bg-surface-2 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand text-on-brand flex items-center justify-center shrink-0">
          <PackagePlus size={18} />
        </div>
        <div>
          <h3 className="text-sm font-black text-ink">{t.title}</h3>
          <p className="text-[10px] text-ink-muted">{t.subtitle}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger-line bg-danger-bg px-3 py-2.5 text-[11px] font-semibold text-danger-ink">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <Field label={t.merchant} required hint={t.merchantHint}>
          <select
            value={effectiveMerchantId}
            onChange={(e) => set('merchant_id', e.target.value)}
            className={inputClass}
          >
            <option value="">{t.chooseMerchant}</option>
            {merchants.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.customerName} required>
            <input
              value={form.customer_name}
              onChange={(e) => set('customer_name', e.target.value)}
              placeholder={t.customerNamePlaceholder}
              className={inputClass}
            />
          </Field>

          <Field
            label={t.phone}
            required
            hint={fill(t.phoneHint, { sample: localizeDigits(PHONE_SAMPLE, locale) })}
          >
            <input
              value={form.phone_number}
              onChange={(e) => set('phone_number', e.target.value)}
              placeholder="07XXXXXXXXX"
              dir="ltr"
              inputMode="tel"
              className={`${inputClass} text-left font-mono`}
            />
          </Field>

          <Field label={t.governorate} required>
            <select
              value={form.governorate}
              onChange={(e) => set('governorate', e.target.value)}
              className={inputClass}
            >
              {GOVERNORATES.map((g) => (
                <option key={g} value={g}>{t.governorates[g]}</option>
              ))}
            </select>
          </Field>

          <Field label={t.district}>
            <input
              value={form.district}
              onChange={(e) => set('district', e.target.value)}
              placeholder={t.districtPlaceholder}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label={t.fullAddress} required>
          <input
            value={form.full_address}
            onChange={(e) => set('full_address', e.target.value)}
            placeholder={t.fullAddressPlaceholder}
            className={inputClass}
          />
        </Field>

        <Field label={t.landmark}>
          <input
            value={form.nearest_landmark}
            onChange={(e) => set('nearest_landmark', e.target.value)}
            placeholder={t.landmarkPlaceholder}
            className={inputClass}
          />
        </Field>

        {/* ===== مواصفات وتفاصيل المنتج حسب طلب الزبون (للطباعة في الستيكر) ===== */}
        <div className="rounded-xl border-2 border-brand/20 bg-surface-2 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <label className="text-xs font-black text-brand-text flex items-center gap-1.5">
              <span>{t.specsTitle}</span>
            </label>
            <span className="text-[10px] text-ink-muted font-semibold">{t.specsNote}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-ink mb-1">{t.productType}</label>
              <input
                value={form.product_type}
                onChange={(e) => set('product_type', e.target.value)}
                placeholder={t.productTypePlaceholder}
                className={specInputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ink mb-1">{t.quantity}</label>
              <input
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                placeholder={t.quantityPlaceholder}
                className={specInputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ink mb-1">{t.colors}</label>
              <input
                value={form.colors}
                onChange={(e) => set('colors', e.target.value)}
                placeholder={t.colorsPlaceholder}
                className={specInputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <div>
              <label className="block text-[11px] font-bold text-ink mb-1">{t.sizeVolume}</label>
              <input
                value={form.size_volume}
                onChange={(e) => set('size_volume', e.target.value)}
                placeholder={t.sizeVolumePlaceholder}
                className={specInputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ink mb-1">{t.dimensions}</label>
              <input
                value={form.dimensions}
                onChange={(e) => set('dimensions', e.target.value)}
                placeholder={t.dimensionsPlaceholder}
                className={specInputClass}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-ink mb-1">{t.capacity}</label>
              <input
                value={form.capacity}
                onChange={(e) => set('capacity', e.target.value)}
                placeholder={t.capacityPlaceholder}
                className={specInputClass}
              />
            </div>
          </div>
        </div>

        {/* ===== محتوى الطلب العام ===== */}
        <div className="rounded-xl border border-line bg-surface p-3 space-y-2">
          <label className="block text-xs font-bold text-ink">{t.contentTitle}</label>
          <input
            value={form.order_content}
            onChange={(e) => set('order_content', e.target.value)}
            placeholder={t.contentPlaceholder}
            className="w-full px-3 py-2 rounded-lg border border-line bg-surface-2 text-xs text-ink outline-none focus:border-brand transition"
          />
          <div className="flex flex-wrap gap-1.5 pt-1">
            {CONTENT_SUGGESTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set('order_content', c)}
                className="px-2.5 py-0.5 rounded-md bg-surface-3 border border-line text-[10px] font-bold text-ink-muted hover:bg-brand hover:text-on-brand transition"
              >
                {t.contentSuggestions[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t.codAmount} required hint={t.codHint}>
            <input
              value={form.cod_amount_iqd}
              onChange={(e) => set('cod_amount_iqd', e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="35000"
              dir="ltr"
              inputMode="numeric"
              className={`${inputClass} text-left font-mono`}
            />
          </Field>

          <Field
            label={t.deliveryFee}
            hint={fill(t.deliveryFeeHint, {
              baghdad: formatNumberFor(locale, FEE_BAGHDAD),
              other: formatNumberFor(locale, FEE_OTHER),
            })}
          >
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

        <Field label={t.notes}>
          <input
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder={t.notesPlaceholder}
            className={inputClass}
          />
        </Field>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-brand text-on-brand text-sm font-bold hover:bg-brand-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <RefreshCw size={16} className="animate-spin" /> : <PackagePlus size={16} />}
          {submitting ? t.submitting : t.submit}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------
const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-line bg-surface text-xs text-ink outline-none focus:border-brand transition'

const specInputClass =
  'w-full px-2.5 py-1.5 rounded-lg border border-line-strong bg-surface text-xs text-ink outline-none focus:border-brand'

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
      <label className="block text-[11px] font-bold text-ink-muted mb-1.5">
        {label} {required && <span className="text-danger-ink">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-ink-faint mt-1">{hint}</p>}
    </div>
  )
}

function Cell({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 border border-line px-2.5 py-2">
      <p className="text-[9px] text-ink-faint font-bold">{label}</p>
      <p className={`font-bold text-ink truncate ${ltr ? 'font-mono' : ''}`} dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  )
}
