-- ============================================================================
-- بذرة الباقات — بلا هذا الملف لا يستطيع أحد التسجيل في قاعدة جديدة
-- ============================================================================
--
-- ⚠️ الترحيل ٠١٠ يُنشئ جدول public.plans **فارغاً**، ولا ترحيل يزرع صفوفه.
-- وقاعدة بلا باقات تعني:
--   • التسجيل الذاتي يفشل بـ "باقة البداية المجانية غير مُهيَّأة" — لأن
--     provisionSelfServeMerchant يبحث عن code='spark' وهو شرط لإنشاء التاجر.
--   • قسم الأسعار في /platform يظهر فارغاً.
--
-- الصفوف أدناه منقولة حرفياً من قاعدة الإنتاج (2026-09-19) لا مؤلَّفة —
-- بند ٢-أ في CLAUDE.md. يُشغَّل على كل بيئة جديدة (معاينة، تطوير) بعد
-- الترحيلات ٠٠١→٠١٦.
--
-- ⚠️ الأسعار: Spark وحدها لها سعر معتمد (صفر). الباقات المدفوعة price_iqd_monthly
-- فيها null عمداً — تسعيرة غير محسومة، وواجهة الأسعار تعرض ذلك كما هو. لا
-- يُملأ أي منها بمبلغ مُخمَّن.
--
-- كيف يُشغَّل: Supabase Dashboard → SQL Editor.
-- ============================================================================

insert into public.plans (
  code, name_en, tagline_ar, price_iqd_monthly, list_price_iqd_monthly,
  sort_order, is_featured, is_active,
  max_social_accounts, max_ai_agents, max_actions_monthly, max_catalogs,
  max_products, max_order_books, max_team_seats,
  analytics_tier, support_tier, has_api_access
) values
  ('spark', 'Spark', 'ابدأ بلا تكلفة — جرّب الموظف الذكي على حسابك الحقيقي',
   0, null, 1, false, true, 2, 1, 250, 1, 25, 1, 2, 'basic', 'standard', false),

  ('flash', 'Flash', 'أول خطوة احترافية — ردود أسرع وتحليلات أعمق',
   null, null, 2, false, true, 2, 2, 2000, 1, 100, 1, 2, 'advanced', 'standard', false),

  ('beam', 'Beam', 'نموّ جادّ — قنوات أكثر وفريق يعمل بتناغم',
   null, null, 3, true, true, 4, 4, 5000, 2, 500, 2, 3, 'advanced', 'standard', false),

  ('bolt', 'Bolt', 'حجم عالٍ — ثمانية حسابات وأولوية في الدعم',
   null, null, 4, false, true, 8, 8, 15000, 4, 2000, 4, 8, 'advanced', 'priority', false),

  ('storm', 'Storm', 'أقصى طاقة — وصول برمجي كامل ودعم مخصّص',
   null, null, 5, false, true, 16, 16, 100000, 8, 30000, 8, 16, 'advanced', 'vip', true)

-- الصفّ موجود؟ تُحدَّث حدوده وتسميته ولا يُكرَّر: plans_code_key يضمن
-- التفرّد، والتحديث يجعل الملف أداة مزامنة لا أداة إنشاء مرة واحدة.
on conflict (code) do update set
  name_en             = excluded.name_en,
  tagline_ar          = excluded.tagline_ar,
  price_iqd_monthly   = excluded.price_iqd_monthly,
  list_price_iqd_monthly = excluded.list_price_iqd_monthly,
  sort_order          = excluded.sort_order,
  is_featured         = excluded.is_featured,
  is_active           = excluded.is_active,
  max_social_accounts = excluded.max_social_accounts,
  max_ai_agents       = excluded.max_ai_agents,
  max_actions_monthly = excluded.max_actions_monthly,
  max_catalogs        = excluded.max_catalogs,
  max_products        = excluded.max_products,
  max_order_books     = excluded.max_order_books,
  max_team_seats      = excluded.max_team_seats,
  analytics_tier      = excluded.analytics_tier,
  support_tier        = excluded.support_tier,
  has_api_access      = excluded.has_api_access,
  updated_at          = now();

-- التحقق بعد التشغيل:
-- select code, name_en, price_iqd_monthly, is_active from public.plans order by sort_order;
