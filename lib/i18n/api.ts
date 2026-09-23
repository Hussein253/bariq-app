import { getLocale } from '@/lib/i18n/server'
import { getDictionary, type Dictionary } from '@/lib/i18n'

/**
 * رسائل مسارات الـ API بلغة صاحب الطلب
 * ======================================
 * مسار الـ API يردّ نصّاً يعرضه المتصفّح كما هو (`alert` أو شريط تنبيه)،
 * فلغته يجب أن تكون لغة من ضغط الزرّ لا لغة من كتب المسار.
 *
 * ⚠️ يُستعمل في المسارات التي تخدم **لوحات التحكم** وحدها. مسارات الآلة —
 * ويب هوك ميتا، ردّ بوابة الدفع، مزامنة شركة التوصيل — تبقى رسائلها عربية
 * ثابتة: قارئها سجلّ أو نظام آخر، ولا كوكي لغة في طلبها أصلاً.
 */
export async function apiMessages(): Promise<Dictionary['app']['api']> {
  const locale = await getLocale()
  return getDictionary(locale).app.api
}

/** حقن قيمة في رسالة تحمل عنصراً نائباً — نسخة مختصرة من fill للمسارات. */
export function apiFill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  )
}
