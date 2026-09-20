'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle } from 'lucide-react'
import { getBrowserSupabase } from '@/lib/supabase/client'

/**
 * معالجة رابط البريد — في المتصفح لا الخادم
 * ===========================================
 * ⚠️ روابط الاستعادة من Supabase ترجع بشظية:
 *
 *     /auth/callback#access_token=...&refresh_token=...
 *
 * والشظية (ما بعد #) **لا تُرسل إلى الخادم إطلاقاً** — لا في الطلب ولا في
 * ترويسة أي شيء. فأي معالجة لها على الخادم لا ترى شيئاً. كانت هذه العقدة
 * Route Handler تقرأ ?code= وتردّ "الرابط ناقص" دائماً.
 *
 * عميل المتصفح من @supabase/ssr يلتقط الشظية تلقائياً (detectSessionInUrl)
 * ويكتب الجلسة في **كوكيز** لا في الذاكرة المحلية — ولهذا يستطيع الخادم
 * قراءتها بعدها، فتبقى /reset-password صفحة خادم عادية.
 */
export default function CallbackClient({ next }: { next: string }) {
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const query = new URLSearchParams(window.location.search)

    const fail = () => {
      if (!cancelled) setFailed(true)
    }

    /** الجلسة بُنيت: يُنظَّف شريط العنوان ثم يُسلَّم المستخدم لوجهته.
     *  التنظيف يشمل الشظية **والاستعلام** معاً — كلاهما يحمل سرّاً (توكن أو
     *  رمز) يبقى في سجل التصفّح وفي أي رابط يُنسخ من هنا. */
    const done = () => {
      window.history.replaceState(null, '', window.location.pathname)
      router.replace(next)
    }

    async function run() {
      // رابط منتهٍ أو مُستعمَل. يُفحص الموضعان معاً: Supabase يضع الخطأ في
      // الاستعلام **و** الشظية، والاكتفاء بالشظية يترك الصفحة تدور ثم تفشل
      // برسالة أعمّ بدل الرسالة الصحيحة فوراً.
      if (hash.has('error') || query.has('error')) return fail()

      const supabase = getBrowserSupabase()

      // ⚠️ لا يكفي انتظار detectSessionInUrl هنا: createBrowserClient يعمل
      // بتدفّق PKCE افتراضياً فيلتقط ?code= ويتجاهل الشظية تماماً. وروابط
      // الاستعادة ترجع بشظية implicit، فتُقرأ ويُبنى منها الجلسة صراحةً.
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (cancelled) return
        if (error || !data.session) return fail()

        // الشظية تُمحى من شريط العنوان: بقاؤها يُسرّب التوكن في سجل
        // التصفّح وفي أي رابط يشاركه المستخدم من هذه الصفحة
        return done()
      }

      // رابط PKCE قديم لم يزل في صندوق بريد: أُرسل قبل تحويل الإرسال إلى
      // implicit، فيصل بـ ?code= بدل الشظية. يُستبدل ما دام مُثبِته
      // (code_verifier) في كوكيز هذا المتصفح — أي ما دام الرابط يُفتح على
      // الجهاز الذي طلبه. فُتح على جهاز آخر؟ لا مُثبِت ولا حيلة: يفشل هنا
      // برسالة "اطلب رابطاً جديداً"، والرابط الجديد implicit يعمل من أي جهاز.
      const code = query.get('code')
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (cancelled) return
        if (error || !data.session) return fail()
        return done()
      }

      // بلا شظية ولا رمز: قد تكون الجلسة قائمة سلفاً (فتح الصفحة مرتين)
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) router.replace(next)
      else fail()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [router, next])

  if (failed) {
    return (
      <div className="text-center">
        <AlertCircle size={24} className="mx-auto text-amber-600 mb-2" />
        <p className="font-black text-sm text-[#0F172A]">تعذّر فتح الرابط</p>
        <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5">
          روابط البريد تُستعمل مرة واحدة وتنتهي بعد مدة قصيرة.
        </p>
        <Link
          href="/login"
          className="mt-4 w-full inline-flex items-center justify-center bg-[#253765] hover:bg-[#1D2B50] text-white text-sm font-bold rounded-xl px-5 py-2.5 transition-colors"
        >
          اطلب رابطاً جديداً
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <span className="w-6 h-6 border-2 border-[#253765]/30 border-t-[#253765] rounded-full animate-spin" />
      <p className="text-xs text-slate-500">جارٍ التحقق من الرابط…</p>
    </div>
  )
}
