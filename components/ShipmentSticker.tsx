'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import type { Shipment } from '@/lib/shipments'
import { formatArabicCurrency } from '@/lib/formatters'

/**
 * ستيكر شحنة برق — للطابعات الحرارية عرض 80mm
 * ==============================================
 * قواعد التصميم للطباعة الحرارية (وليست شاشة):
 * • أبيض وأسود صرف — لا تدرّجات ولا رمادي، فالطابعة الحرارية تُظهرها بقعاً باهتة.
 * • حدود صلبة وخطوط سميكة، وحد أدنى للخط ~9pt ليبقى مقروءاً بعد الطباعة.
 * • رقم التتبع والمبلغ المطلوب أكبر عنصرين — عليهما يعتمد المندوب ميدانياً.
 * • الأرقام (هاتف/تتبع/مبلغ) بالإنجليزية LTR: الأرقام العربية-الهندية تُقرأ
 *   خطأً عند الاتصال أو الإدخال في نظام الشركة.
 *
 * الباركود: Code 39 عبر خط 'Libre Barcode 39 Text' (بلا مكتبات).
 * • مجموعة محارف Code 39 هي A-Z الكبيرة و 0-9 و - . $ / + % ومسافة.
 *   رقم التتبع BRQ-XXXXXX يقع كله ضمنها، لكن الدالة تُطهّر الرقم احتياطاً.
 * • النجمتان (*) هما محرفا البدء والإيقاف الإلزاميان في Code 39.
 * • الخط يُستضاف ذاتياً عبر next/font، ومع ذلك ننتظر document.fonts.ready
 *   قبل window.print(): الطباعة قبل جاهزية الخط تُنتج نصاً بدل باركود.
 * • ⚠️ العرض: رمز Code 39 لـ *BRQ-XXXXXX* يساوي 12 محرفاً، وكل محرف تسعة
 *   عناصر (منها ثلاثة عريضة) + فاصل = نحو 13 وحدة ضيقة، أي ~155 وحدة،
 *   مع منطقتين هادئتين 10 وحدات لكل جانب = ~175 وحدة على 72 ملم مفيدة.
 *   لا يوجد مقاس خط ثابت يضمن ذلك عبر كل المتصفحات، لذلك يقيس المكوّن
 *   الباركود فعلياً قبل الطباعة ويُصغّره ليتّسع (fitBarcode أدناه).
 *   ولا يُستخدم overflow:hidden إطلاقاً — قصّ الباركود يجعله غير قابل للمسح
 *   دون أن يلاحظ أحد، وهو أسوأ من غيابه.
 */

// خط الباركود — يُحمَّل في app/layout.tsx عبر next/font ويُستضاف ذاتياً،
// ويصل هنا كمتغيّر CSS (--font-barcode) لا كاسم عائلة من الشبكة.
const BARCODE_FONT_STACK = "var(--font-barcode), 'Libre Barcode 39 Text', 'Courier New', monospace"
const BARCODE_FONT_SIZE_PX = 46
/** أصغر مقاس يبقى عنده الباركود قابلاً للمسح عملياً على طابعة حرارية 203dpi */
const BARCODE_MIN_FONT_PX = 26
/** المنطقة الهادئة على كل جانب (ملم) — شرط في مواصفة Code 39 */
const BARCODE_QUIET_ZONE_MM = 4

// ---------------------------------------------------------------------
// أنماط الطباعة — تُحقن مرة واحدة عند الطباعة فقط
// ---------------------------------------------------------------------
const PRINT_STYLES = `
@media print {
  @page { size: 80mm auto; margin: 0; }

  /* إخفاء لوحة التحكم بالكامل، وإبقاء الستيكر وحده */
  body > *:not(.bariq-print-root) { display: none !important; }

  html, body {
    background: #fff !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    height: auto !important;
  }

  .bariq-print-root {
    display: block !important;
    position: static !important;
    width: 80mm;
    margin: 0;
    padding: 0;
  }

  .bariq-sticker { page-break-after: always; break-after: page; }
  .bariq-sticker:last-child { page-break-after: auto; break-after: auto; }

  /* الباركود: منطقة هادئة (Quiet Zone) على الجانبين شرط للمسح الصحيح */
  .bariq-barcode {
    font-family: var(--font-barcode), 'Libre Barcode 39 Text', 'Courier New', monospace !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  /* ضمان طباعة الخلفيات السوداء للصناديق المهمة */
  .bariq-ink {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}

@media screen {
  .bariq-print-root { display: none !important; }
}
`

// ---------------------------------------------------------------------
// تطهير النص لمجموعة محارف Code 39 المسموحة
// (خارجها يُنتج الخط رموزاً لا يقرؤها الماسح)
// ---------------------------------------------------------------------
const CODE39_ALLOWED = /[^0-9A-Z\-. $/+%]/g

export function toCode39(value: string): string {
  return (value || '').toUpperCase().replace(CODE39_ALLOWED, '')
}

/**
 * يقيس الباركود المُصيَّر ويُصغّر مقاس الخط حتى يتّسع داخل عرض الملصق.
 * تُستدعى بعد جاهزية الخطوط وقبل window.print() مباشرةً.
 * تُرجع false إن تعذّر إيصاله لمقاس قابل للمسح.
 */
function fitBarcode(el: HTMLElement | null): boolean {
  if (!el) return false
  const container = el.parentElement
  if (!container) return false

  const available = container.clientWidth
  if (available <= 0) return false

  // نُعيد المقاس الأصلي قبل كل قياس حتى لا تتراكم التصغيرات عبر الطباعات
  el.style.fontSize = `${BARCODE_FONT_SIZE_PX}px`
  if (el.scrollWidth <= available) return true

  // تصغير تكراري لا حسبة واحدة: علاقة مقاس الخط بالعرض ليست خطية تماماً
  // (تباعد المحارف وتقريب البكسل)، فحسبة واحدة قد تترك الباركود متجاوزاً
  // — وهو ما يعني قصّه، أي ملصقاً غير قابل للمسح.
  let size = BARCODE_FONT_SIZE_PX
  for (let i = 0; i < 12 && size > BARCODE_MIN_FONT_PX; i++) {
    const natural = el.scrollWidth
    if (natural <= available) return true
    // معامل أمان 0.98 لضمان التقارب بدل التذبذب حول الحد
    const next = Math.floor(size * (available / natural) * 0.98)
    size = Math.max(next < size ? next : size - 1, BARCODE_MIN_FONT_PX)
    el.style.fontSize = `${size}px`
  }

  if (el.scrollWidth <= available) return true

  // لم يتّسع حتى عند الحد الأدنى: نُخفي الباركود بدل طباعة رمز مقصوص
  // يبدو صالحاً وهو ليس كذلك. رقم التتبع المطبوع فوقه يبقى المرجع.
  el.style.display = 'none'
  console.warn(
    '[STICKER][BARCODE_HIDDEN] تعذّر إيصال الباركود لمقاس يتّسع ويبقى قابلاً للمسح — ' +
      'طُبع رقم التتبع نصاً فقط'
  )
  return false
}

// ---------------------------------------------------------------------
// جسم الستيكر
// ---------------------------------------------------------------------
export function ShipmentSticker({
  shipment,
  merchantName,
  orderContent,
}: {
  shipment: Shipment
  merchantName?: string | null
  /** محتوى الطلب من orders.order_content (مثال: تيشرتات، عطور) */
  orderContent?: string | null
}) {
  const barcodeValue = toCode39(shipment.tracking_number)
  const barcodeRef = useRef<HTMLDivElement>(null)
  const printedAt = new Intl.DateTimeFormat('ar-IQ', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  return (
    <div
      className="bariq-sticker"
      dir="rtl"
      style={{
        width: '80mm',
        boxSizing: 'border-box',
        padding: '3mm 4mm',
        background: '#fff',
        color: '#000',
        fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
        fontSize: '10pt',
        lineHeight: 1.35,
      }}
    >
      {/* ===== الترويسة ===== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '2px solid #000',
          paddingBottom: '1.5mm',
          marginBottom: '2mm',
        }}
      >
        <div>
          {/* بلا إيموجي: الطابعة الحرارية أحادية اللون تُحوّل الرموز الملوّنة بقعاً رمادية */}
          <div style={{ fontSize: '16pt', fontWeight: 900, letterSpacing: '-0.5px' }}>برق</div>
          <div style={{ fontSize: '7.5pt', fontWeight: 600 }}>المندوب للتوصيل السريع</div>
        </div>
        <div style={{ textAlign: 'left', fontSize: '7pt' }}>
          <div style={{ fontWeight: 700 }}>طلب رقم</div>
          <div style={{ fontSize: '11pt', fontWeight: 900, direction: 'ltr' }}>
            #{shipment.order_id}
          </div>
        </div>
      </div>

      {/* ===== رقم التتبع ===== */}
      <div
        style={{
          border: '2px solid #000',
          textAlign: 'center',
          padding: '1.5mm 1mm',
          marginBottom: '2mm',
        }}
      >
        <div style={{ fontSize: '7pt', fontWeight: 700, marginBottom: '0.5mm' }}>رقم التتبع</div>
        <div
          style={{
            fontSize: '17pt',
            fontWeight: 900,
            direction: 'ltr',
            fontFamily: '"Courier New", monospace',
            letterSpacing: '1px',
          }}
        >
          {shipment.tracking_number}
        </div>

        {/* باركود Code 39 — النجمتان محرفا البدء والإيقاف الإلزاميان.
            لا overflow:hidden هنا عمداً: القصّ ينتج باركود غير قابل للمسح بصمت. */}
        <div
          style={{
            marginTop: '1mm',
            padding: `0 ${BARCODE_QUIET_ZONE_MM}mm`,
            direction: 'ltr',
          }}
        >
          <div
            ref={barcodeRef}
            className="bariq-barcode"
            aria-hidden="true"
            style={{
              fontFamily: BARCODE_FONT_STACK,
              fontSize: `${BARCODE_FONT_SIZE_PX}px`,
              lineHeight: 1,
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {`*${barcodeValue}*`}
          </div>
        </div>
      </div>

      {/* ===== المستلم ===== */}
      <div style={{ marginBottom: '2mm' }}>
        <Label>المستلم</Label>
        <div style={{ fontSize: '13pt', fontWeight: 900, marginBottom: '0.8mm' }}>
          {shipment.recipient_name}
        </div>
        <div
          style={{
            fontSize: '14pt',
            fontWeight: 900,
            direction: 'ltr',
            textAlign: 'right',
            fontFamily: '"Courier New", monospace',
          }}
        >
          {shipment.recipient_phone}
        </div>
      </div>

      {/* ===== محتوى الطلب ===== */}
      {orderContent && (
        <div
          style={{
            border: '1.5px solid #000',
            padding: '1.2mm 2mm',
            marginBottom: '2mm',
          }}
        >
          <Label>محتوى الطلب</Label>
          <div style={{ fontSize: '12pt', fontWeight: 900 }}>{orderContent}</div>
        </div>
      )}

      {/* ===== الوجهة ===== */}
      <div
        style={{
          borderTop: '1px dashed #000',
          borderBottom: '1px dashed #000',
          padding: '1.5mm 0',
          marginBottom: '2mm',
        }}
      >
        <Label>الوجهة</Label>
        <div style={{ fontSize: '13pt', fontWeight: 900 }}>
          {shipment.governorate}
          {shipment.district ? ` — ${shipment.district}` : ''}
        </div>
        <div style={{ fontSize: '9.5pt', marginTop: '0.8mm' }}>{shipment.full_address}</div>
        {shipment.nearest_landmark && (
          <div style={{ fontSize: '9pt', marginTop: '0.8mm', fontWeight: 700 }}>
            أقرب نقطة دالة: {shipment.nearest_landmark}
          </div>
        )}
      </div>

      {/* ===== المبلغ المطلوب من الزبون ===== */}
      <div
        className="bariq-ink"
        style={{ border: '2px solid #000', marginBottom: '2mm', background: '#fff' }}
      >
        <div
          className="bariq-ink"
          style={{
            background: '#000',
            color: '#fff',
            textAlign: 'center',
            fontSize: '8.5pt',
            fontWeight: 900,
            padding: '0.8mm 0',
          }}
        >
          المبلغ المطلوب من الزبون
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: '20pt',
            fontWeight: 900,
            padding: '1.5mm 0',
            direction: 'rtl',
          }}
        >
          {formatArabicCurrency(shipment.cod_amount_iqd)}
        </div>
      </div>

      {/* ===== التاجر والتاريخ ===== */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt', gap: '2mm' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Label>التاجر</Label>
          <div style={{ fontWeight: 700 }}>{merchantName || shipment.merchant_name || '—'}</div>
        </div>
        <div style={{ textAlign: 'left', flexShrink: 0 }}>
          <Label>تاريخ الطباعة</Label>
          <div style={{ fontWeight: 700 }}>{printedAt}</div>
        </div>
      </div>

      {shipment.notes && (
        <div style={{ borderTop: '1px solid #000', marginTop: '2mm', paddingTop: '1mm', fontSize: '8.5pt' }}>
          <span style={{ fontWeight: 900 }}>ملاحظات: </span>
          {shipment.notes}
        </div>
      )}

      {/* ===== التذييل ===== */}
      <div
        style={{
          borderTop: '2px solid #000',
          marginTop: '2mm',
          paddingTop: '1mm',
          textAlign: 'center',
          fontSize: '7.5pt',
          fontWeight: 600,
        }}
      >
        يُرجى التحقق من سلامة الطرد قبل التسليم — للاستفسار راجع رقم التتبع أعلاه
      </div>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '7pt', fontWeight: 700, letterSpacing: '0.3px', marginBottom: '0.3mm' }}>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------
// زر الطباعة — يركّب الستيكر لحظة الطباعة فقط ثم يزيله
// ---------------------------------------------------------------------
export function PrintStickerButton({
  shipment,
  merchantName,
  orderContent,
  label = 'طباعة ستيكر الشحنة',
  compact = false,
  autoPrint = false,
}: {
  shipment: Shipment
  merchantName?: string | null
  /** محتوى الطلب من orders.order_content */
  orderContent?: string | null
  label?: string
  compact?: boolean
  /** يطبع تلقائياً فور التركيب — يُستخدم عند تأكيد الطلب */
  autoPrint?: boolean
}) {
  const [printing, setPrinting] = useState(false)
  const [mounted, setMounted] = useState(false)

  // البوابة تحتاج document — لا تُركَّب أثناء التصيير على الخادم
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const handlePrint = useCallback(() => setPrinting(true), [])

  // الطباعة التلقائية عند تأكيد الطلب
  useEffect(() => {
    if (!autoPrint || !mounted) return
    const id = requestAnimationFrame(() => setPrinting(true))
    return () => cancelAnimationFrame(id)
  }, [autoPrint, mounted])

  // بعد تركيب الستيكر في DOM: ننتظر خط الباركود ثم نطبع، ثم نزيله
  //
  // ⚠️ الانتظار ليس تجميلاً: خط Libre Barcode 39 Text يُحمَّل من الشبكة.
  // لو فُتح حوار الطباعة قبل اكتماله، يسقط المتصفح إلى الخط الاحتياطي
  // ويطبع نصاً عادياً بدل باركود — ملصق غير قابل للمسح في المخزن.
  useEffect(() => {
    if (!printing) return

    let cancelled = false
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      setPrinting(false)
    }

    window.addEventListener('afterprint', finish)

    const run = async () => {
      // 1) انتظار جاهزية الخطوط. الخط مستضاف ذاتياً عبر next/font، لكن فك
      //    تحميله يبقى غير متزامن — والطباعة قبل جاهزيته تُنتج نصاً لا باركود.
      try {
        if (document.fonts?.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ])
        }
      } catch (err) {
        console.warn('[STICKER][FONT_WAIT_FAILED]', err)
      }

      if (cancelled) return

      // 2) إطارَا رسم لضمان اكتمال تخطيط الستيكر قبل القياس
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
      if (cancelled) return

      // 3) ملاءمة الباركود لعرض الملصق — يمنع القصّ الصامت
      fitBarcode(document.querySelector<HTMLElement>('.bariq-print-root .bariq-barcode'))

      // إطار إضافي بعد تغيير مقاس الخط
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      if (cancelled) return

      try {
        window.print()
      } catch (err) {
        console.error('[STICKER][PRINT_FAILED]', err)
      }

      // احتياطي للمتصفحات التي لا تُطلق afterprint
      setTimeout(finish, 800)
    }

    void run()

    return () => {
      cancelled = true
      window.removeEventListener('afterprint', finish)
    }
  }, [printing])

  return (
    <>
      <button
        onClick={handlePrint}
        disabled={printing}
        title="طباعة ستيكر حراري 80mm"
        className={
          compact
            ? 'inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E2E8F0] text-[10px] font-bold text-[#253765] hover:bg-[#F1F5F9] transition disabled:opacity-50'
            : 'w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-[#253765] text-white text-xs font-bold hover:bg-[#1D2B50] transition disabled:opacity-50'
        }
      >
        <Printer size={compact ? 12 : 14} />
        {printing ? 'جارِ التحضير...' : label}
      </button>

      {mounted &&
        printing &&
        createPortal(
          <div className="bariq-print-root">
            <style dangerouslySetInnerHTML={{ __html: PRINT_STYLES }} />
            <ShipmentSticker
              shipment={shipment}
              merchantName={merchantName}
              orderContent={orderContent}
            />
          </div>,
          document.body
        )}
    </>
  )
}

export default PrintStickerButton
