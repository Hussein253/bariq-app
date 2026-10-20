-- ============================================================================
-- 028 — الرسائل الصوتية: الملف نفسه محفوظ، يُشغَّل من لوحة المحادثات
-- ============================================================================
--
-- المشكلة:
-- مسار ماسنجر ينزّل الرسالة الصوتية من رابط Meta المؤقت، يفرّغها نصاً، ويسجّل
-- النص وحده في conversation_log («[رسالة صوتية]: ...»). رابط Meta ينتهي بعد
-- ساعات، فلا يُخزَّن رابطاً — والملف لا يُحفظ في أي مكان. فالتاجر يرى التفريغ
-- ولا يستطيع سماع الزبون، والتفريغ قد يخطئ في اسم منطقة أو رقم.
--
-- الحل:
--   • n8n يرفع الملف بعد تنزيله مباشرةً إلى حاوية Storage خاصة
--     conversation-media، في مجلد التاجر (المسار أدناه).
--   • المسار يُحمل مع الرسالة: message_buffer (رسالة واحدة) ← conversation_log
--     (الدفعة المجمّعة: عدة رسائل في صف واحد بعد انتظار التجميع) ← messages
--     عبر محفّز المزامنة.
--   • اللوحة تطلب رابطاً موقّعاً قصير العمر بجلسة المستخدم، وسياسة الحاوية
--     تحصره في ملفات تاجره. لا رابط عام ولا رابط دائم.
--
-- شكل العمود media (JSON Schema — مصفوفة بترتيب الرسائل في الدفعة):
--   [ { "type": "audio",
--       "path": "<merchant_id>/<platform>/<account_external_id>/<customer_id>/<message_id>.<ext>",
--       "mime_type": "audio/mp4" } ]
--   path نسبي داخل الحاوية conversation-media. أول مقطع فيه هو التاجر — عليه
--   تقوم سياسة القراءة. null أو [] = رسالة بلا ملف (كل الرسائل قبل هذا الترحيل).
--
-- ⚠️ لا قيد CHECK على عمودي n8n (conversation_log و message_buffer): قيمة
-- غير متوقعة من n8n كانت ستُفشل إدراج الرسالة نفسها فيضيع سجل الزبون. المحفّز
-- ينقل المصفوفة وحدها ويتجاهل غيرها (مبدأ الترحيل ٠٠٨: لا يُكسر مسار البوت).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) الأعمدة
-- ----------------------------------------------------------------------------

alter table public.conversation_log add column if not exists media jsonb;
alter table public.message_buffer add column if not exists media jsonb;
alter table public.messages add column if not exists media jsonb;

alter table public.messages drop constraint if exists messages_media_is_array;
alter table public.messages add constraint messages_media_is_array
  check (media is null or jsonb_typeof(media) = 'array');

comment on column public.conversation_log.media is
  'ملفات الرسالة في حاوية conversation-media: [{type, path, mime_type}] بترتيب رسائل الدفعة. تكتبه n8n؛ المحفّز ينقله إلى messages.media. null أو [] = بلا ملف.';
comment on column public.message_buffer.media is
  'ملف هذه الرسالة الواحدة (مصفوفة بعنصر واحد أو فارغة) — تجمعه «Combine Buffered Messages» إلى conversation_log.media.';
comment on column public.messages.media is
  'ملفات الرسالة في حاوية conversation-media الخاصة: [{type, path, mime_type}]. اللوحة تطلب لكل path رابطاً موقّعاً بجلسة المستخدم.';

-- ----------------------------------------------------------------------------
-- 2) الحاوية: خاصة، صوت فقط، ٢٥ ميغابايت (حد مرفقات Meta)
--
-- ماسنجر يرسل المقطع الصوتي بنوع video/mp4؛ n8n يرفعه بنوع audio/mp4.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conversation-media', 'conversation-media', false, 26214400, array['audio/*'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 3) القراءة: فريق برق كل الملفات، والتاجر مجلده وحده
--
-- إنشاء رابط موقّع يمرّ بصلاحية SELECT على storage.objects. الكتابة لـ n8n
-- وحده بمفتاح service_role (يتجاوز RLS)، فلا سياسة إدراج ولا تعديل ولا حذف.
-- ----------------------------------------------------------------------------

drop policy if exists conversation_media_select_scoped on storage.objects;
create policy conversation_media_select_scoped
  on storage.objects for select to authenticated
  using (
    bucket_id = 'conversation-media'
    and (
      (select public.auth_role()) = any (array['platform_owner', 'staff'])
      or (storage.foldername(name))[1] = (select public.auth_merchant_id())::text
    )
  );

-- ----------------------------------------------------------------------------
-- 4) دالة المزامنة — نسختها الحية (pg_get_functiondef بتاريخ ٢٠٢٦-١٠-٢٠،
--    مطابقة للترحيل ٠١٩) حرفياً، إلا نقل media ونوع الرسالة
-- ----------------------------------------------------------------------------

create or replace function public.sync_live_n8n_messages()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conversation_id uuid;
  v_content         text;
  v_sender          text;
  v_platform        text;
  v_created_at      timestamptz;
  v_direction       text;
  v_sender_raw      text;
  v_media           jsonb;
  v_message_type    text;
begin
  v_content    := nullif(btrim(coalesce(new.message, new.message_text)), '');
  v_created_at := coalesce(new.created_at, now());

  if new.phone_number is null or v_content is null then
    return null;
  end if;

  -- المنصة: تُؤخذ من السجل، وتُطبَّع إلى القيم المعتمدة.
  -- أي قيمة غير معروفة تعود إلى 'whatsapp' حفاظاً على اتساق المحادثات.
  v_platform := lower(btrim(coalesce(new.platform, 'whatsapp')));
  if v_platform not in ('whatsapp', 'messenger', 'instagram', 'telegram') then
    v_platform := 'whatsapp';
  end if;

  -- تطبيع الاتجاه والمرسل قبل المطابقة (حالة الأحرف والمسافات)
  v_direction  := lower(btrim(coalesce(new.direction, '')));
  v_sender_raw := lower(btrim(coalesce(new.sender, '')));

  -- direction هو المرجع القاطع؛ sender احتياطي عند غيابه
  -- تقبل الآن الاختصارات in/out التي يكتبها وكيل n8n
  v_sender := case
    when v_direction  in ('incoming', 'inbound', 'in')   then 'customer'
    when v_direction  in ('outgoing', 'outbound', 'out') then 'bot'
    when v_sender_raw = 'customer'                       then 'customer'
    when v_sender_raw = 'bot'                            then 'bot'
    else null
  end;

  if v_sender is null then
    v_sender := 'system';
    begin
      insert into public.failed_events
        (workflow_name, node_name, phone_number, raw_input, error_message, status)
      values
        ('sync_live_n8n_messages', 'conversation_log_trigger', new.phone_number,
         to_jsonb(new),
         'تعذر تحديد المرسل: direction و sender غير معروفين — سُجّلت الرسالة كـ system',
         'OPEN');
    exception when others then null;
    end;
  end if;

  -- الملفات (الترحيل ٠٢٨): مصفوفة غير فارغة وحدها، وما عداها رسالة بلا ملف
  v_media := case
    when jsonb_typeof(new.media) = 'array' and jsonb_array_length(new.media) > 0 then new.media
    else null
  end;
  v_message_type := case
    when v_media is not null and v_media @> '[{"type": "audio"}]'::jsonb then 'audio'
    else 'text'
  end;

  -- النسبة كلها في resolve_conversation (الترحيل ٠١٩)
  v_conversation_id := public.resolve_conversation(new.phone_number, v_platform, new.account_external_id);

  if v_conversation_id is null then
    return null;
  end if;

  insert into public.messages (conversation_id, sender_type, message_type, content, created_at, media)
  values (v_conversation_id, v_sender, v_message_type, v_content, v_created_at, v_media)
  on conflict do nothing;

  return null;

exception when others then
  begin
    insert into public.failed_events
      (workflow_name, node_name, phone_number, raw_input, error_message, status)
    values
      ('sync_live_n8n_messages', 'conversation_log_trigger', new.phone_number,
       to_jsonb(new), 'فشل المزامنة: ' || sqlerrm, 'OPEN');
  exception when others then null;
  end;
  return null;
end;
$function$;

revoke execute on function public.sync_live_n8n_messages() from anon, authenticated, public;

-- ----------------------------------------------------------------------------
-- التحقق بعد التشغيل
-- ----------------------------------------------------------------------------
-- select id, public, allowed_mime_types from storage.buckets where id = 'conversation-media';  -- false, {audio/*}
-- select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects';  -- conversation_media_select_scoped
-- select position('v_media' in pg_get_functiondef('public.sync_live_n8n_messages'::regproc)) > 0;  -- true
