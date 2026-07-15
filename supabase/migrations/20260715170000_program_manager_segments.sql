-- =====================================================================
-- [Phase 7] 프로그램 담당자 '기간 세그먼트' 모델 전환(시간축 인지)
-- 배경: 담당자 투입률은 본질적으로 시간에 따라 변한다(중도 퇴사·대체인력·투입률 상향).
--   기존 평면 모델(사람당 1행, 전체 합=100)은 모든 담당자가 같은 기간일 때만 성립한다.
--   이를 '투입 구간(segment)' 모델로 확장한다:
--     - 한 사람이 여러 구간을 가질 수 있다(예: 50% 04~06 → 100% 06~08 상향).
--     - 불변식을 "전체 합=100" → "수행 기간 내 모든 시점에서 활성 구간 투입률 합=100(빈 구간 없음)"으로 강화.
--   퇴사 처리: 퇴사자 구간 종료일을 당기면 잔여 구간이 부족(<100)해지고, 대체인력 구간 투입 또는
--   기존 담당자 상향 구간 추가로 다시 100%를 채운다(에디터가 구간별 커버리지를 실시간 검증).
--
-- 스키마 변경: (program_id, user_id) 복합 PK 제거 → surrogate id PK. 사람당 복수 구간 허용.
-- 검증: set_program_managers RPC를 일별 커버리지(수행 기간 전 구간 합=100) 검증으로 교체.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - SECURITY DEFINER 함수 set_program_managers 재정의(자체 인가 유지: ac 쓰기 + program 스코프).
--     search_path 고정, 실행 권한 authenticated 한정. 신규 테이블/Storage/개인정보 Export 없음.
--   - PK 교체는 구조 변경일 뿐 권한 확장 아님. 직접 쓰기 정책은 이미 제거되어 RPC가 유일 쓰기 경로.
-- 근거: 20260715160000_program_manager_assignment.sql(직전 평면 모델), 20260705120200_rls_helpers.sql
-- =====================================================================

-- (1) surrogate PK 도입: (program_id, user_id) 복합 PK 제거 → id PK(사람당 복수 구간 허용) ----
alter table public.program_managers add column if not exists id uuid not null default gen_random_uuid();
alter table public.program_managers drop constraint if exists program_managers_pkey;
alter table public.program_managers add constraint program_managers_pkey primary key (id);

-- (2) 저장 RPC 재정의: 전량 교체 + 일별 커버리지(전 구간 합=100) 검증 -----------------------
-- p_rows: [{ "user_id": uuid, "role": "PM"|"MEMBER", "allocation_rate": int,
--            "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }, ...]  (사람당 복수 구간 허용)
create or replace function public.set_program_managers(p_program_id uuid, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count      int;
  v_pm         int;
  v_prog_start date;
  v_prog_end   date;
  v_env_start  date;
  v_env_end    date;
  v_bad        int;
begin
  -- 인가: admin 또는 ac 쓰기 + 해당 프로그램 접근(RLS 우회하는 SECURITY DEFINER이므로 자체 강제).
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '프로그램 담당자를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where role = 'PM')
    into v_count, v_pm
  from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb))
    as r(user_id uuid, role text, allocation_rate int, start_date date, end_date date);

  -- 담당자 0명(미배정)은 허용: 전량 삭제 후 종료. 이하 불변식은 구간이 있을 때만 강제.
  if v_count = 0 then
    delete from public.program_managers where program_id = p_program_id;
    return;
  end if;

  -- 역할 유효성 + PM 최소 1명(구간 기준)
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(role text)
    where r.role is null or r.role not in ('PM', 'MEMBER')
  ) then
    raise exception '역할은 PM 또는 MEMBER여야 합니다.';
  end if;
  if v_pm < 1 then
    raise exception 'PM을 최소 1명(구간) 지정해야 합니다.';
  end if;

  -- 투입률: 각 구간 1~100
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(allocation_rate int)
    where r.allocation_rate is null or r.allocation_rate < 1 or r.allocation_rate > 100
  ) then
    raise exception '투입률은 1~100 사이여야 합니다.';
  end if;

  -- 수행 기간: 시작·종료 필수, 시작 <= 종료
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(start_date date, end_date date)
    where r.start_date is null or r.end_date is null or r.start_date > r.end_date
  ) then
    raise exception '구간별 수행 기간(시작·종료)을 올바르게 입력해야 합니다.';
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

  -- 커버리지 envelope: 프로그램 기간(있으면) 아니면 구간 min~max.
  select coalesce(v_prog_start, min(r.start_date)), coalesce(v_prog_end, max(r.end_date))
    into v_env_start, v_env_end
  from jsonb_to_recordset(p_rows) as r(start_date date, end_date date);

  -- 핵심 불변식: envelope의 매 하루마다 활성 구간 투입률 합 = 정확히 100.
  -- (부족=대체/상향 미충족, 초과=중복 배정. 빈 구간도 합 0 ≠ 100으로 걸린다.)
  select count(*) into v_bad
  from generate_series(v_env_start, v_env_end, interval '1 day') g(d)
  where 100 <> (
    select coalesce(sum(r.allocation_rate), 0)
    from jsonb_to_recordset(p_rows) as r(allocation_rate int, start_date date, end_date date)
    where r.start_date <= g.d::date and r.end_date >= g.d::date
  );
  if v_bad > 0 then
    raise exception '수행 기간 전 구간에서 투입률 합이 100%%여야 합니다. (미충족 %일)', v_bad;
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
  'AC 프로그램 담당자 구간 원자적 전량 교체. 수행 기간 전 구간 합=100·PM≥1·기간 검증을 서버에서 강제(사람당 복수 구간 허용).';
