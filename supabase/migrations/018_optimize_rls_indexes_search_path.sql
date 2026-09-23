-- ============================================================================
-- 018 — تسريع سياسات RLS، فهرسة مفاتيح أجنبية، وإغلاق ملاحظة الترحيل ٠١٣
-- ============================================================================
--
-- مصدر هذا الترحيل: get_advisors (Supabase) — فحص أمن وأداء حقيقي على قاعدة
-- البيانات الفعلية، لا قائمة عامة. كل بند هنا تحقّقنا منه فردياً قبل الكتابة
-- (بند ٢-أ في تعليمات المشروع: لا تعديل دون فهم فعلي لما يُعدَّل).
--
-- ما رصده المدقّق ولم يُدرَج هنا، ولماذا:
--  • ١٨ جدولاً بـ RLS مفعّل بلا سياسة (customers, tenants, order_items...):
--    تتبّعنا الكود — لا مكوّن متصفّح يلمسها، الوصول كله عبر service_role من
--    مسارات API فقط. هذا مقصود وموثَّق أصلاً في الترحيل ٠٠٥ لجدول مشابه
--    (whatsapp_messages). غياب السياسة هنا هو الإغلاق نفسه، لا ثغرة.
--  • auth_merchant_id() و auth_role() قابلتان للاستدعاء من authenticated
--    كـ SECURITY DEFINER: تحقّقنا من تعريفهما — search_path مضبوط أصلاً،
--    وSECURITY DEFINER مقصود (تحتاجانه لتجاوز RLS على profiles وإرجاع صفّ
--    المستخدم نفسه فقط — لا بيانات أي أحد آخر). لمسهما يُسقط سياسات القراءة
--    التي تستدعيهما (انظر تعليق الترحيل ٠١٣).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) search_path على الدالتين اللتين أجّلهما الترحيل ٠١٣ صراحةً
--    ("لم تُمسّا هنا لأن جسمهما لم يُراجَع بعد") — رُوجع الجسمان الآن:
--    decrement_stock_atomic تحدّث products بلا تأهيل مخطط (UPDATE products)،
--    وupsert_order_items تكتب في public.order_items عبر DELETE+INSERT من
--    JSONB. لا SQL ديناميكي في أيّهما — التثبيت يمنع خداع مسار البحث فقط،
--    لا يغيّر سلوكهما.
-- ----------------------------------------------------------------------------

alter function public.decrement_stock_atomic(p_product_id bigint, p_qty integer)
  set search_path to 'public', 'pg_temp';

alter function public.upsert_order_items(p_order_id bigint, p_items jsonb)
  set search_path to 'public', 'pg_temp';

-- ----------------------------------------------------------------------------
-- 2) فهرسة المفاتيح الأجنبية الستة التي رصدها مدقّق الأداء بلا فهرس —
--    أي DELETE أو UPDATE على الجدول الأب يفحص الجدول الابن بالكامل بدونها.
-- ----------------------------------------------------------------------------

create index if not exists ai_agents_catalog_id_idx on public.ai_agents (catalog_id);
create index if not exists bot_reply_audit_tenant_id_idx on public.bot_reply_audit (tenant_id);
create index if not exists customers_tenant_id_idx on public.customers (tenant_id);
create index if not exists match_runs_shipping_upload_id_idx on public.match_runs (shipping_upload_id);
create index if not exists match_runs_store_upload_id_idx on public.match_runs (store_upload_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ----------------------------------------------------------------------------
-- 3) فهرس مكرر على customer_sessions: قيدا تفرّد منفصلان على العمود نفسه
--    (phone_number). الإبقاء على customer_sessions_phone_key وحذف الآخر —
--    onConflict: 'phone_number' في الكود يعتمد اسم العمود لا اسم القيد،
--    فلا يتأثر بأيّهما بقي.
--    ⚠️ الفهرس المكرر ليس CREATE INDEX مستقلاً بل الفهرس الضمني لقيد
--    UNIQUE — DROP INDEX يرفضه؛ إسقاط القيد نفسه يُسقط فهرسه معه.
-- ----------------------------------------------------------------------------

alter table public.customer_sessions drop constraint if exists customer_sessions_phone_number_key;

-- ----------------------------------------------------------------------------
-- 4) تسريع ٨ سياسات RLS: auth.uid() كان يُقيَّم لكل صف بدل مرة واحدة
--    للاستعلام. التغليف بـ (select ...) هو التوصية الرسمية من توثيق
--    Supabase — يحوّل النداء إلى InitPlan يُقيَّم مرة واحدة لا لكل صف.
--    ALTER POLICY يُبقي كل خاصية أخرى للسياسة (الدور، النوع) كما هي،
--    ويغيّر فقط تعبير USING/WITH CHECK.
-- ----------------------------------------------------------------------------

alter policy "Users can view own uploads" on public.uploads
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own uploads" on public.uploads
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own uploads" on public.uploads
  using ((select auth.uid()) = user_id);
alter policy "Users can delete own uploads" on public.uploads
  using ((select auth.uid()) = user_id);

alter policy "Users can view own match runs" on public.match_runs
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own match runs" on public.match_runs
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own match runs" on public.match_runs
  using ((select auth.uid()) = user_id);

alter policy "profiles_select_own" on public.profiles
  using ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- التحقق بعد التطبيق
-- ----------------------------------------------------------------------------
-- select proname, pg_get_functiondef(oid) like '%search_path%' as pinned
-- from pg_proc where proname in ('decrement_stock_atomic','upsert_order_items');
--
-- select indexname from pg_indexes where tablename = 'customer_sessions';
--
-- select policyname, qual, with_check from pg_policies
-- where tablename in ('uploads','match_runs','profiles');
