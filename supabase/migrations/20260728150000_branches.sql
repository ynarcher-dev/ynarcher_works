-- =====================================================================
-- [OFFICE/ADMIN] 지사 원장 승격 — meeting_branches → branches + 주소·전화·배정인력
-- 설계: ADMIN '지사 관리'가 세팅(SSOT), OFFICE '지사 정보'가 조회
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=office / 등급=Internal / 접근=내부 임직원(외부 게스트 제외)
--   - 지사 원장 쓰기 = admin 전용(ADMIN '지사 관리' 콘솔)
--   - 배정인력(branch_members)은 write RLS 정책 없음(Default Deny) →
--     public.set_branch_members() RPC 한 곳으로만 쓰기 경로를 모은다(회의록 명단 패턴 준용).
--     PostgREST는 public만 노출하므로 클라이언트 호출 RPC는 app이 아닌 public에 둔다
--     (20260723170000에서 겪은 404 회귀 방지).
--   - DELETE 정책 없음. 지사 원장은 soft delete(deleted_at)+비활성(is_active),
--     배정인력은 이력이 아니라 "현재 배정 명단"이라 RPC 안에서 전체 교체(delete+insert)한다.
--   - 감사 로그: 사내 조직 정보(개인정보 원본·다운로드·권한변경 아님)라 audit_logs 미대상.
--   - 배정인력은 임직원 이름만 노출하며 연락처·이메일을 비정규화하지 않는다.
-- 배경: 20260728120000_meeting_rooms.sql이 만든 meeting_branches는 회의실 탭 전용 목록이었으나,
--       지사(지사명·주소·전화번호·배정인력)는 회의실과 무관하게 전사에서 쓰는 조직 정보다.
--       목록을 둘로 나누면 같은 지사가 두 원장에 생기므로 기존 테이블을 승격시켜 단일 원장으로 둔다.
-- 근거: 20260723140000_office_meeting_minutes.sql(명단=RPC 전용 쓰기 패턴),
--       20260705120200_rls_helpers.sql(app.* 헬퍼 규약)
-- =====================================================================

-- 1. 테이블 승격(rename) -----------------------------------------------
-- 이미 승격된 DB에서 재실행해도 안전하도록 양쪽 존재 여부를 함께 확인한다.
-- FK(meeting_rooms.branch_id)·PK·트리거는 rename을 자동으로 따라간다.
do $$
begin
  if to_regclass('public.meeting_branches') is not null
     and to_regclass('public.branches') is null then
    alter table public.meeting_branches rename to branches;
  end if;

  if to_regclass('public.idx_meeting_branches_order') is not null
     and to_regclass('public.idx_branches_order') is null then
    alter index public.idx_meeting_branches_order rename to idx_branches_order;
  end if;
end $$;

-- 2. 지사 속성 추가 -----------------------------------------------------
alter table public.branches
  add column if not exists address text,   -- 지사 주소(자유입력 1줄)
  add column if not exists phone   text;   -- 대표 전화번호(자유입력, 형식 강제 없음)

-- 3. 배정인력 조인 ------------------------------------------------------
-- 한 지사에 여러 임직원이 배정되고, 한 임직원이 여러 지사에 배정될 수 있다(다대다).
create table if not exists public.branch_members (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  sort_order  integer not null default 0,   -- 화면 표기 순서(입력 순서 보존)
  created_at  timestamptz not null default now(),
  unique (branch_id, user_id)
);
create index if not exists idx_branch_members_branch
  on public.branch_members (branch_id, sort_order);
create index if not exists idx_branch_members_user
  on public.branch_members (user_id);

-- 4. 배정인력 쓰기 RPC(admin 전용, 명단 전체 교체) -----------------------
-- 조인 테이블에 write 정책을 두지 않으므로(Default Deny) 쓰기는 이 함수만 가능하다.
-- SECURITY DEFINER지만 첫 줄에서 호출자 권한을 직접 검사하고, 외부 역할 계정은
-- 배정 대상에서 걸러낸다(임직원 원장은 MANAGEMENT 소유 — 여기서 생성하지 않는다).
-- 클라이언트(supabase.rpc)가 직접 호출하므로 public 스키마에 둔다.
create or replace function public.set_branch_members(p_branch_id uuid, p_user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.is_admin() then
    raise exception '지사 배정인력은 관리자만 변경할 수 있습니다.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.branches where id = p_branch_id and deleted_at is null
  ) then
    raise exception '존재하지 않는 지사입니다.' using errcode = '22023';
  end if;

  delete from public.branch_members where branch_id = p_branch_id;

  insert into public.branch_members (branch_id, user_id, sort_order)
  select p_branch_id, u.id, t.ord::integer
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) with ordinality as t(uid, ord)
    join public.users u on u.id = t.uid
   where u.deleted_at is null
     and u.user_type::text not in ('external_startup', 'external_expert', 'temporary_guest')
  on conflict (branch_id, user_id) do nothing;   -- 입력에 같은 사람이 중복돼도 1행
end $$;

revoke all on function public.set_branch_members(uuid, uuid[]) from public;
grant execute on function public.set_branch_members(uuid, uuid[]) to authenticated;

comment on function public.set_branch_members(uuid, uuid[]) is
  '지사 배정인력 명단 일괄 교체. 관리자만 실행 가능(함수 내부 검사). 조인 테이블은 write RLS 정책 없음(Default Deny)이라 이 RPC가 유일한 쓰기 경로.';

-- 5. RLS ----------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.branch_members enable row level security;

-- 승격 전 이름으로 만들어진 정책을 정리하고 새 이름으로 다시 만든다(정책 내용은 동일).
drop policy if exists meeting_branches_select on public.branches;
drop policy if exists meeting_branches_insert on public.branches;
drop policy if exists meeting_branches_update on public.branches;

-- 지사: 내부 사용자 조회(OFFICE '지사 정보'), admin만 등록/변경(ADMIN '지사 관리').
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select
  using (app.is_internal_user());

drop policy if exists branches_insert on public.branches;
create policy branches_insert on public.branches for insert
  with check (app.is_admin());

drop policy if exists branches_update on public.branches;
create policy branches_update on public.branches for update
  using (app.is_admin())
  with check (app.is_admin());

-- 배정인력: 지사를 볼 수 있는 내부 사용자면 조회 가능. 쓰기 정책 없음(RPC 전용, Default Deny).
drop policy if exists branch_members_select on public.branch_members;
create policy branch_members_select on public.branch_members for select
  using (app.is_internal_user());

-- 6. 트리거 --------------------------------------------------------------
-- rename을 따라온 기존 트리거를 새 이름으로 정리한다(동작은 동일).
drop trigger if exists trg_meeting_branches_updated_at on public.branches;
drop trigger if exists trg_meeting_branches_stamp on public.branches;

drop trigger if exists trg_branches_updated_at on public.branches;
create trigger trg_branches_updated_at
  before update on public.branches
  for each row execute function app.set_updated_at();

drop trigger if exists trg_branches_stamp on public.branches;
create trigger trg_branches_stamp
  before insert on public.branches
  for each row execute function app.stamp_meeting_creator();

-- 7. 코멘트 -------------------------------------------------------------
comment on table public.branches is
  '전사 지사 원장(지사명·주소·전화번호). 세팅=ADMIN 지사 관리, 조회=OFFICE 지사 정보. '
  '회의실(meeting_rooms)이 이 원장을 참조한다. 쓰기=admin 전용';
comment on table public.branch_members is
  '지사 배정인력(다대다). 쓰기는 public.set_branch_members() RPC 전용(조인 테이블 write 정책 없음)';
comment on column public.branches.address is '지사 주소(자유입력)';
comment on column public.branches.phone is '지사 대표 전화번호(자유입력)';
