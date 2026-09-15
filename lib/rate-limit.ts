/**
 * حدّ معدّل الطلبات (Rate Limiting) — دفاع في العمق
 * ================================================
 * ⚠️ حدّ أفضل-جهد داخل الذاكرة: كل نسخة serverless على Vercel تحتفظ بعدّادها،
 * فالحدّ الفعلي = الحدّ × عدد النسخ الحيّة. هذا يوقف الإغراق من مصدر واحد،
 * ولا يوقف هجوماً موزّعاً. الحماية الحقيقية للمسارات الحساسة هي التحقق من
 * التوقيع (lib/webhook-signature.ts) ومفتاح الـ API — وهذا طبقة فوقهما.
 *
 * الترقية عند الحاجة: مخزن مشترك (Vercel KV / Upstash Redis) بنفس الواجهة.
 */

interface Bucket {
  hits: number[]
}

const buckets = new Map<string, Bucket>()

/** تنظيف دوري حتى لا تتضخّم الخريطة بمفاتيح ميتة في نسخة طويلة العمر. */
const MAX_KEYS = 10_000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * نافذة منزلقة: يسمح بـ limit طلباً خلال windowMs لكل مفتاح.
 * @param key   مفتاح التجميع (IP، أو merchant_id، أو الاثنان).
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs

  if (buckets.size > MAX_KEYS) buckets.clear()

  const bucket = buckets.get(key) ?? { hits: [] }
  bucket.hits = bucket.hits.filter((t) => t > cutoff)

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket)
    const oldest = bucket.hits[0]
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
    }
  }

  bucket.hits.push(now)
  buckets.set(key, bucket)
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 }
}

/**
 * عنوان العميل خلف وكيل Vercel. x-forwarded-for قد يحمل سلسلة عناوين،
 * والأول هو العميل الأصلي. يعود 'unknown' إن غاب — فتتجمّع الطلبات مجهولة
 * المصدر في دلو واحد، وهو السلوك الآمن (يقيّدها مجتمعة بدل إعفائها).
 */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

/** رد ٤٢٩ جاهز بترويسة Retry-After الصحيحة. */
export function tooManyRequests(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ success: false, error: 'طلبات كثيرة جداً — حاول بعد قليل' }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'retry-after': String(result.retryAfterSeconds),
      },
    }
  )
}
