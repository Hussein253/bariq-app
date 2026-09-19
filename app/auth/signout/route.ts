import { NextResponse, type NextRequest } from 'next/server'
import { createSessionClient } from '@/lib/supabase/session'

/**
 * GET /auth/signout — إنهاء جلسة وإعادة إلى الدخول
 * ==================================================
 * وُجد لحالة بعينها: حساب له جلسة صالحة في Supabase لكن بلا صفّ في profiles،
 * أي بلا دور. إجراء الدخول يُنهي جلسة كهذا فوراً، لكن رابط استعادة كلمة
 * المرور يمنح جلسةً دون المرور به.
 *
 * بدون هذا المسار تنشأ حلقة لانهائية: الجذر لا يجد دوراً فيرسل إلى /login،
 * و proxy.ts يرى جلسةً قائمة فيعيده إلى الجذر. إنهاء الجلسة يكسرها من
 * أصلها — وكتابة الكوكيز تلزم Route Handler لا Server Component.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl
  const reason = searchParams.get('reason')

  const supabase = await createSessionClient()
  await supabase.auth.signOut()

  const target = new URL('/login', origin)
  if (reason === 'no_profile') target.searchParams.set('error', 'no_profile')
  return NextResponse.redirect(target)
}
