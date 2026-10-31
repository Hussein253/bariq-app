-- ============================================================================
-- 033 — شحنة الطلب التجريبي: لا تُنشأ ولا تتحرّك من أي مسار
-- ============================================================================
--
-- المشكلة:
-- المالك يجرّب البوت من حسابه، فيُنشئ البوت طلباً وشحنته آلياً، ثم يُعلَّم
-- الطلب تجريبياً (orders.is_test، الترحيل ٠٢٧) — كالطلب ٥١ وشحنته BRQ-000011
-- في 2026-10-31. التطبيق يرفض إرسال الطلب التجريبي للشحن وتحريك شحنته بـ 409
-- (lib/test-orders.ts)، لكن الرفض في مسارات التطبيق وحدها: n8n ومحرّر SQL
-- يكتبان في shipments مباشرة، ومُحفِّز آلة الحالات (الترحيل ٠٠٢) لا يعرف
-- is_test. وفي القاعدة لا يرفض الطلبَ التجريبي إلا create_bot_order_shipment،
-- وعند الإنشاء فقط.
--
-- الحل: مُحفِّز قبل الإدراج والتعديل على shipments يرفض بـ BQ012:
--   • إنشاء شحنة لطلب تجريبي، أو نقل شحنة قائمة إليه بتغيير order_id.
--   • تغيير أيٍّ من أعمدة التسليم والتسوية في شحنة طلب تجريبي:
--       status · courier_id · settlement_status · postponed_reason · returned_reason
--     وهي نفسها DISPATCH_COLUMNS في lib/test-orders.ts، واختبار
--     tests/test-order-shipment-guard.test.ts يكشف افتراق القائمتين.
-- وما عداها يبقى يُعدَّل، والملاحظات أولاً، كما في التطبيق. والعبرة بتغيّر
-- القيمة لا بذكر العمود: تعديل يعيد الحالة كما هي مع ملاحظة جديدة يمرّ.
-- والطلب المعتبر هو الذي تنتهي إليه الشحنة (new.order_id)، فإلغاء تعليم الطلب
-- تجريبياً يعيد شحنته قابلة للتحريك.
--
-- الرفض بنمط «BQ_…|رسالة عربية» كالترحيل ٠٢٧، وبنص رسائل lib/test-orders.ts
-- نفسه، فيقرأ n8n والتطبيق الرفض واحداً من أي طبقة جاء.
--
-- ⚠️ ما لا يفعله هذا الترحيل عمداً:
--   • لا يمسّ بيانات: المُحفِّز لا يفحص الصفوف القائمة. وقت كتابته ثلاثة طلبات
--     تجريبية (٢٩ و٣٩ و٥١)، وحده ٥١ له شحنة: BRQ-000011 في ORDER_RECEIVED بلا
--     مندوب وتسويتها PENDING.
--   • لا حالة جديدة («ملغاة» مثلاً): آلة الحالات في CLAUDE.md لا تعرفها،
--     وقرارها للمالك.
--   • لا يمنع حذف الشحنة، ولا تعليم الطلب تجريبياً بعد شحنه.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الحارس
--
-- SECURITY DEFINER كـ enforce_plan_limit: يقرأ orders بصلاحية مالكه لا الكاتب،
-- فكاتب لا تُظهر له RLS الطلب لا يتجاوز الحارس لأنه لا يراه. ومسار البحث
-- مثبّت لذلك (الترحيل ٠١٣).
-- ----------------------------------------------------------------------------

create or replace function public.block_test_order_shipment()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- (أ) تعديل لا يغيّر الطلب ولا عمود تسليم أو تسوية (الملاحظات مثلاً) يمرّ
  --     بلا قراءة الطلب
  if tg_op = 'UPDATE' then
    if  new.order_id          is not distinct from old.order_id
    and new.status            is not distinct from old.status
    and new.courier_id        is not distinct from old.courier_id
    and new.settlement_status is not distinct from old.settlement_status
    and new.postponed_reason  is not distinct from old.postponed_reason
    and new.returned_reason   is not distinct from old.returned_reason then
      return new;
    end if;
  end if;

  -- (ب) طلب حقيقي: لا شأن لهذا الحارس به
  if not exists (
    select 1 from public.orders o where o.order_id = new.order_id and o.is_test
  ) then
    return new;
  end if;

  -- (ج) شحنة جديدة لطلب تجريبي، أو شحنة قائمة تُنقل إليه (OLD فارغ عند الإدراج)
  if tg_op = 'INSERT' or new.order_id is distinct from old.order_id then
    raise exception 'BQ_ORDER_NOT_SHIPPABLE|الطلب % تجريبي (اختبار البوت أو المنصة) ولا يُرسل للشحن', new.order_id
      using errcode = 'BQ012';
  end if;

  -- (د) شحنة طلب تجريبي قائمة: لا حالة ولا مندوب ولا تسوية
  raise exception 'BQ_ORDER_NOT_SHIPPABLE|الشحنة % لطلب تجريبي ولا تُرسل للمندوب — حالتها ومندوبها وتسويتها لا تتغيّر، والملاحظات وحدها تُعدَّل', old.tracking_number
    using errcode = 'BQ012';
end;
$function$;

comment on function public.block_test_order_shipment() is
  'يرفض (BQ012) إنشاء شحنة لطلب تجريبي (orders.is_test) أو نقلها إليه، وتغيير حالتها أو مندوبها أو تسويتها أو سببَي التأجيل والإرجاع. الملاحظات تبقى تُعدَّل. الأعمدة نفسها DISPATCH_COLUMNS في lib/test-orders.ts.';

-- ----------------------------------------------------------------------------
-- 2) المُحفِّز
--
-- PostgreSQL يشغّل مُحفِّزات الحدث الواحد بترتيب أسمائها أبجدياً. الاسم يسبق
-- shipments_enforce_status_transition عمداً: شحنة الطلب التجريبي تُرفض لأنها
-- تجريبية، لا بخطأ آلة حالات يوحي بأن انتقالاً آخر كان سيُقبل.
-- ----------------------------------------------------------------------------

drop trigger if exists shipments_block_test_order on public.shipments;
create trigger shipments_block_test_order
  before insert or update on public.shipments
  for each row execute function public.block_test_order_shipment();

-- ----------------------------------------------------------------------------
-- 3) دالة مُحفِّز لا تُنادى من الـ API — نهج الترحيل ٠١٣
-- ----------------------------------------------------------------------------

revoke execute on function public.block_test_order_shipment() from anon, authenticated, public;
