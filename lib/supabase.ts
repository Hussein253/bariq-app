import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// نوع بيانات رسالة واتساب المطابق لجدول whatsapp_messages في Supabase
export interface WhatsAppMessage {
  id: string
  phone_number: string
  message_text: string
  direction: 'inbound' | 'outbound'
  channel?: string
  created_at: string
}