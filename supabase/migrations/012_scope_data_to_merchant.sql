-- ============================================================================
-- 012 — عزل البيانات بالتاجر: إغلاق تسريب محادثات الزبائن
-- ============================================================================
--
-- ⚠️ التسريب الذي يُغلق هنا:
--
-- الترحيل ٠٠٣ منح anon قراءة conversations و messages بشرط `using (true)`.
-- مفتاح anon موجود في حزمة المتصفح لأي زائر، فكان بإمكان أي شخص سحب كل
-- المحادثات — أرقام هواتف وعناوين ومبالغ ونصوص كاملة — لكل زبائن كل التجار.
--
-- لماذا لم تُغلق قبل اليوم: تلك السياسة نفسها هي ما كان يُشغّل Supabase
-- Realtime في لوحة المحادثات. تضييقها بلا مصادقة كان يعطّل البث الحي أو
-- ينقل التسريب إلى مسار خادم عام — لا يغلقه.
--
-- ما تغيّر: عميل المتصفح صار مربوطاً بالجلسة (lib/supabase/client.ts)، فصار
-- اشتراك Realtime نفسه مُصادَقاً وتكفيه سياسة مقيّدة. الميزة باقية والتسريب
-- مغلق.
--
-- مبدأ التقسيم:
--   platform_owner و staff → يريان كل المحادثات (هذا عملهم: خدمة العملاء)
--   merchant               → محادثات تاجره وحده
--   anon                   → لا شيء
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) المحادثات
-- ----------------------------------------------------------------------------

drop policy if exists "conversations_select_client" on public.conversations;
drop policy if exists "conversations_update_bot_active" on public.conversations;

create policy "conversations_select_scoped"
  on public.conversations for select to authenticated
  using (
    public.auth_role() in ('platform_owner', 'staff')
    or merchant_id = public.auth_merchant_id()
  );

-- لا سياسة كتابة: تبديل حالة البوت وتحديث المحادثة يمران بمسارات الخادم
-- (‏/api/conversations/:id/bot) التي تفحص الصلاحية قبل الكتابة. غياب
-- السياسة منعٌ تام، وهو المقصود.

-- ----------------------------------------------------------------------------
-- 2) الرسائل
-- ----------------------------------------------------------------------------

drop policy if exists "messages_select_client" on public.messages;

create policy "messages_select_scoped"
  on public.messages for select to authenticated
  using (
    public.auth_role() in ('platform_owner', 'staff')
    or exists (
      select 1 from public.conversations c
      where c.id = messages.conversation_id
        and c.merchant_id = public.auth_merchant_id()
    )
  );

-- سحب القراءة من anon على مستوى الصلاحية لا الصف فقط: الترحيل ٠٠٦ سحب
-- insert/update/delete وترك select. السياسات أعلاه تمنع anon أصلاً (ممنوحة
-- to authenticated)، وهذا السحب طبقة ثانية تمنع أي سياسة مستقبلية مكتوبة
-- بسهو لـ public من فتح الباب من جديد.
revoke select on table public.conversations from anon;
revoke select on table public.messages from anon;

-- ----------------------------------------------------------------------------
-- 3) قراءة التاجر لبياناته
--
-- كل الكتابة تمرّ بمسارات الخادم بـ service_role بعد فحص الصلاحية، فهذه
-- سياسات قراءة فقط. فائدتها أن أي استعلام من المتصفح — اليوم أو في ميزة
-- قادمة — يبقى محصوراً بتاجر المستخدم بحكم القاعدة لا بحكم انتباه المبرمج.
-- ----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'catalogs', 'products', 'coupons', 'ai_agents', 'social_accounts',
    'order_books', 'merchant_profiles', 'merchant_delivery_settings',
    'ad_campaigns', 'subscriptions', 'shipments'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_scoped', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (public.auth_role() in (''platform_owner'', ''staff'')
                or merchant_id = public.auth_merchant_id())',
      t || '_select_scoped', t
    );
  end loop;
end $$;

-- merchants: التاجر يقرأ صفّه هو (لا قائمة التجار كلها)، وبرق تقرأ الكل.
drop policy if exists "merchants_select_scoped" on public.merchants;
create policy "merchants_select_scoped"
  on public.merchants for select to authenticated
  using (
    public.auth_role() in ('platform_owner', 'staff')
    or id = public.auth_merchant_id()
  );

-- orders لا يحمل merchant_id — النسبة للتاجر تمرّ بالشحنة المرتبطة.
drop policy if exists "orders_select_scoped" on public.orders;
create policy "orders_select_scoped"
  on public.orders for select to authenticated
  using (
    public.auth_role() in ('platform_owner', 'staff')
    or exists (
      select 1 from public.shipments s
      where s.order_id = orders.order_id
        and s.merchant_id = public.auth_merchant_id()
    )
  );

-- ----------------------------------------------------------------------------
-- 4) جداول لا تخصّ تاجراً بعينه — لبرق وحدها
-- ----------------------------------------------------------------------------

drop policy if exists "couriers_select_staff" on public.couriers;
create policy "couriers_select_staff"
  on public.couriers for select to authenticated
  using (public.auth_role() in ('platform_owner', 'staff'));

drop policy if exists "marketers_select_staff" on public.marketers;
create policy "marketers_select_staff"
  on public.marketers for select to authenticated
  using (public.auth_role() in ('platform_owner', 'staff'));

-- دليل مناطق التوصيل وتسعيرتها: يقرأه كل مستخدم داخل، ولا يخصّ تاجراً.
drop policy if exists "delivery_areas_select_authenticated" on public.delivery_areas;
create policy "delivery_areas_select_authenticated"
  on public.delivery_areas for select to authenticated
  using (is_active);
