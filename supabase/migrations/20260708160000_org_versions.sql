-- =====================================================================
-- [Phase 12] 조직 관리 — 조직도 버전(org_versions) + 가용기간(발효 기간)
-- 목적: 조직도(조직 트리 한 벌) = 버전 1개. 각 버전에 가용기간 [시작일, 종료일)을 부여하고
--       오늘 날짜가 속한 버전을 "유효 조직도"로 본다. 종료일 null = 무기한.
--       departments를 버전에 귀속(version_id)하고, 버전 간 동일 부서를 계보(lineage_id)로 잇는다.
-- 활성 규칙(단일): effective_from <= 오늘 중 "가장 늦게 시작한" PUBLISHED 버전.
--       → 기간 포함/공백을 한 규칙으로 처리(공백 구간엔 직전 버전 유지).
-- 겹침 금지: PUBLISHED·미삭제 버전의 가용기간은 서로 겹칠 수 없다(daterange 배타 제약).
--
-- 보안 게이트 체크리스트(docs/docs_dev/11_migration_security_gate.md):
--  · 소유 워크스페이스: management(조직 마스터) / 데이터 등급: Internal
--  · 접근 주체: 내부 사용자(조회 전원, 쓰기 admin/management) / Scope: global(회사 전체 조직도)
--  · 신규 테이블 즉시 RLS 활성화 · SELECT/INSERT/UPDATE 정책 분리 · DELETE 미선언(soft delete)
--  · 판정은 app.* 헬퍼 경유(is_admin/can_write_workspace/current_app_user_id)
--  · SECURITY DEFINER(clone_org_version): search_path 고정(public, app) + 함수 내부 권한검사 선행
--  · GRANT EXECUTE 대상 authenticated 로 제한(public revoke)
--  · 개인정보/파일/Export/권한변경 아님(조직 구조 메타) → 별도 감사로그 없음
-- 근거: docs_planning/3_7_workspace_management.md, docs_master/PROGRESS.md(Phase 12 조직 관리),
--       20260708150000_org_levels.sql(레벨 태그), 20260705210000_management_schema.sql(계층)
-- =====================================================================

-- 조직도 버전(가용기간 단위) -------------------------------------------------
create table if not exists public.org_versions (
  id             uuid primary key default gen_random_uuid(),
  label          text not null,                       -- '현재 조직', '2027 조직' 등
  effective_from date not null,                        -- 시작(보통 연초 설정)
  effective_to   date,                                 -- 종료(연말 설정, null=무기한)
  note           text,
  status         text not null default 'PUBLISHED',    -- DRAFT | PUBLISHED
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint org_versions_status_chk check (status in ('DRAFT','PUBLISHED')),
  constraint org_versions_period_chk check (effective_to is null or effective_to > effective_from)
);

-- 겹침 금지: PUBLISHED·미삭제 버전의 가용기간은 서로 겹칠 수 없다. 반열림 [from,to), to null=무한 상한.
do $$ begin
  alter table public.org_versions
    add constraint org_versions_no_overlap
    exclude using gist (daterange(effective_from, effective_to, '[)') with &&)
    where (status = 'PUBLISHED' and deleted_at is null);
exception when duplicate_object then null; end $$;

-- 시드 버전: 기존 단일 트리를 담는 "현재 조직"(고정 UUID로 멱등, 백필 참조점)
insert into public.org_versions (id, label, effective_from, status)
values ('00e70000-0000-0000-0000-000000000001', '현재 조직', '2026-01-01', 'PUBLISHED')
on conflict (id) do nothing;

-- departments 확장: 버전 귀속 + 계보(버전 간 동일 부서 식별) ------------------
alter table public.departments
  add column if not exists version_id uuid references public.org_versions(id),
  add column if not exists lineage_id uuid;

-- 백필 1) 기존 부서를 시드 버전에 귀속
update public.departments
   set version_id = '00e70000-0000-0000-0000-000000000001'
 where version_id is null;

-- 백필 2) 계보 = 자기 자신(신규 부서는 트리거가 채운다)
update public.departments
   set lineage_id = id
 where lineage_id is null;

-- 백필 완료 후 version_id 필수화(신규 삽입은 조직관리 UI가 항상 지정)
alter table public.departments alter column version_id set not null;

-- 전역 이름 유일 제약 해제: 버전 간 동일 이름 복제 + 트리 내 동명 부서를 허용한다.
alter table public.departments drop constraint if exists departments_name_key;

create index if not exists idx_departments_version on public.departments (version_id);
create index if not exists idx_departments_lineage on public.departments (lineage_id);
-- 버전 내 계보 유일: 한 버전에 같은 부서 계보는 한 행만 존재(clone 재매핑 1:1 보장)
create unique index if not exists uq_departments_version_lineage
  on public.departments (version_id, lineage_id) where deleted_at is null;

-- 신규 부서 계보 자동 채움(미지정 시 자기 자신) ------------------------------
create or replace function app.set_department_lineage()
returns trigger
language plpgsql
as $$
begin
  if new.lineage_id is null then new.lineage_id := new.id; end if;
  return new;
end $$;

drop trigger if exists trg_departments_lineage on public.departments;
create trigger trg_departments_lineage
  before insert on public.departments
  for each row execute function app.set_department_lineage();

-- updated_at 트리거 ---------------------------------------------------------
drop trigger if exists trg_org_versions_updated_at on public.org_versions;
create trigger trg_org_versions_updated_at
  before update on public.org_versions
  for each row execute function app.set_updated_at();

-- 조직 버전 복제 RPC --------------------------------------------------------
-- 원본 버전의 부서 트리(레벨 태그·계층·정렬)를 새 버전으로 통째 복사한다. 새 부서는 새 id를
-- 받되 lineage_id(계보)는 원본과 동일하게 승계해 버전 간 동일 부서를 잇는다.
-- (인력 배치 복사는 후속 슬라이스에서 dept_members로 확장한다.)
create or replace function public.clone_org_version(
  p_src_version uuid,
  p_label       text,
  p_from        date,
  p_to          date
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_new uuid;
begin
  -- 권한검사 선행(SECURITY DEFINER는 RLS를 우회하므로 함수 내부에서 강제)
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception '조직 버전을 생성할 권한이 없습니다.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_label, '')) = '' then
    raise exception '버전 이름을 입력하세요.' using errcode = '22023';
  end if;
  if p_from is null then
    raise exception '시작일을 입력하세요.' using errcode = '22023';
  end if;

  insert into public.org_versions (label, effective_from, effective_to, status)
  values (btrim(p_label), p_from, p_to, 'PUBLISHED')
  returning id into v_new;

  -- 1) 부서 복사: 새 id, parent_id 우선 null, 계보 승계
  insert into public.departments (name, parent_id, level_id, sort_order, version_id, lineage_id)
  select s.name, null, s.level_id, s.sort_order, v_new, s.lineage_id
    from public.departments s
   where s.version_id = p_src_version
     and s.deleted_at is null;

  -- 2) 계층 재매핑: 새 버전의 자식을 원본 부모의 계보로 찾아 같은 계보의 새 부모 id에 연결
  update public.departments c
     set parent_id = np.id
    from public.departments s_child
    join public.departments s_parent
      on s_parent.id = s_child.parent_id and s_parent.version_id = p_src_version
    join public.departments np
      on np.version_id = v_new and np.lineage_id = s_parent.lineage_id
   where c.version_id = v_new
     and c.lineage_id = s_child.lineage_id
     and s_child.version_id = p_src_version;

  return v_new;
end $$;

revoke all on function public.clone_org_version(uuid, text, date, date) from public;
grant execute on function public.clone_org_version(uuid, text, date, date) to authenticated;

-- RLS: 조직 버전(조회 내부 전원, 쓰기 admin/management) ----------------------
alter table public.org_versions enable row level security;

drop policy if exists org_versions_select on public.org_versions;
create policy org_versions_select on public.org_versions for select
  using (app.current_app_user_id() is not null);

drop policy if exists org_versions_insert on public.org_versions;
create policy org_versions_insert on public.org_versions for insert
  with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists org_versions_update on public.org_versions;
create policy org_versions_update on public.org_versions for update
  using (app.is_admin() or app.can_write_workspace('management'))
  with check (app.is_admin() or app.can_write_workspace('management'));
