import { createClient } from '@supabase/supabase-js'

// عميل Supabase للخادم (Server-side) - يستخدم service_role key
// ⚠️ هذا الملف يُستخدم فقط في API Routes و Server Components
// ولا يُستخدم أبداً في المتصفح (Client-side)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})