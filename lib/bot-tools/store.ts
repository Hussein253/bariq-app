import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductCard } from '@/lib/product-knowledge'

/**
 * طبقة الوصول للبيانات لأدوات البوت
 * ==================================
 * كل استعلامات الأدوات هنا وحدها، خلف واجهة صغيرة، فتُختبر المعالجات (handlers.ts)
 * بمخزن وهمي بلا شبكة، ويُختبر المحوّل (createSupabaseStore) بعميل يلتقط الطلبات.
 *
 * ⚠️ العميل المُمرَّر يعمل بـ service_role فيتجاوز RLS. العزل بين التجار هنا في
 * الاستعلام نفسه: كل دالة تقبل merchantId وتقيّد به صراحةً (درس C3 في
 * docs/launch-readiness.md). الاستثناء الوحيد delivery_areas: دليل مناطق عام لا
 * يخص تاجراً بعينه (سياسته في ٠١٢: يقرأه كل مستخدم).
 *
 * كل دالة تعيد ما تحتاجه الأداة بعدد ثابت من الاستعلامات — لا استعلام داخل حلقة (N+1).
 */

/** أعمدة product_cards (الترحيل ٠٢٩) — القائمة صريحة لا `*`. */
const CARD_COLUMNS =
  'group_id, merchant_id, catalog_id, name, category, price_from_iqd, price_to_iqd, ' +
  'available_units, in_stock, available_colors, available_sizes, warranty_months, return_days, ' +
  'top_features, has_details, name_norm, category_norm'

const GROUP_COLUMNS = 'id, name, category, description, key_features, warranty_months, return_days'
const VARIANT_COLUMNS = 'id, color, size, price_iqd, stock, status'
const DELIVERY_COLUMNS =
  'base_governorate, local_fee_iqd, local_days, local_note, other_fee_iqd, other_days, other_note'

/** حدّ أمان لصفوف المتغيّرات في عائلة واحدة (ألوان × قياسات). */
const MAX_VARIANT_ROWS = 200
const MAX_AREA_ROWS = 20

// أنواع الصفوف كما تصل من PostgREST: numeric/bigint قد تصل رقماً أو نصاً، والتحويل في المعالجات.
export interface GroupRow {
  id: string
  name: string
  category: string | null
  description: string | null
  key_features: unknown
  warranty_months: number | string | null
  return_days: number | string | null
}

export interface VariantRow {
  id: number
  color: string | null
  size: string | null
  price_iqd: number | string | null
  stock: number | null
  status: string | null
}

export interface PolicyRow {
  return_policy: string | null
  warranty_policy: string | null
}

export interface DeliverySettingsRow {
  base_governorate: string
  local_fee_iqd: number | string | null
  local_days: number | string | null
  local_note: string | null
  other_fee_iqd: number | string | null
  other_days: number | string | null
  other_note: string | null
}

export interface AreaRow {
  area_name: string
  governorate: string
}

export interface SearchCardsArgs {
  merchantId: string
  /** كلمات مطبَّعة آمنة (toSearchTokens). فارغة = تصفّح. تُطابَق بـ OR على الاسم والفئة. */
  tokens: string[]
  /** نمط ilike جاهز على category_norm (categoryPattern) أو null. */
  categoryPattern: string | null
  limit: number
}

export interface BotToolsStore {
  searchCards(args: SearchCardsArgs): Promise<ProductCard[]>
  getGroup(merchantId: string, groupId: string): Promise<GroupRow | null>
  /** كل صفوف products للعائلة (بما فيها المعطَّلة) — التصفية في المعالج بتعريف واحد. */
  getVariants(merchantId: string, groupId: string): Promise<VariantRow[]>
  getPolicies(merchantId: string): Promise<PolicyRow | null>
  getDeliverySettings(merchantId: string): Promise<DeliverySettingsRow | null>
  /** دليل المناطق النشطة بنمط ilike على area_name_norm. */
  findAreas(pattern: string): Promise<AreaRow[]>
}

/** فشل قاعدة البيانات. الرسالة للسجلّ فقط ولا تصل النموذج ولا الزبون. */
export class StoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StoreError'
  }
}

function fail(label: string, error: { message: string } | null): void {
  if (error) throw new StoreError(`${label}: ${error.message}`)
}

export function createSupabaseStore(client: SupabaseClient): BotToolsStore {
  return {
    async searchCards({ merchantId, tokens, categoryPattern, limit }) {
      let query = client.from('product_cards').select(CARD_COLUMNS).eq('merchant_id', merchantId)
      if (tokens.length > 0) {
        // الكلمات مُنظَّفة من , ( ) % * _ في sanitizeForSearch فلا تكسر صياغة or=()
        query = query.or(
          tokens.flatMap((t) => [`name_norm.ilike.%${t}%`, `category_norm.ilike.%${t}%`]).join(',')
        )
      }
      if (categoryPattern) query = query.ilike('category_norm', categoryPattern)
      const { data, error } = await query.order('name').limit(limit)
      fail('product_cards', error)
      return (data ?? []) as unknown as ProductCard[]
    },

    async getGroup(merchantId, groupId) {
      const { data, error } = await client
        .from('product_groups')
        .select(GROUP_COLUMNS)
        .eq('merchant_id', merchantId)
        .eq('id', groupId)
        .maybeSingle()
      fail('product_groups', error)
      return (data ?? null) as unknown as GroupRow | null
    },

    async getVariants(merchantId, groupId) {
      const { data, error } = await client
        .from('products')
        .select(VARIANT_COLUMNS)
        .eq('merchant_id', merchantId)
        .eq('group_id', groupId)
        .order('id')
        .limit(MAX_VARIANT_ROWS)
      fail('products', error)
      return (data ?? []) as unknown as VariantRow[]
    },

    async getPolicies(merchantId) {
      const { data, error } = await client
        .from('merchant_profiles')
        .select('return_policy, warranty_policy')
        .eq('merchant_id', merchantId)
        .maybeSingle()
      fail('merchant_profiles', error)
      return (data ?? null) as unknown as PolicyRow | null
    },

    async getDeliverySettings(merchantId) {
      const { data, error } = await client
        .from('merchant_delivery_settings')
        .select(DELIVERY_COLUMNS)
        .eq('merchant_id', merchantId)
        .maybeSingle()
      fail('merchant_delivery_settings', error)
      return (data ?? null) as unknown as DeliverySettingsRow | null
    },

    async findAreas(pattern) {
      const { data, error } = await client
        .from('delivery_areas')
        .select('area_name, governorate')
        .eq('is_active', true)
        .ilike('area_name_norm', pattern)
        .limit(MAX_AREA_ROWS)
      fail('delivery_areas', error)
      return (data ?? []) as unknown as AreaRow[]
    },
  }
}
