/**
 * تصنيف أخطاء طلب رابط الاستعادة
 * ================================
 * مفصول عن app/forgot-password/actions.ts لأن ذاك ملف `'use server'` لا
 * يصدّر إلا دوالّ غير متزامنة — فلا يُختبر ما فيه. وهذا قرار أمني يستحق
 * اختباراً صريحاً، لا مراجعة بالعين.
 *
 * القاعدة التي يقوم عليها التصنيف
 * ---------------------------------
 * Supabase يحجب وجود الحساب بنفسه: `/recover` يردّ **بالنجاح** لبريد غير
 * مسجَّل. فكل خطأ يرجع منه عطل تشغيلي — مفتاح خاطئ، أو SMTP معطّل، أو حدّ
 * إرسال — ولا يكشف أيٌّ منها حساباً من عدمه. ولذلك يجوز عرضه.
 *
 * وكان الكتمان شاملاً قبل هذا الملف، فابتلع عطلاً حقيقياً: في ٢٠٢٦-٠٩-٢٠ كان
 * مفتاح anon في الإنتاج مفتاحَ مشروع آخر، فيردّ Supabase «Invalid API key»
 * ويرى المستخدم «تفقّد بريدك» وينتظر رسالة لن تأتي. لم يُكشف إلا من سجلّ
 * الخادم بعد ساعات.
 */

export type ResetFailureKind =
  /** حدّ إرسال. ليس سرّاً ولا يخصّ حساباً بعينه — يُعرض ومعه ما يُنتظر. */
  | 'rate_limited'
  /** نصّ قد يكشف وجود الحساب — يُكتم ويُردّ «أُرسلت» كما لو نجح. */
  | 'account_probe'
  /** عطل عندنا: مفتاح، أو بريد، أو خدمة متوقفة. يُعرض صراحةً. */
  | 'service'

/**
 * أنماط تعني «لا حساب بهذا البريد».
 *
 * احتياط لا أكثر: Supabase لا يردّ بها على `/recover` اليوم. لكن هذا سلوك
 * قد يتغيّر بترقية أو بإعداد، وثمن الخطأ تسريب دائم يسمح بتعداد الحسابات،
 * وثمن الاحتياط رسالة عامة في حالة نادرة. فالكفّة واضحة.
 */
const ACCOUNT_PROBE_PATTERN =
  /user not found|user does not exist|no user|not registered|unable to find user/i

export function classifyResetError(
  status: number | null | undefined,
  message: string | null | undefined
): ResetFailureKind {
  if (status === 429) return 'rate_limited'

  const text = message ?? ''

  // بعض الإصدارات تردّ الحدّ برسالة دون أن تضبط الحالة — يُلتقط بالنصّ أيضاً
  // كيلا يُعرض حدُّ إرسال على أنه عطل في الخدمة.
  if (/rate limit|too many requests|after \d+ seconds/i.test(text)) return 'rate_limited'

  if (ACCOUNT_PROBE_PATTERN.test(text)) return 'account_probe'

  return 'service'
}
