import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { recordMessage, setBotActive } from '@/lib/conversations-server'
import { createOrderWithShipment } from '@/lib/order-intake'
import { verifySignature } from '@/lib/webhook-signature'
import { normalizeIraqiPhone } from '@/lib/phone'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { log, maskPhone, maskText } from '@/lib/log'
import { STATUS_LABELS, type ShipmentStatus } from '@/lib/shipments'
import { formatArabicCurrency, toArabicDigits } from '@/lib/formatters'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/bot — نقطة استقبال أحداث بوتات المحادثة
 * ============================================================
 * الأحداث: message_received | message_sent | order_created |
 *          order_status_query | human_handover
 *
 * ⚠️ ثلاث مشاكل جوهرية أُصلحت هنا:
 *
 * 1. المسار كان مفتوحاً بلا توقيع ولا سرّ. أي شخص على الإنترنت كان يحقن
 *    رسائل وطلبات باسم زبائن حقيقيين. الآن توقيع HMAC إلزامي، والغياب
 *    يُغلق المسار (٥٠٣) بدل فتحه.
 *
 * 2. المبالغ المُخمَّنة: كان `Number(data.total_amount) || 25000` و
 *    `delivery_fee || 5000` و رقم هاتف افتراضي '07700000000'. حقل مفقود في
 *    رسالة واردة كان يُنتج طلباً بمبلغ مُخترع. الآن الرفض صريح (lib/order-intake).
 *
 * 3. التخزين: كان الطلب يُكتب في مصفوفة داخل الذاكرة ويضيع عند إعادة النشر،
 *    ثم يُرد على الزبون برقم طلب لا وجود له بعد دقائق. الآن في القاعدة.
 *
 * التوقيع: x-bariq-signature = HMAC-SHA256(الجسم الخام، BARIQ_BOT_WEBHOOK_SECRET)
 */

const LIMIT = 600
const WINDOW_MS = 60_000

type BotChannel = 'whatsapp' | 'messenger' | 'instagram' | 'telegram'
const CHANNELS: BotChannel[] = ['whatsapp', 'messenger', 'instagram', 'telegram']

function asChannel(raw: unknown): BotChannel {
  return CHANNELS.includes(raw as BotChannel) ? (raw as BotChannel) : 'whatsapp'
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** رد موحّد يحمل نص رسالة للزبون. */
function botReply(reply: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: true, bot_response: { reply }, ...extra })
}

export async function POST(req: Request) {
  const limit = rateLimit(`bot:webhook:${clientKey(req)}`, LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  const rawBody = await req.text()
  const check = verifySignature({
    rawBody,
    signature: req.headers.get('x-bariq-signature'),
    secret: process.env.BARIQ_BOT_WEBHOOK_SECRET,
  })
  if (!check.ok) {
    log.warn('BOT_WEBHOOK_REJECTED', { reason: check.error })
    return NextResponse.json({ success: false, error: check.error }, { status: check.status })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ success: false, error: 'جسم الطلب ليس JSON صالحاً' }, { status: 400 })
  }

  const event = str(body.event)
  const channel = asChannel(body.channel)
  const data = (body.data ?? {}) as Record<string, unknown>

  // رقم الزبون لا بديل افتراضي له: بدونه لا تُعرف المحادثة ولا يُوصل الطلب
  const customerPhone = normalizeIraqiPhone(str(data.customer_phone) || str(data.from))
  if (!customerPhone) {
    return NextResponse.json(
      { success: false, error: 'رقم هاتف عراقي صالح مطلوب في data.customer_phone' },
      { status: 422 }
    )
  }

  // حساب الأعمال الذي وصلت عبره الرسالة — منه يُعرف التاجر (الترحيل ٠١٩).
  // غيابه = القاعدة القديمة مؤقتاً (docs/n8n-webhook-setup.md)
  const accountExternalId = str(data.account_external_id) || null
  const target = { customerPhone, platform: channel, accountExternalId }

  log.info('BOT_WEBHOOK_IN', {
    event,
    channel,
    account_external_id: accountExternalId,
    customer_phone: maskPhone(customerPhone),
    text: maskText(str(data.text) || str(data.message)),
  })

  // -----------------------------------------------------------------
  // رسالة عادية
  // -----------------------------------------------------------------
  if (event === 'message_received' || event === 'message_sent') {
    const text = str(data.text) || str(data.message)
    if (!text) {
      return NextResponse.json({ success: false, error: 'نص الرسالة مطلوب' }, { status: 422 })
    }

    const { message } = await recordMessage({
      ...target,
      content: text,
      senderType: event === 'message_received' ? 'customer' : 'bot',
    })

    if (!message) {
      return NextResponse.json({ success: false, error: 'تعذّر حفظ الرسالة' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'تم تسجيل الرسالة' })
  }

  // -----------------------------------------------------------------
  // طلب جديد
  // -----------------------------------------------------------------
  if (event === 'order_created') {
    const merchantId = str(data.merchant_id)
    if (!merchantId) {
      return NextResponse.json(
        { success: false, error: 'data.merchant_id مطلوب — الطلب يجب أن يُنسب لتاجر محدّد' },
        { status: 422 }
      )
    }

    const { data: merchant, error: merchantError } = await supabaseServer
      .from('merchants')
      .select('id, name, status')
      .eq('id', merchantId)
      .maybeSingle()

    if (merchantError) {
      return NextResponse.json({ success: false, error: 'تعذّر التحقق من التاجر' }, { status: 500 })
    }
    if (!merchant) {
      return NextResponse.json({ success: false, error: 'لا يوجد تاجر بهذا المعرّف' }, { status: 422 })
    }
    if (merchant.status !== 'active') {
      return NextResponse.json({ success: false, error: 'حساب التاجر موقوف' }, { status: 403 })
    }

    // مفتاح منع التكرار: معرّف الرسالة من القناة إن وُجد، وإلا مفتاح صريح.
    // لا يُولَّد من الوقت — مفتاح زمني يجعل كل إعادة إرسال طلباً جديداً.
    const idempotencyKey = str(data.idempotency_key) || str(data.message_id)
    if (!idempotencyKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'data.idempotency_key (أو data.message_id) مطلوب لمنع قيد الطلب مرتين',
        },
        { status: 400 }
      )
    }

    const result = await createOrderWithShipment({
      merchantId: merchant.id,
      recipientName: str(data.customer_name),
      recipientPhone: customerPhone,
      governorate: str(data.governorate),
      district: str(data.district) || null,
      fullAddress: str(data.full_address) || str(data.address),
      nearestLandmark: str(data.nearest_landmark) || null,
      orderContent: str(data.order_content) || str(data.item_name),
      codAmountIqd: data.cod_amount_iqd,
      deliveryFeeIqd: data.delivery_fee_iqd,
      notes: str(data.notes) || null,
      idempotencyKey,
      source: 'bot',
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    const { shipment, duplicate } = result
    const cod = Number(shipment.cod_amount_iqd) || 0
    const fee = Number(shipment.delivery_fee_iqd) || 0

    // نبرة خدمة العملاء — بند ٥: التفاصيل الحيوية فقط، والمبلغان منفصلان
    // لأن الزبون يدفع مجموعهما عند الاستلام ويحق له معرفة تفصيلهما.
    const reply = `تم تأكيد طلبك ✅\nرقم التتبع: ${shipment.tracking_number}\nثمن الطلب: ${formatArabicCurrency(cod)}\nأجرة التوصيل: ${formatArabicCurrency(fee)}\nالمطلوب عند الاستلام: ${formatArabicCurrency(cod + fee)}\nسنُشعرك عند خروج المندوب للتسليم.`

    // المحادثة تُنسب من الحساب الذي وصلت عبره كسائر الرسائل، لا من
    // data.merchant_id: منطق نسبة واحد في القاعدة (resolve_conversation)
    if (!duplicate) {
      await recordMessage({ ...target, content: reply, senderType: 'bot' })
    }

    return botReply(reply, { duplicate, shipment })
  }

  // -----------------------------------------------------------------
  // استعلام عن حالة الطلب
  // -----------------------------------------------------------------
  if (event === 'order_status_query') {
    const trackingNumber = str(data.tracking_number)

    // بلا رقم تتبع: آخر شحنة لهذا الرقم. المطابقة بالهاتف لا بمعرّف يُمرَّر
    // من الخارج — وإلا استعلم أي شخص عن شحنة أي زبون برقم عشوائي.
    let query = supabaseServer
      .from('shipments')
      .select('tracking_number, status, governorate, cod_amount_iqd, delivery_fee_iqd, created_at')
      .eq('recipient_phone', customerPhone)
      .order('created_at', { ascending: false })
      .limit(1)

    if (trackingNumber) query = query.eq('tracking_number', trackingNumber)

    const { data: rows, error } = await query
    if (error) {
      log.error('BOT_STATUS_QUERY_FAILED', { reason: error.message })
      return NextResponse.json({ success: false, error: 'تعذّر جلب حالة الشحنة' }, { status: 500 })
    }

    const shipment = rows?.[0]
    if (!shipment) {
      const notFound = trackingNumber
        ? `لم نجد شحنة برقم ${trackingNumber} مرتبطة برقمك. تأكّد من الرقم أو راسلنا لنتحقق.`
        : 'لا توجد شحنة مسجّلة على رقمك حالياً.'
      await recordMessage({ ...target, content: notFound, senderType: 'bot' })
      return NextResponse.json(
        { success: false, bot_response: { reply: notFound } },
        { status: 404 }
      )
    }

    const label = STATUS_LABELS[shipment.status as ShipmentStatus] ?? shipment.status
    const total = (Number(shipment.cod_amount_iqd) || 0) + (Number(shipment.delivery_fee_iqd) || 0)
    const reply = `شحنتك ${shipment.tracking_number}\nالحالة: ${label}\nالمطلوب عند الاستلام: ${formatArabicCurrency(total)}`

    await recordMessage({ ...target, content: reply, senderType: 'bot' })
    return botReply(reply, { shipment })
  }

  // -----------------------------------------------------------------
  // تحويل لموظف بشري
  // -----------------------------------------------------------------
  if (event === 'human_handover') {
    const text = str(data.text)
    if (text) {
      await recordMessage({ ...target, content: text, senderType: 'customer' })
    }

    // إيقاف البوت فعلياً — بدونه يظل يردّ فوق الموظف في نفس المحادثة
    await setBotActive({ ...target, botActive: false })

    const reply = 'حوّلنا محادثتك إلى أحد موظفي خدمة العملاء، وسيردّ عليك خلال دقائق.'
    await recordMessage({ ...target, content: reply, senderType: 'system' })

    return botReply(reply)
  }

  log.warn('BOT_WEBHOOK_UNKNOWN_EVENT', { event, channel })
  return NextResponse.json(
    { success: false, error: `حدث غير معروف: ${toArabicDigits(event || '—')}` },
    { status: 422 }
  )
}

export async function GET() {
  // فحص حياة فقط — لا يكشف إعدادات ولا يؤكّد وجود سرّ التوقيع
  return NextResponse.json({ status: 'online', service: 'bariq-bot-webhook' })
}
