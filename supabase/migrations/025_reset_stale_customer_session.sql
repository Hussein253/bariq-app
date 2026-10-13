-- ============================================================================
-- 025 — تصفير الجلسة الخاملة بعد حسمها بالحساب (تكملة ٠٢٤)
-- ============================================================================
--
-- عقدة «Reset Stale Session» في مسار واتساب تُفرغ السلة والمرحلة لجلسة خامل
-- زبونها أكثر من 24 ساعة، وتعمل **قبل** touch_customer_session. صارت الجلسة
-- تُحسم بالحساب (٠٢٤)، فالتصفير يحتاج الحسم أولاً.
--
-- لماذا دالة لا استعلام واحد في n8n:
-- الحسم قد يتبنّى الجلسة القديمة (UPDATE على صفها). استدعاؤه داخل UPDATE واحد
-- على الصف نفسه يرفضه Postgres (27000: tuple already modified by an operation
-- triggered by the current command) — جُرِّب فعلاً. فكان أول رسالة لكل زبون
-- قائم بعد التحويل ستتخطى التصفير بصمت. هنا الحسم والتصفير عبارتان متتاليتان.
--
-- قيد الهاتف وحده (customer_sessions_phone_key) يُحذف في ٠٢٦ لا هنا.
-- ============================================================================

create or replace function public.reset_stale_customer_session(
  p_phone text,
  p_platform text,
  p_account_external_id text
)
returns setof public.customer_sessions
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session_id bigint;
begin
  v_session_id := public.resolve_customer_session(p_phone, p_platform, p_account_external_id);

  if v_session_id is null then
    return;
  end if;

  return query
  update public.customer_sessions
     set session_data = default,
         stage        = default
   where id = v_session_id
     and coalesce(last_customer_message_at, created_at) < now() - interval '24 hours'
  returning *;
end;
$function$;

comment on function public.reset_stale_customer_session(text, text, text) is
  'n8n: قبل touch_customer_session — يحسم الجلسة ثم يُفرغ سلّتها ومرحلتها إن خمل زبونها أكثر من 24 ساعة. يُرجع الصف إن صُفِّر.';

revoke execute on function public.reset_stale_customer_session(text, text, text) from anon, authenticated, public;
grant execute on function public.reset_stale_customer_session(text, text, text) to service_role;
