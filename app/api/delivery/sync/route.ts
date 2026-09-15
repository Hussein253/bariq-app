import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { verifySignature } from '@/lib/webhook-signature'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { STATUS_TRANSITIONS, type ShipmentStatus } from '@/lib/shipments'

export const dynamic = 'force-dynamic'

/**
 * POST /api/delivery/sync — تحديث حالة الشحنة من نظام التوصيل
 * =============================================================
 * يستقبل تحديثات المندوب / تطبيق التشغيل، فيحرّك الشحنة خطوة واحدة في آلة
 * الحالات. هذا المسار يغيّر حالة مالية، فهو موقَّع لا مفتوح.
 *
 * ⚠️ ما تغيّر عن النسخة السابقة:
 *   • كان بلا أي تحقق هوية — أي شخص يحدّث حالة أي طلب.
 *   • كان يعمل على مخزن الذاكرة بحالات عربية حرة ('بالطريق'، 'ملغي') لا وجود
 *     لها في قاعدة البيانات، ويكتب driver_name نصاً حراً بلا جدول يستقبله.
 *   • كان يسند حالة الدفع تلقائياً عند التسليم بلا أي تحصيل فعلي.
 *
 * الآن: توقيع HMAC إلزامي، وحالات shipments الرسمية حصراً، والمندوب يُشار
 * إليه بـ courier_id من جدول couriers لا باسم حرّ.
 *
 * التوقيع: ترويسة x-bariq-signature = HMAC-SHA256(الجسم الخام، BARIQ_DELIVERY_SYNC_SECRET)
 */

const LIMIT = 300
const WINDOW_MS = 60_000

/** ترجمة أفعال نظام التوصيل إلى حالات الجدول الرسمية. */
const ACTION_TO_STATUS: Record<string, ShipmentStatus> = {
  pickup: 'PICKED_UP_SAME_DAY',
  in_transit: 'IN_TRANSIT_HUB',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  postponed: 'POSTPONED',
  returned: 'RETURNED',
  settled: 'SETTLED_FINANCIALLY',
}

export async function POST(req: Request) {
  const limit = rateLimit(`delivery:sync:${clientKey(req)}`, LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  // الجسم الخام أولاً: التوقيع محسوب على البايتات كما أُرسلت، وإعادة تسلسل
  // JSON تغيّر الفراغات وترتيب المفاتيح فيفشل التحقق بلا سبب ظاهر.
  const rawBody = await req.text()
  const check = verifySignature({
    rawBody,
    signature: req.headers.get('x-bariq-signature'),
    secret: process.env.BARIQ_DELIVERY_SYNC_SECRET,
  })
  if (!check.ok) {
    log.warn('DELIVERY_SYNC_REJECTED', { reason: check.error })
    return NextResponse.json({ success: false, error: check.error }, { status: check.status })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'جسم الطلب ليس JSON صالحاً' }, { status: 400 })
  }

  const trackingNumber = typeof body.tracking_number === 'string' ? body.tracking_number.trim() : ''
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  const courierId = typeof body.courier_id === 'string' ? body.courier_id.trim() : null
  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''

  if (!trackingNumber) {
    return NextResponse.json(
      { success: false, error: 'tracking_number مطلوب — رقم التتبع هو المعرّف المعتمد للشحنة' },
      { status: 400 }
    )
  }

  const nextStatus = ACTION_TO_STATUS[action]
  if (!nextStatus) {
    return NextResponse.json(
      { success: false, error: `action غير معروف. المسموح: ${Object.keys(ACTION_TO_STATUS).join(', ')}` },
      { status: 422 }
    )
  }

  // ---------- الشحنة الحالية ----------
  const { data: shipment, error: fetchError } = await supabaseServer
    .from('shipments')
    .select('id, tracking_number, status, courier_id')
    .eq('tracking_number', trackingNumber)
    .maybeSingle()

  if (fetchError) {
    log.error('DELIVERY_SYNC_FETCH_FAILED', { tracking_number: trackingNumber, reason: fetchError.message })
    return NextResponse.json({ success: false, error: 'تعذّر جلب الشحنة' }, { status: 500 })
  }
  if (!shipment) {
    return NextResponse.json({ success: false, error: 'لا توجد شحنة بهذا الرقم' }, { status: 404 })
  }

  // ---------- منع التكرار ----------
  // إعادة إرسال نفس التحديث (شبكة متقطّعة عند المندوب) لا تُعدّ خطأ ولا تُكرّر
  // أثراً: الشحنة أصلاً في الحالة المطلوبة.
  if (shipment.status === nextStatus) {
    return NextResponse.json({
      success: true,
      unchanged: true,
      message: 'الشحنة في هذه الحالة أصلاً',
      shipment,
    })
  }

  // ---------- فحص مسبق للتسلسل ----------
  // الفرض الحقيقي في مُحفّز القاعدة؛ هذا الفحص يُنتج رسالة عربية مفهومة بدل
  // تسريب نص استثناء PostgreSQL إلى تطبيق المندوب.
  const current = shipment.status as ShipmentStatus
  if (!STATUS_TRANSITIONS[current]?.includes(nextStatus)) {
    const allowed = STATUS_TRANSITIONS[current] ?? []
    return NextResponse.json(
      {
        success: false,
        error: `انتقال غير مسموح: ${current} → ${nextStatus}`,
        allowed_next: allowed,
      },
      { status: 409 }
    )
  }

  // ---------- الأسباب الإلزامية ----------
  // القاعدة تفرض وجود سبب للتأجيل والإرجاع بقيدَي CHECK — نطلبه هنا برسالة
  // واضحة بدل انتظار رفض القاعدة.
  if (nextStatus === 'POSTPONED' && !reason) {
    return NextResponse.json({ success: false, error: 'سبب التأجيل مطلوب (reason)' }, { status: 422 })
  }
  if (nextStatus === 'RETURNED' && !reason) {
    return NextResponse.json({ success: false, error: 'سبب الإرجاع مطلوب (reason)' }, { status: 422 })
  }

  const patch: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'POSTPONED') patch.postponed_reason = reason
  if (nextStatus === 'RETURNED') patch.returned_reason = reason

  // ---------- المندوب ----------
  if (courierId) {
    const { data: courier, error: courierError } = await supabaseServer
      .from('couriers')
      .select('id, status')
      .eq('id', courierId)
      .maybeSingle()

    if (courierError) {
      return NextResponse.json({ success: false, error: 'تعذّر التحقق من المندوب' }, { status: 500 })
    }
    if (!courier) {
      return NextResponse.json(
        { success: false, error: 'لا يوجد مندوب بهذا المعرّف — أضِفه في جدول couriers أولاً' },
        { status: 422 }
      )
    }
    patch.courier_id = courier.id
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from('shipments')
    .update(patch)
    .eq('id', shipment.id)
    .select('id, tracking_number, order_id, status, courier_id, settlement_status, updated_at')
    .single()

  if (updateError) {
    log.error('DELIVERY_SYNC_UPDATE_FAILED', {
      tracking_number: trackingNumber,
      from: current,
      to: nextStatus,
      reason: updateError.message,
    })
    return NextResponse.json({ success: false, error: 'تعذّر تحديث حالة الشحنة' }, { status: 500 })
  }

  log.info('DELIVERY_SYNC_APPLIED', {
    tracking_number: trackingNumber,
    from: current,
    to: nextStatus,
  })

  return NextResponse.json({
    success: true,
    message: `تم تحديث الشحنة إلى ${nextStatus}`,
    shipment: updated,
  })
}
