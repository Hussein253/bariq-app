import { createBrowserClient } from '@supabase/ssr'

/**
 * عميل Supabase للمتصفح — مربوط بجلسة المستخدم
 * ==============================================
 * يقرأ توكن الجلسة من الكوكيز التي يكتبها الخادم، فكل استعلام من المتصفح
 * يمرّ بدور authenticated وتحكمه سياسات RLS الخاصة بالمستخدم.
 *
 * هذا ما يجعل تضييق سياسات المحادثات ممكناً بلا تعطيل Supabase Realtime:
 * العميل القديم (lib/supabase.ts) كان يستعمل مفتاح anon المجرّد، فكان البث
 * الحي يتطلّب سياسة `using (true)` تفتح كل محادثات كل التجار لأي زائر.
 * الآن الاشتراك نفسه مُصادَق، فتكفيه سياسة مقيّدة بتاجر المستخدم.
 */

let browserClient: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserSupabase() {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { realtime: { params: { eventsPerSecond: 10 } } }
    )
  }
  return browserClient
}
