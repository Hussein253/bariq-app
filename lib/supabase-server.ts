import { createClient } from '@supabase/supabase-js'

/**
 * عميل Supabase للخادم — يستعمل service_role ويتجاوز RLS.
 * ⚠️ يُستورد في API Routes و Server Components فقط، ولا يصل المتصفح أبداً.
 *
 * التحقق من المتغيّرات صريح بدل `!`: غياب المفتاح مع `!` كان يُنتج
 * "supabaseUrl is required" من عمق مكتبة خارجية أثناء أول طلب حقيقي.
 * الرسالة هنا تسمّي المتغيّر الناقص وأين يُضبط.
 */
function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `متغيّر البيئة ${name} غير مضبوط. اضبطه في .env.local محلياً، وفي ` +
        `Vercel → Project Settings → Environment Variables قبل النشر.`
    )
  }
  return value
}

export const supabaseServer = createClient(
  requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
