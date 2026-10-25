-- ============================================================================
-- 030 — رد انتظار واحد للزبون بعد التحويل لموظف: متى بدأ التحويل ومتى انرسل الرد
-- ============================================================================
--
-- المشكلة (ماسنجر 2026-10-24، الزبون 28944586871867160)
-- -----------------------------------------------------
-- بعد «تحوّلت لموظف الدعم» (12:48:19) الزبون كتب «شنو عدكم الوان غيرها» (12:48:48) و«موجودين» (12:52:48)
-- وما وصله شي لحد أول رد موظف 13:00:21 (~11.5 دقيقة). فرع «Human Takeover?» بمسار ماسنجر يسجّل الرسالة
-- ويشيلها من البفر بس. (تحية الموظف 12:48:47 انحفظت باللوحة وما وصلت: إرسال اللوحة لماسنجر كان معطّل وقتها.)
--
-- العقد بعد هذا الترحيل
-- ---------------------
--   customer_sessions.human_takeover_at ← متى صار human_takeover = true آخر مرة (null = البوت شغّال).
--   customer_sessions.human_ack_at      ← متى انرسل رد الانتظار بهالتحويل (null = بعد ما انرسل).
--
-- الحقلان يمشيهما trigger واحد (stamp_human_takeover) مهما كان الكاتب: عقدة «Set Human Takeover» بـ n8n،
-- ورد اللوحة (/api/conversations/:id/reply)، وزر البوت (/api/conversations/:id/bot)، و/api/activate-bot.
-- لما human_takeover يتقلّب: human_takeover_at = now() (أو null عند الرجوع للبوت) و human_ack_at = null.
-- إعادة كتابة human_takeover = true على جلسة محوّلة أصلاً (كل رد من اللوحة) ما تغيّر شي.
--
-- n8n (n8n/human-ack.js) يحجز رد الانتظار بـ UPDATE ذرّي واحد يضبط human_ack_at:
-- بس لو الجلسة محوّلة، وما انرسل رد بهالتحويل، وما كتب موظف (messages.sender_type = 'agent') من بداية التحويل.
--
-- ⚠️ ما لا يلمسه هذا الترحيل عمداً
-- --------------------------------
--   • الجلسات المحوّلة قبله يبقى human_takeover_at = null، و n8n يعدّها «بداية مجهولة»: أي رد موظف سابق يمنع الرد.
--   • ما في رجوع تلقائي للبوت: تحرير الجلسة يبقى يدوي من اللوحة.
-- ============================================================================

alter table public.customer_sessions
  add column if not exists human_takeover_at timestamptz,
  add column if not exists human_ack_at timestamptz;

comment on column public.customer_sessions.human_takeover_at is
  'متى صار human_takeover = true آخر مرة؛ يكتبه trigger stamp_human_takeover بس — الترحيل ٠٣٠';
comment on column public.customer_sessions.human_ack_at is
  'متى انرسل رد الانتظار للزبون بالتحويل الحالي (null = ما انرسل). يصفّره trigger stamp_human_takeover — الترحيل ٠٣٠';

create or replace function public.stamp_human_takeover()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.human_takeover, false) then
      new.human_takeover_at := coalesce(new.human_takeover_at, now());
    end if;
  elsif coalesce(new.human_takeover, false) is distinct from coalesce(old.human_takeover, false) then
    new.human_takeover_at := case when coalesce(new.human_takeover, false) then now() end;
    new.human_ack_at := null;
  end if;
  return new;
end;
$function$;

comment on function public.stamp_human_takeover() is
  'يمشي human_takeover_at و human_ack_at كلما تقلّب human_takeover (أي كاتب) — الترحيل ٠٣٠';

revoke execute on function public.stamp_human_takeover() from anon, authenticated, public;

drop trigger if exists trg_stamp_human_takeover on public.customer_sessions;
create trigger trg_stamp_human_takeover
  before insert or update of human_takeover on public.customer_sessions
  for each row execute function public.stamp_human_takeover();
