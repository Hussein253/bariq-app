import { describe, it, expect } from 'vitest'
import { voiceNotePaths, type Message } from '@/lib/conversations'

/**
 * messages.media يكتبه n8n عبر المحفّز (الترحيل ٠٢٨). شكل غير متوقع يجب أن
 * يُسقط المشغّل وحده، لا أن يكسر عرض المحادثة كلها.
 */

const media = (value: unknown) => ({ media: value }) as Pick<Message, 'media'>

describe('voiceNotePaths', () => {
  it('رسائل ما قبل الترحيل وبلا ملف: لا مشغّل', () => {
    expect(voiceNotePaths({})).toEqual([])
    expect(voiceNotePaths(media(null))).toEqual([])
    expect(voiceNotePaths(media([]))).toEqual([])
  })

  it('دفعة فيها رسالتان صوتيتان: المساران بترتيبهما', () => {
    expect(
      voiceNotePaths(
        media([
          { type: 'audio', path: 'm1/messenger/p/c/a.mp4', mime_type: 'audio/mp4' },
          { type: 'audio', path: 'm1/messenger/p/c/b.mp4' },
        ])
      )
    ).toEqual(['m1/messenger/p/c/a.mp4', 'm1/messenger/p/c/b.mp4'])
  })

  it('يتجاهل ما ليس صوتاً بمسار نصي', () => {
    expect(
      voiceNotePaths(
        media([
          { type: 'image', path: 'm1/x.jpg' },
          { type: 'audio', path: '' },
          { type: 'audio' },
          null,
          'm1/y.mp4',
          { type: 'audio', path: 'm1/ok.mp4' },
        ])
      )
    ).toEqual(['m1/ok.mp4'])
  })

  it('قيمة ليست مصفوفة (نص أو كائن) لا تكسر العرض', () => {
    expect(voiceNotePaths(media('[object Object]'))).toEqual([])
    expect(voiceNotePaths(media({ type: 'audio', path: 'm1/z.mp4' }))).toEqual([])
  })
})
