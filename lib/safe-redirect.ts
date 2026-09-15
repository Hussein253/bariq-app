/**
 * تنقية مسار العودة بعد تسجيل الدخول
 * ====================================
 * `?next=` يصل من الرابط، أي من أي جهة تستطيع صياغة رابط وإرساله للضحية.
 * قبوله كما هو يحوّل صفحة الدخول إلى أداة تحويل مفتوحة (Open Redirect):
 * يُرسَل للموظف رابط يحمل نطاق برق، فيسجّل دخوله بثقة ثم يُقذف إلى صفحة
 * مزوَّرة تطلب كلمة مروره مجدداً.
 *
 * المقبول: مسار داخلي مطلق فقط.
 * المرفوض: العناوين الكاملة (//host و https://host)، والمسارات النسبية،
 * والمسارات المشوّهة بترميز مزدوج، وأي شيء يحمل حرف تحكّم.
 */
export function safeInternalPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null

  const value = raw.trim()
  if (!value) return null

  // يبدأ بشرطة واحدة فقط: '//evil.com' عنوان كامل بروتوكوله ضمني
  if (!value.startsWith('/') || value.startsWith('//')) return null

  // '/\evil.com' تقرأه بعض المتصفحات كـ '//evil.com'
  if (value.startsWith('/\\')) return null

  // أحرف التحكم وفواصل الأسطر تُستعمل في حقن ترويسات
  if (/[\u0000-\u001F\u007F]/.test(value)) return null

  return value
}
