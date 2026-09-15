import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { authenticateMerchant } from '@/lib/api-auth'
import { normalizeIraqiPhone } from '@/lib/phone'
import { createOrderWithShipment } from '@/lib/order-intake'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { SHIPMENT_STATUSES, type ShipmentStatus } from '@/lib/shipments'

export const dynamic = 'force-dynamic'

/**
 * الـ API العام للطلبات — /api/orders
 * ====================================
 * GET : شحنات التاجر صاحب المفتاح، مع بيانات الطلب المرتبط.
 * POST: إنشاء طلب + شحنة معاً من نظام التاجر الخارجي.
 *
 * ⚠️ ما تغيّر جوهرياً عن النسخة السابقة:
 *
 * 1. التخزين: كان المسار يقرأ ويكتب في lib/db.ts — مصفوفات داخل ذاكرة
 *    العملية. على Vercel كل استدعاء قد يصيب نسخة lambda مختلفة، وتُمسح
 *    الذاكرة عند كل إعادة نشر: طلب زبون حقيقي كان يدخل ثم يختفي بلا أثر.
 *    الآن كل شيء في public.orders و public.shipments.
 *
 * 2. الهوية: كان merchant_id يُقرأ من الرابط (GET) أو من جسم الطلب (POST)
 *    مع سقوط على 'm1' — أي أن أي شخص كان يقرأ ويكتب باسم أي تاجر.
 *    الآن التاجر يُستخرج من مفتاح الـ API حصراً ولا يُقبل من المُرسِل.
 *
 * 3. منع التكرار: بند ٤-١ في CLAUDE.md. مفتاح المُرسِل يُحفظ في
 *    shipments.idempotency_key (فريد على مستوى القاعدة)، فإعادة إرسال نفس
 *    الطلب تُعيد الشحنة الأصلية بدل قيدها مرتين.
 */

/** أقصى عدد طلبات لكل مصدر خلال دقيقة. */
const WRITE_LIMIT = 60
const READ_LIMIT = 120
const WINDOW_MS = 60_000

function isShipmentStatus(value: string): value is ShipmentStatus {
  return (SHIPMENT_STATUSES as string[]).includes(value)
}

export async function GET(req: Request) {
  const limit = rateLimit(`orders:get:${clientKey(req)}`, READ_LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  const auth = await authenticateMerchant(req)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')?.trim()
  const search = searchParams.get('search')?.trim()

  if (status && !isShipmentStatus(status)) {
    return NextResponse.json(
      { success: false, error: `حالة غير معروفة. المسموح: ${SHIPMENT_STATUSES.join(', ')}` },
      { status: 422 }
    )
  }

  // الربط بالطلب يجلب محتواه — رقم التتبع وحده لا يكفي نظام التاجر لمطابقة طلبه
  let query = supabaseServer
    .from('shipments')
    .select(
      'id, tracking_number, order_id, status, recipient_name, recipient_phone, governorate, district, nearest_landmark, full_address, cod_amount_iqd, delivery_fee_iqd, merchant_net_amount_iqd, currency, settlement_status, notes, created_at, updated_at, orders(order_content, current_state)'
    )
    .eq('merchant_id', auth.merchant.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)

  if (search) {
    // الهاتف قد يصل بأي صيغة — يُطبَّع قبل المطابقة وإلا لم يجد شيئاً
    const phone = normalizeIraqiPhone(search)
    const term = search.replace(/[%,()]/g, ' ').trim()
    query = query.or(
      [
        `tracking_number.ilike.%${term}%`,
        `recipient_name.ilike.%${term}%`,
        phone ? `recipient_phone.eq.${phone}` : `recipient_phone.ilike.%${term}%`,
      ].join(',')
    )
  }

  const { data, error } = await query
  if (error) {
    log.error('ORDERS_GET_FAILED', { merchant_id: auth.merchant.id, reason: error.message })
    return NextResponse.json({ success: false, error: 'تعذّر جلب الطلبات' }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: data?.length ?? 0, orders: data ?? [] })
}

export async function POST(req: Request) {
  const limit = rateLimit(`orders:post:${clientKey(req)}`, WRITE_LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  const auth = await authenticateMerchant(req)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'جسم الطلب ليس JSON صالحاً' }, { status: 400 })
  }

  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

  // مفتاح منع التكرار إلزامي — بند ٤-١. بدونه تُنتج إعادة إرسال واحدة فاشلة
  // شحنتين لنفس الزبون، وتُطالبه بالمبلغ مرتين.
  const rawKey = req.headers.get('idempotency-key')?.trim() || str(body.idempotency_key)
  if (!rawKey) {
    return NextResponse.json(
      {
        success: false,
        error: 'ترويسة Idempotency-Key مطلوبة — تمنع قيد الطلب مرتين عند إعادة إرسال فاشلة',
      },
      { status: 400 }
    )
  }

  const result = await createOrderWithShipment({
    merchantId: auth.merchant.id,
    recipientName: str(body.customer_name) || str(body.recipient_name),
    recipientPhone: str(body.customer_phone) || str(body.recipient_phone),
    governorate: str(body.governorate),
    district: str(body.district) || null,
    fullAddress: str(body.full_address) || str(body.address),
    nearestLandmark: str(body.nearest_landmark) || null,
    orderContent: str(body.order_content),
    codAmountIqd: body.cod_amount_iqd,
    deliveryFeeIqd: body.delivery_fee_iqd,
    notes: str(body.notes) || null,
    idempotencyKey: rawKey,
    source: 'api',
  })

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: result.status })
  }

  if (result.duplicate) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      message: 'هذا الطلب مُسجَّل مسبقاً بنفس مفتاح منع التكرار',
      shipment: result.shipment,
    })
  }

  return NextResponse.json(
    { success: true, message: 'تم إنشاء الطلب والشحنة', shipment: result.shipment },
    { status: 201 }
  )
}
