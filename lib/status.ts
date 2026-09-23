import { supabaseServer } from '@/lib/supabase-server'

/**
 * فحوصات حالة المنصة الحقيقية — لا نصّاً ثابتاً
 * ================================================
 * كل قيمة هنا فحص فعلي يُشغَّل لحظة الطلب، لا ادّعاء مكتوب سلفاً:
 *  - `database`: استعلام حقيقي على Supabase.
 *  - `api`/`dashboard`: بلوغ هذه الدالة نفسها دليل أن عملية Next.js تعمل —
 *    لا حاجة لفحص منفصل لعملية تخدم هذا الطلب أصلاً.
 *  - `metaWebhooks`/`aiBrain`: لا رؤية لهذا التطبيق داخل مسار n8n أو داخل
 *    شبكة Meta — فالفحص هنا تهيئة (السرّ/الرابط مضبوط) لا اتصالاً حياً.
 *    'configured' لا تعني "يعمل الآن فعلاً"، بل "المسار غير مغلق افتراضياً".
 *
 * ⚠️ لا تُضف مكوّناً هنا لا يملك فحصاً حقيقياً وراءه. مكوّن أخضر بلا قياس
 * أسوأ من غيابه — نفس المبدأ الذي أزال مؤشّرات الاتصال الوهمية من لوحة
 * العمليات (راجع app/operations/OperationsClient.tsx).
 */

export type LiveCheckState = 'operational' | 'down'
export type ConfigCheckState = 'configured' | 'not_configured'

export interface StatusComponent {
  key: 'api' | 'dashboard' | 'database' | 'metaWebhooks' | 'aiBrain'
  state: LiveCheckState | ConfigCheckState
  latencyMs?: number
}

export interface PlatformStatus {
  checkedAt: string
  overall: 'operational' | 'degraded'
  components: StatusComponent[]
}

const HEALTHY_STATES = new Set<StatusComponent['state']>(['operational', 'configured'])

export async function getPlatformStatus(): Promise<PlatformStatus> {
  const components: StatusComponent[] = [
    { key: 'api', state: 'operational' },
    { key: 'dashboard', state: 'operational' },
  ]

  const dbStart = Date.now()
  try {
    const { error } = await supabaseServer.from('merchants').select('id').limit(1)
    components.push({ key: 'database', state: error ? 'down' : 'operational', latencyMs: Date.now() - dbStart })
  } catch {
    components.push({ key: 'database', state: 'down', latencyMs: Date.now() - dbStart })
  }

  components.push({
    key: 'metaWebhooks',
    state: process.env.BARIQ_BOT_WEBHOOK_SECRET ? 'configured' : 'not_configured',
  })
  components.push({
    key: 'aiBrain',
    state: process.env.N8N_WEBHOOK_URL ? 'configured' : 'not_configured',
  })

  const overall = components.every((c) => HEALTHY_STATES.has(c.state)) ? 'operational' : 'degraded'

  return { checkedAt: new Date().toISOString(), overall, components }
}
