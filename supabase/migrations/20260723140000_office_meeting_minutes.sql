-- =====================================================================
-- [Phase 5] OFFICE 회의록(Meeting Minutes) 데이터 계층
-- 설계 정본: docs/docs_master/CLAUDE.md(작성자·담당자·기여자 3축) + 본 세션 결정.
--
-- 핵심 구조(3역할 모델):
-- - 작성자(From)  = meeting_minutes.author_id (등록자 1명, 서버 스탬프).
-- - 참석자(To)/참조(CC) = meeting_minute_people(role) 조인 테이블. 열람 권한은 동일,
--   구분은 의미·표시용(참석자=참석함 / 참조=공유받음).
-- - 공개범위(visibility): OFFICE(전사 공개) / PARTICIPANTS(참석자 한정). 글마다 토글하며
--   기본값은 안전한 PARTICIPANTS(Default Deny — 실수 시 '덜 보이는' 쪽으로 샌다).
--
-- 열람 판정: OFFICE면 office 읽기 권한자 전원, PARTICIPANTS면 작성자+태그된 사람만.
--   전자결재(is_approval_*) 재귀 회피 패턴을 이식해 SECURITY DEFINER 헬퍼로 판정한다.
--
-- 명단(참석자/참조) 쓰기는 작성자 본인만 가능하며 app.set_minute_people() RPC로만 수행한다.
--   조인 테이블에는 write RLS 정책을 두지 않아(Default Deny) 직접 INSERT/UPDATE/DELETE를
--   모두 차단하고, 권한 검사를 함수 내부에서 먼저 수행하는 RPC 한 곳으로 쓰기 경로를 모은다.
--
-- 근거: 20260720200000_office_boards.sql(office 워크스페이스 게이트·스탬프·트리거 패턴),
--       20260707130000_approval_rls_recursion_fix.sql(관련자 열람 SECURITY DEFINER 헬퍼),
--       20260705120200_rls_helpers.sql(app.* 헬퍼 규약)
-- =====================================================================

-- 1. 열거형 ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'minute_visibility') then
    create type public.minute_visibility as enum ('OFFICE', 'PARTICIPANTS');
  end if;
  if not exists (select 1 from pg_type where typname = 'minute_person_role') then
    create type public.minute_person_role as enum ('ATTENDEE', 'REFERENCE');
  end if;
end $$;

-- 2. 회의록 원장 --------------------------------------------------------
create table if not exists public.meeting_minutes (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  meeting_date  date,
  location      text,                                     -- 회의 장소(회의실 예약 연동 여지, 자유입력)
  agenda        text,                                     -- 안건
  discussion    text,                                     -- 논의 내용(본문)
  decisions     text,                                     -- 결정 사항
  visibility    public.minute_visibility not null default 'PARTICIPANTS',
  author_id     uuid references public.users(id),
  author_name   text,                                     -- users RLS 우회 표시용 비정규화(서버 스탬프)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_meeting_minutes_feed
  on public.meeting_minutes (meeting_date desc, created_at desc)
  where deleted_at is null;
create index if not exists idx_meeting_minutes_author
  on public.meeting_minutes (author_id)
  where deleted_at is null;

-- 3. 참석자·참조 조인 ---------------------------------------------------
create table if not exists public.meeting_minute_people (
  id          uuid primary key default gen_random_uuid(),
  minute_id   uuid not null references public.meeting_minutes(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  role        public.minute_person_role not null default 'ATTENDEE',
  created_at  timestamptz not null default now(),
  unique (minute_id, user_id)                              -- 한 사람은 참석자·참조 중 하나만
);
create index if not exists idx_minute_people_minute on public.meeting_minute_people (minute_id);
create index if not exists idx_minute_people_user on public.meeting_minute_people (user_id);

-- 4. 접근 판정 헬퍼 -----------------------------------------------------
-- 전자결재 상호재귀 회피와 동일한 규약: 교차 테이블(원장↔명단) 조회를 SECURITY DEFINER로
-- 이관해 RLS를 우회하므로 정책 간 재귀 고리가 생기지 않는다. 호출자 권한은 함수 내부의
-- app.* 헬퍼(can_read_workspace/current_app_user_id/is_admin)로 판정한다.

-- 회의록 1건을 요청자가 열람할 수 있는가(원장 SELECT + 명단 SELECT 공용).
create or replace function app.can_read_minute(p_minute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.meeting_minutes m
     where m.id = p_minute_id
       and m.deleted_at is null
       and (
         m.author_id = app.current_app_user_id()
         or (m.visibility = 'OFFICE' and app.can_read_workspace('office'))
         or exists (
           select 1
             from public.meeting_minute_people p
            where p.minute_id = m.id
              and p.user_id = app.current_app_user_id()
         )
       )
  );
$$;

-- 요청자가 해당 회의록의 작성자인가(명단 쓰기 권한 판정).
create or replace function app.is_minute_author(p_minute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.meeting_minutes m
     where m.id = p_minute_id
       and m.deleted_at is null
       and m.author_id = app.current_app_user_id()
  );
$$;

revoke all on function app.can_read_minute(uuid) from public;
revoke all on function app.is_minute_author(uuid) from public;
grant execute on function app.can_read_minute(uuid) to authenticated;
grant execute on function app.is_minute_author(uuid) to authenticated;

-- 5. 명단 일괄 교체 RPC -------------------------------------------------
-- 참석자/참조 명단은 이 RPC로만 변경한다. 조인 테이블에 write RLS 정책이 없어(Default Deny)
-- 직접 INSERT/UPDATE/DELETE는 전부 차단되며, 쓰기 경로가 여기 하나로 모인다.
-- SECURITY DEFINER지만 첫 줄에서 작성자/관리자 권한을 직접 확인한 뒤에만 진행한다.
-- p_people 예: '[{"user_id":"...","role":"ATTENDEE"},{"user_id":"...","role":"REFERENCE"}]'
create or replace function app.set_minute_people(p_minute_id uuid, p_people jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not (app.is_admin() or app.is_minute_author(p_minute_id)) then
    raise exception '회의록 작성자만 참석자·참조를 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  delete from public.meeting_minute_people where minute_id = p_minute_id;

  insert into public.meeting_minute_people (minute_id, user_id, role)
  select p_minute_id,
         (elem->>'user_id')::uuid,
         coalesce((elem->>'role')::public.minute_person_role, 'ATTENDEE')
    from jsonb_array_elements(coalesce(p_people, '[]'::jsonb)) as elem
   where elem->>'user_id' is not null
  on conflict (minute_id, user_id) do update set role = excluded.role;
end $$;

revoke all on function app.set_minute_people(uuid, jsonb) from public;
grant execute on function app.set_minute_people(uuid, jsonb) to authenticated;

-- 6. RLS ----------------------------------------------------------------
alter table public.meeting_minutes enable row level security;
alter table public.meeting_minute_people enable row level security;

-- 회의록 원장: 열람은 can_read_minute(작성자/전사공개/태그/관리자)로 판정.
drop policy if exists meeting_minutes_select on public.meeting_minutes;
create policy meeting_minutes_select on public.meeting_minutes for select
  using (app.can_read_minute(id));

-- 등록: office 쓰기 권한자. 작성자는 트리거가 스탬프한다.
drop policy if exists meeting_minutes_insert on public.meeting_minutes;
create policy meeting_minutes_insert on public.meeting_minutes for insert
  with check (app.can_write_workspace('office'));

-- 수정/소프트삭제: 작성자 본인 또는 admin.
drop policy if exists meeting_minutes_update on public.meeting_minutes;
create policy meeting_minutes_update on public.meeting_minutes for update
  using (app.is_admin() or author_id = app.current_app_user_id())
  with check (app.is_admin() or author_id = app.current_app_user_id());

-- 참석자·참조 명단: 읽기는 회의록을 볼 수 있는 사람만. 쓰기 정책 없음(RPC 전용, Default Deny).
drop policy if exists minute_people_select on public.meeting_minute_people;
create policy minute_people_select on public.meeting_minute_people for select
  using (app.can_read_minute(minute_id));

-- 7. 트리거 --------------------------------------------------------------
drop trigger if exists trg_meeting_minutes_updated_at on public.meeting_minutes;
create trigger trg_meeting_minutes_updated_at
  before update on public.meeting_minutes
  for each row execute function app.set_updated_at();

-- 작성자 스탬프: 클라이언트 입력을 신뢰하지 않고 세션 사용자로 채운다.
create or replace function app.stamp_meeting_minute()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if TG_OP = 'INSERT' then
    if NEW.author_id is null then
      NEW.author_id := app.current_app_user_id();
    end if;
    if NEW.author_name is null and NEW.author_id is not null then
      select u.name into NEW.author_name from public.users u where u.id = NEW.author_id;
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_meeting_minutes_stamp on public.meeting_minutes;
create trigger trg_meeting_minutes_stamp
  before insert on public.meeting_minutes
  for each row execute function app.stamp_meeting_minute();

-- 8. 코멘트 --------------------------------------------------------------
comment on table public.meeting_minutes is
  'OFFICE 회의록. visibility=OFFICE(전사 공개)/PARTICIPANTS(참석자 한정). 열람 판정 app.can_read_minute()';
comment on table public.meeting_minute_people is
  '회의록 참석자(ATTENDEE)/참조(REFERENCE) 명단. 쓰기는 app.set_minute_people() RPC 전용(직접 write 차단)';
comment on column public.meeting_minutes.visibility is
  'OFFICE=office 읽기 권한자 전원 / PARTICIPANTS=작성자+명단(참석자·참조)만. 기본 PARTICIPANTS';
