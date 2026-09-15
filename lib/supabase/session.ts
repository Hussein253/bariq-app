import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * عميل Supabase للخادم مربوطاً بجلسة المستخدم
 * =============================================
 * ⚠️ لا يُخلط بـ lib/supabase-server.ts:
 *
 *   • هذا الملف      → دور المستخدم (authenticated/anon)، محكوم بـ RLS.
 *                       يُستعمل حين يجب أن يرى المستخدم ما يخصّه فقط.
 *   • supabase-server → service_role، يتجاوز RLS.
 *                       يُستعمل للعمل الخلفي (webhooks، مسارات الآلة) وبعد
 *                       التحقق الصريح من الصلاحية في الكود.
 *
 * القاعدة: إن كان المصدر طلب مستخدم، ابدأ من هنا. لا تلجأ إلى service_role
 * إلا لعمل لا يملكه مستخدم بعينه — وحينها افحص الدور بنفسك أولاً.
 */
export async function createSessionClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // الكتابة في الكوكيز ممنوعة داخل Server Component — يتكفّل
            // middleware بتجديد الجلسة، فتجاهل الفشل هنا مقصود لا إهمال.
          }
        },
      },
    }
  )
}
