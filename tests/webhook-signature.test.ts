import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifySignature } from '@/lib/webhook-signature'

const SECRET = 'test-secret-value'
const BODY = JSON.stringify({ event: 'order_created', data: { x: 1 } })

function sign(body: string, secret = SECRET) {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

describe('verifySignature', () => {
  it('يقبل توقيعاً صحيحاً بصيغة hex المجرّدة', () => {
    expect(verifySignature({ rawBody: BODY, signature: sign(BODY), secret: SECRET })).toEqual({
      ok: true,
    })
  })

  it('يقبل توقيعاً صحيحاً ببادئة sha256=', () => {
    const result = verifySignature({
      rawBody: BODY,
      signature: `sha256=${sign(BODY)}`,
      secret: SECRET,
    })
    expect(result).toEqual({ ok: true })
  })

  it('يرفض جسماً عُدِّل بعد التوقيع', () => {
    const tampered = JSON.stringify({ event: 'order_created', data: { x: 2 } })
    const result = verifySignature({ rawBody: tampered, signature: sign(BODY), secret: SECRET })
    expect(result.ok).toBe(false)
  })

  it('يرفض توقيعاً بسرّ مختلف', () => {
    const result = verifySignature({
      rawBody: BODY,
      signature: sign(BODY, 'another-secret'),
      secret: SECRET,
    })
    expect(result).toMatchObject({ ok: false, status: 401 })
  })

  it('يرفض غياب ترويسة التوقيع', () => {
    expect(verifySignature({ rawBody: BODY, signature: null, secret: SECRET })).toMatchObject({
      ok: false,
      status: 401,
    })
  })

  it('يفشل مغلقاً عند غياب السرّ في البيئة — لا يفتح المسار', () => {
    // هذه أهم حالة: نسيان ضبط السرّ يجب أن يوقف المسار لا أن يقبل كل شيء
    const result = verifySignature({ rawBody: BODY, signature: sign(BODY), secret: undefined })
    expect(result).toMatchObject({ ok: false, status: 503 })
  })
})
