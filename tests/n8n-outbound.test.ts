import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendDashboardReply, type DashboardReplyPayload } from '@/lib/n8n-outbound'

const WEBHOOK_URL = 'https://n8n.example.test/webhook/bariq-dashboard-reply'
const SECRET = 'test-outbound-secret'

const PAYLOAD: DashboardReplyPayload = {
  phone_number: '9647700000000',
  message_text: 'طلبك قيد التجهيز',
  channel: 'whatsapp',
  source: 'bariq-dashboard',
  account_external_id: null,
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('sendDashboardReply', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('N8N_WEBHOOK_URL', WEBHOOK_URL)
    vi.stubEnv('BARIQ_N8N_OUTBOUND_SECRET', SECRET)
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('يرسل السرّ في Authorization والجسم كما هو', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, message_id: 'wamid.X' }))

    const result = await sendDashboardReply(PAYLOAD)

    expect(result).toEqual({ sent: true, messageId: 'wamid.X' })
    const [calledUrl, init] = fetchMock.mock.calls[0]
    expect(calledUrl).toBe(WEBHOOK_URL)
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`)
    expect(JSON.parse(init.body)).toEqual(PAYLOAD)
  })

  it('لا يتصل أصلاً إن غاب السرّ — فشل مغلق', async () => {
    vi.stubEnv('BARIQ_N8N_OUTBOUND_SECRET', '')

    const result = await sendDashboardReply(PAYLOAD)

    expect(result.sent).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('لا يتصل أصلاً إن غاب الرابط', async () => {
    vi.stubEnv('N8N_WEBHOOK_URL', '')

    const result = await sendDashboardReply(PAYLOAD)

    expect(result.sent).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('يمرّر رمز السبب من n8n مع الحالة', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(409, { ok: false, error: 'outside_24h_window', last_incoming_at: null })
    )

    expect(await sendDashboardReply(PAYLOAD)).toEqual({
      sent: false,
      error: 'n8n 409: outside_24h_window',
    })
  })

  it('يكتفي برقم الحالة إن لم يكن الجسم JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>404</html>', { status: 404 }))

    expect(await sendDashboardReply(PAYLOAD)).toEqual({
      sent: false,
      error: 'n8n responded with status 404',
    })
  })

  it('يحوّل انقطاع الشبكة إلى فشل لا استثناء', async () => {
    fetchMock.mockRejectedValue(new Error('fetch failed'))

    expect(await sendDashboardReply(PAYLOAD)).toEqual({ sent: false, error: 'fetch failed' })
  })
})
