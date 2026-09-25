-- ============================================================================
-- 019 — نسبة المحادثة إلى تاجرها عبر حساب الأعمال المعتمد
-- ============================================================================
--
-- المشكلة:
-- كل محادثة جديدة كانت تُنسب إلى **أقدم تاجر** في مكانين — دالة المزامنة
-- sync_live_n8n_messages (رسائل البوت الحي من conversation_log) و
-- getOrCreateConversation في lib/conversations-server.ts — والمحادثة فريدة
-- بـ (customer_phone, platform) على مستوى المنصة كلها. أول بوت يُشغَّل لتاجر
-- ثانٍ كان سيرسل محادثات زبائنه إلى الأول، ويدمج زبوناً يراسل متجرين في
-- محادثة واحدة.
--
-- الحل: المحادثة تخصّ **حساب الأعمال** الذي استلمها (رقم واتساب، صفحة
-- ماسنجر، حساب إنستغرام)، ومن الحساب **المربوط والمعتمد من فريق برق** يُعرف
-- التاجر. ودالة واحدة (resolve_conversation) تحسم النسبة ويستدعيها المحفّز
-- والتطبيق معاً — لا منطقان يفترقان مع الوقت.
--
-- قرارات المالك:
--   • الحساب الذي يضيفه التاجر ينتظر اعتماد فريق برق قبل أن تُوجَّه إليه
--     أي محادثة: الربط اليوم بكتابة المعرّف يدوياً، فيستطيع تاجر أن يدّعي
--     رقم متجر آخر (verify_social_account أدناه).
--   • رسائل البوت الحالي — وهو لا يرسل معرّف الحساب بعد — تبقى للمتجر الأول
--     حتى يُحدَّث مسار n8n، ثم يُلغى هذا الاستثناء في الترحيل ٠٢٠.
--
-- ⚠️ دالة المزامنة أدناه مبنية على **نسختها الحية** (pg_get_functiondef
-- بتاريخ ٢٠٢٦-٠٩-٢٥) لا على الترحيل ٠٠٩: الحية انحرفت عنه فصارت تطبّع الاتجاه
-- والمرسل وتقبل اختصارَي in/out اللذين يكتبهما وكيل n8n. البناء على ٠٠٩ كان
-- سيكسر اتجاه رسائل البوت الحي بصمت.
--
-- لا نقل بيانات: المحادثات القائمة كلها بلا حساب، فتبقى على القاعدة القديمة
-- كما هي بالضبط.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) توثيق جدولين يعيشان في الإنتاج بلا ترحيل
--
-- أُنشئا يدوياً في لوحة Supabase، فلم يعرفهما أي ترحيل، وقاعدة المعاينة
-- المبنية من الترحيلات خلت منهما. التعريف مأخوذ من information_schema الحي
-- حرفياً. if not exists: لا يغيّر في الإنتاج شيئاً.
-- ----------------------------------------------------------------------------

create table if not exists public.conversation_log (
  id serial primary key,
  phone_number text,
  message text,
  sender text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  direction text,
  order_id text,
  message_text text,
  intent text,
  platform text default 'whatsapp'
);

create index if not exists conversation_log_platform_idx on public.conversation_log (platform);

comment on table public.conversation_log is
  'سجل رسائل البوت الذي تكتبه مسارات n8n مباشرة. المحفّز trg_sync_live_n8n_messages يعكس كل صف إلى conversations/messages.';

create table if not exists public.failed_events (
  id bigint generated always as identity primary key,
  workflow_name text,
  node_name text,
  phone_number text,
  order_id bigint,
  raw_input jsonb,
  error_message text,
  retry_count integer default 0,
  status text default 'OPEN',
  created_at timestamptz default now()
);

comment on table public.failed_events is
  'أحداث تعذّرت معالجتها (مسارات n8n ومحفّزات القاعدة) — تُراجع يدوياً. status: OPEN حتى تُعالَج.';

-- لا يقرؤهما المتصفح ولا يكتب فيهما: n8n بـ service_role، والمحفّز بصلاحية
-- مالكه. RLS مفعّلة بلا سياسة (منع تام)، وتُسحب الصلاحيات المتبقية — TRUNCATE
-- لا يمرّ بـ RLS أصلاً (نفس سبب الترحيل ٠٠٧ على جدولي المحادثات).
alter table public.conversation_log enable row level security;
alter table public.failed_events enable row level security;
revoke all on table public.conversation_log from anon, authenticated;
revoke all on table public.failed_events from anon, authenticated;
revoke all on sequence public.conversation_log_id_seq from anon, authenticated;
revoke all on sequence public.failed_events_id_seq from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 1) أي حساب أعمال استلم الرسالة — تكتبه n8n مع كل صف
-- ----------------------------------------------------------------------------

alter table public.conversation_log add column if not exists account_external_id text;

comment on column public.conversation_log.account_external_id is
  'معرّف حساب الأعمال كما يرسله Meta: phone_number_id لواتساب، معرّف الصفحة لماسنجر، معرّف الحساب المهني لإنستغرام. منه يُعرف التاجر عبر social_accounts. فارغ = مسار n8n لم يُحدَّث بعد (استثناء مؤقت، الترحيل ٠٢٠).';

-- ----------------------------------------------------------------------------
-- 2) المحادثة تتذكّر حسابها
-- ----------------------------------------------------------------------------

alter table public.conversations add column if not exists account_external_id text;
alter table public.conversations add column if not exists social_account_id uuid
  references public.social_accounts (id) on delete set null;

create index if not exists conversations_social_account_idx on public.conversations (social_account_id);

comment on column public.conversations.account_external_id is
  'حساب الأعمال الذي تدور عليه المحادثة. null = محادثة من مسار لا يرسل الحساب (القاعدة القديمة).';
comment on column public.conversations.merchant_id is
  'يُحسم في resolve_conversation من الحساب المعتمد. null = حساب غير مربوط أو غير معتمد: يراها فريق برق وحده حتى الاعتماد.';

-- ----------------------------------------------------------------------------
-- 3) هوية المحادثة: لكل (قناة، حساب، زبون)
--
-- زبون يراسل متجرين = محادثتان. والصفوف القديمة بلا حساب تبقى على قاعدتها
-- (customer_phone, platform) — فهرس جزئي لكل منهما. الجديد قبل حذف القديم.
-- ----------------------------------------------------------------------------

create unique index if not exists conversations_account_phone_key
  on public.conversations (platform, account_external_id, customer_phone)
  where account_external_id is not null;

create unique index if not exists conversations_legacy_phone_platform_key
  on public.conversations (customer_phone, platform)
  where account_external_id is null;

drop index if exists public.conversations_phone_platform_key;

-- ----------------------------------------------------------------------------
-- 4) اعتماد فريق برق للحساب
--
-- لا يعدّله التاجر: مسار PATCH في /api/social-accounts لا يقبل هذين الحقلين
-- ولا external_id نفسه، فلا ينتقل الاعتماد إلى رقم آخر. حذف الحساب وإعادة
-- إضافته يُنشئ صفاً جديداً غير معتمد.
-- ----------------------------------------------------------------------------

alter table public.social_accounts add column if not exists verified_at timestamptz;
alter table public.social_accounts add column if not exists verified_by uuid
  references auth.users (id) on delete set null;

comment on column public.social_accounts.verified_at is
  'متى اعتمد فريق برق ملكية التاجر لهذا الحساب. null = بانتظار الاعتماد: لا تُوجَّه إليه أي محادثة.';

-- ----------------------------------------------------------------------------
-- 5) دالة النسبة الواحدة
--
--   بلا معرّف حساب         → القاعدة القديمة: (phone, platform)، والمتجر الأول
--                            (استثناء مؤقت بقرار المالك، الترحيل ٠٢٠ يلغيه)
--   حساب مربوط ومعتمد      → محادثة (platform, account, phone) لتاجر الحساب
--   حساب غير مربوط/معتمد   → محادثة بلا تاجر يراها فريق برق وحده، وحدث في
--                            failed_events عند إنشائها — لا ضياع ولا تخمين
--   محادثة بلا تاجر اعتُمد حسابها → تُلحق بتاجره (احتياطاً لـ verify_social_account)
-- ----------------------------------------------------------------------------

create or replace function public.resolve_conversation(
  p_customer_phone text,
  p_platform text,
  p_account_external_id text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_platform          text;
  v_account           text;
  v_conversation_id   uuid;
  v_social_account_id uuid;
  v_merchant_id       uuid;
begin
  if p_customer_phone is null or btrim(p_customer_phone) = '' then
    return null;
  end if;

  -- نفس تطبيع المنصة في sync_live_n8n_messages
  v_platform := lower(btrim(coalesce(p_platform, 'whatsapp')));
  if v_platform not in ('whatsapp', 'messenger', 'instagram', 'telegram') then
    v_platform := 'whatsapp';
  end if;

  v_account := nullif(btrim(coalesce(p_account_external_id, '')), '');

  -- (أ) بلا معرّف حساب — القاعدة القديمة
  if v_account is null then
    select id into v_conversation_id
      from public.conversations
     where customer_phone = p_customer_phone
       and platform = v_platform
       and account_external_id is null;

    if v_conversation_id is not null then
      return v_conversation_id;
    end if;

    -- ⚠️ استثناء مؤقت بقرار المالك: البوت الحالي يخدم المتجر الأول وحده.
    select id into v_merchant_id from public.merchants order by created_at asc limit 1;

    insert into public.conversations (customer_phone, platform, merchant_id, updated_at)
    values (p_customer_phone, v_platform, v_merchant_id, now())
    on conflict (customer_phone, platform) where account_external_id is null
      do update set updated_at = excluded.updated_at
    returning id into v_conversation_id;

    return v_conversation_id;
  end if;

  -- (ب) بمعرّف حساب — التاجر من الحساب المربوط المعتمد وحده
  select sa.id, sa.merchant_id
    into v_social_account_id, v_merchant_id
    from public.social_accounts sa
   where sa.platform = v_platform
     and sa.external_id = v_account
     and sa.status = 'connected'
     and sa.verified_at is not null;

  select id into v_conversation_id
    from public.conversations
   where platform = v_platform
     and account_external_id = v_account
     and customer_phone = p_customer_phone;

  if v_conversation_id is null then
    insert into public.conversations
      (customer_phone, platform, account_external_id, social_account_id, merchant_id, updated_at)
    values
      (p_customer_phone, v_platform, v_account, v_social_account_id, v_merchant_id, now())
    on conflict (platform, account_external_id, customer_phone) where account_external_id is not null
      do nothing
    returning id into v_conversation_id;

    if v_conversation_id is not null then
      -- أُنشئت الآن: الحدث يُسجَّل مرة واحدة لكل محادثة، لا مع كل رسالة
      if v_merchant_id is null then
        begin
          insert into public.failed_events
            (workflow_name, node_name, phone_number, raw_input, error_message, status)
          values
            ('resolve_conversation', 'account_routing', p_customer_phone,
             jsonb_build_object(
               'platform', v_platform,
               'account_external_id', v_account,
               'conversation_id', v_conversation_id
             ),
             'حساب أعمال غير مربوط أو غير معتمد — المحادثة بلا تاجر حتى يُعتمد الحساب',
             'OPEN');
        exception when others then null;
        end;
      end if;
      return v_conversation_id;
    end if;

    -- سبقنا إليها طلب متزامن
    select id into v_conversation_id
      from public.conversations
     where platform = v_platform
       and account_external_id = v_account
       and customer_phone = p_customer_phone;
  end if;

  if v_merchant_id is not null then
    update public.conversations
       set merchant_id = v_merchant_id,
           social_account_id = v_social_account_id
     where id = v_conversation_id
       and merchant_id is null;
  end if;

  return v_conversation_id;
end;
$function$;

comment on function public.resolve_conversation(text, text, text) is
  'المصدر الوحيد لنسبة المحادثة إلى تاجرها. يستدعيها sync_live_n8n_messages و lib/conversations-server.ts.';

-- ----------------------------------------------------------------------------
-- 6) اعتماد الحساب وإلحاق محادثاته المعلّقة — عملية واحدة
--
-- يستدعيه POST /api/social-accounts/:id/verify لمالك المنصة وحده. الاعتماد
-- المكرّر لا يغيّر تاريخه ولا صاحبه الأول (coalesce).
-- ----------------------------------------------------------------------------

create or replace function public.verify_social_account(p_account_id uuid, p_actor uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_account  public.social_accounts%rowtype;
  v_attached integer;
begin
  update public.social_accounts
     set verified_at = coalesce(verified_at, now()),
         verified_by = coalesce(verified_by, p_actor),
         updated_at  = now()
   where id = p_account_id
   returning * into v_account;

  if not found then
    raise exception 'BQ_ACCOUNT_NOT_FOUND' using errcode = 'BQ003';
  end if;

  update public.conversations c
     set merchant_id = v_account.merchant_id,
         social_account_id = v_account.id
   where c.platform = v_account.platform
     and c.account_external_id = v_account.external_id
     and c.merchant_id is null;

  get diagnostics v_attached = row_count;
  return v_attached;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 7) دالة المزامنة — نسختها الحية حرفياً، إلا إيجاد المحادثة وإنشاءها
--
-- ما بقي كما هو: تطبيع المنصة والاتجاه والمرسل، واختصارا in/out، وتسجيل
-- المرسل المجهول كـ system مع حدث، وعدم كسر إدراج conversation_log مهما حدث.
-- ما تغيّر: «أقدم تاجر» وقيد (phone, platform) صارا resolve_conversation.
-- ----------------------------------------------------------------------------

create or replace function public.sync_live_n8n_messages()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conversation_id uuid;
  v_content         text;
  v_sender          text;
  v_platform        text;
  v_created_at      timestamptz;
  v_direction       text;
  v_sender_raw      text;
begin
  v_content    := nullif(btrim(coalesce(new.message, new.message_text)), '');
  v_created_at := coalesce(new.created_at, now());

  if new.phone_number is null or v_content is null then
    return null;
  end if;

  -- المنصة: تُؤخذ من السجل، وتُطبَّع إلى القيم المعتمدة.
  -- أي قيمة غير معروفة تعود إلى 'whatsapp' حفاظاً على اتساق المحادثات.
  v_platform := lower(btrim(coalesce(new.platform, 'whatsapp')));
  if v_platform not in ('whatsapp', 'messenger', 'instagram', 'telegram') then
    v_platform := 'whatsapp';
  end if;

  -- تطبيع الاتجاه والمرسل قبل المطابقة (حالة الأحرف والمسافات)
  v_direction  := lower(btrim(coalesce(new.direction, '')));
  v_sender_raw := lower(btrim(coalesce(new.sender, '')));

  -- direction هو المرجع القاطع؛ sender احتياطي عند غيابه
  -- تقبل الآن الاختصارات in/out التي يكتبها وكيل n8n
  v_sender := case
    when v_direction  in ('incoming', 'inbound', 'in')   then 'customer'
    when v_direction  in ('outgoing', 'outbound', 'out') then 'bot'
    when v_sender_raw = 'customer'                       then 'customer'
    when v_sender_raw = 'bot'                            then 'bot'
    else null
  end;

  if v_sender is null then
    v_sender := 'system';
    begin
      insert into public.failed_events
        (workflow_name, node_name, phone_number, raw_input, error_message, status)
      values
        ('sync_live_n8n_messages', 'conversation_log_trigger', new.phone_number,
         to_jsonb(new),
         'تعذر تحديد المرسل: direction و sender غير معروفين — سُجّلت الرسالة كـ system',
         'OPEN');
    exception when others then null;
    end;
  end if;

  -- النسبة كلها في resolve_conversation (الترحيل ٠١٩)
  v_conversation_id := public.resolve_conversation(new.phone_number, v_platform, new.account_external_id);

  if v_conversation_id is null then
    return null;
  end if;

  insert into public.messages (conversation_id, sender_type, message_type, content, created_at)
  values (v_conversation_id, v_sender, 'text', v_content, v_created_at)
  on conflict do nothing;

  return null;

exception when others then
  begin
    insert into public.failed_events
      (workflow_name, node_name, phone_number, raw_input, error_message, status)
    values
      ('sync_live_n8n_messages', 'conversation_log_trigger', new.phone_number,
       to_jsonb(new), 'فشل المزامنة: ' || sqlerrm, 'OPEN');
  exception when others then null;
  end;
  return null;
end;
$function$;

-- المحفّز نفسه قائم في الإنتاج؛ يُعاد إنشاؤه بالتعريف ذاته ليوجد في كل بيئة
drop trigger if exists trg_sync_live_n8n_messages on public.conversation_log;
create trigger trg_sync_live_n8n_messages
  after insert on public.conversation_log
  for each row execute function public.sync_live_n8n_messages();

-- ----------------------------------------------------------------------------
-- 8) التنفيذ لـ service_role وحده (نمط الترحيل ٠١٣)
--
-- Supabase يمنح anon و authenticated حق التنفيذ على كل دالة جديدة تلقائياً،
-- و revoke from public وحده لا يسحبه. دالة SECURITY DEFINER تكتب محادثات
-- وتعتمد حسابات لا يجوز أن ينادِيها المتصفح عبر /rest/v1/rpc.
-- ----------------------------------------------------------------------------

revoke execute on function public.resolve_conversation(text, text, text) from anon, authenticated, public;
revoke execute on function public.verify_social_account(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.sync_live_n8n_messages() from anon, authenticated, public;
grant execute on function public.resolve_conversation(text, text, text) to service_role;
grant execute on function public.verify_social_account(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select count(*) from public.conversations where account_external_id is not null;  -- صفر بعد التشغيل مباشرة
-- select position('''in''' in pg_get_functiondef('public.sync_live_n8n_messages'::regproc)) > 0;  -- true
-- select indexname from pg_indexes where tablename = 'conversations';  -- الفهرسان الجزئيان، بلا phone_platform_key
