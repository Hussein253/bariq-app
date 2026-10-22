import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { card, FakeStore, GROUP_A, MERCHANT, OTHER_MERCHANT } from './helpers/bot-tools-fakes'

const SECRET = 'test-bot-secret'
const fake = new FakeStore()

vi.mock('@/lib/supabase-server', () => ({ supabaseServer: {} }))
vi.mock('@/lib/bot-tools/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bot-tools/store')>()),
  createSupabaseStore: () => fake,
}))

// يُستورد بعد vi.mock (يرفعه vitest تلقائياً فوق الاستيرادات)
import { POST } from '@/app/api/bot-tools/[tool]/route'

const sign = (body: string, secret = SECRET) => createHmac('sha256', secret).update(body, 'utf8').digest('hex')

function call(tool: string, payload: unknown, opts: { signature?: string | null; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(payload)
  const headers = new Headers({ 'content-type': 'application/json' })
  const signature = opts.signature === undefined ? sign(raw) : opts.signature
  if (signature !== null) headers.set('x-bariq-signature', signature)
  return POST(new Request(`http://localhost/api/bot-tools/${tool}`, { method: 'POST', headers, body: raw }), {
    params: Promise.resolve({ tool }),
  })
}

beforeEach(() => {
  vi.stubEnv('BARIQ_BOT_WEBHOOK_SECRET', SECRET)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  fake.calls = []
  fake.failWith = null
  fake.cards = [card({ name: 'قبعة', category: 'إكسسوارات' })]
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('POST /api/bot-tools/:tool — المصادقة', () => {
  it('السرّ غير مضبوط ← 503 (فشل مغلق) ولا تنفيذ', async () => {
    vi.stubEnv('BARIQ_BOT_WEBHOOK_SECRET', '')
    const res = await call('search_products', { merchant_id: MERCHANT, input: { query: 'قبعة' } })
    expect(res.status).toBe(503)
    expect(fake.calls).toHaveLength(0)
  })

  it('بلا توقيع ← 401', async () => {
    const res = await call('search_products', { merchant_id: MERCHANT, input: {} }, { signature: null })
    expect(res.status).toBe(401)
    expect(fake.calls).toHaveLength(0)
  })

  it('توقيع بسرّ آخر أو لجسم معدَّل ← 401', async () => {
    const body = JSON.stringify({ merchant_id: MERCHANT, input: { query: 'قبعة' } })
    expect((await call('search_products', null, { raw: body, signature: sign(body, 'wrong') })).status).toBe(401)
    const tampered = body.replace('قبعة', 'عباءة')
    expect((await call('search_products', null, { raw: tampered, signature: sign(body) })).status).toBe(401)
    expect(fake.calls).toHaveLength(0)
  })

  it('اسم الأداة لا يُكشف لغير الموقِّع: التوقيع يُفحص قبل 404', async () => {
    const res = await call('drop_everything', { merchant_id: MERCHANT }, { signature: null })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/bot-tools/:tool — التحقق من الطلب', () => {
  it('أداة غير معروفة (بتوقيع صحيح) ← 404', async () => {
    const res = await call('drop_everything', { merchant_id: MERCHANT, input: {} })
    expect(res.status).toBe(404)
  })

  it('جسم ليس JSON (بتوقيع صحيح) ← 400', async () => {
    const res = await call('search_products', null, { raw: '{not json' })
    expect(res.status).toBe(400)
  })

  it.each([
    ['مفقود', {}],
    ['ليس UUID', { merchant_id: 'متجر-أ' }],
    ['رقم', { merchant_id: 7 }],
  ])('merchant_id %s ← 400', async (_label, payload) => {
    const res = await call('search_products', { ...payload, input: { query: 'x' } })
    expect(res.status).toBe(400)
    expect(fake.calls).toHaveLength(0)
  })

  it('مدخلات غير صالحة ← 400 برسالة تسمّي الحقل', async () => {
    const res = await call('get_product_details', { merchant_id: MERCHANT, input: {} })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ success: false, error: 'الحقل group_id مطلوب' })
  })
})

describe('POST /api/bot-tools/:tool — التنفيذ', () => {
  it('نجاح: { success, result } والتاجر من الجسم الموقَّع لا من مدخلات النموذج', async () => {
    const res = await call('search_products', {
      merchant_id: MERCHANT,
      input: { query: 'قبعة', merchant_id: OTHER_MERCHANT },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.result.status).toBe('ok')
    expect(body.result.cards[0].name).toBe('قبعة')
    expect(fake.callsTo('searchCards')[0].args[0]).toMatchObject({ merchantId: MERCHANT })
  })

  it('«لا نتيجة» حالة عادية (200) لا خطأ', async () => {
    const res = await call('get_product_details', { merchant_id: MERCHANT, input: { group_id: GROUP_A } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, result: { status: 'not_found' } })
  })

  it('فشل القاعدة ← 500 عامّ، ورسالة القاعدة لا تتسرّب للاستجابة، وتُسجَّل', async () => {
    fake.failWith = new Error('relation "product_cards" does not exist — secret detail')
    const res = await call('search_products', { merchant_id: MERCHANT, input: { query: 'قبعة' } })
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('secret detail')
    expect(text).not.toContain('product_cards')
    expect(vi.mocked(console.error)).toHaveBeenCalledOnce()
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain('BOT_TOOL_FAILED')
  })

  it('السجلّ لا يحمل نص الزبون ولا مدخلات الأداة', async () => {
    await call('search_products', { merchant_id: MERCHANT, input: { query: 'نص-سري-من-الزبون' } })
    const logged = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n')
    expect(logged).toContain('BOT_TOOL')
    expect(logged).not.toContain('نص-سري-من-الزبون')
  })
})
