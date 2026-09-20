import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { safeInternalPath } from '@/lib/safe-redirect'
import { log } from '@/lib/log'

/**
 * تأكيد روابط البريد في الخادم — المسار المتين
 * ==============================================
 * يستقبل `token_hash` من قالب بريد Supabase ويستبدله بجلسة عبر verifyOtp،
 * ثم يكتب كوكيز الجلسة على استجابة التحويل نفسها.
 *
 * لماذا حلّ محلّ /auth/callback
 * ------------------------------
 * الطريق القديم كان يمرّ بثلاث حلقات، كلٌّ منها كسر الدخول فعلياً مرّة:
 *
 *   ١. **الوجهة تُشتقّ من ترويسة `origin` وقت الطلب.** فمن طلب الرابط من
 *      خادم تطوير محلي حصل على رابط يشير إلى localhost، ومن فتحه بعد إطفاء
 *      الخادم رأى ERR_CONNECTION_REFUSED. الآن الوجهة `{{ .SiteURL }}` من
 *      إعداد المشروع — ثابتة لا تتبع مُرسِل الطلب.
 *
 *   ٢. **قائمة Supabase البيضاء.** أي `redirect_to` غير مُدرَج كان يُرتدّ
 *      بصمت إلى Site URL فيضيع المسار. والرابط الآن يشير إلى برق مباشرةً لا
 *      إلى `/auth/v1/verify`، فلا تحويل من Supabase ولا قائمة تحكمه.
 *
 *   ٣. **شظية تُقرأ في المتصفّح.** كانت تفرض جافاسكربت عاملاً، وتضع التوكن
 *      في شريط العنوان، وتنكسر مع PKCE. وverifyOtp نداء خادم خالص: لا شظية،
 *      ولا مُثبِت مربوط بجهاز، ولا فرق بين فتح الرابط على الحاسوب أو الهاتف.
 *
 * ⚠️ /auth/callback باقية عمداً ولم تُحذف: الروابط المُرسَلة قبل تبديل القالب
 * ما تزال في صناديق البريد وتعمل بها. تُحذف حين تنتهي صلاحيتها كلها.
 */

/** أنواع الروابط المقبولة. ما عداها يُرفض بدل أن يُمرَّر إلى verifyOtp كما وصل. */
const ALLOWED_TYPES = new Set<EmailOtpType>([
  'magiclink',
  'recovery',
  'email',
  'invite',
  'signup',
  'email_change',
])

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  // الوجهة تصل من رابط بريد، أي من أي جهة تصوغ رابطاً وترسله لضحية — تُنقّى
  // كما في /login. وغيابها يعني الجذر، وهو موزّع يعرف وجهة كل دور.
  const next = safeInternalPath(searchParams.get('next')) ?? '/'

  const reject = (reason: string) => {
    // السبب يُسجَّل عندنا ولا يُعرض: رسالة الدخول نصّها من LINK_ERRORS لا من
    // الرابط، وإلا حُقن نصّ يقوله أحدهم باسم برق.
    log.warn('EMAIL_LINK_CONFIRM_FAILED', { reason })
    return NextResponse.redirect(new URL('/login?error=expired_link', request.url))
  }

  if (!tokenHash) return reject('missing_token_hash')
  if (!type || !ALLOWED_TYPES.has(type as EmailOtpType)) return reject('unsupported_type')

  // ⚠️ الاستجابة تُبنى **قبل** verifyOtp لأن كوكيز الجلسة تُكتب عليها هي.
  // استعمال cookies() من next/headers هنا يترك الكتابة لتوفيق إطار العمل،
  // والربط الصريح بالاستجابة لا يحتمل التأويل — نفس نهج proxy.ts.
  const response = NextResponse.redirect(new URL(next, request.url))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  })

  if (error) return reject(error.message)

  log.info('EMAIL_LINK_CONFIRMED', { type })
  return response
}
