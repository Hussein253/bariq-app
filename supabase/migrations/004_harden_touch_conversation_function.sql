-- =====================================================================
-- 004: تقييد دالة المحفّز touch_conversation_on_message
-- ---------------------------------------------------------------------
-- الدالة SECURITY DEFINER وتُستدعى من المحفّز فقط، لكنها كانت قابلة
-- للاستدعاء عبر /rest/v1/rpc/ من anon و authenticated. نسحب صلاحية
-- التنفيذ لإغلاق هذا المسار.
-- طُبِّق: 2026-09-04
-- =====================================================================

revoke execute on function public.touch_conversation_on_message() from public;
revoke execute on function public.touch_conversation_on_message() from anon;
revoke execute on function public.touch_conversation_on_message() from authenticated;
