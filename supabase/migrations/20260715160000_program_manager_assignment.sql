-- =====================================================================
-- [Phase 7] 프로그램 담당자 배치 개념 정의(역할·수행 기간·투입률)
-- 개념(확정 스펙):
--   1) 담당자 복수 배치(기존 program_managers 다대다 유지).
--   2) 담당자별 수행 기간(start_date·end_date) 필수, 프로그램 기간 내.
--   3) 담당자별 투입률(allocation_rate, 정수 %) 필수 — 각 1~100, 프로그램 합 = 정확히 100.
--   4) 담당자별 역할(PM/MEMBER) 필수 — PM 최소 1명, PM 복수 허용.
--   * 적용 범위: AC 프로그램 담당자에만(startup_managers 등 미적용).
--
-- 강제 전략(합계=100·PM≥1 등 행 교차 불변식은 순수 CHECK로 못 걸림):
--   - 행 단위 유효성: 테이블 CHECK(allocation 1~100, end>=start) + role enum.
--   - 프로그램 단위 불변식: 원자적 저장 RPC set_program_managers()에서 전량 교체 + 검증.
--   - 쓰기 일원화: program_managers 직접 insert/update/delete RLS 정책 제거 →
--     오직 SECURITY DEFINER RPC로만 기록(UI 은닉이 아닌 서버 강제). SELECT 정책은 유지.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 SECURITY DEFINER 함수 set_program_managers 1건 → 함수 내부에서 자체 인가 강제
--     (app.is_admin() 또는 app.can_write_workspace('ac') + app.can_access_program()).
--     search_path 고정(app, public), 실행 권한은 authenticated 한정.
--   - 신규 Storage/개인정보 원본/Export 없음. 담당자=내부 사용자 참조(Internal 등급).
--   - 직접 쓰기 정책 제거는 권한 축소(tightening)이며, 정당 경로(RPC)를 함께 제공한다.
--   - 기존 행 backfill(정수 균등 분배 + 첫 담당자 PM)은 NOT NULL 승격을 위한 1회성 보정.
-- 근거: 20260715130000_program_managers.sql(junction·RLS), 20260705120200_rls_helpers.sql(헬퍼),
--       20260705160100_ac_eval_results_rpc.sql(RPC/grant 패턴)
-- =====================================================================

-- (1) 역할 enum -------------------------------------------------------------
do $$ begin
  create type public.program_manager_role as enum ('PM', 'MEMBER');
exception when duplicate_object then null; end $$;

-- (2) 컬럼 추가(우선 nullable로 두고 backfill 후 NOT NULL 승격) --------------
alter table public.program_managers
  add column if not exists role            public.program_manager_role not null default 'MEMBER',
  add column if not exists allocation_rate smallint,
  add column if not exists start_date      date,
  add column if not exists end_date        date;

-- (3) backfill: 투입률 정수 균등 분배(나머지는 첫 담당자) + 첫 담당자 PM 지정 --
with ranked as (
  select
    program_id,
    user_id,
    row_number() over (partition by program_id order by assigned_at, user_id) as rn,
    count(*)     over (partition by program_id)                               as cnt
  from public.program_managers
)
update public.program_managers pm
set
  allocation_rate = (100 / r.cnt) + case when r.rn = 1 then 100 - (100 / r.cnt) * r.cnt else 0 end,
  role            = case when r.rn = 1 then 'PM'::public.program_manager_role else 'MEMBER'::public.program_manager_role end
from ranked r
where pm.program_id = r.program_id and pm.user_id = r.user_id;

-- (4) backfill: 수행 기간 = 프로그램 기간(없으면 등록일로 폴백) ----------------
update public.program_managers pm
set
  start_date = coalesce(p.start_date, p.created_at::date),
  end_date   = coalesce(p.end_date, p.start_date, p.created_at::date)
from public.programs p
where p.id = pm.program_id
  and (pm.start_date is null or pm.end_date is null);

-- (5) NOT NULL 승격 + 행 단위 CHECK ----------------------------------------
alter table public.program_managers
  alter column allocation_rate set not null,
  alter column start_date      set not null,
  alter column end_date        set not null;

alter table public.program_managers
  drop constraint if exists program_managers_alloc_chk,
  add  constraint program_managers_alloc_chk  check (allocation_rate between 1 and 100),
  drop constraint if exists program_managers_period_chk,
  add  constraint program_managers_period_chk check (end_date >= start_date);

-- (6) 직접 쓰기 정책 제거 → RPC 일원화. SELECT 정책은 유지. --------------------
drop policy if exists program_managers_insert on public.program_managers;
drop policy if exists program_managers_update on public.program_managers;
drop policy if exists program_managers_delete on public.program_managers;

-- (7) 원자적 저장 RPC: 전량 교체 + 프로그램 단위 불변식 검증 --------------------
-- p_rows: [{ "user_id": uuid, "role": "PM"|"MEMBER", "allocation_rate": int,
--            "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }, ...]
create or replace function public.set_program_managers(p_program_id uuid, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count      int;
  v_sum        int;
  v_pm         int;
  v_prog_start date;
  v_prog_end   date;
begin
  -- 인가: admin 또는 ac 쓰기 + 해당 프로그램 접근(RLS를 우회하는 SECURITY DEFINER이므로 자체 강제).
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '프로그램 담당자를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 집계(건수·투입률 합·PM 수)
  select count(*), coalesce(sum(allocation_rate), 0), count(*) filter (where role = 'PM')
    into v_count, v_sum, v_pm
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(user_id uuid, role text, allocation_rate int, start_date date, end_date date);

  -- 담당자 0명(미배정)은 허용: 전량 삭제 후 종료. 아래 불변식은 담당자가 있을 때만 강제한다.
  if v_count = 0 then
    delete from public.program_managers where program_id = p_program_id;
    return;
  end if;

  -- 중복 사용자 금지
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(user_id uuid)
    group by r.user_id having count(*) > 1
  ) then
    raise exception '동일 담당자가 중복 배정되었습니다.';
  end if;

  -- 역할 유효성 + PM 최소 1명
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(role text)
    where r.role is null or r.role not in ('PM', 'MEMBER')
  ) then
    raise exception '역할은 PM 또는 MEMBER여야 합니다.';
  end if;
  if v_pm < 1 then
    raise exception 'PM을 최소 1명 지정해야 합니다.';
  end if;

  -- 투입률: 각 1~100, 합 정확히 100
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(allocation_rate int)
    where r.allocation_rate is null or r.allocation_rate < 1 or r.allocation_rate > 100
  ) then
    raise exception '투입률은 1~100 사이여야 합니다.';
  end if;
  if v_sum <> 100 then
    raise exception '투입률 합계는 100%%여야 합니다. (현재 %)', v_sum;
  end if;

  -- 수행 기간: 시작·종료 필수, 시작 <= 종료
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(start_date date, end_date date)
    where r.start_date is null or r.end_date is null or r.start_date > r.end_date
  ) then
    raise exception '담당자별 수행 기간(시작·종료)을 올바르게 입력해야 합니다.';
  end if;

  -- 수행 기간: 프로그램 기간 내(프로그램 기간이 설정된 경우에만 검사)
  select start_date, end_date into v_prog_start, v_prog_end
  from public.programs where id = p_program_id;
  if v_prog_start is not null and v_prog_end is not null then
    if exists (
      select 1 from jsonb_to_recordset(p_rows) as r(start_date date, end_date date)
      where r.start_date < v_prog_start or r.end_date > v_prog_end
    ) then
      raise exception '담당자 수행 기간은 프로그램 기간(% ~ %) 내여야 합니다.', v_prog_start, v_prog_end;
    end if;
  end if;

  -- 전량 교체(원자적). assigned_by는 현재 앱 유저로 스탬프.
  delete from public.program_managers where program_id = p_program_id;
  insert into public.program_managers
    (program_id, user_id, role, allocation_rate, start_date, end_date, assigned_by)
  select
    p_program_id, r.user_id, r.role::public.program_manager_role,
    r.allocation_rate, r.start_date, r.end_date, app.current_app_user_id()
  from jsonb_to_recordset(p_rows)
    as r(user_id uuid, role text, allocation_rate int, start_date date, end_date date);
end;
$$;

grant execute on function public.set_program_managers(uuid, jsonb) to authenticated;

comment on function public.set_program_managers(uuid, jsonb) is
  'AC 프로그램 담당자 원자적 전량 교체. 투입률 합=100·PM≥1·기간 검증을 서버에서 강제(직접 쓰기 정책 제거).';
