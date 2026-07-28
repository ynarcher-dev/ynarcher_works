-- =====================================================================
-- [OFFICE] 회의실 예약 시스템 — 지사·회의실 원장 + 예약
-- 설계: docs/docs_master 작업 규칙(OFFICE=예약 허브, ADMIN=설정)
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=office / 등급=Internal / 접근=내부 임직원(게스트 제외)
--   - 지사·회의실 설정 쓰기 = admin 전용(ADMIN '회의실 관리' 콘솔)
--   - 예약 쓰기 = 모든 내부 임직원(본인 예약만 INSERT), 취소 = 본인·admin
--   - DELETE 정책 없음(soft delete: deleted_at). 정책은 app.* 헬퍼만 경유.
--   - 감사 로그: 사내 일정 예약(개인정보·다운로드·권한변경 아님)이라 audit_logs 미대상.
--     예약자·취소자 추적은 행의 created_by/cancelled_by로 남긴다.
--   - 회의실 사진은 공개 마케팅성 이미지가 아닌 내부 안내용이나, 공개 URL 표시 편의를 위해
--     public 버킷을 쓰되 업로드(쓰기)는 admin으로 제한한다(program-posters 패턴 준용).
-- 근거: 20260720200000_office_boards.sql(스탬프/RLS/트리거 패턴),
--       20260705120200_rls_helpers.sql(app.* 헬퍼),
--       20260716180000_recruitment_poster_bucket.sql(공개 버킷 패턴)
-- =====================================================================

-- 0. 확장 --------------------------------------------------------------
-- 중복 예약 방지 EXCLUDE 제약에서 uuid 동등(=) + tsrange 겹침(&&)을 함께 색인하려면
-- btree_gist가 필요하다(Supabase 지원 확장).
create extension if not exists btree_gist with schema extensions;

-- 1. 헬퍼: 내부 사용자 여부 --------------------------------------------
-- 기존 can_use_attachment_storage()가 인라인하던 판정을 재사용 헬퍼로 승격.
-- 외부 역할(스타트업/전문가/임시 게스트)은 회의실 조회·예약에서 전부 차단된다.
create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or (app.current_app_user_id() is not null
          and app.current_app_role() not in
              ('external_startup', 'external_expert', 'temporary_guest'));
$$;

revoke all on function app.is_internal_user() from public;
grant execute on function app.is_internal_user() to authenticated;

-- 2. 지사 원장 --------------------------------------------------------
create table if not exists public.meeting_branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,      -- 소프트 비활성화(탭에서 숨김)
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_meeting_branches_order
  on public.meeting_branches (sort_order, name);

-- 3. 회의실 원장 ------------------------------------------------------
create table if not exists public.meeting_rooms (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references public.meeting_branches(id),
  name          text not null,
  location      text,                              -- 층·위치 표기(예: 6F)
  capacity      integer,                           -- 수용 인원
  photo_path    text,                              -- meeting-room-photos 버킷 키
  open_time     time not null default '09:00',     -- 예약 가능 시작 시각
  close_time    time not null default '18:00',     -- 예약 가능 종료 시각
  slot_minutes  integer not null default 30,       -- 예약 슬롯 단위(분)
  weekdays      smallint[] not null default '{1,2,3,4,5}',  -- 예약가능 요일(0=일..6=토)
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint meeting_rooms_time_order check (open_time < close_time),
  constraint meeting_rooms_slot check (slot_minutes in (10, 15, 20, 30, 60))
);
create index if not exists idx_meeting_rooms_branch
  on public.meeting_rooms (branch_id, sort_order, name);

-- 4. 예약 -------------------------------------------------------------
create table if not exists public.meeting_room_reservations (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.meeting_rooms(id),
  reserved_date  date not null,
  start_time     time not null,
  end_time       time not null,
  created_by     uuid not null references public.users(id),  -- 예약자(트리거 스탬프)
  created_by_name text,                                      -- users RLS 우회 표시용 비정규화(서버 스탬프)
  cancelled_by   uuid references public.users(id),
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz,                                -- soft cancel
  constraint reservation_time_order check (start_time < end_time)
);
create index if not exists idx_reservations_room_date
  on public.meeting_room_reservations (room_id, reserved_date)
  where deleted_at is null;
create index if not exists idx_reservations_mine
  on public.meeting_room_reservations (created_by, reserved_date)
  where deleted_at is null;

-- 같은 회의실에서 시간대가 겹치는 유효 예약을 원자적으로 차단.
-- tsrange 기본 '[)': 09:00~09:30 과 09:30~10:00 은 겹치지 않는다.
alter table public.meeting_room_reservations
  drop constraint if exists meeting_reservations_no_overlap;
alter table public.meeting_room_reservations
  add constraint meeting_reservations_no_overlap
  exclude using gist (
    room_id with =,
    tsrange((reserved_date + start_time)::timestamp,
            (reserved_date + end_time)::timestamp) with &&
  ) where (deleted_at is null);

-- 5. RLS --------------------------------------------------------------
alter table public.meeting_branches enable row level security;
alter table public.meeting_rooms enable row level security;
alter table public.meeting_room_reservations enable row level security;

-- 지사: 내부 사용자 조회, admin만 등록/변경.
drop policy if exists meeting_branches_select on public.meeting_branches;
create policy meeting_branches_select on public.meeting_branches for select
  using (app.is_internal_user());

drop policy if exists meeting_branches_insert on public.meeting_branches;
create policy meeting_branches_insert on public.meeting_branches for insert
  with check (app.is_admin());

drop policy if exists meeting_branches_update on public.meeting_branches;
create policy meeting_branches_update on public.meeting_branches for update
  using (app.is_admin())
  with check (app.is_admin());

-- 회의실: 내부 사용자 조회, admin만 등록/변경.
drop policy if exists meeting_rooms_select on public.meeting_rooms;
create policy meeting_rooms_select on public.meeting_rooms for select
  using (app.is_internal_user());

drop policy if exists meeting_rooms_insert on public.meeting_rooms;
create policy meeting_rooms_insert on public.meeting_rooms for insert
  with check (app.is_admin());

drop policy if exists meeting_rooms_update on public.meeting_rooms;
create policy meeting_rooms_update on public.meeting_rooms for update
  using (app.is_admin())
  with check (app.is_admin());

-- 예약: 내부 사용자 전원 조회(가용성 확인), 본인 예약만 INSERT, 취소는 본인·admin.
drop policy if exists meeting_reservations_select on public.meeting_room_reservations;
create policy meeting_reservations_select on public.meeting_room_reservations for select
  using (app.is_internal_user());

drop policy if exists meeting_reservations_insert on public.meeting_room_reservations;
create policy meeting_reservations_insert on public.meeting_room_reservations for insert
  with check (
    app.is_internal_user()
    and created_by = app.current_app_user_id()
  );

drop policy if exists meeting_reservations_update on public.meeting_room_reservations;
create policy meeting_reservations_update on public.meeting_room_reservations for update
  using (app.is_admin() or created_by = app.current_app_user_id())
  with check (app.is_admin() or created_by = app.current_app_user_id());

-- 6. 트리거 -----------------------------------------------------------
drop trigger if exists trg_meeting_branches_updated_at on public.meeting_branches;
create trigger trg_meeting_branches_updated_at
  before update on public.meeting_branches
  for each row execute function app.set_updated_at();

drop trigger if exists trg_meeting_rooms_updated_at on public.meeting_rooms;
create trigger trg_meeting_rooms_updated_at
  before update on public.meeting_rooms
  for each row execute function app.set_updated_at();

-- 지사·회의실 등록자 스탬프(클라이언트 입력을 신뢰하지 않는다).
create or replace function app.stamp_meeting_creator()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  return NEW;
end $$;

drop trigger if exists trg_meeting_branches_stamp on public.meeting_branches;
create trigger trg_meeting_branches_stamp
  before insert on public.meeting_branches
  for each row execute function app.stamp_meeting_creator();

drop trigger if exists trg_meeting_rooms_stamp on public.meeting_rooms;
create trigger trg_meeting_rooms_stamp
  before insert on public.meeting_rooms
  for each row execute function app.stamp_meeting_creator();

-- 예약 등록자 스탬프 + 회의실 운영시간·요일·슬롯 정합 검증.
-- 데이터 무결성 목적(누가 예약 가능한가는 RLS가 이미 강제). 대상 회의실을 읽어야 하므로
-- security definer로 원장을 직접 조회하되, 어떤 개인정보도 반환하지 않고 예외만 발생시킨다.
create or replace function app.stamp_validate_reservation()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  r public.meeting_rooms%rowtype;
  slot_sec integer;
begin
  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  if NEW.created_by_name is null and NEW.created_by is not null then
    select u.name into NEW.created_by_name from public.users u where u.id = NEW.created_by;
  end if;

  select * into r from public.meeting_rooms
   where id = NEW.room_id and deleted_at is null;
  if not found then
    raise exception '존재하지 않는 회의실입니다.';
  end if;
  if not r.is_active then
    raise exception '비활성화된 회의실은 예약할 수 없습니다.';
  end if;

  -- 예약가능 요일(0=일..6=토)
  if not (extract(dow from NEW.reserved_date)::smallint = any (r.weekdays)) then
    raise exception '해당 요일은 예약할 수 없는 회의실입니다.';
  end if;

  -- 운영시간 범위 내
  if NEW.start_time < r.open_time or NEW.end_time > r.close_time then
    raise exception '운영시간(% ~ %)을 벗어난 예약입니다.', r.open_time, r.close_time;
  end if;

  -- 슬롯 정렬(오픈 시각 기준 slot_minutes 배수)
  slot_sec := r.slot_minutes * 60;
  if mod(extract(epoch from (NEW.start_time - r.open_time))::integer, slot_sec) <> 0
     or mod(extract(epoch from (NEW.end_time - r.open_time))::integer, slot_sec) <> 0 then
    raise exception '예약 시간은 % 분 단위여야 합니다.', r.slot_minutes;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_reservations_stamp_validate on public.meeting_room_reservations;
create trigger trg_reservations_stamp_validate
  before insert on public.meeting_room_reservations
  for each row execute function app.stamp_validate_reservation();

-- 7. Storage — 회의실 사진(공개 버킷, 업로드는 admin) ------------------
insert into storage.buckets (id, name, public)
values ('meeting-room-photos', 'meeting-room-photos', true)
on conflict (id) do nothing;

drop policy if exists room_photo_objects_insert on storage.objects;
create policy room_photo_objects_insert on storage.objects for insert
  with check (bucket_id = 'meeting-room-photos' and app.is_admin());

drop policy if exists room_photo_objects_update on storage.objects;
create policy room_photo_objects_update on storage.objects for update
  using (bucket_id = 'meeting-room-photos' and app.is_admin())
  with check (bucket_id = 'meeting-room-photos' and app.is_admin());

-- 8. 코멘트 -----------------------------------------------------------
comment on table public.meeting_branches is
  'OFFICE 회의실 예약 전용 지사(탭) 원장. MANAGEMENT 지사 원장과는 연동하지 않는 독립 목록. 설정=admin';
comment on table public.meeting_rooms is
  '지사별 회의실. 운영시간(open/close)·슬롯 단위·예약가능 요일(0=일..6=토)·사진(photo_path). 설정=admin';
comment on table public.meeting_room_reservations is
  '회의실 예약(날짜·시작·종료). 예약자=created_by, 취소=soft delete(deleted_at/cancelled_by). 중복은 EXCLUDE 제약으로 차단';
