-- ============================================================================
-- 017 — توثيق انحراف مرصود: أعمدة يستعملها الكود ولا ينشئها أي ترحيل
-- ============================================================================
--
-- ⚠️ ما اكتُشف عند تجهيز قاعدة بيئة المعاينة (٢٠٢٦-٠٩-١٩):
--
-- طُبِّقت الترحيلات كلها على قاعدة جديدة فارغة، ثم قورن مخططها بمخطط
-- الإنتاج عموداً بعمود. الفرق: خمسة أعمدة موجودة في الإنتاج ولا ينشئها أي
-- ترحيل — أُضيفت في لوحة Supabase ولم تُسجَّل في المستودع، وهو بالضبط ما
-- جاء الترحيل ٠١٠ ليُنهيه.
--
-- أربعة منها ليست تجميلية: app/api/merchants/route.ts **يقرؤها ويكتبها**:
--
--     .select('id, name, owner_name, phone, city, status, balance_iqd,
--              commission_rate, api_key, webhook_url')
--
-- أي أن لوحة التجار كلها — عرضاً وإنشاءً وتعديلاً — تنهار على أي قاعدة
-- تُبنى من هذا المستودع بـ:
--
--     column merchants.owner_name does not exist
--
-- والخامس (whatsapp_messages.channel) من حقبة n8n ولا يقرؤه كود المنصة،
-- ويُوثَّق هنا لأن المستودع يجب أن يصف القاعدة كما هي لا كما نتمنّاها.
--
-- التعريفات أدناه مستخرَجة من قاعدة الإنتاج (information_schema و
-- pg_constraint) لا مُخمَّنة — بند ٢-أ في CLAUDE.md.
--
-- آمن على القاعدة الحية: كل شيء `if not exists`، ولا يحذف ولا يعدّل بيانات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) أعمدة التاجر التي تستعملها لوحة /operations
-- ----------------------------------------------------------------------------

alter table public.merchants
  add column if not exists owner_name text,
  add column if not exists city text,
  add column if not exists commission_rate numeric,
  add column if not exists webhook_url text;

comment on column public.merchants.owner_name is 'اسم صاحب المتجر — يُعرض في لوحة التجار ويُدخل عند إنشاء تاجر من /operations.';
comment on column public.merchants.city is 'مدينة التاجر. حقل عرض في لوحة التجار — لا يُشتق منه شيء لوجستياً.';
comment on column public.merchants.commission_rate is 'نسبة عمولة برق على هذا التاجر (٠–١٠٠). null = لم تُحدَّد بعد، ولا تُفترض قيمة.';
comment on column public.merchants.webhook_url is 'نقطة إرسال أحداث هذا التاجر. تُقرأ وتُعرض في اللوحة.';

-- النسبة خارج ٠–١٠٠ ليست خطأ إدخال فحسب: عمولة ١٢٠٪ تقلب إشارة أي حساب
-- مالي مبنيّ عليها. القيد منقول كما هو من الإنتاج.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.merchants'::regclass
      and conname = 'merchants_commission_rate_check'
  ) then
    alter table public.merchants add constraint merchants_commission_rate_check
      check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100));
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2) عمود قناة الرسائل القديم (حقبة n8n)
-- ----------------------------------------------------------------------------

alter table public.whatsapp_messages
  add column if not exists channel text default 'whatsapp';

comment on column public.whatsapp_messages.channel is
  'قناة الرسالة في الجدول القديم. لا يقرؤه كود المنصة — مصدر الحقيقة للمحادثات هو conversations/messages.';

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='merchants'
-- order by column_name;   -- يجب أن تظهر city و commission_rate و owner_name و webhook_url
