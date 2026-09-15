import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { authenticateMerchant } from '@/lib/api-auth'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'

/**
 * /api/orders/:id — استعلام طلب واحد وتعديل ملاحظاته
 * ====================================================
 * :id هو orders.order_id، نفس ما يستعمله /api/orders/:id/dispatch.
 *
 * ⚠️ ما تغيّر: النسخة السابقة كانت تقرأ من مخزن الذاكرة، وتسمح لأي مُرسِل
 * بلا أي تحقق هوية بتعيين status و payment_status لأي طلب — بما فيها القفز
 * مباشرة إلى "تم التسليم" أو "تم الدفع".
 *
 * الآن:
 *   • التاجر يُستخرج من مفتاح الـ API، والطلب يُقيَّد بشحنة هذا التاجر وحده.
 *   • تغيير حالة الشحنة ليس من صلاحية التاجر: الحالة يحرّكها تشغيل برق عبر
 *     /api/delivery/sync الموقَّع، وتفرض القاعدة تسلسلها (بند ٤-٢).
 *     التاجر يعدّل ملاحظاته فقط.
 */

const LIMIT = 120
const WINDOW_MS = 60_000

const SHIPMENT_FIELDS =
  'id, tracking_number, order_id, status, recipient_name, recipient_phone, governorate, district, nearest_landmark, full_address, cod_amount_iqd, delivery_fee_iqd, merchant_net_amount_iqd, currency, settlement_status, settled_at, postponed_reason, returned_reason, notes, picked_up_at, in_transit_at, out_for_delivery_at, delivered_at, postponed_at, returned_at, created_at, updated_at, orders(order_content, current_state, created_at)'

function parseOrderId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`order:get:${clientKey(req)}`, LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  const auth = await authenticateMerchant(req)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const orderId = parseOrderId((await params).id)
  if (orderId === null) {
    return NextResponse.json({ success: false, error: 'معرّف الطلب غير صالح' }, { status: 400 })
  }

  const { data, error } = await supabaseServer
    .from('shipments')
    .select(SHIPMENT_FIELDS)
    .eq('order_id', orderId)
    .eq('merchant_id', auth.merchant.id)
    .maybeSingle()

  if (error) {
    log.error('ORDER_GET_FAILED', { order_id: orderId, reason: error.message })
    return NextResponse.json({ success: false, error: 'تعذّر جلب الطلب' }, { status: 500 })
  }
  // طلب تاجر آخر يعود "غير موجود" لا "ممنوع": الرد بـ 403 يؤكّد للمُستعلم أن
  // الرقم قائم فعلاً، فيتحوّل المسار إلى أداة إحصاء لطلبات المنافسين.
  if (!data) {
    return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
  }

  return NextResponse.json({ success: true, shipment: data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`order:patch:${clientKey(req)}`, LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  const auth = await authenticateMerchant(req)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const orderId = parseOrderId((await params).id)
  if (orderId === null) {
    return NextResponse.json({ success: false, error: 'معرّف الطلب غير صالح' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'جسم الطلب ليس JSON صالحاً' }, { status: 400 })
  }

  if ('status' in body) {
    return NextResponse.json(
      {
        success: false,
        error:
          'تغيير حالة الشحنة ليس من صلاحية التاجر — الحالة يحرّكها تشغيل برق وفق تسلسل مُلزَم',
      },
      { status: 403 }
    )
  }

  if (typeof body.notes !== 'string') {
    return NextResponse.json(
      { success: false, error: 'الحقل القابل للتعديل الوحيد هو notes (نص)' },
      { status: 422 }
    )
  }

  const notes = body.notes.trim().slice(0, 1000) || null

  const { data, error } = await supabaseServer
    .from('shipments')
    .update({ notes })
    .eq('order_id', orderId)
    .eq('merchant_id', auth.merchant.id)
    .select('id, tracking_number, order_id, status, notes, updated_at')
    .maybeSingle()

  if (error) {
    log.error('ORDER_PATCH_FAILED', { order_id: orderId, reason: error.message })
    return NextResponse.json({ success: false, error: 'تعذّر تحديث الطلب' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
  }

  return NextResponse.json({ success: true, message: 'تم تحديث الملاحظات', shipment: data })
}
