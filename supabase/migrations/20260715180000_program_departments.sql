-- =====================================================================
-- [Phase 7] 프로그램 담당자 배치 '부서 계층' 추가(메인/협업 부서 + 협업비율)
-- 개념(확정 스펙):
--   - 프로그램은 부서 단위 협업: 메인부서 1개 + 협업부서 0~n개(사내 departments 마스터 참조).
--   - 각 부서에 협업비율(1~100, 명시 세팅), 부서별 합 = 정확히 100%.
--   - 담당자는 한 부서에 소속되어 배치되고, 부서 내 담당자 투입률 합 = 그 부서의 협업비율.
--   - 부서 구성/비율은 시간 불변(값 편집은 가능, 시간 세그먼트 아님). 담당자는 기존 기간 세그먼트 유지.
--   - 불변식(프로그램 기간 매 시점): 각 부서에서 활성 담당자 투입률 합 = 그 부서 협업비율.
--     (부서 협업비율 합=100이므로 전체 합=100도 자동 성립.)
--
-- 강제: 부서/인력을 한 트랜잭션으로 원자 검증·저장하는 단일 RPC set_program_staffing로 통합
--       (기존 set_program_managers 대체·삭제). 직접 쓰기 정책 없음(RPC가 유일 쓰기 경로).
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블 program_departments → RLS 활성 + SELECT 정책(ac 읽기 + program 스코프). 직접 쓰기 정책 미선언(RPC 전용).
--   - SECURITY DEFINER 함수 set_program_staffing: 자체 인가(ac 쓰기 + program 스코프), search_path 고정, authenticated 한정.
--   - program_managers.department_id는 nullable 추가(레거시 백필 없음, 다음 저장 때 부서 지정 강제).
--   - 신규 Storage/개인정보 Export 없음. 부서=조직 마스터 참조(Internal 등급).
-- 근거: 20260715170000_program_manager_segments.sql, 20260705120100_core_identity.sql(departments/users),
--       20260705120200_rls_helpers.sql, 20260715130000_program_managers.sql
-- =====================================================================

-- (1) 부서 역할 enum -------------------------------------------------------
do $$ begin
  create type public.program_department_kind as enum ('MAIN', 'COLLAB');
exception when duplicate_object then null; end $$;

-- (2) 프로그램 부서 구성(메인 1 + 협업 n, 부서별 협업비율) ------------------
create table if not exists public.program_departments (
  id                  uuid primary key default gen_random_uuid(),
  program_id          uuid not null references public.programs(id) on delete cascade,
  department_id       uuid not null references public.departments(id),
  kind                public.program_department_kind not null,
  collaboration_ratio smallint not null check (collaboration_ratio between 1 and 100),
  created_at          timestamptz not null default now(),
  unique (program_id, department_id)
);
create index if not exists idx_program_departments_program on public.program_departments (program_id);

alter table public.program_departments enable row level security;

-- 조회: ac 읽기 권한자 + program 스코프. 쓰기 정책 미선언 → RPC(SECURITY DEFINER)만 기록.
drop policy if exists program_departments_select on public.program_departments;
create policy program_departments_select on public.program_departments for select
  using (app.can_read_workspace('ac') and app.can_access_program(program_id));

-- (3) 담당자에 소속 부서 추가(레거시 nullable, 신규 저장 시 RPC가 강제) -------
alter table public.program_managers
  add column if not exists department_id uuid references public.departments(id);

-- (4) 원자 저장 RPC: 부서 구성 + 담당자 구간을 함께 검증·전량 교체 -----------
-- p_departments: [{ "department_id": uuid, "kind": "MAIN"|"COLLAB", "collaboration_ratio": int }, ...]
-- p_managers:    [{ "user_id": uuid, "department_id": uuid, "role": "PM"|"MEMBER",
--                   "allocation_rate": int, "start_date": date, "end_date": date }, ...]
create or replace function public.set_program_staffing(
  p_program_id  uuid,
  p_departments jsonb,
  p_managers    jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_dep_count  int;
  v_main       int;
  v_ratio_sum  int;
  v_mgr_count  int;
  v_pm         int;
  v_prog_start date;
  v_prog_end   date;
  v_env_start  date;
  v_env_end    date;
  v_bad        int;
begin
  -- 인가: admin 또는 ac 쓰기 + 해당 프로그램 접근(SECURITY DEFINER이므로 자체 강제).
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '프로그램 담당자를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where kind = 'MAIN'), coalesce(sum(collaboration_ratio), 0)
    into v_dep_count, v_main, v_ratio_sum
  from jsonb_to_recordset(coalesce(p_departments, '[]'::jsonb))
    as d(department_id uuid, kind text, collaboration_ratio int);

  select count(*), count(*) filter (where role = 'PM')
    into v_mgr_count, v_pm
  from jsonb_to_recordset(coalesce(p_managers, '[]'::jsonb))
    as m(user_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);

  -- 둘 다 비면(미배정) 전량 삭제 후 종료.
  if v_dep_count = 0 and v_mgr_count = 0 then
    delete from public.program_managers   where program_id = p_program_id;
    delete from public.program_departments where program_id = p_program_id;
    return;
  end if;

  -- 부서 구성 검증 ------------------------------------------------------------
  if v_dep_count = 0 then
    raise exception '부서 구성을 먼저 설정해야 합니다.';
  end if;
  if v_main <> 1 then
    raise exception '메인 부서는 정확히 1개여야 합니다.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(kind text, collaboration_ratio int)
    where d.kind not in ('MAIN', 'COLLAB')
       or d.collaboration_ratio is null or d.collaboration_ratio < 1 or d.collaboration_ratio > 100
  ) then
    raise exception '부서 종류(MAIN/COLLAB)와 협업비율(1~100)을 올바르게 입력하세요.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(department_id uuid)
    group by d.department_id having count(*) > 1
  ) then
    raise exception '같은 부서가 중복 지정되었습니다.';
  end if;
  if v_ratio_sum <> 100 then
    raise exception '부서 협업비율 합이 100%%여야 합니다. (현재 %)', v_ratio_sum;
  end if;

  -- 담당자 검증 --------------------------------------------------------------
  if v_mgr_count = 0 then
    raise exception '담당자를 1명 이상 배정해야 합니다.';
  end if;
  if v_pm < 1 then
    raise exception 'PM을 최소 1명(구간) 지정해야 합니다.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(role text)
    where m.role is null or m.role not in ('PM', 'MEMBER')
  ) then
    raise exception '역할은 PM 또는 MEMBER여야 합니다.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(allocation_rate int)
    where m.allocation_rate is null or m.allocation_rate < 1 or m.allocation_rate > 100
  ) then
    raise exception '투입률은 1~100 사이여야 합니다.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(start_date date, end_date date)
    where m.start_date is null or m.end_date is null or m.start_date > m.end_date
  ) then
    raise exception '구간별 수행 기간(시작·종료)을 올바르게 입력해야 합니다.';
  end if;
  -- 담당자 부서는 지정 부서 중 하나여야 함
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(department_id uuid)
    where m.department_id is null
       or not exists (
         select 1 from jsonb_to_recordset(p_departments) as d(department_id uuid)
         where d.department_id = m.department_id)
  ) then
    raise exception '담당자의 부서는 프로그램 지정 부서 중 하나여야 합니다.';
  end if;

  -- 수행 기간: 프로그램 기간 내(설정된 경우)
  select start_date, end_date into v_prog_start, v_prog_end
  from public.programs where id = p_program_id;
  if v_prog_start is not null and v_prog_end is not null then
    if exists (
      select 1 from jsonb_to_recordset(p_managers) as m(start_date date, end_date date)
      where m.start_date < v_prog_start or m.end_date > v_prog_end
    ) then
      raise exception '담당자 수행 기간은 프로그램 기간(% ~ %) 내여야 합니다.', v_prog_start, v_prog_end;
    end if;
  end if;

  -- 커버리지 envelope: 프로그램 기간(있으면) 아니면 구간 min~max.
  select coalesce(v_prog_start, min(start_date)), coalesce(v_prog_end, max(end_date))
    into v_env_start, v_env_end
  from jsonb_to_recordset(p_managers) as m(start_date date, end_date date);

  -- 핵심 불변식: 매일 × 각 부서에서 활성 담당자 투입률 합 = 그 부서 협업비율.
  select count(*) into v_bad
  from generate_series(v_env_start, v_env_end, interval '1 day') g(d)
  cross join jsonb_to_recordset(p_departments) as dep(department_id uuid, collaboration_ratio int)
  where dep.collaboration_ratio <> (
    select coalesce(sum(m.allocation_rate), 0)
    from jsonb_to_recordset(p_managers)
      as m(department_id uuid, allocation_rate int, start_date date, end_date date)
    where m.department_id = dep.department_id
      and m.start_date <= g.d::date and m.end_date >= g.d::date
  );
  if v_bad > 0 then
    raise exception '부서별로 수행 기간 전 구간에서 투입률 합이 협업비율과 일치해야 합니다. (미충족 %건)', v_bad;
  end if;

  -- 원자 교체(부서 → 담당자). assigned_by는 현재 앱 유저로 스탬프.
  delete from public.program_managers    where program_id = p_program_id;
  delete from public.program_departments where program_id = p_program_id;
  insert into public.program_departments (program_id, department_id, kind, collaboration_ratio)
  select p_program_id, d.department_id, d.kind::public.program_department_kind, d.collaboration_ratio
  from jsonb_to_recordset(p_departments) as d(department_id uuid, kind text, collaboration_ratio int);
  insert into public.program_managers
    (program_id, user_id, department_id, role, allocation_rate, start_date, end_date, assigned_by)
  select
    p_program_id, m.user_id, m.department_id, m.role::public.program_manager_role,
    m.allocation_rate, m.start_date, m.end_date, app.current_app_user_id()
  from jsonb_to_recordset(p_managers)
    as m(user_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);
end;
$$;

grant execute on function public.set_program_staffing(uuid, jsonb, jsonb) to authenticated;

comment on function public.set_program_staffing(uuid, jsonb, jsonb) is
  'AC 프로그램 부서 구성 + 담당자 구간 원자 전량 교체. 부서 1메인·협업비율 합100, 부서별 일별 합=협업비율, PM≥1 강제.';

-- 기존 담당자 전용 저장 RPC는 통합 RPC로 대체되어 제거.
drop function if exists public.set_program_managers(uuid, jsonb);
