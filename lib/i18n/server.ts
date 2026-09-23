import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, normalizeLocale, type Locale } from './config'
import { getDictionary, type Dictionary } from './index'

/**
 * لغة الطلب الحالي — المصدر الوحيد الذي تقرأ منه صفحات الخادم
 * =============================================================
 * الترتيب مقصود: اختيار المستخدم أولاً (كوكي)، ثم لغة متصفّحه، ثم العربية.
 *
 * ⚠️ الرجوع إلى Accept-Language ليس ترفاً: التاجر الكردي أو الزائر الأجنبي
 * يفتح الرابط أول مرة بلا كوكي، فيرى العربية ويبحث عن مبدّل اللغة في صفحة
 * لا يقرأها. قراءة ترويسة متصفّحه تعطيه لغته من أول شاشة — ويبقى المبدّل
 * فوق الصفحة لمن أراد غير ذلك، وضغطته تكتب الكوكي فيسبق اختيارُه الترويسةَ
 * إلى الأبد.
 *
 * وقراءة الكوكي تجعل الصفحة ديناميكية بطبعها. وهذا لا يكلّف هنا شيئاً:
 * صفحات المنصة كلها ديناميكية أصلاً — إمّا force-dynamic أو محروسة بجلسة.
 */
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value
  if (chosen) return normalizeLocale(chosen)

  const headerList = await headers()
  const accept = headerList.get('accept-language')
  if (!accept) return DEFAULT_LOCALE

  // "ku;q=0.9, ar-IQ;q=0.8, en;q=0.7" → أول وسم مدعوم بالترتيب الذي أرسله
  // المتصفّح. لا تُوزن q: الترتيب فيها تنازلي أصلاً في كل المتصفحات العملية.
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0]?.trim()
    if (!tag) continue
    const base = tag.split('-')[0]?.toLowerCase()
    if (base === 'ar' || base === 'en') return base
    if (base === 'ku' || base === 'ckb') return 'ku'
  }

  return DEFAULT_LOCALE
}

/** اللغة والقاموس معاً — ما تحتاجه صفحة الخادم في استدعاء واحد. */
export async function getTranslations(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale()
  return { locale, t: getDictionary(locale) }
}
