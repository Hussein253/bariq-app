-- ============================================================================
-- 031 — المحادثة تتبع مالك الحساب المعتمد حين ينتقل الحساب لتاجر آخر
-- ============================================================================
--
-- المشكلة (واتساب 2026-10-27، المحادثة 5846faca):
-- رقم واتساب 1245317385330588 كان مربوطاً بـ«ستايل بغداد» فتبنّى محادثة الزبون
-- 9647731048129 (الترحيل ٠٢٠). بعدها حُذف صف الحساب وأُعيد ربطه بـ«الرقمي»
-- واعتُمد (2026-10-21). البوت يرد والرسائل تُسجَّل بمعرّف الحساب، لكن المحادثة
-- بقيت لـ«ستايل بغداد»: resolve_conversation و verify_social_account لا يلحقان
-- المحادثة بتاجر الحساب إلا إن كانت **بلا تاجر** (merchant_id is null). فلوحة
-- «الرقمي» تقول «لا توجد محادثات» والموظف ما يقدر يرد.
--
-- الحل (بقرار المالك): المحادثة تخصّ حساب الأعمال (مبدأ الترحيل ٠١٩)، فتتبع
-- مالكه المعتمد الحالي بتاريخها كله. والحساب لا يملكه إلا تاجر واحد بالمرة
-- (social_accounts_external_unique على platform, external_id)، فلا تتنازع عليه
-- محادثتان.
--
--   • resolve_conversation: كل رسالة عبر حساب معتمد تصحّح تاجر محادثتها إن
--     خالف مالك الحساب — لا للمحادثة بلا تاجر وحدها.
--   • verify_social_account: الاعتماد ينقل محادثات الحساب لتاجره ولو كانت
--     لتاجر سابق.
--   • نقل البيانات أدناه: المحادثات المخالفة اليوم (واحدة: 5846faca).
--
-- ما لا يتغيّر: حساب غير مربوط أو غير معتمد لا ينزع المحادثة من تاجرها، والتبنّي
-- (الترحيل ٠٢٠) يبقى لتاجر الحساب نفسه. الطلبات القديمة تبقى لتاجرها
-- (orders.merchant_id)، فالمنتقل هو المحادثة ورسائلها فقط.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) دالة النسبة — نسخة الترحيل ٠٢٠ الحية حرفياً، إلا الشرط الأخير
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
    --    الترحيل ٠٢١ يلغيه.
    select id into v_merchant_id from public.merchants order by created_at asc limit 1;

    -- محادثة المتجر الأول مع الزبون تبنّاها حساب (القاعدة ٢): تكمل فيها
    if v_merchant_id is not null then
      select id into v_conversation_id
        from public.conversations
       where customer_phone = p_customer_phone
         and platform = v_platform
         and merchant_id = v_merchant_id
         and account_external_id is not null
       order by updated_at desc nulls last
       limit 1;

      if v_conversation_id is not null then
        return v_conversation_id;
      end if;
    end if;

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

  -- (ج) التبنّي (القاعدة ١): لا محادثة على هذا الحساب بعد، والحساب معتمد
  if v_conversation_id is null and v_merchant_id is not null then
    begin
      update public.conversations
         set account_external_id = v_account,
             social_account_id   = v_social_account_id
       where customer_phone = p_customer_phone
         and platform = v_platform
         and account_external_id is null
         and merchant_id = v_merchant_id
      returning id into v_conversation_id;
    exception when unique_violation then
      -- طلب متزامن فتح محادثة هذا الحساب للتوّ: المسار العادي أدناه يجدها
      v_conversation_id := null;
    end;

    if v_conversation_id is not null then
      return v_conversation_id;
    end if;
  end if;

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

  -- المحادثة تتبع مالك الحساب المعتمد الحالي، ولو كانت لتاجر سابق (الترحيل ٠٣١).
  -- is distinct from: لا كتابة مع كل رسالة حين تكون النسبة صحيحة أصلاً.
  if v_merchant_id is not null then
    update public.conversations
       set merchant_id = v_merchant_id,
           social_account_id = v_social_account_id
     where id = v_conversation_id
       and (merchant_id is distinct from v_merchant_id
            or social_account_id is distinct from v_social_account_id);
  end if;

  return v_conversation_id;
end;
$function$;

comment on function public.resolve_conversation(text, text, text) is
  'المصدر الوحيد لنسبة المحادثة إلى تاجرها: مالك الحساب المعتمد (الترحيل ٠٣١)، مع تبنّي المحادثة القديمة لتاجر الحساب نفسه (الترحيل ٠٢٠). يستدعيها sync_live_n8n_messages و lib/conversations-server.ts.';

-- ----------------------------------------------------------------------------
-- 2) الاعتماد ينقل محادثات الحساب لتاجره — ولو كانت لتاجر سابق
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
     and (c.merchant_id is distinct from v_account.merchant_id
          or c.social_account_id is distinct from v_account.id);

  get diagnostics v_attached = row_count;
  return v_attached;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3) نقل المحادثات المخالفة اليوم لمالك حسابها المعتمد
-- ----------------------------------------------------------------------------

update public.conversations c
   set merchant_id = sa.merchant_id,
       social_account_id = sa.id
  from public.social_accounts sa
 where sa.platform = c.platform
   and sa.external_id = c.account_external_id
   and sa.status = 'connected'
   and sa.verified_at is not null
   and (c.merchant_id is distinct from sa.merchant_id
        or c.social_account_id is distinct from sa.id);

-- create or replace يُبقي الصلاحيات، وتُعاد هنا ليكتفي الترحيل بنفسه (نمط ٠١٣)
revoke execute on function public.resolve_conversation(text, text, text) from anon, authenticated, public;
revoke execute on function public.verify_social_account(uuid, uuid) from anon, authenticated, public;
grant execute on function public.resolve_conversation(text, text, text) to service_role;
grant execute on function public.verify_social_account(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select count(*) from public.conversations c
--   join public.social_accounts sa on sa.platform = c.platform and sa.external_id = c.account_external_id
--  where sa.status = 'connected' and sa.verified_at is not null
--    and (c.merchant_id is distinct from sa.merchant_id or c.social_account_id is distinct from sa.id);  -- صفر
