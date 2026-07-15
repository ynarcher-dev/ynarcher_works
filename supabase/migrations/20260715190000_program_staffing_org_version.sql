-- =====================================================================
-- [Phase 7] 프로그램 배치 '조직 버전(단계)' 인지 — 조직개편 경계 대응
-- 배경: 조직도는 연 1회 개편(org_versions)되어 부서 정체성/구조가 바뀐다. 사업이 개편 경계를 넘으면
--   투입률(→ 품의·지출결의 배분 → 1인당 생산이익)이 날짜별로 그날 유효 조직 기준으로 확정돼야 한다.
--   따라서 부서 구성·담당자 배치를 org 버전 기간(단계)별로 독립 관리한다(자동 승계 없음, 단계 독립 재편성).
--
-- 모델:
--   - program_departments.org_version_id + program_managers.org_version_id 추가.
--   - 부서 협업비율 합=100·메인 1개는 (program_id, org_version_id) '단계 그룹'별로 성립.
--   - 담당자 구간은 그 단계 org 버전 부서를 참조하고, 구간이 그 버전 유효기간[from,to) 안이어야 함.
--   - 불변식(매일): 그날 유효한 '설정된' 단계의 부서마다 활성 담당자 합 = 협업비율.
--     설정 안 된 미래 단계(개편 미확정)는 검사 대상 아님(pending, 저장 허용).
--
-- 보안 게이트(11_migration_security_gate.md):
--   - set_program_staffing(SECURITY DEFINER) 재정의: 자체 인가(ac 쓰기 + program 스코프) 유지, search_path 고정, authenticated 한정.
--   - 신규 컬럼 org_version_id(→ org_versions), 유니크 제약 교체, 기존 행 백필(부서의 version_id). 신규 Storage/개인정보 Export 없음.
-- 근거: 20260715180000_program_departments.sql, 20260708160000_org_versions.sql(effective_from/[to) 반열림), 20260705120100(departments.version_id)
-- =====================================================================

-- (1) org_version_id 컬럼 추가 --------------------------------------------
alter table public.program_departments
  add column if not exists org_version_id uuid references public.org_versions(id);
alter table public.program_managers
  add column if not exists org_version_id uuid references public.org_versions(id);

-- (2) 백필: 부서의 소속 org 버전(departments.version_id)으로 채운다 ----------
update public.program_departments pd
set org_version_id = d.version_id
from public.departments d
where d.id = pd.department_id and pd.org_version_id is null;

update public.program_managers pm
set org_version_id = d.version_id
from public.departments d
where d.id = pm.department_id and pm.department_id is not null and pm.org_version_id is null;

-- (3) 유니크 교체: (program_id, department_id) → (program_id, org_version_id, department_id) --
alter table public.program_departments
  drop constraint if exists program_departments_program_id_department_id_key;
-- org_version_id 백필 후 NOT NULL 승격(부서 구성 행은 항상 버전에 속한다).
alter table public.program_departments alter column org_version_id set not null;
alter table public.program_departments
  add constraint program_departments_prog_ver_dept_key unique (program_id, org_version_id, department_id);
create index if not exists idx_program_departments_prog_ver
  on public.program_departments (program_id, org_version_id);

-- (4) 저장 RPC 재정의: 단계(버전)별 독립 검증 + 원자 전량 교체 ----------------
-- p_departments: [{ org_version_id, department_id, kind, collaboration_ratio }, ...]
-- p_managers:    [{ user_id, org_version_id, department_id, role, allocation_rate, start_date, end_date }, ...]
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
  v_mgr_count  int;
  v_pm         int;
  v_prog_start date;
  v_prog_end   date;
  v_env_start  date;
  v_env_end    date;
  v_bad        int;
begin
  -- 인가
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '프로그램 담당자를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  select count(*) into v_dep_count
  from jsonb_to_recordset(coalesce(p_departments, '[]'::jsonb))
    as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int);
  select count(*), count(*) filter (where role = 'PM') into v_mgr_count, v_pm
  from jsonb_to_recordset(coalesce(p_managers, '[]'::jsonb))
    as m(user_id uuid, org_version_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);

  -- 둘 다 비면(미배정) 전량 삭제 후 종료.
  if v_dep_count = 0 and v_mgr_count = 0 then
    delete from public.program_managers    where program_id = p_program_id;
    delete from public.program_departments where program_id = p_program_id;
    return;
  end if;
  if v_dep_count = 0 then
    raise exception '부서 구성을 먼저 설정해야 합니다.';
  end if;

  -- 부서 값 유효성(종류/비율/버전 소속)
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, kind text, collaboration_ratio int)
    where d.org_version_id is null or d.kind not in ('MAIN', 'COLLAB')
       or d.collaboration_ratio is null or d.collaboration_ratio < 1 or d.collaboration_ratio > 100
  ) then
    raise exception '부서 종류(MAIN/COLLAB)·협업비율(1~100)·org 버전을 올바르게 입력하세요.';
  end if;
  -- 부서는 해당 org 버전 소속이어야 함(departments.version_id = org_version_id).
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid)
    left join public.departments dd on dd.id = d.department_id
    where dd.id is null or dd.version_id <> d.org_version_id
  ) then
    raise exception '부서가 지정한 조직 버전에 속하지 않습니다.';
  end if;
  -- 단계(버전) 그룹별: 메인 정확히 1개 + 협업비율 합 100 + 부서 중복 없음.
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    group by d.org_version_id
    having count(*) filter (where d.kind = 'MAIN') <> 1
        or sum(d.collaboration_ratio) <> 100
        or count(*) <> count(distinct d.department_id)
  ) then
    raise exception '각 조직 버전(단계)에서 메인 1개 + 협업비율 합 100%%를 지켜야 합니다.';
  end if;

  -- 담당자 값 유효성
  if v_mgr_count = 0 then raise exception '담당자를 1명 이상 배정해야 합니다.'; end if;
  if v_pm < 1 then raise exception 'PM을 최소 1명(구간) 지정해야 합니다.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(role text, allocation_rate int, start_date date, end_date date, org_version_id uuid, department_id uuid)
    where m.role is null or m.role not in ('PM', 'MEMBER')
       or m.allocation_rate is null or m.allocation_rate < 1 or m.allocation_rate > 100
       or m.start_date is null or m.end_date is null or m.start_date > m.end_date
       or m.org_version_id is null or m.department_id is null
  ) then
    raise exception '담당자 구간의 부서·역할·투입률(1~100)·수행 기간을 올바르게 입력하세요.';
  end if;
  -- 담당자 (버전, 부서)는 그 버전에 지정된 부서 중 하나여야 함.
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(org_version_id uuid, department_id uuid)
    where not exists (
      select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid)
      where d.org_version_id = m.org_version_id and d.department_id = m.department_id)
  ) then
    raise exception '담당자의 부서는 해당 단계에 지정된 부서 중 하나여야 합니다.';
  end if;
  -- 담당자 구간은 그 org 버전 유효기간[from, to) 안이어야 함.
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(org_version_id uuid, start_date date, end_date date)
    join public.org_versions ov on ov.id = m.org_version_id
    where m.start_date < ov.effective_from or (ov.effective_to is not null and m.end_date >= ov.effective_to)
  ) then
    raise exception '담당자 구간이 소속 조직 버전의 유효기간을 벗어났습니다.';
  end if;

  -- 프로그램 기간 내
  select start_date, end_date into v_prog_start, v_prog_end from public.programs where id = p_program_id;
  if v_prog_start is not null and v_prog_end is not null then
    if exists (
      select 1 from jsonb_to_recordset(p_managers) as m(start_date date, end_date date)
      where m.start_date < v_prog_start or m.end_date > v_prog_end
    ) then
      raise exception '담당자 수행 기간은 프로그램 기간(% ~ %) 내여야 합니다.', v_prog_start, v_prog_end;
    end if;
  end if;

  select coalesce(v_prog_start, min(start_date)), coalesce(v_prog_end, max(end_date))
    into v_env_start, v_env_end
  from jsonb_to_recordset(p_managers) as m(start_date date, end_date date);

  -- 핵심 불변식: 매일 × '그날 유효한 설정된 단계'의 부서마다 활성 담당자 합 = 협업비율.
  with days as (select g.d::date d from generate_series(v_env_start, v_env_end, interval '1 day') g(d)),
  cfg_ver as (
    select distinct d.org_version_id, ov.effective_from, ov.effective_to
    from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    join public.org_versions ov on ov.id = d.org_version_id
  ),
  day_ver as (
    select days.d, cv.org_version_id
    from days join cfg_ver cv
      on days.d >= cv.effective_from and (cv.effective_to is null or days.d < cv.effective_to)
  )
  select count(*) into v_bad
  from day_ver dv
  join jsonb_to_recordset(p_departments) as dep(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    on dep.org_version_id = dv.org_version_id
  where dep.collaboration_ratio <> (
    select coalesce(sum(m.allocation_rate), 0)
    from jsonb_to_recordset(p_managers)
      as m(org_version_id uuid, department_id uuid, allocation_rate int, start_date date, end_date date)
    where m.org_version_id = dep.org_version_id and m.department_id = dep.department_id
      and m.start_date <= dv.d and m.end_date >= dv.d
  );
  if v_bad > 0 then
    raise exception '단계별로 각 부서를 전 구간에서 협업비율만큼 채워야 합니다. (미충족 %건)', v_bad;
  end if;

  -- 원자 교체
  delete from public.program_managers    where program_id = p_program_id;
  delete from public.program_departments where program_id = p_program_id;
  insert into public.program_departments (program_id, org_version_id, department_id, kind, collaboration_ratio)
  select p_program_id, d.org_version_id, d.department_id, d.kind::public.program_department_kind, d.collaboration_ratio
  from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int);
  insert into public.program_managers
    (program_id, org_version_id, user_id, department_id, role, allocation_rate, start_date, end_date, assigned_by)
  select
    p_program_id, m.org_version_id, m.user_id, m.department_id, m.role::public.program_manager_role,
    m.allocation_rate, m.start_date, m.end_date, app.current_app_user_id()
  from jsonb_to_recordset(p_managers)
    as m(user_id uuid, org_version_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);
end;
$$;

grant execute on function public.set_program_staffing(uuid, jsonb, jsonb) to authenticated;

comment on function public.set_program_staffing(uuid, jsonb, jsonb) is
  'AC 프로그램 부서+담당자 배치 org 버전(단계)별 독립 검증·원자 교체. 단계별 메인1·협업비율합100, 단계별 일별 부서합=협업비율.';
