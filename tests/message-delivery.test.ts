import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardReplyResult } from '@/lib/n8n-outbound'

/**
 * سلسلة supabase-js وهمية لفحص النافذة: تسجّل كل نداء، و maybeSingle يرجع windowCheck.result.
 * windowCheck.result = null ← ما في رسالة واردة. windowCheck.throws ← انقطاع (مهلة 3 ثواني).
 */
const windowCheck = vi.hoisted(() => ({
  result: null as { data: unknown; error: { message: string } | null } | null,
  throws: false,
  calls: [] as Array<[string, unknown[]]>,
}))
const send = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase-server', () => {
  const chain: Record<string, unknown> = {}
  for (const name of ['from', 'select', 'eq', 'in', 'or', 'order', 'limit', 'abortSignal']) {
    chain[name] = (...args: unknown[]) => {
      windowCheck.calls.push([name, args])
      return chain
    }
  }
  chain.maybeSingle = async () => {
    if (windowCheck.throws) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    return windowCheck.result ?? { data: null, error: null }
  }
  return { supabaseServer: chain }
})
vi.mock('@/lib/n8n-outbound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/n8n-outbound')>()),
  sendDashboardReply: send,
}))

import {
  canResendMessage,
  classifyReplyResult,
  effectiveDeliveryStatus,
  isWithinCustomerWindow,
} from '@/lib/message-delivery'
import { deliverAgentReply } from '@/lib/message-delivery-server'

const NOW = new Date('2026-10-25T09:34:25Z') // لحظة الرد الضائع (التنفيذ 1946)
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN

describe('classifyReplyResult — نتيجة n8n ← حالة الرسالة', () => {
  const cases: Array<[string, DashboardReplyResult, string]> = [
    ['Meta قبلت', { sent: true, messageId: 'm_X' }, 'sent'],
    ['مهلتنا انتهت (التنفيذ 1946)', { sent: false, kind: 'timeout', error: 'timeout 15s' }, 'unknown'],
    ['انقطع بعد ما انفتح', { sent: false, kind: 'network', error: 'fetch failed' }, 'unknown'],
    ['جهاز n8n طافي', { sent: false, kind: 'unreachable', error: 'fetch failed (ECONNREFUSED)' }, 'failed'],
    ['سرّ ناقص', { sent: false, kind: 'config', error: 'BARIQ_N8N_OUTBOUND_SECRET غير مضبوط' }, 'failed'],
    ['Meta رفضت صراحةً', { sent: false, kind: 'rejected', error: 'n8n 502: messenger_send_failed', detail: '(#100) No matching user found' }, 'failed'],
    [
      'n8n ← Meta انقطع (مهلة axios): ممكن وصلت',
      { sent: false, kind: 'rejected', error: 'n8n 502: messenger_send_failed', detail: 'The connection was aborted, perhaps the server is offline' },
      'unknown',
    ],
    ['n8n رفض الطلب', { sent: false, kind: 'rejected', error: 'n8n 401: unauthorized' }, 'failed'],
  ]

  it.each(cases)('%s', (_label, result, status) => {
    expect(classifyReplyResult(result).status).toBe(status)
  })

  it('يحفظ معرّف Meta والسبب مع التفصيل', () => {
    expect(classifyReplyResult({ sent: true, messageId: 'wamid.X' })).toEqual({
      status: 'sent',
      error: null,
      externalMessageId: 'wamid.X',
    })
    expect(
      classifyReplyResult({ sent: false, kind: 'rejected', error: 'n8n 502: whatsapp_send_failed', detail: 'bad token' }).error
    ).toBe('n8n 502: whatsapp_send_failed — bad token')
  })
})

describe('isWithinCustomerWindow — 24 ساعة من آخر رسالة للزبون', () => {
  it('آخر رسالة قبل 21 ساعة ← داخل (محادثة 5f31200d)', () => {
    expect(isWithinCustomerWindow('2026-10-24T12:13:08.444Z', NOW)).toBe(true)
  })
  it('قبل 25 ساعة ← خارج', () => expect(isWithinCustomerWindow(ago(25 * HOUR), NOW)).toBe(false))
  it('ما راسل أبداً ← خارج', () => expect(isWithinCustomerWindow(null, NOW)).toBe(false))
})

describe('canResendMessage / effectiveDeliveryStatus', () => {
  const agent = (delivery_status: string | null, updatedAgo = 0) => ({
    sender_type: 'agent',
    delivery_status: delivery_status as never,
    delivery_updated_at: ago(updatedAgo),
  })

  it('failed و unknown تنعاد، sent و not_supported لا', () => {
    expect(canResendMessage(agent('failed'), NOW)).toBe(true)
    expect(canResendMessage(agent('unknown'), NOW)).toBe(true)
    expect(canResendMessage(agent('sent'), NOW)).toBe(false)
    expect(canResendMessage(agent('not_supported'), NOW)).toBe(false)
  })

  it('رد قبل الترحيل ٠٣٠ (null) ما ندّعي حالته ولا نعيده', () => {
    expect(effectiveDeliveryStatus(agent(null), NOW)).toBeNull()
    expect(canResendMessage(agent(null), NOW)).toBe(false)
  })

  it('pending جارية ما تنعاد؛ العالقة أكثر من دقيقتين تصير unknown', () => {
    expect(canResendMessage(agent('pending', 30_000), NOW)).toBe(false)
    expect(effectiveDeliveryStatus(agent('pending', 3 * MIN), NOW)).toBe('unknown')
    expect(canResendMessage(agent('pending', 3 * MIN), NOW)).toBe(true)
  })

  it('رسالة زبون أو بوت ما تنعاد أبداً', () => {
    expect(canResendMessage({ ...agent('failed'), sender_type: 'bot' }, NOW)).toBe(false)
    expect(canResendMessage({ ...agent('failed'), sender_type: 'customer' }, NOW)).toBe(false)
  })
})

describe('deliverAgentReply — النافذة بالتطبيق ثم n8n', () => {
  const PARAMS = { phone: '28386991107651965', channel: 'messenger' as const, accountExternalId: '1321149431082632', text: 'مرحبا شلون اساعدك' }

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    windowCheck.result = null
    windowCheck.throws = false
    windowCheck.calls = []
    send.mockResolvedValue({ sent: true, messageId: 'm_X' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    send.mockReset()
  })

  it('داخل النافذة ← يرسل بنفس عقد n8n ويرجع sent', async () => {
    windowCheck.result = { data: { created_at: '2026-10-24T12:13:08.444Z' }, error: null }

    expect(await deliverAgentReply(PARAMS)).toEqual({ status: 'sent', error: null, externalMessageId: 'm_X' })
    expect(send).toHaveBeenCalledWith({
      phone_number: PARAMS.phone,
      message_text: PARAMS.text,
      channel: 'messenger',
      source: 'bariq-dashboard',
      account_external_id: '1321149431082632',
    })
  })

  it('نفس استعلام n8n: conversation_log، الوارد بس، ومنصة القناة', async () => {
    windowCheck.result = { data: { created_at: ago(HOUR) }, error: null }
    await deliverAgentReply(PARAMS)

    expect(windowCheck.calls).toEqual(
      expect.arrayContaining([
        ['from', ['conversation_log']],
        ['eq', ['phone_number', PARAMS.phone]],
        ['in', ['direction', ['incoming', 'in']]],
        ['eq', ['platform', 'messenger']],
      ])
    )
  })

  it('واتساب: المنصة الفارغة تُحسب واتساب (coalesce بـ n8n)', async () => {
    windowCheck.result = { data: { created_at: ago(HOUR) }, error: null }
    await deliverAgentReply({ ...PARAMS, channel: 'whatsapp', phone: '9647700000000' })

    expect(windowCheck.calls).toContainEqual(['or', ['platform.eq.whatsapp,platform.is.null']])
  })

  it('خارج النافذة ← failed بلا ما يستدعي n8n أصلاً', async () => {
    windowCheck.result = { data: { created_at: ago(25 * HOUR) }, error: null }

    expect(await deliverAgentReply(PARAMS)).toEqual({ status: 'failed', error: 'outside_24h_window', externalMessageId: null })
    expect(send).not.toHaveBeenCalled()
  })

  it('الزبون ما راسل أبداً على هالقناة ← خارج النافذة', async () => {
    expect((await deliverAgentReply(PARAMS)).error).toBe('outside_24h_window')
    expect(send).not.toHaveBeenCalled()
  })

  it('فشل الفحص (خطأ أو مهلة) ← يرسل على أي حال', async () => {
    windowCheck.result = { data: null, error: { message: 'connection reset' } }
    expect((await deliverAgentReply(PARAMS)).status).toBe('sent')

    windowCheck.throws = true
    expect((await deliverAgentReply(PARAMS)).status).toBe('sent')
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('مهلة n8n ← unknown لا failed (ممكن وصلت)', async () => {
    windowCheck.result = { data: { created_at: ago(HOUR) }, error: null }
    send.mockResolvedValue({ sent: false, kind: 'timeout', error: 'timeout 15s' })

    expect(await deliverAgentReply(PARAMS)).toEqual({ status: 'unknown', error: 'timeout 15s', externalMessageId: null })
  })
})
