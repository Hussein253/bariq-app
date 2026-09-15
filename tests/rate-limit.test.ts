import { describe, expect, it } from 'vitest'
import { clientKey, rateLimit } from '@/lib/rate-limit'

describe('rateLimit', () => {
  it('يسمح حتى الحدّ ثم يمنع', () => {
    const key = `test-${Math.random()}`
    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true)
    }
    const blocked = rateLimit(key, 3, 60_000)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('يعزل المفاتيح عن بعضها', () => {
    const a = `a-${Math.random()}`
    const b = `b-${Math.random()}`
    rateLimit(a, 1, 60_000)
    expect(rateLimit(a, 1, 60_000).allowed).toBe(false)
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true)
  })

  it('ينسى الطلبات بعد انقضاء النافذة', async () => {
    const key = `w-${Math.random()}`
    expect(rateLimit(key, 1, 20).allowed).toBe(true)
    expect(rateLimit(key, 1, 20).allowed).toBe(false)
    await new Promise((r) => setTimeout(r, 30))
    expect(rateLimit(key, 1, 20).allowed).toBe(true)
  })
})

describe('clientKey', () => {
  it('يأخذ أول عنوان من سلسلة x-forwarded-for', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(clientKey(req)).toBe('1.2.3.4')
  })

  it('يجمع مجهولي المصدر في دلو واحد بدل إعفائهم', () => {
    expect(clientKey(new Request('https://x.test'))).toBe('unknown')
  })
})
