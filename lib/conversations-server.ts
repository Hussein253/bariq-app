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
 * أين تُكتب الرسالة أو يُضبط البوت:
 *   { conversation }  — محادثة معروفة، كالرد من اللوحة على محادثة مفتوحة.
 *                       تُكتب فيها بعينها، لا في أول محادثة لرقم الزبون.
 *   { customerPhone } — تُحسم من الزبون والقناة وحساب الأعمال الذي وصلت عبره.
 */
export type ConversationTarget =
  | { conversation: Conversation }
  | { customerPhone: string; platform?: string; accountExternalId?: string | null }

/**
 * يجلب محادثة الزبون أو ينشئها.
 *
 * النسبة إلى التاجر كلها في دالة القاعدة resolve_conversation (الترحيل ٠١٩)،
 * وهي نفسها التي يستدعيها محفّز رسائل البوت الحي — لا منطق نسبة هنا، فلا
 * يفترق طريقان مع الوقت. التاجر يُعرف من حساب الأعمال المربوط والمعتمد،
 * والرسالة بلا حساب تمرّ بالقاعدة القديمة مؤقتاً. ومحادثة الزبون القديمة لدى
 * التاجر نفسه تُتبنّى ولا تُفتح له ثانية (الترحيل ٠٢٠). والدالة آمنة عند
 * وصول عدة Webhooks متزامنة لنفس الزبون (Idempotency).
 */
export async function getOrCreateConversation(params: {
  customerPhone: string
  platform?: string
  /** phone_number_id لواتساب، ومعرّف الصفحة أو الحساب المهني لماسنجر وإنستغرام */
  accountExternalId?: string | null
}): Promise<Conversation | null> {
  if (!params.customerPhone) return null

  const { data: conversationId, error } = await supabaseServer.rpc('resolve_conversation', {
    p_customer_phone: params.customerPhone,
    p_platform: params.platform || 'whatsapp',
    p_account_external_id: params.accountExternalId || null,
  })

  if (error || typeof conversationId !== 'string') {
    console.error('[CONVERSATIONS][RESOLVE_ERROR]', error?.message ?? 'no conversation id')
    return null
  }

  const { data, error: readError } = await supabaseServer
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (readError) {
    console.error('[CONVERSATIONS][READ_ERROR]', readError.message)
    return null
  }

  return data as Conversation
}

function resolveTarget(target: ConversationTarget): Promise<Conversation | null> {
  return 'conversation' in target
    ? Promise.resolve(target.conversation)
    : getOrCreateConversation(target)
}

/**
 * يسجّل رسالة داخل محادثة الزبون.
 * محفّز trg_touch_conversation_on_message يتكفّل بتحديث updated_at
 * وبالتالي بإطلاق حدث Realtime على جدول conversations أيضاً.
 */
export async function recordMessage(
  params: ConversationTarget & {
    content: string
    senderType: SenderType
    messageType?: MessageType
  }
): Promise<{ message: Message | null; conversation: Conversation | null }> {
  if (!params.content) return { message: null, conversation: null }

  const conversation = await resolveTarget(params)
  if (!conversation) return { message: null, conversation: null }

  // .select() ضروري ليصل الصف كاملاً في حدث Realtime
  const { data, error } = await supabaseServer
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender_type: params.senderType,
      message_type: params.messageType || 'text',
      content: params.content,
    })
    .select()
    .single()

  if (error) {
    console.error('[CONVERSATIONS][MESSAGE_INSERT_ERROR]', error.message)
    return { message: null, conversation }
  }

  return { message: data as Message, conversation }
}

/** يضبط حالة البوت لمحادثة واحدة (تُنشأ إن لزم حين تُحسم من الزبون). */
export async function setBotActive(
  params: ConversationTarget & { botActive: boolean }
): Promise<Conversation | null> {
  const conversation = await resolveTarget(params)
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
 *
 * @param merchantId يقيّد القائمة بتاجر واحد (صفحة التاجر /workspace/chats).
 *   دونه تُرجع كل المحادثات لفريق برق. ⚠️ الشرط `!== undefined` لا فحص
 *   صدقٍ: معرّف فارغ يُطابق لا شيء، ولا يسقط إلى كل المحادثات.
 */
export async function loadConversationsOverview(merchantId?: string): Promise<ConversationOverview[]> {
  let conversationsQuery = supabaseServer
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
  if (merchantId !== undefined) conversationsQuery = conversationsQuery.eq('merchant_id', merchantId)

  const [conversationsRes, merchantsRes] = await Promise.all([
    conversationsQuery,
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
