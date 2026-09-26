-- ============================================================================
-- 020 — التبنّي: الزبون يبقى في محادثة واحدة لدى تاجره
-- ============================================================================
--
-- المشكلة:
-- المحادثات القائمة قبل الترحيل ٠١٩ بلا حساب أعمال (account_external_id فارغ).
-- فحين يبدأ n8n بإرسال المعرّف تُبحث المحادثة بـ (القناة، الحساب، الزبون) فلا
-- تُوجد، فتُفتح للزبون محادثة ثانية ويبقى تاريخه في الأولى: يرى التاجر الزبون
-- نفسه مرتين، والبوت يُضبط في محادثة والرسائل في أخرى.
--
-- الحل (بقرار المالك) — قاعدتان في resolve_conversation، والتاجر لا يتغيّر:
--
--   ١) التبنّي: أول رسالة من الزبون عبر حساب **معتمد** تكمل في محادثته
--      القديمة بلا حساب، إن كانت **لتاجر الحساب نفسه**. تُسجَّل عليها هوية
--      الحساب وتستمر فيها الرسائل. محادثة قديمة لتاجر آخر تبقى له، ويُفتح
--      للزبون عند التاجر الجديد محادثة جديدة.
--
--   ٢) رسالة بلا معرّف (عقدة n8n لم تُحدَّث بعد، أو أداة فريق بالرقم وحده)
--      تكمل في محادثة المتجر الأول مع الزبون على القناة نفسها ولو تبنّاها
--      حساب — بدل أن تفتح له محادثة قديمة جديدة. فالتحديث الجزئي لمسار n8n
--      (الوارد قبل الصادر مثلاً) لا يشطر المحادثة.
--
-- لماذا الحساب المعتمد وحده يتبنّى: الحساب غير المعتمد لا يُعرف تاجره. وتبنّي
-- محادثة له يربطها بمعرّف قد يُعتمد لاحقاً لتاجر آخر، فتصل رسائل زبائنه إلى
-- صاحب المحادثة القديمة.
--
-- ⚠️ الترتيب يهمّ: الحساب يُربط ويُعتمد **قبل** أن يرسل n8n معرّفه. الرسالة
-- التي تصل عبر حساب لم يُعتمد بعد تفتح محادثة بلا تاجر، وتُلحق بالتاجر عند
-- الاعتماد محادثةً منفصلة عن القديمة، لا تتبنّاها.
--
-- إلغاء استثناء «المتجر الأول» للرسائل بلا معرّف صار الترحيل ٠٢١ (وكان ٠١٩
-- يسمّيه ٠٢٠). لا نقل بيانات هنا: التبنّي يحدث عند أول رسالة، لا دفعة واحدة.
-- ============================================================================

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
  'المصدر الوحيد لنسبة المحادثة إلى تاجرها، مع تبنّي المحادثة القديمة لتاجر الحساب نفسه (الترحيل ٠٢٠). يستدعيها sync_live_n8n_messages و lib/conversations-server.ts.';

comment on column public.conversation_log.account_external_id is
  'معرّف حساب الأعمال كما يرسله Meta: phone_number_id لواتساب، معرّف الصفحة لماسنجر، معرّف الحساب المهني لإنستغرام. منه يُعرف التاجر عبر social_accounts. فارغ = مسار n8n لم يُحدَّث بعد (استثناء مؤقت، الترحيل ٠٢١).';

-- create or replace يُبقي الصلاحيات، وتُعاد هنا ليكتفي الترحيل بنفسه (نمط ٠١٣)
revoke execute on function public.resolve_conversation(text, text, text) from anon, authenticated, public;
grant execute on function public.resolve_conversation(text, text, text) to service_role;
