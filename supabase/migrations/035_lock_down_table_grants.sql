-- ============================================================================
-- 035 — سحب صلاحيات الجداول الزائدة عن أدوار الـ API (anon و authenticated)
-- ============================================================================
--
-- رُقِّم ٠٣٥ لأن ٠٣٤ مأخوذ على القاعدة الحية بالترحيل 034_cancelled_shipment_state
-- (2026-11-01)، وهو لا يمسّ صلاحيات الجداول.
--
-- ما وُجد على القاعدة الحية (استعلامات قراءة فقط، 2026-10-31، وأُعيد الفحص في
-- 2026-11-01 بالصورة نفسها، وآخر ترحيل فيها 033):
--
--   ٣٥ جدولاً من ٤١ في public ما زالت تحمل منح Supabase الافتراضية كاملة
--   لدورَي anon و authenticated: SELECT و INSERT و UPDATE و DELETE و TRUNCATE
--   و REFERENCES و TRIGGER، ومعها MAINTAIN. والأخيرة صلاحية جاءت مع
--   PostgreSQL 17، لا يعرضها information_schema.role_table_grants فلا تظهر إلا
--   في pg_class.relacl (الحرف m). ولذلك فاتت كل سحب سابق: ما زال anon يملكها
--   على conversations و messages (بعد ٠٠٧)، و authenticated يملكها عليهما وعلى
--   product_images (بعد ٠٣٢).
--
-- لماذا يهمّ ذلك و RLS مفعّلة على كل الجداول:
--   • RLS تحكم صفوف SELECT و INSERT و UPDATE و DELETE وحدها. TRUNCATE لا يمرّ
--     بها ولا بمُحفّزات الصفوف: جدول بلا سياسة DELETE يمنع الحذف صفاً صفاً،
--     ولا يمنع تفريغه كله.
--   • MAINTAIN تتيح VACUUM و ANALYZE و REINDEX و CLUSTER و LOCK TABLE، وهي صيانة
--     لا يحتاجها دور يصل عبر PostgREST.
--   • REFERENCES و TRIGGER صلاحيات تعريف (DDL) لا يحتاجها دور يصل عبر PostgREST.
--
-- حجم الخطر الفعلي: منخفض. anon و authenticated دوران بلا تسجيل دخول (NOLOGIN)،
-- لا يصل بهما إلا PostgREST وخدمتا البث الحي والتخزين، ولا شيء منها ينفّذ
-- TRUNCATE ولا LOCK ولا DDL. لكن الإبقاء عليها مخالف لمبدأ الحد الأدنى من
-- الامتياز (كما في ٠٠٧)، وأي مسار مستقبلي ينفّذ SQL بدور المستخدم يرثها.
--
-- ما يحتاجه المتصفح فعلاً (تتبّع الكود، وسجل طلبات الـ API لآخر ٢٤ ساعة):
--   • authenticated: قراءة messages، والبث الحي على messages و conversations
--     (components/LiveConversations.tsx). ولا يكتب الدور في أي جدول من المتصفح.
--   • ملفات conversation-media في التخزين (components/VoiceNote.tsx) لا تمرّ بصلاحيات
--     الجداول: سياستها على storage.objects تستدعي auth_role() و auth_merchant_id()،
--     وهما security definer تقرآن profiles بصلاحية المالك.
--   • anon: قراءة plans لصفحة التعريف (lib/plans-server.ts، سياسة plans_public_read).
--   • كل ما عدا ذلك يمرّ بـ service_role (مسارات الخادم وn8n)، وهو يتجاوز الصلاحيات
--     و RLS فلا يمسّه شيء هنا. وفي نافذة السجل لم يرد أي طلب REST بدور anon، ولا بدور
--     authenticated إلا قراءة messages.
--   • لا يرث من يسجّل الدخول صلاحيات anon أو authenticated إلا postgres، وهو مالك
--     الجداول أصلاً. و authenticator (الذي يصل عبره PostgREST) عضو بلا وراثة: يبدّل
--     الدور ولا يرث.
--
-- القاعدة:
--   ١. TRUNCATE و REFERENCES و TRIGGER و MAINTAIN: تُسحب من الدورين على كل جدول.
--   ٢. INSERT و UPDATE و DELETE: تُسحب ما لم تقابلها سياسة RLS للدور والأمر نفسيهما.
--   ٣. SELECT من anon: تُسحب إلا عن plans.
--   ٤. SELECT لـ authenticated: تبقى حيث كانت، عمداً. على ٢٣ جدولاً تقابلها
--      سياسة، وعلى ١٥ بلا سياسة تعيد RLS صفراً من الصفوف. وسحبها من هذه يحوّل
--      النتيجة الفارغة إلى خطأ صلاحية، ويُسقط كاملاً أي استعلام PostgREST يضمّ
--      أحدها بالتضمين (embed) بدل أن يعيد مصفوفة فارغة.
--
-- القرار لكل جدول (السياسات كما على القاعدة الحية):
--
--   الجدول                      سياسات RLS               anon بعده  authenticated بعده
--   --------------------------  -----------------------  ---------  ------------------
--   ad_campaigns                authenticated: S         —          S
--   admin_impersonation_log     —                        —          S [1]
--   ai_agents                   authenticated: S         —          S
--   bot_reply_audit             —                        —          S [1]
--   catalogs                    authenticated: S         —          S
--   conversation_log            —                        —          — [2]
--   conversations               authenticated: S         —          S [3]
--   coupons                     authenticated: S         —          S
--   couriers                    authenticated: S         —          S
--   customer_sessions           —                        —          S [1]
--   customers                   —                        —          S [1]
--   delivery_areas              authenticated: S         —          S
--   discount_policy             —                        —          S [1]
--   failed_events               —                        —          — [2]
--   incoming_messages           —                        —          S [1]
--   marketer_merchants          —                        —          S [1]
--   marketers                   authenticated: S         —          S
--   match_runs                  authenticated: S I D     —          S I D [4]
--   merchant_delivery_settings  authenticated: S         —          S
--   merchant_profiles           authenticated: S         —          S
--   merchants                   authenticated: S         —          S
--   message_buffer              —                        —          S [1]
--   messages                    authenticated: S         —          S [3]
--   n8n_chat_histories          —                        —          S [1]
--   n8n_chat_history            —                        —          S [1]
--   order_books                 authenticated: S         —          S
--   order_items                 —                        —          S [1]
--   orders                      authenticated: S         —          S
--   plans                       anon, authenticated: S   S          S
--   processed_messages          —                        —          S [1]
--   product_images              authenticated: S         —          S [3]
--   products                    authenticated: S         —          S
--   profiles                    authenticated: S         —          S
--   session_context             —                        —          S [1]
--   shipments                   authenticated: S         —          S
--   shipping_zones              —                        —          S [1]
--   social_accounts             authenticated: S         —          S
--   subscriptions               authenticated: S         —          S
--   tenants                     —                        —          S [1]
--   uploads                     authenticated: S I U D   —          S I U D [4]
--   whatsapp_messages           —                        —          — [2]
--
--   S = SELECT، I = INSERT، U = UPDATE، D = DELETE. ولا يبقى لأيّ من الدورين
--   TRUNCATE ولا REFERENCES ولا TRIGGER ولا MAINTAIN على أي جدول.
--   [1] بلا سياسة: RLS تعيد صفراً من الصفوف، و SELECT باقية عمداً (القاعدة ٤).
--   [2] مقفل كلياً قبلاً (٠٠٥، ٠١٩): لا يتغيّر.
--   [3] أُقفل قبلاً (٠٠٦، ٠٠٧، ٠١٢، ٠٣٢): لا يتغيّر هنا إلا MAINTAIN.
--   [4] سياسات بـ user_id لا يستعملها كود التطبيق اليوم، فتبقى صلاحياتها ما
--       دامت السياسات قائمة. وتُسحب UPDATE من match_runs: لا سياسة لها.
--
-- الجداول الجديدة (ALTER DEFAULT PRIVILEGES):
--   Supabase تمنح كل جدول يُنشأ في public كل الصلاحيات لـ anon و authenticated
--   عبر مدخلين في pg_default_acl، واحد لكل منشئ: postgres و supabase_admin.
--   سحبت ٠١٩ و٠٢٩ و٠٣٢ صلاحيات جداولها يدوياً، وما لم يُسحب (ومنه ما أنشأه ٠٠٢
--   و٠١٠ و٠١١) بقي ممنوحاً، ولم يشمل أي سحب سابق MAINTAIN. القرار: يُعدَّل مدخل postgres ليبدأ الجدول الجديد بما ينتهي إليه
--   هنا الجدول الذي بلا سياسة: SELECT وحدها لـ authenticated، ولا شيء لـ anon.
--   ومن يحتاج كتابة من المتصفح أو قراءة بلا دخول يمنحها صراحةً مع سياستها،
--   فيظهر النسيان رفضاً صريحاً لا انكشافاً صامتاً.
--   • SELECT لـ authenticated تبقى في الافتراضي: الترحيل ٠٢٩
--     (product_groups_and_policy_columns، لم يُطبَّق بعد) لا يمنحها صراحةً
--     وتحتاجها سياسته product_groups_select_scoped.
--   • المدخل خاص بمخطط public لا عامّ، فسحبه بـ in schema public نافذ.
--   • مدخل supabase_admin يبقى كما هو: postgres ليس عضواً فيه فلا يعدّل افتراضياته.
--     وكل الجداول الـ ٤١ ملك postgres.
--   • الافتراضي لا يمسّ الجداول القائمة ولا المتسلسلات. EXECUTE: هذا الترحيل يسحبه من
--     دالة المُحفِّز sync_live_n8n_message_update (القسم ٤)، وبقية الدوال خارجه: الافتراضي
--     للدوال يمنحها anon و authenticated كذلك، ويُعالَج دالةً دالةً كما في ٠١٣.
--
-- MAINTAIN صلاحية من PostgreSQL 17، ولا تعرفها الإصدارات الأقدم. القاعدة الحية على 17.6.
-- وإعادة تطبيق هذا الترحيل آمنة: كل جملة فيه تسحب أو تمنح، ولا تمسّ بيانات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) anon: قراءة الباقات المفعّلة لصفحة التعريف، ولا شيء غيرها
-- ----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select on table public.plans to anon;

-- ----------------------------------------------------------------------------
-- 2) authenticated: القراءة باقية، والكتابة حيث تقابلها سياسة فقط
-- ----------------------------------------------------------------------------

revoke insert, update, delete, truncate, references, trigger, maintain
  on all tables in schema public from authenticated;

grant insert, delete on table public.match_runs to authenticated;
grant insert, update, delete on table public.uploads to authenticated;

-- ----------------------------------------------------------------------------
-- 3) الجداول الجديدة تبدأ من الحالة نفسها
-- ----------------------------------------------------------------------------

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate, references, trigger, maintain
  on tables from authenticated;

-- ----------------------------------------------------------------------------
-- 4) دالة المُحفِّز الحية sync_live_n8n_message_update
--
-- SECURITY DEFINER، تُستعمل مُحفِّزاً على conversation_log، ومنح EXECUTE لـ PUBLIC
-- و anon و authenticated يخالف نمط ٠١٣. لا تعريف لها في المستودع (جاءت من الترحيل
-- الحي sync_conversation_log_updates_to_messages، 20261026102900)، فلا يعرّفها هذا
-- الترحيل. السحب مشروط بوجودها: قاعدة لا تحملها (إعادة تشغيل المستودع على قاعدة
-- جديدة) لا تفشل عنده. وتنفيذ المُحفِّز لا يمرّ بفحص EXECUTE لمن ينفّذ INSERT/UPDATE،
-- فيبقى المُحفِّز يعمل، وهذا يُتحقَّق منه في الفحص.
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.sync_live_n8n_message_update()') is not null then
    revoke execute on function public.sync_live_n8n_message_update() from anon, authenticated, public;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 5) يُعاد تحميل مخطط PostgREST (كما في ٠٢٢ و٠٢٩)
-- ----------------------------------------------------------------------------

notify pgrst, 'reload schema';
