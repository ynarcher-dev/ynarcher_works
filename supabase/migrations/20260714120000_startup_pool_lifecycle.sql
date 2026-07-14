-- =====================================================================
-- 스타트업 풀 라이프사이클: 구분 코드화 · 복수 담당자 · 관리현황 게이팅 · 행단위 RLS · 승격 RPC
--
-- 기획: docs/docs_planning/3_3_1_startup_pool_classification.md
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups),
--       20260705120500_rls_enable_policies.sql(startups RLS),
--       20260705120200_rls_helpers.sql(app.* 헬퍼),
--       20260710120000_startups_pool_columns.sql(management_status/pool_status/discovery_source),
--       20260710130000_startup_pool_tags.sql(company_category_tags 시드: 발굴/보육/투자/기타)
--
-- 보안 게이트 사전 답변:
--   · 소유 워크스페이스: networks (스타트업 마스터 SSOT)
--   · 데이터 등급: Internal (담당자 = 내부 사용자 FK. 개인정보 원본/파일 다운로드/Export 없음)
--   · 접근 주체: 내부 사용자만 (external_* 게스트는 networks 권한이 없어 접근 불가)
--   · Scope: global (networks 워크스페이스 권한 + 투자기업은 행단위 담당자 소유권)
--   · 운영 영향: startups.management_status 를 한글 태그값 → 코드값으로 정규화(프론트 라벨 매핑 필요),
--               startups UPDATE 정책을 행단위 담당자 잠금으로 교체.
--
-- 구성:
--   (1) management_status 코드화(sourced/incubated/invested/other) + 한글→코드 이관 + management_status_etc
--   (2) startup_managers 담당자 조인(리드 1 + 지원 N) + RLS
--   (3) app.is_startup_manager() 헬퍼(RLS 재귀 방지용 SECURITY DEFINER)
--   (4) 관리현황(pool_status) 투자 전용 게이팅 트리거
--   (5) startups UPDATE 정책 교체(투자기업 = 담당자/관리자만)
--   (6) app.promote_to_invested() 승격 RPC(담당자 원자 지정, 등록-후-승격 경로 공용)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 구분(management_status) 코드화 + 데이터 이관
-- ---------------------------------------------------------------------
alter table public.startups
  add column if not exists management_status_etc text;

-- 1-a. 미매핑 커스텀 한글값은 원문을 management_status_etc 에 보존(뒤 UPDATE 전에 선행)
update public.startups
   set management_status_etc = management_status
 where management_status is not null
   and management_status not in ('발굴', '보육', '투자', '기타');

-- 1-b. 한글 태그값 → 코드값 이관 (null/미매핑은 sourced/other 로 안전 매핑)
update public.startups
   set management_status = case
         when management_status = '발굴' then 'sourced'
         when management_status = '보육' then 'incubated'
         when management_status = '투자' then 'invested'
         when management_status = '기타' then 'other'
         when management_status is null  then 'sourced'
         else 'other'  -- 미매핑 커스텀값 → other (원문은 1-a 에서 etc 보존)
       end;

-- 1-c. NOT NULL + 기본값 + 허용값 CHECK 고정
alter table public.startups
  alter column management_status set default 'sourced';
update public.startups
   set management_status = 'sourced'
 where management_status is null;
alter table public.startups
  alter column management_status set not null;
alter table public.startups
  drop constraint if exists startups_management_status_chk;
alter table public.startups
  add constraint startups_management_status_chk
  check (management_status in ('sourced', 'incubated', 'invested', 'other'));

comment on column public.startups.management_status is
  '구분 코드(sourced=발굴/incubated=보육/invested=투자/other=기타). 단일값 라이프사이클. 한글 라벨은 프론트 매핑.';
comment on column public.startups.management_status_etc is
  '기타(other) 구분의 자유 분류 라벨. other 가 아니면 트리거로 NULL 유지.';

-- ---------------------------------------------------------------------
-- (2) 담당자 조인 테이블 (투자기업 전용: 리드 1 + 지원 N)
--     - created_by(등록자)와 별개. 투자기업의 편집/삭제 권한 소유 주체.
--     - 순수 배정 관계(junction)이므로 soft delete 대신 하드 DELETE 정책을 둔다
--       (배정 해제는 정상 운영 행위, 민감 이력 아님. 감사 필요 시 후속 audit 트리거로 확장).
-- ---------------------------------------------------------------------
create table if not exists public.startup_managers (
  startup_id  uuid not null references public.startups(id),
  user_id     uuid not null references public.users(id),
  is_lead     boolean not null default false,
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  primary key (startup_id, user_id)
);
-- 스타트업당 리드 1명 강제
create unique index if not exists uq_startup_managers_one_lead
  on public.startup_managers (startup_id) where is_lead;
create index if not exists idx_startup_managers_user
  on public.startup_managers (user_id);

-- ---------------------------------------------------------------------
-- (3) RLS 재귀 방지 헬퍼: 특정 스타트업의 담당자 여부
--     정책 안에서 startup_managers 를 직접 조회하면 자기 정책이 재귀 평가되므로,
--     SECURITY DEFINER 로 RLS 를 우회하는 판정 헬퍼를 경유한다.
-- ---------------------------------------------------------------------
create or replace function app.is_startup_manager(p_startup_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1 from public.startup_managers m
     where m.startup_id = p_startup_id
       and m.user_id = p_user_id
  );
$$;
grant execute on function app.is_startup_manager(uuid, uuid) to authenticated;

-- startup_managers RLS: 열람=networks 읽기 권한자, 변경=관리자 + 기존 담당자
--   (최초 담당자 부트스트랩은 SECURITY DEFINER RPC(6)가 담당하므로 여기서는 기존 담당자 기준으로 충분)
alter table public.startup_managers enable row level security;

drop policy if exists startup_managers_select on public.startup_managers;
create policy startup_managers_select on public.startup_managers for select
  using (app.can_read_workspace('networks'));

drop policy if exists startup_managers_insert on public.startup_managers;
create policy startup_managers_insert on public.startup_managers for insert
  with check (app.is_admin() or app.is_startup_manager(startup_id, app.current_app_user_id()));

drop policy if exists startup_managers_update on public.startup_managers;
create policy startup_managers_update on public.startup_managers for update
  using (app.is_admin() or app.is_startup_manager(startup_id, app.current_app_user_id()))
  with check (app.is_admin() or app.is_startup_manager(startup_id, app.current_app_user_id()));

drop policy if exists startup_managers_delete on public.startup_managers;
create policy startup_managers_delete on public.startup_managers for delete
  using (app.is_admin() or app.is_startup_manager(startup_id, app.current_app_user_id()));

-- ---------------------------------------------------------------------
-- (4) 관리현황(pool_status) 투자 전용 게이팅 + 기타 라벨 게이팅 트리거
--     - management_status <> 'invested' → pool_status 강제 NULL
--     - management_status <> 'other'    → management_status_etc 강제 NULL
--     - 기존 비투자 행의 잔여 pool_status 는 다음 편집 시점에 정리(프론트는 비투자에서 숨김).
-- ---------------------------------------------------------------------
create or replace function app.startups_lifecycle_gate()
returns trigger
language plpgsql
as $$
begin
  if new.management_status is distinct from 'invested' then
    new.pool_status := null;
  end if;
  if new.management_status is distinct from 'other' then
    new.management_status_etc := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_startups_lifecycle_gate on public.startups;
create trigger trg_startups_lifecycle_gate
  before insert or update on public.startups
  for each row execute function app.startups_lifecycle_gate();

-- ---------------------------------------------------------------------
-- (5) startups UPDATE 정책 교체: 투자기업은 담당자/관리자만 수정·소프트삭제
--     - 비투자(sourced/incubated/other): networks 쓰기 권한자 누구나
--     - 투자(invested): 관리자 또는 지정 담당자만
--     - 투자로의 직접 승격(UPDATE)은 WITH CHECK(신규행 invested + 담당자 존재)에 막혀
--       RPC(6) 경유를 강제 → 담당자 없는 투자기업 생성 방지.
--     - SELECT/INSERT 정책은 기존 유지(networks 읽기/쓰기).
-- ---------------------------------------------------------------------
drop policy if exists startups_update on public.startups;
create policy startups_update on public.startups for update
  using (
    app.can_write_workspace('networks')
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.is_startup_manager(id, app.current_app_user_id())
    )
  )
  with check (
    app.can_write_workspace('networks')
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.is_startup_manager(id, app.current_app_user_id())
    )
  );

-- ---------------------------------------------------------------------
-- (6) 승격 RPC: 담당자 지정과 investment 전환을 원자적으로 처리
--     - "투자로 직접 등록" = 프론트에서 sourced 생성 후 이 RPC 호출(등록-후-승격 공용)
--     - 미투자 → 투자: networks 쓰기 권한자 호출 가능(승격 전엔 누구나 편집 규칙과 일관)
--     - 이미 투자(담당자 재구성): 관리자 또는 기존 담당자만
-- ---------------------------------------------------------------------
create or replace function public.promote_to_invested(
  p_startup_id       uuid,
  p_lead_user_id     uuid,
  p_support_user_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid         uuid := app.current_app_user_id();
  v_is_invested boolean;
  v_support     uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_lead_user_id is null then
    raise exception 'lead_required' using errcode = '23514';
  end if;

  select (management_status = 'invested')
    into v_is_invested
    from public.startups
   where id = p_startup_id and deleted_at is null;
  if not found then
    raise exception 'startup_not_found' using errcode = 'P0002';
  end if;

  -- 호출자 권한: 이미 투자면 담당자/관리자만, 아니면 networks 쓰기 권한자
  if v_is_invested then
    if not (app.is_admin() or app.is_startup_manager(p_startup_id, v_uid)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not app.can_write_workspace('networks') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  -- 담당자 재구성: 기존 리드 해제 → 리드/지원 upsert (리드 1명 유니크 인덱스 준수)
  update public.startup_managers set is_lead = false where startup_id = p_startup_id;

  insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
    values (p_startup_id, p_lead_user_id, true, v_uid)
  on conflict (startup_id, user_id)
    do update set is_lead = true, assigned_by = v_uid;

  foreach v_support in array coalesce(p_support_user_ids, '{}'::uuid[])
  loop
    if v_support is not null and v_support <> p_lead_user_id then
      insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
        values (p_startup_id, v_support, false, v_uid)
      on conflict (startup_id, user_id)
        do update set is_lead = false, assigned_by = v_uid;
    end if;
  end loop;

  update public.startups
     set management_status = 'invested'
   where id = p_startup_id;
end;
$$;
revoke all on function public.promote_to_invested(uuid, uuid, uuid[]) from public;
grant execute on function public.promote_to_invested(uuid, uuid, uuid[]) to authenticated;
