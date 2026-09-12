import { supabase } from '@/lib/supabase'
import type { Plan } from '@/lib/plans'

/**
 * يجلب باقات الاشتراك المفعّلة لصفحة التعريف.
 * يكفي مفتاح anon هنا: سياسة RLS تفتح القراءة للباقات المفعّلة وحدها،
 * فلا داعي لتمرير service_role إلى صفحة عامة.
 */
export async function loadActivePlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw new Error(error.message)
  return (data || []) as Plan[]
}
