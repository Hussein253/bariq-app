import {
  DISABLED_PRODUCT_STATUSES,
  MAX_SEARCH_RESULTS,
  type BotAvailability,
  type BotProductCard,
  type BotToolContext,
  type BotVariant,
  type CheckAvailabilityInput,
  type CheckAvailabilityResult,
  type GetProductDetailsInput,
  type GetProductDetailsResult,
  type MerchantPolicies,
  type ProductCard,
  type QuoteShippingInput,
  type QuoteShippingResult,
  type SearchProductsInput,
  type SearchProductsResult,
} from '@/lib/product-knowledge'
import { canonicalGovernorate, sameGovernorate } from './governorate'
import {
  areaSearchPattern,
  canonicalColor,
  canonicalSize,
  categoryPattern,
  isUuid,
  toSearchTokens,
} from './normalize'
import type { BotToolsStore, DeliverySettingsRow, VariantRow } from './store'

/**
 * معالجات أدوات البوت
 * ===================
 * منطق نقي فوق BotToolsStore: لا شبكة ولا قاعدة بيانات هنا، فيُختبر بمخزن وهمي.
 *
 * قواعد ثابتة في كل أداة (CLAUDE.md بند ٢-أ):
 *   • التاجر من ctx.merchantId (الطلب الموقَّع) وحده، ويُمرَّر لكل استعلام.
 *   • قيمة غير معروفة (null) تبقى null في الناتج ولا تُستبدل برقم أو نص مخمَّن.
 *   • «لا توجد نتيجة» حالة صريحة في النوع (not_found / no_match / unavailable)،
 *     لا خطأ ولا قيمة افتراضية.
 *
 * عدد استعلامات القاعدة لكل نداء ثابت (لا N+1): search=1، details=3 بالتوازي،
 * availability=1، shipping≤2 بالتوازي.
 */

/** صفوف تُجلب من القاعدة للبحث قبل الترتيب والقصّ — فوقها تُعدّ النتيجة «مقصوصة». */
const SEARCH_FETCH_LIMIT = 50
const MAX_AVAILABILITY_MATCHES = 100

// ---------------------------------------------------------------------------
// تحويلات دفاعية (القيم تصل من PostgREST: numeric/bigint قد تكون نصاً)
// ---------------------------------------------------------------------------

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t === '' ? null : t
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    : []
}

/** نفس تعريف product_cards: coalesce(status,'') في ('inactive','معطل'). */
function isDisabled(status: string | null): boolean {
  return (DISABLED_PRODUCT_STATUSES as readonly string[]).includes(status ?? '')
}

function stockOf(row: VariantRow): number {
  const n = toNumber(row.stock)
  return n !== null && n > 0 ? n : 0
}

// ---------------------------------------------------------------------------
// search_products
// ---------------------------------------------------------------------------

function toBotCard(row: ProductCard): BotProductCard {
  const units = toNumber(row.available_units) ?? 0
  return {
    group_id: row.group_id,
    name: row.name,
    category: textOrNull(row.category),
    price_from_iqd: toNumber(row.price_from_iqd),
    price_to_iqd: toNumber(row.price_to_iqd),
    available_units: units,
    in_stock: units > 0,
    available_colors: Array.isArray(row.available_colors) ? stringArray(row.available_colors) : null,
    available_sizes: Array.isArray(row.available_sizes) ? stringArray(row.available_sizes) : null,
    warranty_months: toNumber(row.warranty_months),
    return_days: toNumber(row.return_days),
    top_features: stringArray(row.top_features),
    has_details: row.has_details === true,
  }
}

/** كلمة في الاسم تساوي كلمتين، وفي الفئة كلمة؛ الأقرب للنص كاملاً أولاً. */
function relevance(row: ProductCard, tokens: string[]): number {
  const name = (row.name_norm ?? '').toLowerCase()
  const category = (row.category_norm ?? '').toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (name.includes(t)) score += 2
    if (category.includes(t)) score += 1
  }
  return score
}

export async function searchProducts(
  store: BotToolsStore,
  ctx: BotToolContext,
  input: SearchProductsInput
): Promise<SearchProductsResult> {
  const tokens = toSearchTokens(input.query)
  const rows = await store.searchCards({
    merchantId: ctx.merchantId,
    tokens,
    categoryPattern: categoryPattern(input.category),
    limit: SEARCH_FETCH_LIMIT,
  })
  if (rows.length === 0) return { status: 'no_match' }

  const ranked = rows
    .map((row) => ({ row, score: relevance(row, tokens), inStock: (toNumber(row.available_units) ?? 0) > 0 }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.inStock) - Number(a.inStock) ||
        a.row.name.localeCompare(b.row.name, 'ar')
    )

  return {
    status: 'ok',
    cards: ranked.slice(0, MAX_SEARCH_RESULTS).map(({ row }) => toBotCard(row)),
    truncated: rows.length >= SEARCH_FETCH_LIMIT || ranked.length > MAX_SEARCH_RESULTS,
  }
}

// ---------------------------------------------------------------------------
// get_product_details
// ---------------------------------------------------------------------------

function toBotVariant(row: VariantRow): BotVariant {
  return {
    variant_id: row.id,
    color: textOrNull(row.color),
    size: textOrNull(row.size),
    price_iqd: toNumber(row.price_iqd),
    in_stock: stockOf(row) > 0,
  }
}

export async function getProductDetails(
  store: BotToolsStore,
  ctx: BotToolContext,
  input: GetProductDetailsInput
): Promise<GetProductDetailsResult> {
  if (!isUuid(input.group_id)) return { status: 'not_found' }

  const [group, variants, policies] = await Promise.all([
    store.getGroup(ctx.merchantId, input.group_id),
    store.getVariants(ctx.merchantId, input.group_id),
    store.getPolicies(ctx.merchantId),
  ])
  if (!group) return { status: 'not_found' }

  const merchantPolicies: MerchantPolicies = {
    return_policy: textOrNull(policies?.return_policy),
    warranty_policy: textOrNull(policies?.warranty_policy),
  }

  return {
    status: 'ok',
    group_id: group.id,
    name: group.name,
    category: textOrNull(group.category),
    description: textOrNull(group.description),
    key_features: stringArray(group.key_features),
    warranty_months: toNumber(group.warranty_months),
    return_days: toNumber(group.return_days),
    variants: variants.filter((v) => !isDisabled(v.status)).map(toBotVariant),
    policies: merchantPolicies,
  }
}

// ---------------------------------------------------------------------------
// check_availability
// ---------------------------------------------------------------------------

/**
 * المخزون لحظي من القاعدة. اللون/القياس يُطابَقان بعد التطبيع ومفردات المتجر
 * (لارج = large، سودا = أسود). لا تطابق ⇒ matches فارغة (الصنف غير موجود)، لا not_found:
 * not_found للعائلة نفسها.
 */
export async function checkAvailability(
  store: BotToolsStore,
  ctx: BotToolContext,
  input: CheckAvailabilityInput
): Promise<CheckAvailabilityResult> {
  if (!isUuid(input.group_id)) return { status: 'not_found' }

  const rows = await store.getVariants(ctx.merchantId, input.group_id)
  if (rows.length === 0) return { status: 'not_found' }

  const wantedColor = input.color ? canonicalColor(input.color) : null
  const wantedSize = input.size ? canonicalSize(input.size) : null

  const matches: BotAvailability[] = rows
    .filter((row) => !isDisabled(row.status))
    .filter((row) => wantedColor === null || (row.color !== null && canonicalColor(row.color) === wantedColor))
    .filter((row) => wantedSize === null || (row.size !== null && canonicalSize(row.size) === wantedSize))
    .slice(0, MAX_AVAILABILITY_MATCHES)
    .map((row) => {
      const stock = stockOf(row)
      return {
        variant_id: row.id,
        color: textOrNull(row.color),
        size: textOrNull(row.size),
        price_iqd: toNumber(row.price_iqd),
        available: stock > 0,
        stock,
      }
    })

  return { status: 'ok', matches }
}

// ---------------------------------------------------------------------------
// quote_shipping
// ---------------------------------------------------------------------------

type ScopeFees = { fee: number; days: number; note: string | null }

/** محافظة الانطلاق = محلي، وغيرها = بقية المحافظات. قيمة غير رقمية ⇒ null (لا تُخمَّن). */
function feesFor(settings: DeliverySettingsRow, scope: 'local' | 'other'): ScopeFees | null {
  const fee = toNumber(scope === 'local' ? settings.local_fee_iqd : settings.other_fee_iqd)
  const days = toNumber(scope === 'local' ? settings.local_days : settings.other_days)
  if (fee === null || fee < 0 || days === null || days < 0) return null
  return { fee, days, note: textOrNull(scope === 'local' ? settings.local_note : settings.other_note) }
}

/**
 * أجرة التاجر المعلنة (merchant_delivery_settings). delivery_areas تحدّد المحافظة فقط.
 *
 * التحديد:
 *   ١) محافظة معتمدة في المدخل ⇒ تُستعمل ولا يُبحث عن المنطقة.
 *   ٢) وإلا المنطقة تُبحث في الدليل: محافظة واحدة ⇒ تُستعمل، أكثر ⇒ يُسأل الزبون،
 *      بلا نتيجة ⇒ يُسأل الزبون (الدليل جزئي والمتجر يوصّل لكل العراق).
 *   ٣) محافظة الدليل خارج القائمة المعتمدة (صف شاذ في الدليل) تُهمل ولا يُسعَّر عليها.
 *
 * ⚠️ fee_iqd = 0 تعني توصيلاً مجانياً أعلنه التاجر. النموذج يُحفظ بـ Number('') = 0 عند
 * ترك الحقل فارغاً (validateDeliverySettings)، فصفرٌ ناتج عن حقل فارغ لا يُميَّز اليوم.
 */
export async function quoteShipping(
  store: BotToolsStore,
  ctx: BotToolContext,
  input: QuoteShippingInput
): Promise<QuoteShippingResult> {
  const inputGovernorate = input.governorate ? canonicalGovernorate(input.governorate) : null
  const pattern = inputGovernorate === null && input.area_name ? areaSearchPattern(input.area_name) : null

  const [settings, areaRows] = await Promise.all([
    store.getDeliverySettings(ctx.merchantId),
    pattern ? store.findAreas(pattern) : Promise.resolve([]),
  ])
  if (!settings) return { status: 'unavailable', reason: 'no_delivery_settings' }

  let governorate = inputGovernorate
  if (governorate === null) {
    const candidates = [
      ...new Set(
        areaRows
          .map((row) => canonicalGovernorate(row.governorate))
          .filter((g): g is string => g !== null)
      ),
    ]
    if (candidates.length !== 1) return { status: 'needs_governorate', candidates }
    governorate = candidates[0]
  }

  const scope = sameGovernorate(governorate, settings.base_governorate) ? 'local' : 'other'
  const fees = feesFor(settings, scope)
  if (!fees) return { status: 'unavailable', reason: 'invalid_delivery_settings' }

  return {
    status: 'quoted',
    governorate,
    scope,
    fee_iqd: fees.fee,
    days: fees.days,
    note: fees.note,
  }
}
