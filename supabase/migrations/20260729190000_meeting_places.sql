-- =====================================================================
-- [OFFICE] 회의실 지점 원장 분리 — meeting_rooms를 branches에서 떼어낸다
-- 설계: 회의실 예약 탭 목록은 지사 원장(branches)과 별도로 관리한다
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=office / 등급=Internal / 접근=내부 임직원(외부 게스트 제외)
--   - 지점 쓰기 = admin 전용(ADMIN '회의실 관리' 콘솔)
--   - DELETE 정책 없음(soft delete: deleted_at) + 비활성(is_active)로 탭에서 숨김
--   - 정책은 app.is_internal_user()/app.is_admin() 헬퍼만 경유
--   - 감사 로그: 사내 회의실 위치 목록(개인정보·다운로드·권한변경 아님)이라 미대상
-- 배경: 20260728150000_branches.sql이 meeting_branches를 전사 지사 원장(branches)으로
--       승격시키면서 회의실 예약 탭이 지사 목록과 같아졌다. 지사는 조직 정보(주소·전화·
--       배정인력)이고 회의실 지점은 "예약 화면의 장소 탭"이라 생명주기가 다르다 —
--       지사를 하나 추가하면 회의실 없는 빈 탭이 생기고, 지사를 비활성화하면 그 자리의
--       회의실 예약이 통째로 사라진다. 다시 분리해 각자 자기 목록을 갖게 한다.
-- 근거: 20260728120000_meeting_rooms.sql(원 설계), 20260705120200_rls_helpers.sql(app.* 헬퍼)
-- =====================================================================

-- 1. 회의실 지점 원장 ---------------------------------------------------
create table if not exists public.meeting_places (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,   -- 소프트 비활성화(예약 탭에서 숨김)
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_meeting_places_order
  on public.meeting_places (sort_order, name);

-- 2. 회의실의 소속 컬럼 이름 교체(branch_id → place_id) -------------------
-- 값(uuid)은 그대로 두고 이름만 바꾼다. 아래 3에서 같은 id로 지점을 복제하므로
-- 기존 회의실·예약 데이터는 한 건도 옮기지 않는다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'meeting_rooms' and column_name = 'branch_id'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'meeting_rooms' and column_name = 'place_id'
  ) then
    alter table public.meeting_rooms rename column branch_id to place_id;
  end if;

  if to_regclass('public.idx_meeting_rooms_branch') is not null
     and to_regclass('public.idx_meeting_rooms_place') is null then
    alter index public.idx_meeting_rooms_branch rename to idx_meeting_rooms_place;
  end if;
end $$;

create index if not exists idx_meeting_rooms_place
  on public.meeting_rooms (place_id, sort_order, name);

-- 3. 초기 지점 = 지금 회의실이 걸려 있는 지사만 복제 ----------------------
-- 지사 id를 그대로 재사용해 meeting_rooms.place_id가 즉시 유효해진다.
-- 회의실이 없는 지사는 복제하지 않는다 — 빈 탭이 생기는 것이 이번 분리의 원인이었다.
-- 최초 1회만 채우고(지점 원장이 비어 있을 때) 이후 목록은 ADMIN 콘솔이 소유한다.
insert into public.meeting_places (id, name, sort_order, is_active, created_by, created_at, deleted_at)
select b.id, b.name, b.sort_order, b.is_active, b.created_by, b.created_at, b.deleted_at
  from public.branches b
 where exists (select 1 from public.meeting_rooms r where r.place_id = b.id)
   and not exists (select 1 from public.meeting_places)
on conflict (id) do nothing;

-- 4. 외래키 재연결 ------------------------------------------------------
alter table public.meeting_rooms
  drop constraint if exists meeting_rooms_branch_id_fkey;
alter table public.meeting_rooms
  drop constraint if exists meeting_rooms_place_id_fkey;
alter table public.meeting_rooms
  add constraint meeting_rooms_place_id_fkey
  foreign key (place_id) references public.meeting_places(id);

-- 5. RLS ----------------------------------------------------------------
alter table public.meeting_places enable row level security;

-- 지점: 내부 사용자 조회(OFFICE 회의실 예약), admin만 등록/변경(ADMIN 회의실 관리).
drop policy if exists meeting_places_select on public.meeting_places;
create policy meeting_places_select on public.meeting_places for select
  using (app.is_internal_user());

drop policy if exists meeting_places_insert on public.meeting_places;
create policy meeting_places_insert on public.meeting_places for insert
  with check (app.is_admin());

drop policy if exists meeting_places_update on public.meeting_places;
create policy meeting_places_update on public.meeting_places for update
  using (app.is_admin())
  with check (app.is_admin());

-- 6. 트리거 --------------------------------------------------------------
drop trigger if exists trg_meeting_places_updated_at on public.meeting_places;
create trigger trg_meeting_places_updated_at
  before update on public.meeting_places
  for each row execute function app.set_updated_at();

-- 등록자 스탬프(클라이언트 입력을 신뢰하지 않는다) — 지사와 동일 함수 재사용.
drop trigger if exists trg_meeting_places_stamp on public.meeting_places;
create trigger trg_meeting_places_stamp
  before insert on public.meeting_places
  for each row execute function app.stamp_meeting_creator();

-- 7. 코멘트 -------------------------------------------------------------
comment on table public.meeting_places is
  'OFFICE 회의실 예약 전용 지점(탭) 원장. 지사 원장(public.branches)과 연동하지 않는 독립 목록 — '
  '세팅=ADMIN 회의실 관리, 조회=내부 임직원. 쓰기=admin 전용';
comment on column public.meeting_rooms.place_id is
  '소속 회의실 지점(public.meeting_places). 지사(branches)와 무관한 예약 전용 목록이다.';

comment on table public.branches is
  '전사 지사 원장(지사명·주소·전화번호). 세팅=ADMIN 지사 관리, 조회=OFFICE 지사 정보. '
  '회의실 예약 지점(meeting_places)과는 연동하지 않는다. 쓰기=admin 전용';
