/**
 * معرفة المنتج للموظف الذكي — أنواع الصفوف وعقود الأدوات.
 * ======================================================
 * المرحلة ١ (سكيما أولاً — بند ٢-ب في CLAUDE.md): أنواع وثوابت فقط، بلا استعلام
 * ولا منطق. تعكس الترحيل ٠٢٩ (supabase/migrations/029_product_groups_and_policy_columns.sql).
 * آمن للاستيراد في المتصفح.
 *
 * دلالة null في كل مكان: «غير محدَّد». الوكيل لا يخمّن قيمة null ولا يحسبها؛
 * يقول للزبون إنه سيتأكد، ويحوّله لموظف عند الحاجة. أما 0 فقرار صريح (لا ضمان…).
 */

// ---------------------------------------------------------------------------
// ثوابت تعكس قيود قاعدة البيانات — أي تعديل هنا يُعدَّل في ٠٢٩ معه
// ---------------------------------------------------------------------------

/** حدّ عناصر product_groups.key_features (قيد is_valid_key_features). */
export const MAX_KEY_FEATURES = 8
/** أقصى طول لعنصر في key_features بالحروف (قيد is_valid_key_features). */
export const MAX_KEY_FEATURE_LENGTH = 120
/** عدد المميزات التي تعرضها البطاقة (التعريف في product_cards.top_features). */
export const CARD_TOP_FEATURES = 3
/** أقصى عدد بطاقات تعيدها أداة البحث للوكيل في ردّ واحد. */
export const MAX_SEARCH_RESULTS = 5

/**
 * قيم products.status المعطَّلة — كما في displayStatus (lib/catalog.ts) وكما
 * يعرّفها product_cards. ما سواها (وnull) غير معطَّل.
 * ⚠️ قيم الإنتاج الفعلية لم تُراجَع بعد (انظر رأس الترحيل ٠٢٩).
 */
export const DISABLED_PRODUCT_STATUSES = ['inactive', 'معطل'] as const

// ---------------------------------------------------------------------------
// صفوف قاعدة البيانات
// ---------------------------------------------------------------------------

/** صف public.product_groups — «عائلة المنتج»: ما يخص المنتج لا لونه وقياسه. */
export interface ProductGroup {
  id: string
  merchant_id: string
  catalog_id: string | null
  name: string
  category: string | null
  description: string | null
  /** مصفوفة نصوص قصيرة (≤ MAX_KEY_FEATURES عناصر، كل عنصر ≤ MAX_KEY_FEATURE_LENGTH). */
  key_features: string[]
  /** null = غير محدَّد، 0 = لا ضمان صراحةً. */
  warranty_months: number | null
  /** null = غير محدَّد، 0 = لا إرجاع صراحةً. */
  return_days: number | null
  /** ar_normalize(name) — عمود محسوب للبحث العربي. لا يُكتب. */
  name_norm: string
  /** ar_normalize(category) — '' حين category فارغة. لا يُكتب. */
  category_norm: string
  created_at: string
  updated_at: string
}

/** الحقول الجديدة على public.merchant_profiles (الترحيل ٠٢٩). null = غير محدَّدة. */
export interface MerchantPolicies {
  return_policy: string | null
  warranty_policy: string | null
}

/**
 * صف الواجهة public.product_cards — بطاقة عائلة واحدة.
 * التجميع على صفوف products غير المعطَّلة (DISABLED_PRODUCT_STATUSES):
 *   • السعر من price_iqd المُسعَّر فقط؛ كلها null ⇒ price_* = null ⇒ لا سعر يُذكر.
 *   • available_* من الصفوف التي stock > 0 فقط.
 */
export interface ProductCard {
  group_id: string
  merchant_id: string
  catalog_id: string | null
  name: string
  category: string | null
  price_from_iqd: number | null
  price_to_iqd: number | null
  /** مجموع مخزون الصفوف المتوفرة. 0 حين لا شيء متوفر. */
  available_units: number
  in_stock: boolean
  /** null حين لا لون متوفر. المصفوفتان لا تحفظان الأزواج — check_availability تجيب عنها. */
  available_colors: string[] | null
  available_sizes: string[] | null
  warranty_months: number | null
  return_days: number | null
  /** أول CARD_TOP_FEATURES من key_features. */
  top_features: string[]
  /** هل للعائلة وصف تفصيلي (get_product_details يعيده). */
  has_details: boolean
  /** ar_normalize(name) — للبحث المطبَّع فقط، لا يُعرض للنموذج. */
  name_norm: string
  /** ar_normalize(category) — للبحث المطبَّع فقط، لا يُعرض للنموذج. */
  category_norm: string
}

// ---------------------------------------------------------------------------
// عقود أدوات الوكيل
// ---------------------------------------------------------------------------

export type BotToolName =
  | 'search_products'
  | 'get_product_details'
  | 'check_availability'
  | 'quote_shipping'

/**
 * السياق الموثوق لكل أداة — يأتي من الطلب الموقَّع (HMAC) الذي ترسله عقدة n8n
 * بعد «تحديد التاجر»، لا من مدخلات النموذج أبداً (درس C1 في docs/launch-readiness.md).
 * مدخلات الأدوات أدناه هي وحدها ما يملؤه النموذج.
 */
export interface BotToolContext {
  merchantId: string
}

/**
 * البطاقة كما تُعرض للنموذج: بلا merchant_id ولا catalog_id ولا الأعمدة المطبَّعة
 * (معرّفات داخلية وأعمدة بحث لا حاجة للنموذج بها). group_id باقٍ لأنه مفتاح
 * الأدوات التالية.
 */
export type BotProductCard = Omit<
  ProductCard,
  'merchant_id' | 'catalog_id' | 'name_norm' | 'category_norm'
>

// ---- search_products -------------------------------------------------------

export interface SearchProductsInput {
  /** كما كتبها الزبون. تُطبَّع بنفس ar_normalize (ة/ه، ى/ي، أ/ا…) قبل المطابقة. */
  query: string
  category?: string
}

export type SearchProductsResult =
  | { status: 'ok'; cards: BotProductCard[]; truncated: boolean }
  | { status: 'no_match' }

// ---- get_product_details ---------------------------------------------------

export interface GetProductDetailsInput {
  group_id: string
}

/** متغيّر قابل للبيع = صف products (order_items.variant_id يشير إلى id هذا). */
export interface BotVariant {
  variant_id: number
  color: string | null
  size: string | null
  /** null = لا سعر ⇒ لا يُذكر سعر لهذا المتغيّر. */
  price_iqd: number | null
  in_stock: boolean
}

export type GetProductDetailsResult =
  | {
      status: 'ok'
      group_id: string
      name: string
      category: string | null
      description: string | null
      key_features: string[]
      warranty_months: number | null
      return_days: number | null
      variants: BotVariant[]
      /** سياسة المتجر النصية. null = غير محدَّدة. */
      policies: MerchantPolicies
    }
  | { status: 'not_found' }

// ---- check_availability ----------------------------------------------------

export interface CheckAvailabilityInput {
  group_id: string
  /** كما كتبها الزبون؛ تُطابَق بعد التطبيع. بلا لون ولا قياس ⇒ كل المتغيّرات. */
  color?: string
  size?: string
}

export interface BotAvailability {
  variant_id: number
  color: string | null
  size: string | null
  price_iqd: number | null
  /** stock > 0. المخزون يُقرأ لحظياً من القاعدة، لا من ذاكرة النموذج. */
  available: boolean
  stock: number
}

export type CheckAvailabilityResult =
  | { status: 'ok'; matches: BotAvailability[] }
  | { status: 'not_found' }

// ---- quote_shipping --------------------------------------------------------

export interface QuoteShippingInput {
  /** المحافظة كما كتبها الزبون (اختيارية إن ذكر منطقة). */
  governorate?: string
  /** المنطقة/الحي كما كتبها الزبون — يُبحث عنها في delivery_areas. */
  area_name?: string
}

/**
 * أجرة التاجر المعلنة من merchant_delivery_settings:
 * محافظة الزبون = base_governorate ⇒ local_fee_iqd/local_days، وإلا other_*.
 * delivery_areas تُستعمل لتحديد المحافظة فقط، لا للأجرة (تسعيرة برق الداخلية).
 */
export type QuoteShippingResult =
  | {
      status: 'quoted'
      governorate: string
      scope: 'local' | 'other'
      fee_iqd: number
      days: number
      note: string | null
    }
  /** المنطقة في أكثر من محافظة، أو غير موجودة في الدليل الجزئي: يسأل الوكيل الزبون عن المحافظة. */
  | { status: 'needs_governorate'; candidates: string[] }
  /**
   * لا أجرة تُذكر والوكيل يحوّل لموظف:
   *   no_delivery_settings      لا صف merchant_delivery_settings للتاجر.
   *   invalid_delivery_settings الصف موجود وقيمه غير رقمية (انحراف بيانات، لا يُخمَّن بدلها).
   */
  | { status: 'unavailable'; reason: 'no_delivery_settings' | 'invalid_delivery_settings' }
