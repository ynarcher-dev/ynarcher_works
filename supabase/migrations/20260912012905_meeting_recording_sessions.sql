-- =====================================================================
-- OFFICE 회의 녹음 세션 / 분할 저장 원장
--
-- 보안 게이트
--   · 소유 워크스페이스: office
--   · 데이터 등급: Restricted (회의 음성 원본·전사·AI 초안)
--   · 접근 주체: 녹음 소유자, 연결된 회의록 열람자
--   · 쓰기 Scope: office write + 녹음 소유자
--   · 다운로드/외부 AI 전송: Edge Function에서 access_logs 적재 후 수행
--   · 삭제: 정책 없음. deleted_at 기반 soft delete만 허용
-- =====================================================================

begin;

create table public.meeting_recordings (
  id                 uuid primary key default gen_random_uuid(),
  minute_id          uuid references public.meeting_minutes(id),
  owner_id           uuid not null references public.users(id),
  status             text not null default 'RECORDING'
                     check (status in ('RECORDING', 'PROCESSING', 'READY', 'FAILED')),
  started_at         timestamptz not null default now(),
  stopped_at         timestamptz,
  duration_ms        bigint not null default 0 check (duration_ms >= 0),
  transcript         text,
  ai_draft           jsonb,
  error_code         text,
  last_activity_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

create index idx_meeting_recordings_minute
  on public.meeting_recordings (minute_id, created_at desc)
  where deleted_at is null;
create index idx_meeting_recordings_owner_active
  on public.meeting_recordings (owner_id, last_activity_at desc)
  where deleted_at is null;

create table public.meeting_recording_segments (
  id                 uuid primary key,
  recording_id       uuid not null references public.meeting_recordings(id) on delete cascade,
  segment_no         integer not null check (segment_no between 1 and 36),
  storage_path       text not null unique,
  file_name          text not null,
  mime_type          text not null check (mime_type in (
                       'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav',
                       'audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/aac'
                     )),
  byte_size          bigint not null check (byte_size > 0 and byte_size <= 14680064),
  duration_ms        integer not null check (duration_ms > 0 and duration_ms <= 420000),
  status             text not null default 'PENDING'
                     check (status in ('PENDING', 'UPLOADED', 'TRANSCRIBING', 'READY', 'FAILED')),
  transcript         text,
  error_code         text,
  attempt_count      integer not null default 0 check (attempt_count >= 0),
  uploaded_at        timestamptz,
  transcribed_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (recording_id, segment_no)
);

create index idx_meeting_recording_segments_work
  on public.meeting_recording_segments (recording_id, status, segment_no);

alter table public.meeting_recordings enable row level security;
alter table public.meeting_recording_segments enable row level security;

create or replace function app.can_read_recording(p_recording_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.meeting_recordings r
     where r.id = p_recording_id
       and r.deleted_at is null
       and (
         r.owner_id = (select app.current_app_user_id())
         or (r.minute_id is not null and app.can_read_minute(r.minute_id))
       )
  );
$$;

create or replace function app.can_write_recording(p_recording_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.can_write_workspace('office') and exists (
    select 1
      from public.meeting_recordings r
     where r.id = p_recording_id
       and r.owner_id = (select app.current_app_user_id())
       and r.deleted_at is null
  );
$$;

revoke all on function app.can_read_recording(uuid) from public;
revoke all on function app.can_write_recording(uuid) from public;
grant execute on function app.can_read_recording(uuid) to authenticated;
grant execute on function app.can_write_recording(uuid) to authenticated;

create policy meeting_recordings_select on public.meeting_recordings
  for select to authenticated
  using (app.can_read_recording(id));

create policy meeting_recording_segments_select on public.meeting_recording_segments
  for select to authenticated
  using (app.can_read_recording(recording_id));

-- 일반 클라이언트에는 직접 쓰기 권한을 주지 않는다. 아래 상태 전이 RPC만 쓸 수 있다.
revoke all on table public.meeting_recordings from anon, authenticated;
revoke all on table public.meeting_recording_segments from anon, authenticated;
grant select on table public.meeting_recordings to authenticated;
grant select on table public.meeting_recording_segments to authenticated;

create or replace function public.start_meeting_recording(p_minute_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_user uuid := app.current_app_user_id();
  v_id uuid;
begin
  if v_user is null or not app.can_write_workspace('office') then
    raise exception '회의 녹음 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_minute_id is not null and not app.is_minute_author(p_minute_id) then
    raise exception '회의록 작성자만 녹음을 연결할 수 있습니다.' using errcode = '42501';
  end if;

  insert into public.meeting_recordings (minute_id, owner_id)
  values (p_minute_id, v_user)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.prepare_meeting_recording_segment(
  p_segment_id uuid,
  p_recording_id uuid,
  p_segment_no integer,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_byte_size bigint,
  p_duration_ms integer
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.can_write_recording(p_recording_id) then
    raise exception '녹음 구간을 저장할 권한이 없습니다.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.meeting_recordings
     where id = p_recording_id and status = 'RECORDING' and deleted_at is null
  ) then
    raise exception '녹음 중인 세션이 아닙니다.' using errcode = '22023';
  end if;
  -- CASE는 괄호로 감싼다. plpgsql은 IF 조건을 첫 THEN에서 끊으므로 괄호가 없으면 42601이다.
  if p_storage_path <> p_recording_id::text || '/' || p_segment_id::text ||
      (case p_mime_type
        when 'audio/webm' then '.webm'
        when 'audio/mp4' then '.m4a'
        when 'audio/ogg' then '.ogg'
        when 'audio/wav' then '.wav'
        when 'audio/mpeg' then '.mp3'
        when 'audio/mp3' then '.mp3'
        when 'audio/x-m4a' then '.m4a'
        when 'audio/aac' then '.aac'
      end) then
    raise exception '스토리지 경로가 올바르지 않습니다.' using errcode = '22023';
  end if;

  insert into public.meeting_recording_segments (
    id, recording_id, segment_no, storage_path, file_name, mime_type, byte_size, duration_ms
  ) values (
    p_segment_id, p_recording_id, p_segment_no, p_storage_path,
    left(trim(p_file_name), 180), p_mime_type, p_byte_size, p_duration_ms
  )
  on conflict (id) do nothing;

  update public.meeting_recordings
     set last_activity_at = now(), updated_at = now()
   where id = p_recording_id;
end;
$$;

create or replace function app.can_upload_recording_object(p_path text)
returns boolean
language sql
stable
security definer
set search_path = app, public, storage
as $$
  select exists (
    select 1
      from public.meeting_recording_segments s
     where s.storage_path = p_path
       and s.status = 'PENDING'
       and app.can_write_recording(s.recording_id)
  );
$$;

revoke all on function app.can_upload_recording_object(text) from public;
grant execute on function app.can_upload_recording_object(text) to authenticated;

create or replace function public.complete_meeting_recording_segment(p_segment_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public, storage
as $$
declare
  v_segment public.meeting_recording_segments%rowtype;
begin
  select * into v_segment from public.meeting_recording_segments where id = p_segment_id;
  if v_segment.id is null or not app.can_write_recording(v_segment.recording_id) then
    raise exception '녹음 구간을 완료할 권한이 없습니다.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'meeting-recordings' and o.name = v_segment.storage_path
  ) then
    raise exception '업로드된 녹음 파일을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  update public.meeting_recording_segments
     set status = case when status = 'PENDING' then 'UPLOADED' else status end,
         uploaded_at = coalesce(uploaded_at, now()), updated_at = now()
   where id = p_segment_id;
end;
$$;

create or replace function public.finish_meeting_recording(p_recording_id uuid, p_duration_ms bigint)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.can_write_recording(p_recording_id) then
    raise exception '녹음을 종료할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_duration_ms < 0 then
    raise exception '녹음 시간이 올바르지 않습니다.' using errcode = '22023';
  end if;
  update public.meeting_recordings
     set status = 'PROCESSING', stopped_at = coalesce(stopped_at, now()),
         duration_ms = p_duration_ms, last_activity_at = now(), updated_at = now()
   where id = p_recording_id and status in ('RECORDING', 'FAILED');
end;
$$;

create or replace function public.attach_meeting_recording(p_recording_id uuid, p_minute_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.can_write_recording(p_recording_id) or not app.is_minute_author(p_minute_id) then
    raise exception '녹음을 회의록에 연결할 권한이 없습니다.' using errcode = '42501';
  end if;
  update public.meeting_recordings
     set minute_id = p_minute_id, updated_at = now(), last_activity_at = now()
   where id = p_recording_id and (minute_id is null or minute_id = p_minute_id);
  if not found then
    raise exception '이미 다른 회의록에 연결된 녹음입니다.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.complete_meeting_recording(
  p_recording_id uuid,
  p_transcript text,
  p_ai_draft jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.can_write_recording(p_recording_id) then
    raise exception '녹음 처리를 완료할 권한이 없습니다.' using errcode = '42501';
  end if;
  if length(coalesce(p_transcript, '')) > 240000 then
    raise exception '전사 내용이 너무 깁니다.' using errcode = '22023';
  end if;
  if p_ai_draft is null or jsonb_typeof(p_ai_draft) <> 'object' then
    raise exception 'AI 초안 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  update public.meeting_recordings
     set transcript = nullif(trim(p_transcript), ''), ai_draft = p_ai_draft,
         status = 'READY', error_code = null, last_activity_at = now(), updated_at = now()
   where id = p_recording_id;
end;
$$;

revoke all on function public.start_meeting_recording(uuid) from public, anon, service_role;
revoke all on function public.prepare_meeting_recording_segment(uuid, uuid, integer, text, text, text, bigint, integer) from public, anon, service_role;
revoke all on function public.complete_meeting_recording_segment(uuid) from public, anon, service_role;
revoke all on function public.finish_meeting_recording(uuid, bigint) from public, anon, service_role;
revoke all on function public.attach_meeting_recording(uuid, uuid) from public, anon, service_role;
revoke all on function public.complete_meeting_recording(uuid, text, jsonb) from public, anon, service_role;
grant execute on function public.start_meeting_recording(uuid) to authenticated;
grant execute on function public.prepare_meeting_recording_segment(uuid, uuid, integer, text, text, text, bigint, integer) to authenticated;
grant execute on function public.complete_meeting_recording_segment(uuid) to authenticated;
grant execute on function public.finish_meeting_recording(uuid, bigint) to authenticated;
grant execute on function public.attach_meeting_recording(uuid, uuid) to authenticated;
grant execute on function public.complete_meeting_recording(uuid, text, jsonb) to authenticated;

drop trigger if exists trg_meeting_recordings_updated_at on public.meeting_recordings;
create trigger trg_meeting_recordings_updated_at before update on public.meeting_recordings
  for each row execute function app.set_updated_at();
drop trigger if exists trg_meeting_recording_segments_updated_at on public.meeting_recording_segments;
create trigger trg_meeting_recording_segments_updated_at before update on public.meeting_recording_segments
  for each row execute function app.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-recordings', 'meeting-recordings', false, 14680064,
  array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/aac']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy meeting_recordings_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meeting-recordings'
    and app.can_upload_recording_object(name)
  );

comment on table public.meeting_recordings is
  '사용자에게 한 건으로 보이는 회의 녹음 세션. 원본/전사/AI 초안은 Restricted 등급이다.';
comment on table public.meeting_recording_segments is
  '장시간 녹음을 안전하게 자동 보존하기 위한 내부 물리 구간. UI에서는 세션 한 건으로 표시한다.';

commit;
