/**
 * طبقة الأنواع والمساعدات لنموذج المحادثات الحية
 * =================================================
 * المصدر الوحيد للحقيقة: جدولا public.conversations و public.messages في Supabase.
 * أي تغيير في أعمدة الجدولين يجب أن ينعكس هنا أولاً (Schema-First).
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
  merchant_id: string | null
  customer_phone: string
  platform: string
  bot_active: boolean
  created_at: string | null
  updated_at: string | null
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

/** هل الرسالة صادرة من جهتنا (بوت أو موظف)؟ */
export function isOutbound(senderType: string): boolean {
  return senderType !== 'customer'
}

/** تسمية عربية لمرسل الرسالة */
export function senderLabel(senderType: string): string {
  switch (senderType) {
    case 'customer':
      return 'الزبون'
    case 'bot':
      return 'البوت'
    case 'agent':
      return 'موظف'
    case 'system':
      return 'النظام'
    default:
      return senderType
  }
}

/** تسمية عربية للمنصة */
export function platformLabel(platform: string): string {
  switch (platform) {
    case 'whatsapp':
      return 'واتساب'
    case 'messenger':
      return 'ماسنجر'
    case 'instagram':
      return 'إنستغرام'
    case 'telegram':
      return 'تيليغرام'
    default:
      return platform
  }
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

export function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function formatDayLabel(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('ar-IQ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function isSameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/** فارق زمني مختصر بالعربية (منذ ٥ دقائق / أمس ...) */
export function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'الآن'
  if (mins < 60) return `منذ ${mins} د`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'أمس'
  if (days < 30) return `منذ ${days} يوم`
  return formatDayLabel(iso)
}
