import { afterEach, describe, it, expect, vi } from 'vitest'
import { canActOnConversation, platformLabel, relativeTime, senderLabel } from '@/lib/conversations'

/**
 * canActOnConversation هو ما يمنع تاجراً من الرد في محادثة زبون تاجر آخر أو
 * إيقاف بوته — المساران /api/conversations/:id/{reply,bot} يفحصانه قبل أي
 * كتابة. خطأ هنا تسريب بين التجار، لا خلل عرض.
 */

const MINE = 'merchant-a'
const OTHER = 'merchant-b'

describe('canActOnConversation', () => {
  it('فريق برق ومالك المنصة يتصرفون في كل محادثة — هذا عملهم', () => {
    for (const role of ['platform_owner', 'staff'] as const) {
      expect(canActOnConversation(role, null, MINE)).toBe(true)
      expect(canActOnConversation(role, null, OTHER)).toBe(true)
      expect(canActOnConversation(role, null, null)).toBe(true)
    }
  })

  it('التاجر يتصرف في محادثات تاجره وحده', () => {
    expect(canActOnConversation('merchant', MINE, MINE)).toBe(true)
    expect(canActOnConversation('merchant', MINE, OTHER)).toBe(false)
  })

  it('محادثة بلا تاجر ليست لأي تاجر', () => {
    expect(canActOnConversation('merchant', MINE, null)).toBe(false)
  })

  it('حساب تاجر غير مربوط بتاجر لا يتصرف في شيء، ولو في محادثة بلا تاجر', () => {
    // null === null صحيحة في JavaScript — والدالة يجب ألّا تسقط فيها
    expect(canActOnConversation('merchant', null, null)).toBe(false)
    expect(canActOnConversation('merchant', null, MINE)).toBe(false)
  })
})

describe('نصوص المحادثات بلغة الواجهة', () => {
  const senders = { customer: 'Customer', bot: 'Bot', agent: 'Agent', system: 'System' }

  it('اسم المرسل من القاموس، والنوع المجهول كما هو', () => {
    expect(senderLabel('bot', senders)).toBe('Bot')
    expect(senderLabel('webhook', senders)).toBe('webhook')
    expect(platformLabel('whatsapp', { whatsapp: 'WhatsApp' })).toBe('WhatsApp')
    expect(platformLabel('tiktok', { whatsapp: 'WhatsApp' })).toBe('tiktok')
  })

  it('لا تُقرأ خصائص الكائن الموروثة أسماءً', () => {
    expect(senderLabel('toString', senders)).toBe('toString')
    expect(platformLabel('constructor', { whatsapp: 'WhatsApp' })).toBe('constructor')
  })

  describe('relativeTime', () => {
    const en = { now: 'now', minutes: '{n}m ago', hours: '{n}h ago', yesterday: 'yesterday', days: '{n}d ago' }
    const ar = { now: 'الآن', minutes: 'منذ {n} د', hours: 'منذ {n} س', yesterday: 'أمس', days: 'منذ {n} يوم' }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('يختار الوحدة بحسب الفارق', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))

      expect(relativeTime('2026-09-25T11:59:40Z', 'en', en)).toBe('now')
      expect(relativeTime('2026-09-25T11:55:00Z', 'en', en)).toBe('5m ago')
      expect(relativeTime('2026-09-25T09:00:00Z', 'en', en)).toBe('3h ago')
      expect(relativeTime('2026-09-24T11:00:00Z', 'en', en)).toBe('yesterday')
      expect(relativeTime('2026-09-20T12:00:00Z', 'en', en)).toBe('5d ago')
      expect(relativeTime(null, 'en', en)).toBe('')
    })

    it('يكتب الرقم بأرقام اللغة', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))

      expect(relativeTime('2026-09-25T11:55:00Z', 'ar', ar)).toBe('منذ ٥ د')
    })
  })
})
