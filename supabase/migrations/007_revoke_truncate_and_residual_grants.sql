-- =====================================================================
-- 007: سحب الصلاحيات المتبقية غير الضرورية عن جدولي المحادثات
-- ---------------------------------------------------------------------
-- اكتُشف بعد الترحيلة 006 أن anon و authenticated ما زالا يملكان
-- TRUNCATE و TRIGGER و REFERENCES على conversations و messages.
--
-- TRUNCATE لا يخضع لسياسات RLS إطلاقاً — لا يمر عبرها أصلاً.
-- وإن كان PostgREST لا يعرض نقطة وصول لـ TRUNCATE عبر REST، فإن
-- الإبقاء على الصلاحية مخالف لمبدأ الحد الأدنى من الامتياز.
--
-- الحالة بعد هذه الترحيلة: SELECT فقط للمتصفح — الضرورية للبث الحي.
-- طُبِّق: 2026-09-05
-- =====================================================================

revoke truncate, trigger, references on table public.conversations from anon;
revoke truncate, trigger, references on table public.conversations from authenticated;

revoke truncate, trigger, references on table public.messages from anon;
revoke truncate, trigger, references on table public.messages from authenticated;
