import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * حارس المسارات — الطبقة الأولى
 * ===============================
 * قبله كانت /admin و/operations و/workspace و/dashboard تُفتح بالرابط بلا أي
 * تحقق هوية: أرصدة كل التجار والإيرادات والعمولات لمن يعرف العنوان.
 *
 * ⚠️ هذا الملف يمنع الوصول غير المُصادَق فقط، ولا يفحص الدور. فحص الدور يقع
 * في الصفحة نفسها عبر requireRole (lib/auth.ts) لأنه يحتاج قراءة profiles من
 * قاعدة البيانات، و middleware يعمل على حافة الشبكة في كل طلب — استعلام
 * إضافي هناك يُبطّئ كل شيء، والأسوأ أنه يجعل الصلاحية تُفحص في مكانين
 * فيفترقان مع الوقت. المرجع واحد: requireRole.
 *
 * أي مسار جديد تحت هذه الجذور محميّ تلقائياً بحكم matcher أدناه — الافتراض
 * هو المنع، والاستثناء يُكتب صراحةً.
 */

/** جذور تتطلّب جلسة. كل ما تحتها محميّ. */
const PROTECTED_PREFIXES = ['/admin', '/operations', '/workspace', '/dashboard']

export async function proxy(request: NextRequest) {
  // الاستجابة تُبنى أولاً لأن Supabase قد يجدّد التوكن ويكتب كوكيز عليها
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser لا getSession: تتحقق من التوكن لدى خادم Supabase بدل تصديق
  // الكوكي كما هو. ولها أثر جانبي مقصود هنا — تجديد التوكن قبل انتهائه.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  )

  if (isProtected && !user) {
    const loginUrl = new URL('/login', request.url)
    // مسار العودة يُمرَّر نسبياً فقط — قبول عنوان كامل يجعل الصفحة أداة
    // تحويل مفتوحة تُستعمل في التصيّد باسم نطاق برق.
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  // الداخل لا يرى صفحة الدخول — يُعاد إلى الجذر فيوزّعه على واجهته حسب دوره
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * كل المسارات عدا:
     *   _next/static, _next/image  — أصول البناء
     *   favicon.ico وملفات الصور    — أصول ثابتة
     *   api/                        — مسارات الـ API تحرس نفسها: منها ما
     *                                 يُصادَق بمفتاح آلة أو توقيع HMAC لا
     *                                 بجلسة، وتحويل نداء fetch إلى صفحة
     *                                 HTML للدخول يكسر العميل بدل إفادته.
     */
    '/((?!_next/static|_next/image|api/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
