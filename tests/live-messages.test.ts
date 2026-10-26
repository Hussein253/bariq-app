import { describe, expect, it } from 'vitest'
import { BOT_TYPING_WINDOW_MS, type Message, botTypingUntil, mergeMessages } from '@/lib/conversations'

/** صف رسالة بأقل الحقول — الوقت ISO والمرسل يكفيان للدمج وعلامة «يكتب» */
const msg = (id: string, created_at: string | null, sender_type = 'customer', extra: Partial<Message> = {}): Message => ({
  id,
  conversation_id: 'c1',
  sender_type,
  message_type: 'text',
  content: id,
  created_at,
  ...extra,
})

describe('mergeMessages — الجلب يكمّل ما فات Realtime ولا يحذف', () => {
  it('رسالة فاتها المقبس (11:26:10) ترجع بمكانها بين المعروضة', () => {
    // التنفيذ 2167: المعروض زبون 11:24 وبوت 11:25 وبوت 11:27، والقاعدة فيها زبون 11:26:10
    const shown = [
      msg('c-1124', '2026-10-26T11:24:48.935Z'),
      msg('b-1125', '2026-10-26T11:25:10.920Z', 'bot'),
      msg('b-1127', '2026-10-26T11:27:04.451Z', 'bot'),
    ]
    const fetched = [...shown.slice(0, 2), msg('c-1126', '2026-10-26T11:26:10.133Z'), shown[2]]
    expect(mergeMessages(shown, fetched).map((m) => m.id)).toEqual(['c-1124', 'b-1125', 'c-1126', 'b-1127'])
  })

  it('رسالة معروضة غائبة عن الجلب تبقى (حدث وصل بعد لقطة الاستعلام)', () => {
    const live = msg('new', '2026-10-26T11:30:00Z')
    const fetched = [msg('old', '2026-10-26T11:20:00Z')]
    expect(mergeMessages([live], fetched).map((m) => m.id)).toEqual(['old', 'new'])
  })

  it('نسخة الجلب تحدّث الصف المعروض (حالة التوصيل) بلا تكرار', () => {
    const shown = [msg('a', '2026-10-26T11:00:00Z', 'agent', { delivery_status: 'pending' })]
    const fetched = [msg('a', '2026-10-26T11:00:00Z', 'agent', { delivery_status: 'sent' })]
    const merged = mergeMessages(shown, fetched)
    expect(merged).toHaveLength(1)
    expect(merged[0].delivery_status).toBe('sent')
  })

  it('رسالة بلا وقت تنزل آخر القائمة', () => {
    expect(mergeMessages([msg('x', null)], [msg('y', '2026-10-26T11:00:00Z')]).map((m) => m.id)).toEqual(['y', 'x'])
  })
})

describe('botTypingUntil — علامة «البوت يكتب…»', () => {
  const at = '2026-10-26T11:26:10.133Z'

  it('آخر رسالة زبون والبوت مفعّل ← تنطفئ بعد المهلة', () => {
    expect(botTypingUntil([msg('c', at)], true)).toBe(Date.parse(at) + BOT_TYPING_WINDOW_MS)
  })

  it('رد البوت يطفئها', () => {
    expect(botTypingUntil([msg('c', at), msg('b', '2026-10-26T11:27:04Z', 'bot')], true)).toBeNull()
  })

  it('بإدارة موظف ما في علامة', () => {
    expect(botTypingUntil([msg('c', at)], false)).toBeNull()
  })

  it('محادثة فاضية أو وقت تالف ← لا علامة', () => {
    expect(botTypingUntil([], true)).toBeNull()
    expect(botTypingUntil([msg('c', 'not-a-date')], true)).toBeNull()
  })
})
