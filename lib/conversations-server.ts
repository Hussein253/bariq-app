import { supabaseServer } from '@/lib/supabase-server'
import type {
  Conversation,
  ConversationOverview,
  Message,
  MessageType,
  SenderType,
} from '@/lib/conversations'

/**
 * مساعدات الخادم لنموذج المحادثات الحية
 * ======================================
 * ⚠️ تستخدم service_role — لا تُستورد أبداً في كود المتصفح.
 */

/**
 * يجلب محادثة الزبون أو ينشئها إن لم تكن موجودة.
 * الاعتماد على القيد الفريد (customer_phone, platform) يجعل العملية آمنة
 * عند وصول عدة Webhooks متزامنة لنفس الرقم (Idempotency).
 */
export async function getOrCreateConversation(params: {
  customerPhone: string
  platform?: string
  merchantId?: string | null
}): Promise<Conversation | null> {
  const { customerPhone } = params
  const platform = params.platform || 'whatsapp'

  if (!customerPhone) return null

  // 1) محاولة الجلب المباشر (المسار الشائع)
  const { data: existing } = await supabaseServer
    .from('conversations')
    .select('*')
    .eq('customer_phone', customerPhone)
    .eq('platform', platform)
    .maybeSingle()

  if (existing) return existing as Conversation

  // 2) الإنشاء — مع تعيين تاجر افتراضي إن لم يُمرَّر
  let merchantId = params.merchantId ?? null
  if (!merchantId) {
    const { data: merchant } = await supabaseServer
      .from('merchants')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    merchantId = (merchant as { id: string } | null)?.id ?? null
  }

  const { data: created, error } = await supabaseServer
    .from('conversations')
    .upsert(
      {
        customer_phone: customerPhone,
        platform,
        merchant_id: merchantId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'customer_phone,platform' }
    )
    .select()
    .single()

  if (error) {
    console.error('[CONVERSATIONS][CREATE_ERROR]', error.message)
    return null
  }

  return created as Conversation
}

/**
 * يسجّل رسالة داخل محادثة الزبون.
 * محفّز trg_touch_conversation_on_message يتكفّل بتحديث updated_at
 * وبالتالي بإطلاق حدث Realtime على جدول conversations أيضاً.
 */
export async function recordMessage(params: {
  customerPhone: string
  content: string
  senderType: SenderType
  platform?: string
  messageType?: MessageType
  merchantId?: string | null
}): Promise<{ message: Message | null; conversation: Conversation | null }> {
  const { customerPhone, content, senderType } = params

  if (!customerPhone || !content) {
    return { message: null, conversation: null }
  }

  const conversation = await getOrCreateConversation({
    customerPhone,
    platform: params.platform,
    merchantId: params.merchantId,
  })

  if (!conversation) return { message: null, conversation: null }

  // .select() ضروري ليصل الصف كاملاً في حدث Realtime
  const { data, error } = await supabaseServer
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: senderType,
      message_type: params.messageType || 'text',
      content,
    })
    .select()
    .single()

  if (error) {
    console.error('[CONVERSATIONS][MESSAGE_INSERT_ERROR]', error.message)
    return { message: null, conversation }
  }

  return { message: data as Message, conversation }
}

/** يضبط حالة البوت لمحادثة زبون معيّن (يُنشئ المحادثة إن لزم). */
export async function setBotActiveByPhone(params: {
  customerPhone: string
  botActive: boolean
  platform?: string
}): Promise<Conversation | null> {
  const conversation = await getOrCreateConversation({
    customerPhone: params.customerPhone,
    platform: params.platform,
  })
  if (!conversation) return null

  const { data, error } = await supabaseServer
    .from('conversations')
    .update({ bot_active: params.botActive, updated_at: new Date().toISOString() })
    .eq('id', conversation.id)
    .select()
    .single()

  if (error) {
    console.error('[CONVERSATIONS][SET_BOT_ACTIVE_ERROR]', error.message)
    return conversation
  }

  return data as Conversation
}

/**
 * يبني قائمة المحادثات المُثراة.
 * يستعمله كل من Server Component في صفحة العمليات ومسار GET /api/conversations.
 */
export async function loadConversationsOverview(): Promise<ConversationOverview[]> {
  const [conversationsRes, merchantsRes] = await Promise.all([
    supabaseServer
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false }),
    supabaseServer.from('merchants').select('id, name'),
  ])

  if (conversationsRes.error) throw new Error(conversationsRes.error.message)

  const conversations = (conversationsRes.data || []) as Conversation[]
  if (conversations.length === 0) return []

  const merchantMap = new Map(
    ((merchantsRes.data || []) as { id: string; name: string }[]).map((m) => [m.id, m.name])
  )

  // جلب رسائل كل المحادثات المعروضة دفعة واحدة (تجنّب N+1)
  const { data: messagesData, error: messagesError } = await supabaseServer
    .from('messages')
    .select('id, conversation_id, sender_type, content, created_at')
    .in(
      'conversation_id',
      conversations.map((c) => c.id)
    )
    .order('created_at', { ascending: true })

  if (messagesError) throw new Error(messagesError.message)

  const stats = new Map<string, { count: number; last: Partial<Message> }>()
  for (const raw of (messagesData || []) as Message[]) {
    if (!raw.conversation_id) continue
    const entry = stats.get(raw.conversation_id)
    if (entry) {
      entry.count += 1
      entry.last = raw
    } else {
      stats.set(raw.conversation_id, { count: 1, last: raw })
    }
  }

  return conversations.map((c) => {
    const s = stats.get(c.id)
    return {
      ...c,
      merchant_name: c.merchant_id ? merchantMap.get(c.merchant_id) || null : null,
      message_count: s?.count || 0,
      last_message: s?.last.content || null,
      last_message_at: s?.last.created_at || c.updated_at,
      last_sender_type: s?.last.sender_type || null,
    }
  })
}
