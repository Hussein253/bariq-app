import type { Locale } from '@/lib/i18n/config'
import type { AppRole } from '@/lib/roles'
import { DATE_LOCALE, localizeDigits } from '@/lib/formatters'

/**
 * طبقة الأنواع والمساعدات لنموذج المحادثات الحية
 * =================================================
 * المصدر الوحيد للحقيقة: جدولا public.conversations و public.messages في Supabase.
 * أي تغيير في أعمدة الجدولين يجب أن ينعكس هنا أولاً (Schema-First).
 *
 * ⚠️ يُستورد من مكوّن عميل (LiveConversations)، فلا يستورد '@/lib/i18n' —
 * ذاك يجرّ القواميس الثلاثة إلى حزمة المتصفح. النصوص تصل الدوالَّ وسائطَ.
 */

// ---------------------------------------------------------------------
// الأنواع المطابقة لأعمدة قاعدة البيانات
// ---------------------------------------------------------------------

/** نوع مرسل الرسالة — مطابق للقيد messages_sender_type_check */
export type SenderType = 'customer' | 'bot' | 'agent' | 'system'

/** نوع محتوى الرسالة — مطابق للقيد messages_message_type_check */
export type MessageType = 'text' | 'image' | 'audio' | 'document' | 'location' | 'template'

/** قناة المحادثة */
export type ConversationPlatform = 'whatsapp' | 'messenger' | 'instagram' | 'telegram'

/** صف من جدول public.conversations */
export interface Conversation {
  id: string
  /** null = حساب غير مربوط أو غير معتمد: يراها فريق برق وحده (الترحيل ٠١٩) */
  merchant_id: string | null
  customer_phone: string
  platform: string
  bot_active: boolean
  created_at: string | null
  updated_at: string | null
  /** حساب الأعمال الذي تدور عليه المحادثة؛ null = مسار لا يرسل الحساب بعد */
  account_external_id: string | null
  social_account_id: string | null
}

/** صف من جدول public.messages */
export interface Message {
  id: string
  conversation_id: string | null
  sender_type: string
  message_type: string
  content: string
  created_at: string | null
}

/** محادثة مُثراة ببيانات العرض (تُبنى في الخادم، لا تُخزَّن) */
export interface ConversationOverview extends Conversation {
  merchant_name: string | null
  message_count: number
  last_message: string | null
  last_message_at: string | null
  last_sender_type: string | null
}

// ---------------------------------------------------------------------
// مساعدات العرض
// ---------------------------------------------------------------------

/**
 * من يحقّ له التصرف في محادثة (الرد وإيقاف البوت)؟
 *   platform_owner و staff → كل المحادثات، فهذا عملهم (خدمة العملاء)
 *   merchant               → محادثات تاجره وحده، ولا شيء بلا تاجر مربوط
 * ⚠️ المسارات تردّ الرفض ٤٠٤ لا ٤٠٣: وجود محادثة تاجر آخر لا يُكشف.
 */
export function canActOnConversation(
  role: AppRole,
  sessionMerchantId: string | null,
  conversationMerchantId: string | null
): boolean {
  if (role === 'platform_owner' || role === 'staff') return true
  return role === 'merchant' && sessionMerchantId !== null && conversationMerchantId === sessionMerchantId
}

/** هل الرسالة صادرة من جهتنا (بوت أو موظف)؟ */
export function isOutbound(senderType: string): boolean {
  return senderType !== 'customer'
}

/** اسم المرسل بلغة الواجهة؛ نوع غير معروف يُعرض كما هو. */
export function senderLabel(senderType: string, labels: Record<SenderType, string>): string {
  return Object.prototype.hasOwnProperty.call(labels, senderType)
    ? labels[senderType as SenderType]
    : senderType
}

/** اسم القناة بلغة الواجهة؛ قناة غير معروفة تُعرض كما هي. */
export function platformLabel(platform: string, labels: Record<string, string>): string {
  return Object.prototype.hasOwnProperty.call(labels, platform) ? labels[platform] : platform
}

/**
 * تنسيق رقم الهاتف للعرض.
 * الأرقام مخزّنة بالصيغة الدولية بدون + (مثال: 9647727869571).
 */
export function displayPhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.startsWith('964') && digits.length === 13) {
    // 964 77 278 69571 -> 0772 786 9571
    const local = '0' + digits.slice(3)
    return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
  }
  if (digits.length === 11 && digits.startsWith('07')) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
  }
  return phone
}

/** رابط واتساب المباشر للرقم */
export function waLink(phone: string): string {
  return `https://wa.me/${(phone || '').replace(/\D/g, '')}`
}

/** الحرفان الأخيران من الرقم — تُستخدم كصورة رمزية */
export function phoneInitials(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.slice(-2) || '؟'
}

// الوقت والتاريخ هنا بتوقيت جهاز القارئ لا بتوقيت ثابت: تُرسم في المتصفّح بعد
// تحميل الرسائل، و isSameDay أدناه يفصل الأيام بالتوقيت نفسه.

export function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  return localizeDigits(
    date.toLocaleTimeString(DATE_LOCALE[locale], { hour: '2-digit', minute: '2-digit' }),
    locale
  )
}

export function formatDayLabel(iso: string | null, locale: Locale): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (isNaN(date.getTime())) return ''
  return localizeDigits(
    date.toLocaleDateString(DATE_LOCALE[locale], { day: 'numeric', month: 'long', year: 'numeric' }),
    locale
  )
}

export function isSameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** نصوص الفارق الزمني — {n} عنصر نائب يُحقن بأرقام اللغة. */
export interface RelativeTimeLabels {
  now: string
  minutes: string
  hours: string
  yesterday: string
  days: string
}

/** فارق زمني مختصر بلغة الواجهة (منذ ٥ د / أمس …)، وما بعد ٣٠ يوماً تاريخ كامل. */
export function relativeTime(iso: string | null, locale: Locale, labels: RelativeTimeLabels): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const withN = (template: string, n: number) => template.replace('{n}', localizeDigits(n, locale))
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return labels.now
  if (mins < 60) return withN(labels.minutes, mins)
  const hours = Math.floor(mins / 60)
  if (hours < 24) return withN(labels.hours, hours)
  const days = Math.floor(hours / 24)
  if (days === 1) return labels.yesterday
  if (days < 30) return withN(labels.days, days)
  return formatDayLabel(iso, locale)
}
