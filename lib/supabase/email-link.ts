import { createClient } from '@supabase/supabase-js'

/**
 * عميل إرسال روابط البريد — تدفّق implicit صراحةً
 * ================================================
 * ⚠️ لا يُستعمل لقراءة جلسة ولا لكتابتها. وظيفته الوحيدة نداء
 * `signInWithOtp` و`resetPasswordForEmail`، وكلاهما نداء بلا حالة: لا يقرأ
 * كوكي ولا يكتبه، فلا حاجة به إلى createServerClient.
 *
 * لماذا لا createSessionClient؟
 * ------------------------------
 * `createServerClient` من @supabase/ssr يفرض `flowType: "pkce"` فرضاً — يضعه
 * **بعد** خيارات المستخدم فيبتلع أي قيمة تُمرَّر. وPKCE يكسر رابط البريد من
 * وجهين:
 *
 *   ١. Supabase يردّ حينها بـ `?code=` في الاستعلام لا بشظية، و/auth/callback
 *      لا تقرأ إلا الشظية — فالرمز يُستهلك ولا تُبنى جلسة. هذا هو العطل
 *      نفسه: سجلّ `auth.flow_state` يُظهر `code_challenge_method = s256`
 *      و`auth_code_issued_at` مضبوطاً، أي أن /verify نجح وأصدر رمزاً لم
 *      يستبدله أحد.
 *
 *   ٢. والأهم: مُثبِت PKCE (code_verifier) يُكتب في كوكي **الجهاز الذي طلب
 *      الرابط**. ومن يطلب الرابط من حاسوبه ثم يفتح بريده على هاتفه لن يجد
 *      المُثبِت هناك أبداً. وهذه هي الحالة الشائعة لا النادرة في روابط
 *      البريد، فPKCE هنا يكسر الاستعمال الطبيعي لا الشاذ.
 *
 * وimplicit يردّ بـ `#access_token&refresh_token` في الشظية: لا تُرسَل إلى أي
 * خادم، وتُمحى من شريط العنوان فور بناء الجلسة (CallbackClient)، وتعمل من أي
 * جهاز ومن أي متصفح.
 */
export function createEmailLinkClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )
}
