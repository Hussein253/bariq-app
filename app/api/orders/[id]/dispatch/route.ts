import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { normalizeIraqiPhone } from '@/lib/phone'
import type { Shipment } from '@/lib/shipments'

/**
 * POST /api/orders/:id/dispatch — إرسال طلب مؤكَّد للشحن (إنشاء شحنة)
 * =====================================================================
 * :id هنا هو orders.order_id (bigint)، وليس shipments.id.
 *
 * يُنشئ صفاً في shipments لهذا الطلب (حالة ORDER_RECEIVED الافتراضية)،
 * تماماً كما يفعل /api/orders/book لكن للطلب الموجود مسبقاً بدل نموذج يدوي.
 * shipments.order_id فريد، فمحاولة إرسال نفس الطلب مرتين تُرفض من القاعدة
 * حتى لو انزلق أي فحص هنا (حماية Idempotency حقيقية على مستوى القاعدة).
 *
 * مطابقة الحقول المالية: cod_amount_iqd و delivery_fee_iqd تُؤخذان مباشرة
 * من orders.items_total_iqd و orders.delivery_fee_iqd (الطلبات المؤكدة عبر
 * البوت تخزّنهما منفصلين فعلاً، خلافاً لنموذج الحجز اليدوي) — بند 4-4.
 */

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const orderId = Number(id)
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return NextResponse.json({ success: false, error: 'معرّف الطلب غير صالح' }, { status: 400 })
    }

    // 1) جلب الطلب
    const { data: order, error: orderError } = await supabaseServer
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle()

    if (orderError) {
      return NextResponse.json({ success: false, error: orderError.message }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ success: false, error: 'الطلب غير موجود' }, { status: 404 })
    }
    if (order.current_state !== 'confirmed') {
      return NextResponse.json(
        { success: false, error: `لا يمكن إرسال هذا الطلب للشحن — حالته الحالية: ${order.current_state ?? 'غير معروفة'} (يجب أن تكون confirmed)` },
        { status: 400 }
      )
    }

    // 2) هل سبق إرسال هذا الطلب للشحن؟
    const { data: existingShipment, error: existingError } = await supabaseServer
      .from('shipments')
      .select('id, tracking_number, status')
      .eq('order_id', orderId)
      .maybeSingle()

    if (existingError) {
      return NextResponse.json({ success: false, error: existingError.message }, { status: 500 })
    }
    if (existingShipment) {
      return NextResponse.json(
        { success: false, error: 'تم إرسال هذا الطلب للشحن مسبقاً', shipment: existingShipment },
        { status: 409 }
      )
    }

    // 3) التحقق من اكتمال بيانات الطلب اللازمة لإصدار شحنة
    const recipientName = String(order.customer_name || order.name || '').trim()
    const governorate = String(order.governorate || '').trim()
    const fullAddress = String(order.address || '').trim()
    const recipientPhone = normalizeIraqiPhone(order.contact_phone) || normalizeIraqiPhone(order.phone_number)

    const errors: string[] = []
    if (!recipientName) errors.push('اسم المستلم غير متوفر في الطلب')
    if (!governorate) errors.push('المحافظة غير محددة في الطلب')
    if (!fullAddress) errors.push('العنوان الكامل غير متوفر في الطلب')
    if (!recipientPhone) errors.push('رقم هاتف المستلم غير صالح (يلزم صيغة عراقية 07XXXXXXXXX) — صحّح رقم الطلب أولاً')

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join(' · ') }, { status: 422 })
    }

    // 4) التاجر الافتراضي (orders لا يحمل merchant_id بعد — نفس نهج /api/orders/book)
    const { data: merchant, error: merchantError } = await supabaseServer
      .from('merchants')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (merchantError || !merchant) {
      return NextResponse.json(
        { success: false, error: 'لا يوجد تاجر مُهيّأ في جدول merchants — أضف تاجراً واحداً على الأقل قبل الإرسال للشحن' },
        { status: 500 }
      )
    }

    // 5) إنشاء الشحنة
    const { data: shipment, error: shipmentError } = await supabaseServer
      .from('shipments')
      .insert({
        order_id: order.order_id,
        merchant_id: merchant.id,
        recipient_name: recipientName,
        recipient_phone: recipientPhone,
        governorate,
        district: order.district || null,
        nearest_landmark: order.address_details || null,
        full_address: fullAddress,
        cod_amount_iqd: Number(order.items_total_iqd) || 0,
        delivery_fee_iqd: Number(order.delivery_fee_iqd) || 0,
        idempotency_key: `bot-order-${order.order_id}`,
      })
      .select()
      .single()

    if (shipmentError || !shipment) {
      console.error('[ORDER_DISPATCH][SHIPMENT_INSERT_ERROR]', shipmentError?.message)
      return NextResponse.json(
        { success: false, error: shipmentError?.message || 'تعذر إنشاء الشحنة' },
        { status: 500 }
      )
    }

    console.log('[ORDER_DISPATCH][CREATED]', {
      order_id: order.order_id,
      tracking_number: (shipment as Shipment).tracking_number,
    })

    return NextResponse.json({
      success: true,
      message: 'تم إرسال الطلب للشحن بنجاح',
      shipment: { ...(shipment as Shipment), merchant_name: merchant.name },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ داخلي في إرسال الطلب للشحن'
    console.error('[ORDER_DISPATCH][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
