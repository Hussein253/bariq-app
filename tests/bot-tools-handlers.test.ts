import { describe, expect, it } from 'vitest'
import {
  checkAvailability,
  getProductDetails,
  quoteShipping,
  searchProducts,
} from '@/lib/bot-tools/handlers'
import { parseToolCall } from '@/lib/bot-tools'
import {
  card,
  FakeStore,
  GROUP_A,
  GROUP_B,
  MERCHANT,
  OTHER_MERCHANT,
  SETTINGS,
  variant,
} from './helpers/bot-tools-fakes'

const ctx = { merchantId: MERCHANT }

// ---------------------------------------------------------------------------
describe('search_products', () => {
  it('يطابق مع اختلاف الإملاء (القبعه ← قبعة) ولا يكشف الأعمدة الداخلية', async () => {
    const store = new FakeStore()
    store.cards = [card({ name: 'قبعة', category: 'إكسسوارات' })]
    const result = await searchProducts(store, ctx, { query: 'القبعه' })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0].name).toBe('قبعة')
    for (const hidden of ['merchant_id', 'catalog_id', 'name_norm', 'category_norm']) {
      expect(result.cards[0]).not.toHaveProperty(hidden)
    }
  })

  it('لا يعيد بطاقات تاجر آخر ولو تطابق الاسم تماماً', async () => {
    const store = new FakeStore()
    store.cards = [
      card({ name: 'تيشيرت', merchant_id: OTHER_MERCHANT, group_id: GROUP_B }),
      card({ name: 'تيشيرت', merchant_id: MERCHANT, group_id: GROUP_A }),
    ]
    const result = await searchProducts(store, ctx, { query: 'تيشيرت' })
    expect(result.status === 'ok' && result.cards.map((c) => c.group_id)).toEqual([GROUP_A])
    expect(store.callsTo('searchCards')[0].args[0]).toMatchObject({ merchantId: MERCHANT })
  })

  it('يرتّب: تطابق الاسم قبل الفئة، ثم المتوفر قبل النافد', async () => {
    const store = new FakeStore()
    store.cards = [
      card({ name: 'جاكيت', category: 'تيشيرتات', group_id: GROUP_B }),
      card({ name: 'تيشيرت صيفي', group_id: GROUP_A, available_units: 0, in_stock: false }),
      card({ name: 'تيشيرت شتوي', group_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
    ]
    const result = await searchProducts(store, ctx, { query: 'تيشيرت' })
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.cards.map((c) => c.name)).toEqual(['تيشيرت شتوي', 'تيشيرت صيفي', 'جاكيت'])
  })

  it('بلا نص ولا فئة: تصفّح، متوفر أولاً، ويقصّ عند الحد مع truncated', async () => {
    const store = new FakeStore()
    store.cards = Array.from({ length: 7 }, (_, i) =>
      card({
        name: `منتج ${i}`,
        group_id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,
        available_units: i === 6 ? 9 : 0,
        in_stock: i === 6,
      })
    )
    const result = await searchProducts(store, ctx, { query: '' })
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.cards).toHaveLength(5)
    expect(result.truncated).toBe(true)
    expect(result.cards[0].name).toBe('منتج 6')
    expect(store.callsTo('searchCards')[0].args[0]).toMatchObject({ tokens: [], categoryPattern: null })
  })

  it('يمرّر فلتر الفئة للمخزن ويطبّقه', async () => {
    const store = new FakeStore()
    store.cards = [
      card({ name: 'تيشيرت', category: 'ملابس' }),
      card({ name: 'تيشيرت ورقي', category: 'قرطاسية', group_id: GROUP_B }),
    ]
    const result = await searchProducts(store, ctx, { query: 'تيشيرت', category: 'الملابس' })
    expect(result.status === 'ok' && result.cards.map((c) => c.name)).toEqual(['تيشيرت'])
  })

  it('لا نتيجة ← no_match', async () => {
    const store = new FakeStore()
    expect(await searchProducts(store, ctx, { query: 'ساعة' })).toEqual({ status: 'no_match' })
  })

  it('القيم المجهولة تبقى null ولا تتحول لأصفار', async () => {
    const store = new FakeStore()
    store.cards = [
      card({
        name: 'عباءة',
        price_from_iqd: null,
        price_to_iqd: null,
        available_colors: null,
        available_sizes: null,
        warranty_months: null,
        return_days: null,
        available_units: 0,
        in_stock: false,
      }),
    ]
    const result = await searchProducts(store, ctx, { query: 'عباءة' })
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.cards[0]).toMatchObject({
      price_from_iqd: null,
      price_to_iqd: null,
      available_colors: null,
      available_sizes: null,
      warranty_months: null,
      return_days: null,
      in_stock: false,
    })
  })

  it('استعلام واحد للقاعدة لكل نداء', async () => {
    const store = new FakeStore()
    store.cards = [card({ name: 'قبعة' })]
    await searchProducts(store, ctx, { query: 'قبعة' })
    expect(store.calls).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
describe('get_product_details', () => {
  function seeded() {
    const store = new FakeStore()
    store.groups = [
      {
        merchant_id: MERCHANT,
        id: GROUP_A,
        name: 'تيشيرت',
        category: 'ملابس',
        description: '  قطن مريح  ',
        key_features: ['قطن 100%', '', 7, null, 'يتحمل الغسيل'],
        warranty_months: null,
        return_days: 7,
      },
    ]
    store.variants = [
      { merchant_id: MERCHANT, group_id: GROUP_A, ...variant({ id: 1, price_iqd: '15000' }) },
      { merchant_id: MERCHANT, group_id: GROUP_A, ...variant({ id: 2, color: 'أبيض', price_iqd: null, stock: 0 }) },
      { merchant_id: MERCHANT, group_id: GROUP_A, ...variant({ id: 3, status: 'معطل' }) },
      { merchant_id: MERCHANT, group_id: GROUP_A, ...variant({ id: 4, status: 'inactive' }) },
      { merchant_id: MERCHANT, group_id: GROUP_A, ...variant({ id: 5, color: 'أحمر', status: 'active' }) },
    ]
    return store
  }

  it('معرّف غير UUID ← not_found بلا أي استعلام', async () => {
    const store = seeded()
    expect(await getProductDetails(store, ctx, { group_id: 'تيشيرت' })).toEqual({ status: 'not_found' })
    expect(store.calls).toHaveLength(0)
  })

  it('عائلة غير موجودة ← not_found', async () => {
    const store = seeded()
    expect(await getProductDetails(store, ctx, { group_id: GROUP_B })).toEqual({ status: 'not_found' })
  })

  it('عائلة تاجر آخر ← not_found (العزل في الاستعلام)', async () => {
    const store = seeded()
    const result = await getProductDetails(store, { merchantId: OTHER_MERCHANT }, { group_id: GROUP_A })
    expect(result).toEqual({ status: 'not_found' })
  })

  it('يستبعد المتغيّرات المعطَّلة ويبقي المجهولة كما هي', async () => {
    const result = await getProductDetails(seeded(), ctx, { group_id: GROUP_A })
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.variants.map((v) => v.variant_id)).toEqual([1, 2, 5])
    expect(result.variants[0]).toMatchObject({ price_iqd: 15000, in_stock: true })
    expect(result.variants[1]).toMatchObject({ price_iqd: null, in_stock: false })
    expect(result.warranty_months).toBeNull()
    expect(result.return_days).toBe(7)
  })

  it('يقصّ الوصف، ويصفّي key_features غير النصية', async () => {
    const result = await getProductDetails(seeded(), ctx, { group_id: GROUP_A })
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.description).toBe('قطن مريح')
    expect(result.key_features).toEqual(['قطن 100%', 'يتحمل الغسيل'])
  })

  it('سياسات المتجر: غياب الصف أو الحقل الفارغ ← null (لا نص مخمَّن)', async () => {
    const store = seeded()
    let result = await getProductDetails(store, ctx, { group_id: GROUP_A })
    expect(result.status === 'ok' && result.policies).toEqual({ return_policy: null, warranty_policy: null })

    store.policies[MERCHANT] = { return_policy: '  استبدال خلال ٧ أيام ', warranty_policy: '   ' }
    result = await getProductDetails(store, ctx, { group_id: GROUP_A })
    expect(result.status === 'ok' && result.policies).toEqual({
      return_policy: 'استبدال خلال ٧ أيام',
      warranty_policy: null,
    })
  })

  it('ثلاثة استعلامات بالتوازي مقيَّدة بالتاجر، بلا N+1', async () => {
    const store = seeded()
    await getProductDetails(store, ctx, { group_id: GROUP_A })
    expect(store.calls.map((c) => c.method).sort()).toEqual(['getGroup', 'getPolicies', 'getVariants'])
    for (const call of store.calls) expect(call.args[0]).toBe(MERCHANT)
  })
})

// ---------------------------------------------------------------------------
describe('check_availability', () => {
  function seeded() {
    const store = new FakeStore()
    const rows = [
      variant({ id: 1, color: 'أسود', size: 'large', stock: 5 }),
      variant({ id: 2, color: 'أسود', size: 'medium', stock: 0 }),
      variant({ id: 3, color: 'أبيض', size: 'large', stock: -3 }),
      variant({ id: 4, color: 'أحمر', size: 'xl', stock: 4, status: 'معطل' }),
      variant({ id: 5, color: 'أزرق', size: null, stock: null, price_iqd: null }),
    ]
    store.variants = rows.map((r) => ({ ...r, merchant_id: MERCHANT, group_id: GROUP_A }))
    return store
  }

  it('يطابق اللون والقياس بمفردات الزبون (سودا + لارج)', async () => {
    const result = await checkAvailability(seeded(), ctx, { group_id: GROUP_A, color: 'سودا', size: 'لارج' })
    expect(result).toEqual({
      status: 'ok',
      matches: [{ variant_id: 1, color: 'أسود', size: 'large', price_iqd: 15000, available: true, stock: 5 }],
    })
  })

  it('مخزون صفر أو سالب أو null ← غير متوفر بمخزون 0 (لا قيمة سالبة تصل النموذج)', async () => {
    const result = await checkAvailability(seeded(), ctx, { group_id: GROUP_A })
    if (result.status !== 'ok') throw new Error('expected ok')
    const byId = Object.fromEntries(result.matches.map((m) => [m.variant_id, m]))
    expect(byId[2]).toMatchObject({ available: false, stock: 0 })
    expect(byId[3]).toMatchObject({ available: false, stock: 0 })
    expect(byId[5]).toMatchObject({ available: false, stock: 0, size: null, price_iqd: null })
  })

  it('المتغيّر المعطَّل لا يظهر ولو طُلب بالاسم', async () => {
    const result = await checkAvailability(seeded(), ctx, { group_id: GROUP_A, color: 'أحمر' })
    expect(result).toEqual({ status: 'ok', matches: [] })
  })

  it('لا تركيبة مطابقة ← matches فارغة (لا not_found)', async () => {
    const result = await checkAvailability(seeded(), ctx, { group_id: GROUP_A, color: 'أسود', size: 'xl' })
    expect(result).toEqual({ status: 'ok', matches: [] })
  })

  it('بلا لون ولا قياس ← كل المتغيّرات غير المعطَّلة', async () => {
    const result = await checkAvailability(seeded(), ctx, { group_id: GROUP_A })
    expect(result.status === 'ok' && result.matches.map((m) => m.variant_id)).toEqual([1, 2, 3, 5])
  })

  it('UUID غير صالح أو عائلة بلا صفوف أو لتاجر آخر ← not_found', async () => {
    const store = seeded()
    expect(await checkAvailability(store, ctx, { group_id: 'x' })).toEqual({ status: 'not_found' })
    expect(await checkAvailability(store, ctx, { group_id: GROUP_B })).toEqual({ status: 'not_found' })
    expect(await checkAvailability(store, { merchantId: OTHER_MERCHANT }, { group_id: GROUP_A })).toEqual({
      status: 'not_found',
    })
  })

  it('استعلام واحد مقيَّد بالتاجر', async () => {
    const store = seeded()
    await checkAvailability(store, ctx, { group_id: GROUP_A, color: 'أسود' })
    expect(store.calls).toHaveLength(1)
    expect(store.calls[0]).toMatchObject({ method: 'getVariants', args: [MERCHANT, GROUP_A] })
  })
})

// ---------------------------------------------------------------------------
describe('quote_shipping', () => {
  function withSettings(settings = SETTINGS) {
    const store = new FakeStore()
    store.settings[MERCHANT] = settings
    return store
  }

  it('لا إعدادات توصيل للتاجر ← unavailable (لا أجرة مخمَّنة)', async () => {
    const store = new FakeStore()
    expect(await quoteShipping(store, ctx, { governorate: 'بغداد' })).toEqual({
      status: 'unavailable',
      reason: 'no_delivery_settings',
    })
  })

  it('محافظة الانطلاق ← محلي، بلا بحث في دليل المناطق', async () => {
    const store = withSettings()
    expect(await quoteShipping(store, ctx, { governorate: 'بغداد' })).toEqual({
      status: 'quoted',
      governorate: 'بغداد',
      scope: 'local',
      fee_iqd: 3000,
      days: 1,
      note: 'التوصيل بنفس اليوم',
    })
    expect(store.callsTo('findAreas')).toHaveLength(0)
  })

  it('محافظة أخرى ← بقية المحافظات', async () => {
    const result = await quoteShipping(withSettings(), ctx, { governorate: 'محافظة البصره' })
    expect(result).toMatchObject({ status: 'quoted', governorate: 'البصرة', scope: 'other', fee_iqd: 5000, days: 3, note: null })
  })

  it('المقارنة بالتطبيع: الأنبار = الانبار', async () => {
    const store = withSettings({ ...SETTINGS, base_governorate: 'الانبار' })
    expect(await quoteShipping(store, ctx, { governorate: 'الأنبار' })).toMatchObject({
      governorate: 'الأنبار',
      scope: 'local',
    })
  })

  it('منطقة بمحافظة واحدة ← تُستعمل', async () => {
    const store = withSettings()
    store.areas = [{ area_name: 'حي العامرية', governorate: 'بغداد' }]
    expect(await quoteShipping(store, ctx, { area_name: 'العامرية' })).toMatchObject({
      status: 'quoted',
      governorate: 'بغداد',
      scope: 'local',
    })
  })

  it('منطقة في أكثر من محافظة ← يسأل الزبون عن المحافظة بما أعاده الدليل فقط', async () => {
    const store = withSettings()
    store.areas = [
      { area_name: 'العامرية', governorate: 'بغداد' },
      { area_name: 'العامرية', governorate: 'الأنبار' },
      { area_name: 'حي العامرية', governorate: 'بغداد' },
    ]
    expect(await quoteShipping(store, ctx, { area_name: 'العامرية' })).toEqual({
      status: 'needs_governorate',
      candidates: ['بغداد', 'الأنبار'],
    })
  })

  it('منطقة غير موجودة في الدليل الجزئي ← needs_governorate بلا مرشحين', async () => {
    expect(await quoteShipping(withSettings(), ctx, { area_name: 'قرية نائية' })).toEqual({
      status: 'needs_governorate',
      candidates: [],
    })
  })

  it('صف دليل بمحافظة غير معتمدة (الديوانية) لا يُسعَّر عليه', async () => {
    const store = withSettings()
    store.areas = [{ area_name: 'القادسية', governorate: 'الديوانية' }]
    expect(await quoteShipping(store, ctx, { area_name: 'القادسية' })).toEqual({
      status: 'needs_governorate',
      candidates: [],
    })
  })

  it('«محافظة» غير معتمدة (حي) بلا منطقة ← يسأل، ولا يُعامَل كبقية المحافظات', async () => {
    expect(await quoteShipping(withSettings(), ctx, { governorate: 'الكرخ' })).toEqual({
      status: 'needs_governorate',
      candidates: [],
    })
  })

  it('محافظة غير معتمدة مع منطقة ← يحسم الدليل', async () => {
    const store = withSettings()
    store.areas = [{ area_name: 'الكرخ', governorate: 'بغداد' }]
    expect(await quoteShipping(store, ctx, { governorate: 'الكرخ', area_name: 'الكرخ' })).toMatchObject({
      status: 'quoted',
      governorate: 'بغداد',
      scope: 'local',
    })
  })

  it('بلا محافظة ولا منطقة ← needs_governorate', async () => {
    expect(await quoteShipping(withSettings(), ctx, {})).toEqual({ status: 'needs_governorate', candidates: [] })
  })

  it('قيم الأجرة النصية تُحوَّل لأرقام، والصفر يمرّ كما أعلنه التاجر', async () => {
    const store = withSettings({ ...SETTINGS, local_fee_iqd: '0', local_days: '2' })
    expect(await quoteShipping(store, ctx, { governorate: 'بغداد' })).toMatchObject({ fee_iqd: 0, days: 2 })
  })

  it.each([
    ['أجرة غير رقمية', { other_fee_iqd: 'abc' }],
    ['أجرة null', { other_fee_iqd: null }],
    ['أجرة سالبة', { other_fee_iqd: -1 }],
    ['مدة null', { other_days: null }],
  ])('إعدادات غير صالحة (%s) ← unavailable ولا رقم مخمَّن', async (_label, patch) => {
    const store = withSettings({ ...SETTINGS, ...patch } as typeof SETTINGS)
    expect(await quoteShipping(store, ctx, { governorate: 'البصرة' })).toEqual({
      status: 'unavailable',
      reason: 'invalid_delivery_settings',
    })
  })

  it('الإعدادات المعطوبة لمحلي لا تؤثر على «بقية المحافظات» والعكس', async () => {
    const store = withSettings({ ...SETTINGS, local_fee_iqd: null })
    expect(await quoteShipping(store, ctx, { governorate: 'البصرة' })).toMatchObject({ status: 'quoted', fee_iqd: 5000 })
  })

  it('إعدادات تاجر آخر لا تُستعمل', async () => {
    const store = new FakeStore()
    store.settings[OTHER_MERCHANT] = SETTINGS
    expect(await quoteShipping(store, ctx, { governorate: 'بغداد' })).toEqual({
      status: 'unavailable',
      reason: 'no_delivery_settings',
    })
  })

  it('استعلامان بالتوازي في مسار المنطقة، واحد في مسار المحافظة', async () => {
    const byArea = withSettings()
    byArea.areas = [{ area_name: 'الكرادة', governorate: 'بغداد' }]
    await quoteShipping(byArea, ctx, { area_name: 'الكرادة' })
    expect(byArea.calls.map((c) => c.method).sort()).toEqual(['findAreas', 'getDeliverySettings'])

    const byGov = withSettings()
    await quoteShipping(byGov, ctx, { governorate: 'البصرة' })
    expect(byGov.calls.map((c) => c.method)).toEqual(['getDeliverySettings'])
  })
})

// ---------------------------------------------------------------------------
describe('parseToolCall — مدخلات النموذج', () => {
  it('search_products: query اختيارية، تُقصّ، والمفاتيح الزائدة (merchant_id) تُهمل', () => {
    const parsed = parseToolCall('search_products', { query: '  تيشيرت ', merchant_id: OTHER_MERCHANT, x: 1 })
    expect(parsed).toEqual({
      ok: true,
      call: { tool: 'search_products', input: { query: 'تيشيرت', category: undefined } },
    })
    expect(parseToolCall('search_products', undefined)).toMatchObject({ ok: true })
  })

  it('group_id مطلوب في details وavailability', () => {
    expect(parseToolCall('get_product_details', {})).toMatchObject({ ok: false })
    expect(parseToolCall('check_availability', { group_id: '  ' })).toMatchObject({ ok: false })
    expect(parseToolCall('get_product_details', { group_id: GROUP_A })).toMatchObject({ ok: true })
  })

  it('يرفض النوع الخاطئ والنص الطويل', () => {
    expect(parseToolCall('search_products', { query: 42 })).toMatchObject({ ok: false })
    expect(parseToolCall('search_products', { query: 'ا'.repeat(201) })).toMatchObject({ ok: false })
    expect(parseToolCall('quote_shipping', { governorate: ['بغداد'] })).toMatchObject({ ok: false })
    expect(parseToolCall('check_availability', { group_id: GROUP_A, color: 'ا'.repeat(101) })).toMatchObject({
      ok: false,
    })
  })

  it('الحقول الفارغة تصير undefined', () => {
    expect(parseToolCall('check_availability', { group_id: GROUP_A, color: ' ', size: '' })).toEqual({
      ok: true,
      call: { tool: 'check_availability', input: { group_id: GROUP_A, color: undefined, size: undefined } },
    })
    expect(parseToolCall('quote_shipping', null)).toEqual({
      ok: true,
      call: { tool: 'quote_shipping', input: { governorate: undefined, area_name: undefined } },
    })
  })
})
