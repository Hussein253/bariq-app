import type {
  BotToolContext,
  BotToolName,
  CheckAvailabilityInput,
  CheckAvailabilityResult,
  GetProductDetailsInput,
  GetProductDetailsResult,
  QuoteShippingInput,
  QuoteShippingResult,
  SearchProductsInput,
  SearchProductsResult,
} from '@/lib/product-knowledge'
import { checkAvailability, getProductDetails, quoteShipping, searchProducts } from './handlers'
import type { BotToolsStore } from './store'

/**
 * سجلّ أدوات البوت: التحقق من المدخلات + التوزيع على المعالجات.
 * المسار (app/api/bot-tools/[tool]) يستعمل هذا الملف وحده.
 *
 * مدخلات الأدوات هي ما يملؤه النموذج فقط. التاجر لا يُقرأ منها أبداً: يأتي من الطلب
 * الموقَّع (BotToolContext). أي مفتاح زائد في المدخلات (merchant_id مثلاً) يُتجاهل.
 */

export const BOT_TOOL_NAMES: readonly BotToolName[] = [
  'search_products',
  'get_product_details',
  'check_availability',
  'quote_shipping',
]

export function isBotToolName(value: string): value is BotToolName {
  return (BOT_TOOL_NAMES as readonly string[]).includes(value)
}

export type BotToolCall =
  | { tool: 'search_products'; input: SearchProductsInput }
  | { tool: 'get_product_details'; input: GetProductDetailsInput }
  | { tool: 'check_availability'; input: CheckAvailabilityInput }
  | { tool: 'quote_shipping'; input: QuoteShippingInput }

export type BotToolResult =
  | SearchProductsResult
  | GetProductDetailsResult
  | CheckAvailabilityResult
  | QuoteShippingResult

export type ParseResult = { ok: true; call: BotToolCall } | { ok: false; error: string }

const MAX_TEXT = 200
const MAX_SHORT_TEXT = 100

type Field = { name: string; max: number; required?: boolean }

/** نص اختياري/إلزامي بطول محدود. فارغ ⇒ undefined. نوع غير نصي ⇒ خطأ. */
function readText(
  raw: Record<string, unknown>,
  { name, max, required }: Field
): { ok: true; value: string | undefined } | { ok: false; error: string } {
  const v = raw[name]
  if (v === undefined || v === null) {
    return required ? { ok: false, error: `الحقل ${name} مطلوب` } : { ok: true, value: undefined }
  }
  if (typeof v !== 'string') return { ok: false, error: `الحقل ${name} يجب أن يكون نصاً` }
  const trimmed = v.trim()
  if (trimmed.length > max) return { ok: false, error: `الحقل ${name} أطول من ${max} حرفاً` }
  if (trimmed === '') {
    return required ? { ok: false, error: `الحقل ${name} مطلوب` } : { ok: true, value: undefined }
  }
  return { ok: true, value: trimmed }
}

export function parseToolCall(tool: BotToolName, rawInput: unknown): ParseResult {
  const raw: Record<string, unknown> =
    rawInput !== null && typeof rawInput === 'object' && !Array.isArray(rawInput)
      ? (rawInput as Record<string, unknown>)
      : {}

  switch (tool) {
    case 'search_products': {
      const query = readText(raw, { name: 'query', max: MAX_TEXT })
      if (!query.ok) return query
      const category = readText(raw, { name: 'category', max: MAX_SHORT_TEXT })
      if (!category.ok) return category
      return { ok: true, call: { tool, input: { query: query.value ?? '', category: category.value } } }
    }
    case 'get_product_details': {
      const groupId = readText(raw, { name: 'group_id', max: 64, required: true })
      if (!groupId.ok) return groupId
      return { ok: true, call: { tool, input: { group_id: groupId.value as string } } }
    }
    case 'check_availability': {
      const groupId = readText(raw, { name: 'group_id', max: 64, required: true })
      if (!groupId.ok) return groupId
      const color = readText(raw, { name: 'color', max: MAX_SHORT_TEXT })
      if (!color.ok) return color
      const size = readText(raw, { name: 'size', max: MAX_SHORT_TEXT })
      if (!size.ok) return size
      return {
        ok: true,
        call: { tool, input: { group_id: groupId.value as string, color: color.value, size: size.value } },
      }
    }
    case 'quote_shipping': {
      const governorate = readText(raw, { name: 'governorate', max: MAX_SHORT_TEXT })
      if (!governorate.ok) return governorate
      const areaName = readText(raw, { name: 'area_name', max: MAX_SHORT_TEXT })
      if (!areaName.ok) return areaName
      return {
        ok: true,
        call: { tool, input: { governorate: governorate.value, area_name: areaName.value } },
      }
    }
  }
}

export function runBotTool(
  store: BotToolsStore,
  ctx: BotToolContext,
  call: BotToolCall
): Promise<BotToolResult> {
  switch (call.tool) {
    case 'search_products':
      return searchProducts(store, ctx, call.input)
    case 'get_product_details':
      return getProductDetails(store, ctx, call.input)
    case 'check_availability':
      return checkAvailability(store, ctx, call.input)
    case 'quote_shipping':
      return quoteShipping(store, ctx, call.input)
  }
}
