import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { verifySignature } from '@/lib/webhook-signature'
import { clientKey, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { log } from '@/lib/log'
import { isBotToolName, parseToolCall, runBotTool } from '@/lib/bot-tools'
import { isUuid } from '@/lib/bot-tools/normalize'
import { createSupabaseStore } from '@/lib/bot-tools/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bot-tools/:tool — أدوات الموظف الذكي (قراءة فقط)
 * ===========================================================
 * :tool ∈ search_products | get_product_details | check_availability | quote_shipping
 * العقود والأمثلة: docs/bot-tools-api.md. الأنواع: lib/product-knowledge.ts.
 *
 * الجسم: { "merchant_id": "<uuid>", "input": { ...ما يملؤه النموذج... } }
 * التوقيع: x-bariq-signature = HMAC-SHA256(الجسم الخام، BARIQ_BOT_WEBHOOK_SECRET)
 * — نفس سرّ وآلية /api/webhooks/bot، فلا متغيّر بيئة جديد ولا سرّ ثانٍ في n8n.
 *
 * ⚠️ merchant_id تضعه عقدة n8n من «تحديد التاجر» (حساب التواصل المعتمد) لا النموذج،
 * ويُغطّيه التوقيع. مدخلات النموذج لا تُقرأ منها هوية التاجر أبداً (درس C1).
 *
 * ⚠️ التوقيع بلا طابع زمني (نفس حدّ M1 في docs/launch-readiness.md): طلب مُلتقَط يمكن
 * إعادته. الأثر هنا قراءة بيانات منتجات يعرضها التاجر للزبائن أصلاً، لا كتابة.
 */

const LIMIT = 600
const WINDOW_MS = 60_000

function reject(status: number, error: string) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(req: Request, { params }: { params: Promise<{ tool: string }> }) {
  const limit = rateLimit(`bot:tools:${clientKey(req)}`, LIMIT, WINDOW_MS)
  if (!limit.allowed) return tooManyRequests(limit)

  // التوقيع قبل أي شيء، حتى اسم الأداة: غير المُصادَق لا يعرف ما هو موجود.
  const rawBody = await req.text()
  const check = verifySignature({
    rawBody,
    signature: req.headers.get('x-bariq-signature'),
    secret: process.env.BARIQ_BOT_WEBHOOK_SECRET,
  })
  if (!check.ok) {
    log.warn('BOT_TOOL_REJECTED', { reason: check.error })
    return reject(check.status, check.error)
  }

  const { tool } = await params
  if (!isBotToolName(tool)) return reject(404, 'أداة غير معروفة')

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return reject(400, 'الجسم ليس JSON صالحاً')
  }
  const payload =
    body !== null && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}

  const merchantId = payload.merchant_id
  if (!isUuid(merchantId)) return reject(400, 'merchant_id مطلوب بصيغة UUID')

  const parsed = parseToolCall(tool, payload.input)
  if (!parsed.ok) return reject(400, parsed.error)

  const started = Date.now()
  try {
    const result = await runBotTool(createSupabaseStore(supabaseServer), { merchantId }, parsed.call)
    log.info('BOT_TOOL', { tool, merchant_id: merchantId, status: result.status, ms: Date.now() - started })
    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    // رسالة القاعدة للسجلّ فقط: لا تصل النموذج (قد يكرّرها للزبون) ولا n8n.
    log.error('BOT_TOOL_FAILED', {
      tool,
      merchant_id: merchantId,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : 'unknown',
    })
    return reject(500, 'تعذّر تنفيذ الأداة')
  }
}
