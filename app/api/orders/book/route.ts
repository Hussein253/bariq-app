import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { normalizeIraqiPhone } from '@/lib/phone'
import type { Shipment } from '@/lib/shipments'
import { requireSession } from '@/lib/api-session'
import { apiMessages } from '@/lib/i18n/api'

/**
 * POST /api/orders/book — حجز طلب جديد من لوحة التحكم
 * ====================================================
 * يمر الحجز عبر الخادم بمفتاح service_role عمداً، ولا يُدرج من المتصفح:
 * صلاحيات anon على orders و shipments مسحوبة بالترحيلات 005–007،
 * وقواعد العمل (تطبيع الهاتف، ربط التاجر، الذرّية) تُفرض هنا لا في الواجهة.
 *
 * ⚠️ رقم التتبع لا يُولَّد في الكود إطلاقاً. عمود shipments.tracking_number
 * له قيمة افتراضية في قاعدة البيانات تعتمد تسلسل shipments_tracking_seq:
 *   'BRQ-' || lpad(nextval('shipments_tracking_seq')::text, 6, '0')
 * توليده هنا كان سيسبب تصادماً عند حجزين متزامنين.
 *
 * التاجر: merchant_id يصل إلزامياً في جسم الطلب ويُتحقَّق منه (الترحيل ٠١٦
 * جعله عموداً إلزامياً على orders). الحاجز هنا staff/platform_owner يحجزون
 * نيابةً عن أي تاجر — بخلاف /workspace حيث هوية التاجر تأتي من الجلسة عبر
 * requireMerchantScope. قبل هذا التعديل كان المسار يسحب أول تاجر في الجدول
 * عشوائياً، فأي تاجر ثانٍ كان يعني حجز طلبات تاجر أول باسم تاجر آخر بصمت.
 */

export async function POST(req: NextRequest) {
  const t = await apiMessages()
  const guard = await requireSession(['platform_owner', 'staff'])
  if (!guard.ok) return guard.response
  try {
    const body = await req.json().catch(() => ({}))
    const customerName = String(body?.customer_name || '').trim()
    const governorate = String(body?.governorate || '').trim()
    const district = String(body?.district || '').trim() || null
    const orderContent = String(body?.order_content || '').trim()
    const fullAddress = String(body?.full_address || '').trim()
    const landmark = String(body?.nearest_landmark || '').trim() || null
    const notes = String(body?.notes || '').trim() || null
    const codAmount = Number(body?.cod_amount_iqd ?? 0)
    const deliveryFee = Number(body?.delivery_fee_iqd ?? 0)
    const merchantId = String(body?.merchant_id || '').trim()

    // ---------- التحقق ----------
    const errors: string[] = []
    if (!merchantId) errors.push(t.booking.merchantRequired)
    if (!customerName) errors.push(t.booking.customerNameRequired)
    if (!governorate) errors.push(t.booking.governorateRequired)
    if (!orderContent) errors.push(t.booking.contentRequired)
    if (!fullAddress) errors.push(t.booking.addressRequired)

    const phone = normalizeIraqiPhone(String(body?.phone_number || ''))
    if (!phone) errors.push(t.booking.phoneInvalid)

    if (!Number.isFinite(codAmount) || codAmount < 0) errors.push(t.booking.codInvalid)
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) errors.push(t.booking.feeInvalid)

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join(' · ') }, { status: 400 })
    }

    // ---------- التاجر — يُتحقَّق من هويته، لا يُخمَّن ----------
    const { data: merchant, error: merchantError } = await supabaseServer
      .from('merchants')
      .select('id, name, status')
      .eq('id', merchantId)
      .maybeSingle()

    if (merchantError) {
      return NextResponse.json({ success: false, error: t.booking.merchantCheckFailed }, { status: 500 })
    }
    if (!merchant) {
      return NextResponse.json({ success: false, error: t.booking.merchantNotFound }, { status: 422 })
    }
    if (merchant.status !== 'active') {
      return NextResponse.json({ success: false, error: t.booking.merchantSuspended }, { status: 403 })
    }

    // ---------- 1) إنشاء الطلب ----------
    const { data: order, error: orderError } = await supabaseServer
      .from('orders')
      .insert({
        merchant_id: merchant.id,
        phone_number: phone,
        contact_phone: phone,
        name: customerName,
        customer_name: customerName,
        governorate,
        district,
        address: fullAddress,
        address_details: landmark,
        order_content: orderContent,
        current_state: 'confirmed',
        items_total_iqd: codAmount,
        delivery_fee_iqd: deliveryFee,
        grand_total_iqd: codAmount,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (orderError || !order) {
      console.error('[BOOK_ORDER][ORDER_INSERT_ERROR]', orderError?.message)
      return NextResponse.json(
        { success: false, error: orderError?.message || t.booking.orderCreateFailed },
        { status: 500 }
      )
    }

    // ---------- 2) إنشاء الشحنة (رقم التتبع يولّده الجدول) ----------
    const { data: shipment, error: shipmentError } = await supabaseServer
      .from('shipments')
      .insert({
        order_id: order.order_id,
        merchant_id: merchant.id,
        recipient_name: customerName,
        recipient_phone: phone,
        governorate,
        district,
        nearest_landmark: landmark,
        full_address: fullAddress,
        cod_amount_iqd: codAmount,
        delivery_fee_iqd: deliveryFee,
        notes,
        idempotency_key: `dashboard-order-${order.order_id}`,
      })
      .select()
      .single()

    if (shipmentError || !shipment) {
      // تعويض يدوي: نحذف الطلب حتى لا يبقى يتيماً بلا شحنة
      // (لا توجد معاملة عبر PostgREST، فالتنظيف الصريح هو البديل)
      await supabaseServer.from('orders').delete().eq('order_id', order.order_id)
      console.error('[BOOK_ORDER][SHIPMENT_INSERT_ERROR]', shipmentError?.message)
      return NextResponse.json(
        { success: false, error: shipmentError?.message || t.booking.shipmentCreateFailed },
        { status: 500 }
      )
    }

    console.log('[BOOK_ORDER][CREATED]', {
      order_id: order.order_id,
      tracking_number: (shipment as Shipment).tracking_number,
    })

    return NextResponse.json({
      success: true,
      message: t.booking.success,
      order_id: order.order_id,
      order_content: orderContent,
      shipment: { ...(shipment as Shipment), merchant_name: merchant.name },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : t.booking.internalError
    console.error('[BOOK_ORDER][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
