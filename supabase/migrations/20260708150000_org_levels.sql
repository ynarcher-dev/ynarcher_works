-- =====================================================================
-- [Phase 12] 조직 관리 — 조직 레벨(org_levels) + departments 계층/정렬 확장
-- 목적: 조직도를 N-depth(parent_id)로 관리하고, 각 부서에 "조직 레벨"(회사/본부/팀/파트…)을
--       노드별로 태그한다. 레벨 이름은 인사관리 컬럼으로 파생된다(깊이 아닌 레벨 태그 기준).
-- 소유 워크스페이스: management / 데이터 등급: Internal / 접근 주체: 내부 사용자
-- Scope: global(회사 전체 조직도) / 감사 로그 대상 아님(구조 메타, 개인정보 아님)
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
-- 근거: docs_planning/3_7_workspace_management.md, docs_master/PROGRESS.md(Phase 12 조직 관리)
-- =====================================================================

-- 조직 레벨(계층) 정의 ----------------------------------------------------
-- sort_order: 상위(작은 값) → 하위. 이름(name)이 인사관리 컬럼 헤더가 된다.
create table if not exists public.org_levels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- departments 확장: 레벨 태그 + 형제 정렬(sort_order). parent_id는 기존 컬럼 재사용.
alter table public.departments
  add column if not exists level_id   uuid references public.org_levels(id),
  add column if not exists sort_order integer not null default 0;

-- 기본 레벨 시드(회사 › 본부 › 팀 › 파트). 고정 UUID로 멱등.
insert into public.org_levels (id, name, sort_order) values
  ('0c000000-0000-0000-0000-000000000001', '회사', 0),
  ('0c000000-0000-0000-0000-000000000002', '본부', 1),
  ('0c000000-0000-0000-0000-000000000003', '팀',   2),
  ('0c000000-0000-0000-0000-000000000004', '파트', 3)
on conflict (id) do nothing;

-- 백필 1) 형제 정렬(sort_order): 부모 그룹 내 이름순 인덱스로 초기화(기존 0들 정돈).
with ord as (
  select id, (row_number() over (partition by parent_id order by name) - 1) as rn
    from public.departments
)
update public.departments d
   set sort_order = ord.rn
  from ord
 where ord.id = d.id;

-- 백필 2) 레벨 태그: 트리 깊이를 레벨에 매핑하되 최상위(부모 없음)를 '본부'(idx 1)에 앵커링.
--         회사(idx 0) 노드는 아직 없으므로 비워두고, 조직관리 UI에서 신설/재태그한다.
with recursive tree as (
  select id, parent_id, 0 as depth
    from public.departments
   where parent_id is null
  union all
  select d.id, d.parent_id, t.depth + 1
    from public.departments d
    join tree t on d.parent_id = t.id
),
lvl as (
  select id, (row_number() over (order by sort_order) - 1) as idx
    from public.org_levels
   where deleted_at is null
)
update public.departments d
   set level_id = (
     select l.id from lvl l
      where l.idx = least(t.depth + 1, (select max(idx) from lvl))
   )
  from tree t
 where t.id = d.id
   and d.level_id is null;

-- updated_at 트리거 ------------------------------------------------------
drop trigger if exists trg_org_levels_updated_at on public.org_levels;
create trigger trg_org_levels_updated_at
  before update on public.org_levels
  for each row execute function app.set_updated_at();

-- RLS: 조직 레벨(조회는 내부 사용자 전원, 쓰기는 admin/management) --------
-- 원칙: 즉시 활성화 · SELECT/INSERT/UPDATE 분리 · DELETE 미선언(soft delete) · app.* 헬퍼 경유.
alter table public.org_levels enable row level security;

drop policy if exists org_levels_select on public.org_levels;
create policy org_levels_select on public.org_levels for select
  using (app.current_app_user_id() is not null);

drop policy if exists org_levels_insert on public.org_levels;
create policy org_levels_insert on public.org_levels for insert
  with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists org_levels_update on public.org_levels;
create policy org_levels_update on public.org_levels for update
  using (app.is_admin() or app.can_write_workspace('management'))
  with check (app.is_admin() or app.can_write_workspace('management'));
