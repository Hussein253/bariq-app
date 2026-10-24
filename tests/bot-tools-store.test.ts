import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseStore, StoreError } from '@/lib/bot-tools/store'
import { toSearchTokens, categoryPattern } from '@/lib/bot-tools/normalize'
import { GROUP_A, MERCHANT } from './helpers/bot-tools-fakes'

/**
 * محوّل Supabase يُختبر بعميل حقيقي (supabase-js) يلتقط طلبات HTTP بدل إرسالها:
 * نتحقق مما سيصل PostgREST فعلاً — فلتر التاجر في كل استعلام، صياغة or=()/ilike،
 * والأعمدة الصريحة. (ما تفعله القاعدة بالفلتر مغطّى في فحوص PGlite لترحيل ٠٢٩.)
 */

type Reply = { status?: number; body?: unknown }

function harness(reply: Reply | ((url: URL) => Reply) = { body: [] }) {
  const requests: Array<{ url: URL; method: string; headers: Headers }> = []
  const fetchMock = async (input: string | URL | Request, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw)
    requests.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers) })
    const r = typeof reply === 'function' ? reply(url) : reply
    return new Response(JSON.stringify(r.body ?? []), {
      status: r.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  const client = createClient('http://localhost:54321', 'service-role-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchMock as typeof fetch },
  })
  return { store: createSupabaseStore(client), requests }
}

describe('searchCards', () => {
  it('يقيّد بالتاجر ويقرأ من الواجهة بأعمدة صريحة مرتّبة بالاسم', async () => {
    const { store, requests } = harness()
    await store.searchCards({ merchantId: MERCHANT, tokens: [], categoryPattern: null, limit: 50 })

    const { url, method } = requests[0]
    expect(method).toBe('GET')
    expect(url.pathname).toBe('/rest/v1/product_cards')
    expect(url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
    expect(url.searchParams.get('order')).toBe('name.asc')
    expect(url.searchParams.get('limit')).toBe('50')
    expect(url.searchParams.has('or')).toBe(false)
    const select = url.searchParams.get('select') ?? ''
    expect(select).not.toContain('*')
    for (const col of ['group_id', 'price_from_iqd', 'available_units', 'name_norm', 'category_norm']) {
      expect(select).toContain(col)
    }
  })

  it('كلمات البحث ← or=(name_norm.ilike…,category_norm.ilike…) وفلتر الفئة ilike', async () => {
    const { store, requests } = harness()
    await store.searchCards({
      merchantId: MERCHANT,
      tokens: toSearchTokens('بالتيشيرت الأسود'),
      categoryPattern: categoryPattern('الملابس'),
      limit: 50,
    })
    const { url } = requests[0]
    expect(url.searchParams.get('or')).toBe(
      '(name_norm.ilike.%تيشيرت%,category_norm.ilike.%تيشيرت%,name_norm.ilike.%اسود%,category_norm.ilike.%اسود%)'
    )
    expect(url.searchParams.get('category_norm')).toBe('ilike.%ملابس%')
    expect(url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
  })

  it('نص حقن لا يضيف شرطاً ولا يكسر or=()', async () => {
    const { store, requests } = harness()
    const tokens = toSearchTokens('تيشيرت),merchant_id.neq.x,(name_norm.ilike.%')
    await store.searchCards({ merchantId: MERCHANT, tokens, categoryPattern: null, limit: 50 })
    const or = requests[0].url.searchParams.get('or') ?? ''
    // كل ما بين الأقواس شروط name_norm/category_norm.ilike فقط، بلا merchant_id ولا فواصل زائدة
    const inner = or.slice(1, -1).split(',')
    expect(inner.length).toBe(tokens.length * 2)
    for (const cond of inner) expect(cond).toMatch(/^(name_norm|category_norm)\.ilike\.%[^,()%*_\\]+%$/)
    expect(requests[0].url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
  })
})

describe('بقية الاستعلامات — كلها مقيَّدة بالتاجر عدا دليل المناطق العام', () => {
  it('getGroup', async () => {
    const { store, requests } = harness({ body: [{ id: GROUP_A, name: 'تيشيرت' }] })
    const group = await store.getGroup(MERCHANT, GROUP_A)
    expect(group).toMatchObject({ id: GROUP_A })
    const { url } = requests[0]
    expect(url.pathname).toBe('/rest/v1/product_groups')
    expect(url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
    expect(url.searchParams.get('id')).toBe(`eq.${GROUP_A}`)
  })

  it('getGroup: لا صف ← null', async () => {
    const { store } = harness({ body: [] })
    expect(await store.getGroup(MERCHANT, GROUP_A)).toBeNull()
  })

  it('getVariants: فلتر التاجر والعائلة وحدّ صريح', async () => {
    const { store, requests } = harness()
    await store.getVariants(MERCHANT, GROUP_A)
    const { url } = requests[0]
    expect(url.pathname).toBe('/rest/v1/products')
    expect(url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
    expect(url.searchParams.get('group_id')).toBe(`eq.${GROUP_A}`)
    expect(url.searchParams.get('limit')).toBe('200')
    // supabase-js يزيل الفراغات من select
    expect(url.searchParams.get('select')).toBe('id,color,size,price_iqd,stock,status')
  })

  it('getPolicies وgetDeliverySettings', async () => {
    const { store, requests } = harness()
    await store.getPolicies(MERCHANT)
    await store.getDeliverySettings(MERCHANT)
    expect(requests[0].url.pathname).toBe('/rest/v1/merchant_profiles')
    expect(requests[0].url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
    expect(requests[0].url.searchParams.get('select')).toBe('return_policy,warranty_policy')
    expect(requests[1].url.pathname).toBe('/rest/v1/merchant_delivery_settings')
    expect(requests[1].url.searchParams.get('merchant_id')).toBe(`eq.${MERCHANT}`)
  })

  it('findAreas: نشطة فقط، على العمود المطبَّع، بحدّ ٢٠', async () => {
    const { store, requests } = harness()
    await store.findAreas('%عامريه%')
    const { url } = requests[0]
    expect(url.pathname).toBe('/rest/v1/delivery_areas')
    expect(url.searchParams.get('is_active')).toBe('eq.true')
    expect(url.searchParams.get('area_name_norm')).toBe('ilike.%عامريه%')
    expect(url.searchParams.get('limit')).toBe('20')
  })

  it('كل نداء = طلب HTTP واحد (لا N+1 داخل المحوّل)', async () => {
    const { store, requests } = harness()
    await store.searchCards({ merchantId: MERCHANT, tokens: ['a1'], categoryPattern: null, limit: 5 })
    await store.getGroup(MERCHANT, GROUP_A)
    await store.getVariants(MERCHANT, GROUP_A)
    await store.getPolicies(MERCHANT)
    await store.getDeliverySettings(MERCHANT)
    await store.findAreas('%x%')
    expect(requests).toHaveLength(6)
  })
})

describe('الأخطاء', () => {
  it('خطأ PostgREST ← StoreError برسالة تسمّي الجدول (للسجلّ لا للمستخدم)', async () => {
    const { store } = harness({ status: 500, body: { message: 'boom', code: 'XX000' } })
    await expect(store.getVariants(MERCHANT, GROUP_A)).rejects.toThrow(StoreError)
    await expect(store.getVariants(MERCHANT, GROUP_A)).rejects.toThrow(/products: boom/)
  })

  it('العمود غير الموجود (ترحيل ٠٢٩ لم يُطبَّق) يظهر خطأً صريحاً لا نتيجة فارغة صامتة', async () => {
    const { store } = harness({
      status: 404,
      body: { message: "Could not find the table 'public.product_cards' in the schema cache", code: 'PGRST205' },
    })
    await expect(
      store.searchCards({ merchantId: MERCHANT, tokens: [], categoryPattern: null, limit: 5 })
    ).rejects.toThrow(/product_cards/)
  })
})
