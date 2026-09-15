import { supabaseServer } from '@/lib/supabase-server'
import { validateIntake } from '@/lib/order-validation'
import { log, maskPhone } from '@/lib/log'

export { validateIntake } from '@/lib/order-validation'

/**
 * استقبال الطلبات — المسار الوحيد لإنشاء طلب وشحنته
 * ==================================================
 * يشترك فيه /api/orders (نظام التاجر الخارجي) و/api/webhooks/bot (البوت)،
 * حتى لا يتفرّع منطق مالي إلى نسختين تفترق إحداهما عن الأخرى بصمت.
 *
 * قواعد ملزمة مطبَّقة هنا (CLAUDE.md بندا ٢-أ و٤):
 *
 * • لا قيمة مالية افتراضية إطلاقاً. النسخة السابقة من مسار البوت كانت تكتب
 *   `Number(data.total_amount) || 25000` و`delivery_fee || 5000` — أي أن
 *   حقلاً مفقوداً في رسالة واردة كان يُنتج طلباً بمبلغ مُخترع يُطالَب به
 *   زبون حقيقي. الحقل المفقود هنا يُرفض برد ٤٢٢، ولا يُخمَّن.
 *
 * • لا رقم هاتف افتراضي. كان '07700000000' يُسند عند غياب الرقم، فتُنشأ
 *   شحنة لا تصل أحداً وتُنسب لرقم قد يخصّ شخصاً آخر فعلاً.
 *
 * • الفصل المالي: ثمن البضاعة (COD) وأجرة التوصيل حقلان مستقلان يصلان
 *   منفصلين. الصافي لا يُرسَل ولا يُحسب هنا — عمود merchant_net_amount_iqd
 *   تشتقّه القاعدة.
 *
 * • منع التكرار: idempotency_key فريد على مستوى القاعدة. إعادة إرسال نفس
 *   الحدث تُعيد الشحنة الأصلية بدل قيدها مرتين.
 */

export interface OrderIntakeInput {
  merchantId: string
  recipientName: string
  recipientPhone: string
  governorate: string
  district?: string | null
  fullAddress: string
  nearestLandmark?: string | null
  orderContent: string
  codAmountIqd: unknown
  deliveryFeeIqd: unknown
  notes?: string | null
  /** مفتاح منع التكرار كما ورد من المُرسِل — يُنطَّق بالمصدر قبل الحفظ. */
  idempotencyKey: string
  /** بادئة تميّز مصدر الطلب في المفتاح: 'api' أو 'bot'. */
  source: 'api' | 'bot'
}

export interface IntakeShipment {
  id: string
  tracking_number: string
  order_id: number
  status: string
  cod_amount_iqd: number | string
  delivery_fee_iqd: number | string
  merchant_net_amount_iqd: number | string
  created_at: string
}

export type OrderIntakeResult =
  | { ok: true; shipment: IntakeShipment; duplicate: boolean }
  | { ok: false; status: number; error: string }

const SHIPMENT_SELECT =
  'id, tracking_number, order_id, status, cod_amount_iqd, delivery_fee_iqd, merchant_net_amount_iqd, created_at'

export async function createOrderWithShipment(
  input: OrderIntakeInput
): Promise<OrderIntakeResult> {
  const { errors, phone, cod, fee } = validateIntake(input)
  if (errors.length > 0) {
    return { ok: false, status: 422, error: errors.join(' · ') }
  }

  const scopedKey = `${input.source}:${input.merchantId}:${input.idempotencyKey}`

  const { data: existing, error: existingError } = await supabaseServer
    .from('shipments')
    .select(SHIPMENT_SELECT)
    .eq('idempotency_key', scopedKey)
    .maybeSingle()

  if (existingError) {
    log.error('INTAKE_IDEMPOTENCY_CHECK_FAILED', { reason: existingError.message })
    return { ok: false, status: 500, error: 'تعذّر التحقق من تكرار الطلب' }
  }
  if (existing) {
    return { ok: true, shipment: existing as IntakeShipment, duplicate: true }
  }

  const name = input.recipientName.trim()
  const governorate = input.governorate.trim()
  const fullAddress = input.fullAddress.trim()
  const district = input.district?.trim() || null
  const landmark = input.nearestLandmark?.trim() || null
  const orderContent = input.orderContent.trim()
  const notes = input.notes?.trim() || null

  // ---------- 1) الطلب ----------
  const { data: order, error: orderError } = await supabaseServer
    .from('orders')
    .insert({
      phone_number: phone,
      contact_phone: phone,
      name,
      customer_name: name,
      governorate,
      district,
      address: fullAddress,
      address_details: landmark,
      order_content: orderContent,
      current_state: 'confirmed',
      items_total_iqd: cod,
      delivery_fee_iqd: fee,
      grand_total_iqd: cod,
      updated_at: new Date().toISOString(),
    })
    .select('order_id')
    .single()

  if (orderError || !order) {
    log.error('INTAKE_ORDER_INSERT_FAILED', { reason: orderError?.message })
    return { ok: false, status: 500, error: 'تعذّر إنشاء الطلب' }
  }

  // ---------- 2) الشحنة — رقم التتبع تولّده القاعدة لا الكود ----------
  const { data: shipment, error: shipmentError } = await supabaseServer
    .from('shipments')
    .insert({
      order_id: order.order_id,
      merchant_id: input.merchantId,
      recipient_name: name,
      recipient_phone: phone,
      governorate,
      district,
      nearest_landmark: landmark,
      full_address: fullAddress,
      cod_amount_iqd: cod,
      delivery_fee_iqd: fee,
      notes,
      idempotency_key: scopedKey,
    })
    .select(SHIPMENT_SELECT)
    .single()

  if (shipmentError || !shipment) {
    // لا معاملة عبر PostgREST — التنظيف الصريح يمنع طلباً يتيماً بلا شحنة
    await supabaseServer.from('orders').delete().eq('order_id', order.order_id)
    log.error('INTAKE_SHIPMENT_INSERT_FAILED', {
      order_id: order.order_id,
      reason: shipmentError?.message,
    })
    return { ok: false, status: 500, error: 'تعذّر إنشاء الشحنة — أُلغي الطلب' }
  }

  log.info('ORDER_INTAKE_CREATED', {
    source: input.source,
    merchant_id: input.merchantId,
    order_id: order.order_id,
    tracking_number: (shipment as IntakeShipment).tracking_number,
    recipient_phone: maskPhone(phone),
  })

  return { ok: true, shipment: shipment as IntakeShipment, duplicate: false }
}
