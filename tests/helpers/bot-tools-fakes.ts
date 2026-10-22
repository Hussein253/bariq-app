import { arNormalize } from '@/lib/bot-tools/normalize'
import type {
  AreaRow,
  BotToolsStore,
  DeliverySettingsRow,
  GroupRow,
  PolicyRow,
  SearchCardsArgs,
  VariantRow,
} from '@/lib/bot-tools/store'
import type { ProductCard } from '@/lib/product-knowledge'

export const MERCHANT = '11111111-1111-4111-8111-111111111111'
export const OTHER_MERCHANT = '22222222-2222-4222-8222-222222222222'
export const GROUP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const GROUP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

/** بطاقة product_cards بقيم افتراضية معقولة؛ name_norm/category_norm تُشتقّان كما تفعل القاعدة. */
export function card(partial: Partial<ProductCard> & { name: string }): ProductCard {
  return {
    group_id: GROUP_A,
    merchant_id: MERCHANT,
    catalog_id: null,
    category: null,
    price_from_iqd: 15000,
    price_to_iqd: 15000,
    available_units: 5,
    in_stock: true,
    available_colors: ['أسود'],
    available_sizes: ['large'],
    warranty_months: null,
    return_days: null,
    top_features: [],
    has_details: false,
    name_norm: arNormalize(partial.name),
    category_norm: arNormalize(partial.category ?? ''),
    ...partial,
  }
}

export function variant(partial: Partial<VariantRow> & { id: number }): VariantRow {
  return { color: 'أسود', size: 'large', price_iqd: 15000, stock: 5, status: null, ...partial }
}

export const SETTINGS: DeliverySettingsRow = {
  base_governorate: 'بغداد',
  local_fee_iqd: 3000,
  local_days: 1,
  local_note: 'التوصيل بنفس اليوم',
  other_fee_iqd: 5000,
  other_days: 3,
  other_note: null,
}

/** نمط ilike (%أ%ب%) إلى تعبير نمطي، لمحاكاة الفلتر الذي تطبّقه القاعدة. */
function likeToRegex(pattern: string): RegExp {
  const body = pattern
    .split('%')
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}$`, 'i')
}

/**
 * مخزن وهمي يحاكي عزل التاجر وفلاتر القاعدة، ويسجّل كل نداء لاختبار:
 * عدد الاستعلامات (لا N+1) وأن merchantId يصل كل استعلام.
 */
export class FakeStore implements BotToolsStore {
  calls: Array<{ method: string; args: unknown[] }> = []
  cards: ProductCard[] = []
  groups: Array<GroupRow & { merchant_id: string }> = []
  variants: Array<VariantRow & { merchant_id: string; group_id: string }> = []
  policies: Record<string, PolicyRow> = {}
  settings: Record<string, DeliverySettingsRow> = {}
  areas: AreaRow[] = []
  failWith: Error | null = null

  private record(method: string, ...args: unknown[]) {
    this.calls.push({ method, args })
    if (this.failWith) throw this.failWith
  }

  callsTo(method: string) {
    return this.calls.filter((c) => c.method === method)
  }

  async searchCards(args: SearchCardsArgs) {
    this.record('searchCards', args)
    const category = args.categoryPattern ? likeToRegex(args.categoryPattern) : null
    return this.cards
      .filter((c) => c.merchant_id === args.merchantId)
      .filter(
        (c) =>
          args.tokens.length === 0 ||
          args.tokens.some(
            (t) => c.name_norm.toLowerCase().includes(t) || c.category_norm.toLowerCase().includes(t)
          )
      )
      .filter((c) => !category || category.test(c.category_norm))
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .slice(0, args.limit)
  }

  async getGroup(merchantId: string, groupId: string) {
    this.record('getGroup', merchantId, groupId)
    return this.groups.find((g) => g.merchant_id === merchantId && g.id === groupId) ?? null
  }

  async getVariants(merchantId: string, groupId: string) {
    this.record('getVariants', merchantId, groupId)
    return this.variants.filter((v) => v.merchant_id === merchantId && v.group_id === groupId)
  }

  async getPolicies(merchantId: string) {
    this.record('getPolicies', merchantId)
    return this.policies[merchantId] ?? null
  }

  async getDeliverySettings(merchantId: string) {
    this.record('getDeliverySettings', merchantId)
    return this.settings[merchantId] ?? null
  }

  async findAreas(pattern: string) {
    this.record('findAreas', pattern)
    return this.areas.slice(0, 20)
  }
}
