import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { Shipment } from '@/lib/shipments'

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
 */

const IRAQI_PHONE = /^07[0-9]{9}$/

/** يطبّع رقم الهاتف العراقي إلى الصيغة المحلية 07XXXXXXXXX */
function normalizeIraqiPhone(raw: string): string | null {
  if (!raw) return null
  let digits = String(raw).replace(/[^0-9]/g, '')
  if (digits.startsWith('964') && digits.length === 13) digits = '0' + digits.slice(3)
  if (digits.length === 10 && digits.startsWith('7')) digits = '0' + digits
  return IRAQI_PHONE.test(digits) ? digits : null
}

export async function POST(req: NextRequest) {
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

    // ---------- التحقق ----------
    const errors: string[] = []
    if (!customerName) errors.push('اسم الزبون مطلوب')
    if (!governorate) errors.push('المحافظة مطلوبة')
    if (!orderContent) errors.push('محتوى الطلب مطلوب')
    if (!fullAddress) errors.push('العنوان الكامل مطلوب')

    const phone = normalizeIraqiPhone(String(body?.phone_number || ''))
    if (!phone) errors.push('رقم هاتف غير صالح — المطلوب صيغة عراقية 07XXXXXXXXX')

    if (!Number.isFinite(codAmount) || codAmount < 0) errors.push('مبلغ الطلب غير صالح')
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) errors.push('أجرة التوصيل غير صالحة')

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: errors.join(' · ') }, { status: 400 })
    }

    // ---------- التاجر ----------
    const { data: merchant, error: merchantError } = await supabaseServer
      .from('merchants')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (merchantError || !merchant) {
      return NextResponse.json(
        { success: false, error: 'لا يوجد تاجر مُهيّأ في جدول merchants — أضف تاجراً واحداً على الأقل قبل الحجز' },
        { status: 500 }
      )
    }

    // ---------- 1) إنشاء الطلب ----------
    const { data: order, error: orderError } = await supabaseServer
      .from('orders')
      .insert({
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
        { success: false, error: orderError?.message || 'تعذر إنشاء الطلب' },
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
        { success: false, error: shipmentError?.message || 'تعذر إنشاء الشحنة — أُلغي الطلب' },
        { status: 500 }
      )
    }

    console.log('[BOOK_ORDER][CREATED]', {
      order_id: order.order_id,
      tracking_number: (shipment as Shipment).tracking_number,
    })

    return NextResponse.json({
      success: true,
      message: 'تم حجز الطلب وإنشاء الشحنة بنجاح',
      order_id: order.order_id,
      order_content: orderContent,
      shipment: { ...(shipment as Shipment), merchant_name: merchant.name },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ داخلي في حجز الطلب'
    console.error('[BOOK_ORDER][ERROR]', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
