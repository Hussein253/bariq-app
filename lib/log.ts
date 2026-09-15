/**
 * تسجيل آمن للخادم (Safe Structured Logging)
 * ===========================================
 * سجلات Vercel يقرؤها كل من يملك وصولاً للمشروع، وتُحفظ خارج قاعدة البيانات
 * بلا سياسات RLS. لذلك يُمنع طبع رقم هاتف زبون أو عنوانه أو نص رسالته خاماً.
 *
 * القاعدة: كل حقل يعرّف شخصاً يمرّ عبر maskPhone أو maskText قبل الطبع.
 * المعرّفات التقنية (order_id, tracking_number, conversation_id) تُطبع كاملة
 * لأنها لازمة للتشخيص ولا تكشف هوية بذاتها.
 */

/** ٠٧٧١٢٣٤٥٦٧٨ -> ٠٧٧****٥٦٧٨ — يكفي لمطابقة السجل بالشكوى بلا كشف الرقم. */
export function maskPhone(raw: string | null | undefined): string {
  if (!raw) return '—'
  const digits = String(raw).replace(/[^0-9]/g, '')
  if (digits.length < 7) return '***'
  return `${digits.slice(0, 3)}${'*'.repeat(digits.length - 7)}${digits.slice(-4)}`
}

/** يطبع الطول فقط — نص الرسالة نفسه لا يدخل السجل أبداً. */
export function maskText(raw: string | null | undefined): string {
  if (!raw) return '—'
  return `<${String(raw).length} حرفاً>`
}

type Fields = Record<string, unknown>

function emit(level: 'INFO' | 'WARN' | 'ERROR', event: string, fields?: Fields) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields })
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (event: string, fields?: Fields) => emit('INFO', event, fields),
  warn: (event: string, fields?: Fields) => emit('WARN', event, fields),
  error: (event: string, fields?: Fields) => emit('ERROR', event, fields),
}
