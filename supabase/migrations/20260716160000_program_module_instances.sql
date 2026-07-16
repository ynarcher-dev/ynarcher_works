-- =====================================================================
-- [AC] 운영 모듈 템플릿·인스턴스화: 동일 템플릿 다중 배치 + 모듈명 + 담당자 다중
-- 근거 기획: docs/docs_planning/3_4_2_ac_program_overview.md (템플릿·인스턴스 모델)
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=ac / 등급=Internal / 접근=내부 사용자(게스트는 ac 전면 차단) / scope=program
--   - program_modules: 컬럼 추가·제약 교체. 기존 program 스코프 RLS(20260705150500_ac_rls.sql)가 그대로 커버.
--   - program_module_assignees(신규): 생성 즉시 RLS 활성 + SELECT/INSERT/UPDATE/DELETE 분리.
--     권한 판정은 상위 program_modules→program_id 경유 app.can_read/write_workspace('ac') + app.can_access_program().
--     junction(순수 배정 관계)이라 배정 해제는 정상 운영 행위 → 하드 DELETE 허용(program_managers 선례와 동일).
--   - 담당자 풀 소속 강제는 RPC(정상 경로)와 트리거(직접 쓰기 방어)로 이중 강제.
--   - set_program_module(SECURITY DEFINER 신규): 자체 인가(ac 쓰기+program 스코프), search_path 고정,
--     authenticated 한정. 모듈명 유일성·담당자 풀 소속·OUTCOMES 단일성·기간 포함 검증 내부 강제.
-- 배포 주의(운영 영향): 아래 UNIQUE(program_id, module_type) 제거는 구 프론트의 upsert(onConflict)와
--   충돌하므로 supabase db push는 신규 프론트 배포와 동시에 진행한다.
-- =====================================================================

-- (1) 모듈명(자율 입력) 컬럼. NULL이면 프론트에서 템플릿 라벨로 폴백한다.
alter table public.program_modules
  add column if not exists title text;

-- 신규 인스턴스는 기본 활성으로 생성된다(끄기=soft off는 enabled 플래그로 별도 제어).
alter table public.program_modules
  alter column enabled set default true;

-- (2) 동일 템플릿 다중 인스턴스 허용: (program_id, module_type) 유니크 제거.
alter table public.program_modules
  drop constraint if exists program_modules_program_id_module_type_key;

-- (3) 모듈명은 프로그램 내 유일(정규화: 앞뒤 공백 제거 + 소문자). NULL 제목은 제약 대상 아님.
create unique index if not exists uq_program_modules_title
  on public.program_modules (program_id, lower(btrim(title)))
  where title is not null;

-- (4) OUTCOMES(성과/KPI)는 다중화 대상 제외 — 프로그램당 1개만 허용(단일 인스턴스 유지).
create unique index if not exists uq_program_modules_outcomes_singleton
  on public.program_modules (program_id)
  where module_type = 'OUTCOMES';

-- (5) 인스턴스 담당자(다중). user_id는 해당 프로그램 담당자 풀(program_managers)에 존재해야 한다
--     (FK는 users로만 두고, 풀 소속은 아래 트리거 + RPC로 강제).
create table if not exists public.program_module_assignees (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  user_id           uuid not null references public.users(id),
  assigned_by       uuid references public.users(id),
  assigned_at       timestamptz not null default now(),
  unique (program_module_id, user_id)
);
create index if not exists idx_program_module_assignees_module
  on public.program_module_assignees (program_module_id);
create index if not exists idx_program_module_assignees_user
  on public.program_module_assignees (user_id);

comment on table public.program_module_assignees is
  '운영 모듈 인스턴스 담당자(다중). 프로그램 담당자 풀(program_managers) 소속 사용자만 배정 가능.';

-- (6) RLS: program_module_id → program_modules.program_id 경유로 program 스코프 판정.
alter table public.program_module_assignees enable row level security;

drop policy if exists program_module_assignees_select on public.program_module_assignees;
create policy program_module_assignees_select on public.program_module_assignees for select
  using (
    app.can_read_workspace('ac')
    and exists (
      select 1 from public.program_modules pm
      where pm.id = program_module_id and app.can_access_program(pm.program_id)
    )
  );

drop policy if exists program_module_assignees_insert on public.program_module_assignees;
create policy program_module_assignees_insert on public.program_module_assignees for insert
  with check (
    app.can_write_workspace('ac')
    and exists (
      select 1 from public.program_modules pm
      where pm.id = program_module_id and app.can_access_program(pm.program_id)
    )
  );

drop policy if exists program_module_assignees_update on public.program_module_assignees;
create policy program_module_assignees_update on public.program_module_assignees for update
  using (
    app.can_write_workspace('ac')
    and exists (
      select 1 from public.program_modules pm
      where pm.id = program_module_id and app.can_access_program(pm.program_id)
    )
  )
  with check (
    app.can_write_workspace('ac')
    and exists (
      select 1 from public.program_modules pm
      where pm.id = program_module_id and app.can_access_program(pm.program_id)
    )
  );

drop policy if exists program_module_assignees_delete on public.program_module_assignees;
create policy program_module_assignees_delete on public.program_module_assignees for delete
  using (
    app.can_write_workspace('ac')
    and exists (
      select 1 from public.program_modules pm
      where pm.id = program_module_id and app.can_access_program(pm.program_id)
    )
  );

-- (7) 담당자 풀 소속 강제 트리거(직접 쓰기 방어). RPC를 우회한 INSERT/UPDATE도 막는다.
create or replace function public.enforce_module_assignee_in_pool()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_program uuid;
begin
  select program_id into v_program from public.program_modules where id = new.program_module_id;
  if v_program is null then
    raise exception '모듈 인스턴스를 찾을 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.program_managers pm
    where pm.program_id = v_program and pm.user_id = new.user_id
  ) then
    raise exception '담당자는 프로그램 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_module_assignee_pool on public.program_module_assignees;
create trigger trg_module_assignee_pool
  before insert or update on public.program_module_assignees
  for each row execute function public.enforce_module_assignee_in_pool();

-- (8) 인스턴스 생성/수정 RPC — 인스턴스 1건 + 담당자 목록을 원자적으로 반영하고 id를 반환한다.
--     p_module_id NULL이면 신규 생성, 있으면 수정(담당자는 전량 교체).
create or replace function public.set_program_module(
  p_program_id         uuid,
  p_module_id          uuid,
  p_module_type        text,
  p_title              text,
  p_status             text,
  p_visibility         text,
  p_participation_mode text,
  p_settings           jsonb,
  p_assignee_user_ids  uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id         uuid := p_module_id;
  v_title      text := nullif(btrim(p_title), '');
  v_mode       text;
  v_ps         date := (p_settings->>'start_date')::date;
  v_pe         date := (p_settings->>'end_date')::date;
  v_prop_start date;
  v_prop_end   date;
  v_op_start   date;
  v_op_end     date;
  v_uid        uuid;
begin
  -- 인가: 관리자 또는 (ac 쓰기 + 해당 프로그램 접근권)
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '운영 모듈을 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 수정 대상 인스턴스가 이 프로그램 소속인지 확인.
  if v_id is not null and not exists (
    select 1 from public.program_modules where id = v_id and program_id = p_program_id
  ) then
    raise exception '수정할 모듈 인스턴스를 찾을 수 없습니다.';
  end if;

  -- 배정 방식: 미지정 시 템플릿 기본값으로 강제.
  v_mode := coalesce(p_participation_mode, case p_module_type
    when 'RECRUITMENT'       then 'OPEN_APPLICATION'
    when 'DOC_REVIEW'        then 'REVIEWER_ASSIGNMENT'
    when 'ONSITE_EVAL'       then 'REVIEWER_ASSIGNMENT'
    when 'DEMO_DAY'          then 'REVIEWER_ASSIGNMENT'
    when 'ORIENTATION'       then 'ADMIN_ONLY'
    when 'OUTCOMES'          then 'ADMIN_ONLY'
    when 'CUSTOM_ACTIVITY'   then 'ADMIN_ONLY'
    when 'MENTORING'         then 'MANUAL_ALLOCATION'
    when 'BUSINESS_MATCHING' then 'STARTUP_FCFS'
  end);

  -- 모듈명 중복 금지(프로그램 내, 정규화 비교; 수정 시 자기 자신 제외).
  if v_title is not null and exists (
    select 1 from public.program_modules pm
    where pm.program_id = p_program_id
      and lower(btrim(pm.title)) = lower(v_title)
      and (v_id is null or pm.id <> v_id)
  ) then
    raise exception '이미 같은 이름의 모듈이 있습니다: %', v_title;
  end if;

  -- OUTCOMES 단일성(신규 생성 시).
  if p_module_type = 'OUTCOMES' and v_id is null and exists (
    select 1 from public.program_modules where program_id = p_program_id and module_type = 'OUTCOMES'
  ) then
    raise exception '성과/KPI 모듈은 프로그램당 1개만 배치할 수 있습니다.';
  end if;

  -- 기간 검증: start<=end 및 제안/운영 기간 중 한 구간에 완전 포함.
  if v_ps is not null and v_pe is not null then
    if v_ps > v_pe then
      raise exception '종료일은 시작일 이후여야 합니다.';
    end if;
    select proposal_start_date, proposal_end_date, start_date, end_date
      into v_prop_start, v_prop_end, v_op_start, v_op_end
    from public.programs where id = p_program_id;
    if (v_prop_start is not null and v_prop_end is not null)
       or (v_op_start is not null and v_op_end is not null) then
      if not (
        (v_prop_start is not null and v_prop_end is not null and v_ps >= v_prop_start and v_pe <= v_prop_end)
        or (v_op_start is not null and v_op_end is not null and v_ps >= v_op_start and v_pe <= v_op_end)
      ) then
        raise exception '모듈 기간은 제안 기간 또는 운영 기간 내에서만 설정할 수 있습니다.';
      end if;
    end if;
  end if;

  -- 담당자 풀 소속 검증(전체 사전 확인; 트리거와 이중 방어).
  if p_assignee_user_ids is not null then
    foreach v_uid in array p_assignee_user_ids loop
      if not exists (
        select 1 from public.program_managers pm
        where pm.program_id = p_program_id and pm.user_id = v_uid
      ) then
        raise exception '담당자는 프로그램 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '42501';
      end if;
    end loop;
  end if;

  -- 인스턴스 upsert(생성/수정).
  if v_id is null then
    insert into public.program_modules
      (program_id, module_type, title, enabled, status, participation_mode, visibility, settings)
    values (
      p_program_id, p_module_type::public.module_type, v_title, true,
      p_status::public.module_status, v_mode::public.participation_mode,
      p_visibility::public.module_visibility, coalesce(p_settings, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.program_modules set
      title              = v_title,
      status             = p_status::public.module_status,
      participation_mode = v_mode::public.participation_mode,
      visibility         = p_visibility::public.module_visibility,
      settings           = coalesce(p_settings, '{}'::jsonb),
      updated_at         = now()
    where id = v_id;
  end if;

  -- 담당자 전량 교체.
  delete from public.program_module_assignees where program_module_id = v_id;
  if p_assignee_user_ids is not null then
    insert into public.program_module_assignees (program_module_id, user_id, assigned_by)
    select v_id, u, app.current_app_user_id()
    from unnest(p_assignee_user_ids) as u
    on conflict (program_module_id, user_id) do nothing;
  end if;

  return v_id;
end;
$$;

grant execute on function public.set_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]) to authenticated;

comment on function public.set_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]) is
  'AC 운영 모듈 인스턴스 생성/수정 + 담당자 전량 교체(원자). 모듈명 유일·담당자 풀 소속·OUTCOMES 단일·기간 포함 검증.';
