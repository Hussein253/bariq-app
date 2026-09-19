-- ============================================================================
-- 016 — إضافة merchant_id إلى orders (إغلاق ثغرة تعدد التجار)
-- ============================================================================
--
-- المشكلة: public.orders لا يحمل رابط تاجر منذ إنشائه. النسبة للتاجر كانت
-- تمرّ بشحنته المرتبطة فقط (shipments.merchant_id)، وموثَّقة صراحةً في
-- الترحيل ٠١٢:
--
--     -- orders لا يحمل merchant_id — النسبة للتاجر تمرّ بالشحنة المرتبطة.
--
-- الأثر العملي: بتاجر واحد لا فرق. بأكثر من تاجر:
--   • أي مسار يحتاج "تاجر هذا الطلب" قبل إنشاء شحنته (dispatch، الحجز
--     اليدوي) لا يملك مصدراً، فيسحب أول تاجر في الجدول عشوائياً
--     (app/api/orders/[id]/dispatch و app/api/orders/book، وسبق أن عولج
--     الخطأ نفسه في مسار n8n لاستقبال الشحنات بتوقّف بدل التخمين).
--   • أي طلب لم يُنشأ له شحنة بعد (بين التأكيد والإرسال للشحن) لا تاجر له
--     على الإطلاق — نافذة عمياء حتى لو مُلئ merchant_id لاحقاً في الشحنة.
--
-- الحل: merchant_id يُكتب على orders لحظة إنشاء الطلب نفسه (lib/order-intake.ts
-- الآن يكتبه)، فيصبح مصدر الحقيقة الوحيد بدل الاشتقاق من شحنة قد لا توجد بعد.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) العمود — nullable مؤقتاً لإتاحة التعبئة الرجعية قبل فرض NOT NULL
-- ----------------------------------------------------------------------------

alter table public.orders
  add column if not exists merchant_id uuid references public.merchants(id) on delete restrict;

-- ----------------------------------------------------------------------------
-- 2) تعبئة الطلبات القائمة
--
-- المصدر الأول: شحنة الطلب إن وُجدت — merchant_id فيها موثوق دائماً
-- (NOT NULL + مُدخَل عبر lib/order-intake.ts أو مسارات الخادم المكافئة لها).
-- ----------------------------------------------------------------------------

update public.orders o
set merchant_id = s.merchant_id
from public.shipments s
where s.order_id = o.order_id
  and o.merchant_id is null;

-- ----------------------------------------------------------------------------
-- 3) الطلبات بلا شحنة (أُلغيت، أو رُفضت لبيانات ناقصة قبل الإرسال للشحن)
--
-- لا مصدر موثوق لتاجرها. نُسنِدها للتاجر الوحيد **فقط إن كان يوجد تاجر واحد
-- بالضبط** في هذه القاعدة تحديداً — تحقّقناه مباشرة قبل كتابة هذا الترحيل
-- (CLAUDE.md بند ٢-أ: لا تخمين). لو طُبِّق هذا الترحيل على قاعدة بعدة تجار
-- (نسخة تطوير مستقبلية مثلاً) فالإسناد يتوقف صراحةً بدل أن يخمّن تاجراً —
-- نفس مبدأ عقدة Resolve Single Merchant في مسار n8n لاستقبال الشحنات.
-- ----------------------------------------------------------------------------

do $$
declare
  orphan_count int;
  merchant_count int;
  sole_merchant_id uuid;
begin
  select count(*) into orphan_count from public.orders where merchant_id is null;
  if orphan_count = 0 then
    return;
  end if;

  select count(*) into merchant_count from public.merchants;

  if merchant_count = 1 then
    select id into sole_merchant_id from public.merchants limit 1;
    update public.orders set merchant_id = sole_merchant_id where merchant_id is null;
  else
    raise exception
      'orders.merchant_id: % طلب بلا شحنة ولا يمكن اشتقاق تاجرها تلقائياً — يوجد % تاجر في merchants (وليس تاجراً واحداً). أسندها يدوياً قبل إعادة تشغيل هذا الترحيل.',
      orphan_count, merchant_count;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4) فرض الإلزامية والفهرسة
-- ----------------------------------------------------------------------------

alter table public.orders
  alter column merchant_id set not null;

create index if not exists idx_orders_merchant_id on public.orders (merchant_id);

-- ----------------------------------------------------------------------------
-- 5) تبسيط سياسة القراءة — مقارنة مباشرة بدل EXISTS عبر shipments
--
-- الفائدة مزدوجة: أداء أفضل (لا استعلام فرعي)، وإغلاق النافذة العمياء
-- المذكورة أعلاه — طلب بلا شحنة بعد صار مرئياً لتاجره فوراً لا بعد الإرسال
-- للشحن.
-- ----------------------------------------------------------------------------

drop policy if exists "orders_select_scoped" on public.orders;
create policy "orders_select_scoped"
  on public.orders for select to authenticated
  using (
    public.auth_role() in ('platform_owner', 'staff')
    or merchant_id = public.auth_merchant_id()
  );

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select count(*) from public.orders where merchant_id is null;  -- يجب أن يعيد صفراً
-- select conname from pg_constraint where conrelid = 'public.orders'::regclass
--   and conname = 'orders_merchant_id_fkey';                     -- يجب أن يظهر
