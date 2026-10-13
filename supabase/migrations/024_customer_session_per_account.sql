-- ============================================================================
-- 024 — جلسة البوت لكل (زبون، قناة، حساب أعمال) — M2، مرحلة التوسعة
-- ============================================================================
--
-- المشكلة (M2 في docs/launch-readiness.md):
-- customer_sessions فريدة برقم الهاتف وحده (customer_sessions_phone_key). فيها
-- حالة البوت للزبون: التسليم البشري (human_takeover / bot_active)، وقفل
-- المعالجة، والسلّة، والمرحلة. فرد تاجر يدوياً على زبون يوقف البوت لهذا الزبون
-- عند **كل** التجار، وسلّته عند متجر تُقرأ في بوت متجر آخر.
--
-- الحل: الجلسة تخصّ حساب الأعمال الذي يكلّمه الزبون — نفس هوية المحادثة في
-- الترحيل ٠١٩: (الهاتف، القناة، account_external_id).
--
-- لماذا على مرحلتين:
-- كل الكتّاب الحاليين يعتمدون على قيد الهاتف وحده — ON CONFLICT (phone_number)
-- في مسارات n8n الثلاثة (Upsert Customer Session / Acquire Session Lock)،
-- و onConflict: 'phone_number' في أربعة مسارات في التطبيق. حذف القيد الآن يكسر
-- البوتات الثلاثة فوراً. لذلك:
--   ٠٢٤ (هذا): العمود والقيد المركّب ودوال الحسم — لا يتغيّر سلوك أي كاتب.
--   ثم:   تحويل n8n والتطبيق إلى الدوال أدناه (الجلسة بمعرّفها id).
--   ٠٢٥:  حذف customer_sessions_phone_key — بعد أن لا يبقى كاتب يعتمد عليه.
--
-- قاعدتا الحسم هما قاعدتا الترحيل ٠٢٠ للمحادثات حرفياً، فلا يفترق المنطقان:
--   ١) التبنّي: أول رسالة عبر حساب **معتمد** تكمل في جلسة الزبون القديمة بلا
--      حساب، إن كان الحساب للمتجر الأول (صاحب كل الجلسات القديمة باستثناء ٠١٩).
--   ٢) طلب بلا معرّف (عقدة لم تُحدَّث، أو أداة فريق بالرقم وحده) يكمل في جلسة
--      المتجر الأول مع الزبون على القناة نفسها ولو تبنّاها حساب.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) أي حساب أعمال تخصّه الجلسة
-- ----------------------------------------------------------------------------

alter table public.customer_sessions add column if not exists account_external_id text;

comment on column public.customer_sessions.account_external_id is
  'حساب الأعمال الذي تخصّه الجلسة (phone_number_id لواتساب، معرّف الصفحة لماسنجر، معرّف الحساب المهني لإنستغرام) — كما في conversation_log و conversations. null = جلسة قديمة أو كاتب لم يُحدَّث بعد.';

-- صف واحد كتبه مسار في التطبيق بلا قناة (2026-09-06). رقمه بصيغة واتساب العراق،
-- ومسارات التطبيق التي تكتب بلا قناة هي مسارات واتساب. غيره لا يُمسّ.
update public.customer_sessions
   set platform = 'whatsapp'
 where platform is null
   and phone_number ~ '^9647[0-9]{9}$';

-- ----------------------------------------------------------------------------
-- 2) الهوية المركّبة
--
-- NULLS NOT DISTINCT: الجلسات القديمة (حساب فارغ) تتصادم فيما بينها كما اليوم،
-- فلا يُفتح للزبون صفّان قديمان على القناة نفسها.
-- قيد الهاتف وحده يبقى حتى ٠٢٥ — والقيد الجديد لا يخالفه أي صف قائم لأن الهاتف
-- فريد أصلاً.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.customer_sessions'::regclass
                    and conname = 'customer_sessions_identity_key') then
    alter table public.customer_sessions
      add constraint customer_sessions_identity_key
      unique nulls not distinct (phone_number, platform, account_external_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3) دالة الحسم الواحدة — تُرجع معرّف الجلسة
-- ----------------------------------------------------------------------------

create or replace function public.resolve_customer_session(
  p_phone text,
  p_platform text,
  p_account_external_id text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_platform    text;
  v_account     text;
  v_session_id  bigint;
  v_merchant_id uuid;
  v_first_store uuid;
begin
  if p_phone is null or btrim(p_phone) = '' then
    return null;
  end if;

  -- نفس تطبيع المنصة في resolve_conversation
  v_platform := lower(btrim(coalesce(p_platform, 'whatsapp')));
  if v_platform not in ('whatsapp', 'messenger', 'instagram', 'telegram') then
    v_platform := 'whatsapp';
  end if;

  v_account := nullif(btrim(coalesce(p_account_external_id, '')), '');

  -- صاحب الجلسات القديمة: المتجر الأول (استثناء ٠١٩ بقرار المالك، ٠٢١ يلغيه)
  select id into v_first_store from public.merchants order by created_at asc limit 1;

  if v_account is null then
    -- (أ) بلا معرّف حساب — الجلسة القديمة
    select id into v_session_id
      from public.customer_sessions
     where phone_number = p_phone
       and platform = v_platform
       and account_external_id is null;

    if v_session_id is not null then
      return v_session_id;
    end if;

    -- القاعدة ٢: جلسة المتجر الأول مع الزبون تبنّاها حساب معتمد — تكمل فيها
    select cs.id into v_session_id
      from public.customer_sessions cs
      join public.social_accounts sa
        on sa.platform = cs.platform
       and sa.external_id = cs.account_external_id
     where cs.phone_number = p_phone
       and cs.platform = v_platform
       and sa.merchant_id = v_first_store
       and sa.verified_at is not null
     order by cs.updated_at desc nulls last, cs.id desc
     limit 1;

    if v_session_id is not null then
      return v_session_id;
    end if;
  else
    -- (ب) بمعرّف حساب — جلسة هذا الحساب
    select id into v_session_id
      from public.customer_sessions
     where phone_number = p_phone
       and platform = v_platform
       and account_external_id = v_account;

    if v_session_id is not null then
      return v_session_id;
    end if;

    -- (ج) التبنّي (القاعدة ١): الحساب مربوط ومعتمد وللمتجر الأول
    select sa.merchant_id into v_merchant_id
      from public.social_accounts sa
     where sa.platform = v_platform
       and sa.external_id = v_account
       and sa.status = 'connected'
       and sa.verified_at is not null;

    if v_merchant_id is not null and v_merchant_id = v_first_store then
      begin
        update public.customer_sessions
           set account_external_id = v_account
         where phone_number = p_phone
           and platform = v_platform
           and account_external_id is null
        returning id into v_session_id;
      exception when unique_violation then
        -- طلب متزامن أنشأ جلسة هذا الحساب للتوّ: المسار أدناه يجدها
        v_session_id := null;
      end;

      if v_session_id is not null then
        return v_session_id;
      end if;
    end if;
  end if;

  -- (د) جلسة جديدة
  begin
    insert into public.customer_sessions (phone_number, platform, account_external_id)
    values (p_phone, v_platform, v_account)
    on conflict (phone_number, platform, account_external_id) do nothing
    returning id into v_session_id;
  exception when unique_violation then
    -- ⚠️ مرحلة انتقالية حتى ٠٢٥: قيد الهاتف وحده ما زال قائماً، والزبون له صف
    -- لا تتبنّاه هذه الجلسة. السلوك نفسه الذي قبل ٠٢٤ (صف الهاتف الواحد)،
    -- ويُسجَّل الحدث ليُرى. لا يقع مع تاجر واحد له حساب معتمد.
    select id into v_session_id
      from public.customer_sessions
     where phone_number = p_phone;

    begin
      insert into public.failed_events
        (workflow_name, node_name, phone_number, raw_input, error_message, status)
      values
        ('resolve_customer_session', 'phone_key_fallback', p_phone,
         jsonb_build_object(
           'platform', v_platform,
           'account_external_id', v_account,
           'session_id', v_session_id
         ),
         'جلسة الزبون لهذا الحساب لم تُنشأ لأن قيد الهاتف وحده ما زال قائماً — استُعملت جلسة الهاتف القائمة (يُحذف القيد في ٠٢٥)',
         'OPEN');
    exception when others then null;
    end;

    return v_session_id;
  end;

  if v_session_id is null then
    -- سبقنا إليها طلب متزامن
    select id into v_session_id
      from public.customer_sessions
     where phone_number = p_phone
       and platform = v_platform
       and account_external_id is not distinct from v_account;
  end if;

  return v_session_id;
end;
$function$;

comment on function public.resolve_customer_session(text, text, text) is
  'المصدر الوحيد لجلسة البوت: (الهاتف، القناة، الحساب) مع قاعدتي التبنّي في ٠٢٠. يستدعيها touch_customer_session و set_customer_session_bot.';

-- ----------------------------------------------------------------------------
-- 4) مدخل n8n: رسالة زبون وصلت — بديل «Upsert Customer Session»
--
-- الحقول نفسها التي يكتبها المسار اليوم، لا غيرها: updated_at لا يُمسّ لأن
-- «Acquire Session Lock» يقيس به قِدم القفل.
-- ----------------------------------------------------------------------------

create or replace function public.touch_customer_session(
  p_phone text,
  p_platform text,
  p_account_external_id text,
  p_debounce_token text
)
returns setof public.customer_sessions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session_id bigint;
begin
  v_session_id := public.resolve_customer_session(p_phone, p_platform, p_account_external_id);

  if v_session_id is null then
    return;
  end if;

  return query
  update public.customer_sessions
     set debounce_token           = p_debounce_token,
         last_message_at          = now(),
         last_customer_message_at = now()
   where id = v_session_id
  returning *;
end;
$function$;

comment on function public.touch_customer_session(text, text, text, text) is
  'n8n: رسالة زبون وصلت — يحسم الجلسة ويحدّث رمز الانتظار ووقت الرسالة، ويُرجع الصف (ومنه id لباقي العقد).';

-- ----------------------------------------------------------------------------
-- 5) مدخل التطبيق: تشغيل البوت أو إيقافه لجلسة واحدة
--
-- بديل upsert(..., { onConflict: 'phone_number' }) في مسارات المحادثات.
-- ----------------------------------------------------------------------------

create or replace function public.set_customer_session_bot(
  p_phone text,
  p_platform text,
  p_account_external_id text,
  p_bot_active boolean
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session_id bigint;
begin
  if p_bot_active is null then
    raise exception 'BQ_BOT_ACTIVE_REQUIRED' using errcode = 'BQ004';
  end if;

  v_session_id := public.resolve_customer_session(p_phone, p_platform, p_account_external_id);

  if v_session_id is null then
    return null;
  end if;

  update public.customer_sessions
     set bot_active     = p_bot_active,
         human_takeover = not p_bot_active,
         updated_at     = now()
   where id = v_session_id;

  return v_session_id;
end;
$function$;

comment on function public.set_customer_session_bot(text, text, text, boolean) is
  'التطبيق: تشغيل البوت أو إيقافه (التسليم البشري) لجلسة الزبون عند هذا الحساب وحده.';

-- ----------------------------------------------------------------------------
-- 6) التنفيذ لـ service_role وحده (نمط الترحيل ٠١٣)
-- ----------------------------------------------------------------------------

revoke execute on function public.resolve_customer_session(text, text, text) from anon, authenticated, public;
revoke execute on function public.touch_customer_session(text, text, text, text) from anon, authenticated, public;
revoke execute on function public.set_customer_session_bot(text, text, text, boolean) from anon, authenticated, public;

grant execute on function public.resolve_customer_session(text, text, text) to service_role;
grant execute on function public.touch_customer_session(text, text, text, text) to service_role;
grant execute on function public.set_customer_session_bot(text, text, text, boolean) to service_role;
