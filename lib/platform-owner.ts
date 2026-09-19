/**
 * بريد مالك المنصة — من يدخل كأدمِن ومن يدخل كمشترك
 * ====================================================
 * قاعدة واحدة تحسم الدور لحظة أول دخول:
 *
 *   • بريد في هذه القائمة  → platform_owner، يُفتح له /admin مباشرة
 *   • أي بريد آخر          → merchant (مشترك) على باقة Spark المجانية
 *
 * لماذا هنا لا في قاعدة البيانات: قبل هذا الملف كان منح دور المالك يتطلّب
 * تشغيل supabase/seed/001 يدوياً بعد إنشاء الحساب من لوحة Supabase. ولو
 * دخل المالك برابط بريده قبل تشغيله لصار **تاجراً** — الدور يُمنح مرة
 * واحدة ولا يُصحَّح ذاتياً. فالهوية تُحسم بالكود قبل الإدراج لا بعده.
 *
 * ⚠️ ملف نقيّ بلا وصول لقاعدة البيانات ولا لـ service_role، ليبقى قابلاً
 * للاستيراد من الاختبارات ومن أي سياق بلا متغيّرات بيئة كاملة.
 *
 * ⚠️ هذه القائمة تقرّر من يصير أدمِن عند **إنشاء** صفّه في profiles فقط.
 * حذف بريد منها لا ينزع الدور عمّن أخذه؛ ذلك يتم من /admin/users أو بتعديل
 * profiles مباشرة — وهو المقصود: تغيير متغيّر بيئة لا يجوز أن يقلب صلاحيات
 * حسابات قائمة بصمت.
 */

/** المالك الافتراضي لهذا النشر. يُتجاوَز بـ PLATFORM_OWNER_EMAILS عند الحاجة. */
const DEFAULT_OWNER_EMAILS = ['hus4561990@gmail.com']

function configuredOwnerEmails(): string[] {
  const raw = process.env.PLATFORM_OWNER_EMAILS?.trim()
  if (!raw) return DEFAULT_OWNER_EMAILS

  const parsed = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  // متغيّر مضبوط بقيمة فارغة أو فواصل فقط لا يُفهم على أنه "لا مالك
  // للمنصة" — ذلك يترك النشر بلا أدمِن إطلاقاً.
  return parsed.length > 0 ? parsed : DEFAULT_OWNER_EMAILS
}

/** هل يدخل صاحب هذا البريد كمالك منصة؟ المقارنة بلا حساسية لحالة الأحرف. */
export function isPlatformOwnerEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false
  return configuredOwnerEmails().includes(normalized)
}
