import { supabaseServer } from '@/lib/supabase-server'
import { mapOrderRow, type MerchantOrder } from '@/lib/orders'

/**
 * طلبات تاجر واحد لصفحته (/workspace/orders)
 * ===========================================
 * ⚠️ تستخدم service_role — لا تُستورد أبداً في كود المتصفح.
 * الاستعلام هو نفسه في /api/orders/confirmed (الطلب وعناصره ومرجع شحنته)،
 * مع فرقين: التقييد بالتاجر شرط صريح، ولا تصفية بالحالة — التاجر يرى كل
 * طلباته، والتصفية في الصفحة.
 */

/** حدّ أولي للقائمة — يُضاف ترقيم الصفحات حين يتجاوزه تاجر فعلاً. */
const MERCHANT_ORDERS_LIMIT = 500

export async function loadMerchantOrders(merchantId: string): Promise<MerchantOrder[]> {
  const { data, error } = await supabaseServer
    .from('orders')
    .select(
      `order_id, created_at, phone_number, contact_phone, name, customer_name,
       governorate, district, address, address_details, order_content,
       items_total_iqd, delivery_fee_iqd, grand_total_iqd, current_state, updated_at,
       shipments ( id, tracking_number, status ),
       order_items ( id, variant_id, product_name_snapshot, color_snapshot, size_snapshot, quantity, unit_price_iqd )`
    )
    .eq('merchant_id', merchantId)
    .order('created_at', { ascending: false })
    .limit(MERCHANT_ORDERS_LIMIT)

  if (error) throw new Error(error.message)

  return (data || []).map((row) => mapOrderRow(row as Record<string, unknown>))
}
