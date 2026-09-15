import { paymentsNotImplemented } from '@/lib/payments'

/**
 * POST /api/payments/initiate — بدء دفع إلكتروني
 * ===============================================
 * مُعطَّل عمداً حتى يُبنى تكامل حقيقي. ما كان هنا سابقاً كان يُعيد رابط دفع
 * مركَّباً نصياً ومعاملة مخزَّنة في الذاكرة، فيظهر للتاجر أن جلسة دفع فُتحت
 * وهي لم تُفتح. تفاصيل ما يلزم للتفعيل في lib/payments/index.ts.
 */
export async function POST() {
  return paymentsNotImplemented()
}
