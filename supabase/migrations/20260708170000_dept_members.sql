-- =====================================================================
-- [Phase 12] 조직 관리 — 버전별 인력 배치(dept_members) + 배치 스냅샷
-- 목적: 인력 배치를 조직 버전(가용기간)별로 관리한다. 지금까지 배치는 users.department_id
--       단일 값(라이브 버전)이었으나, 미래·과거 조직도를 인력까지 미리 설계하려면 버전별 배치가
--       필요하다. dept_members가 (버전, 임직원)→부서의 SSOT가 되고, users.department_id는
--       라이브(활성 버전) 배치 미러로만 남긴다(표시 전용, RLS 스코프 미사용).
-- 활성 버전 규칙은 20260708160000과 동일: effective_from<=오늘 중 최신 시작 PUBLISHED.
--
-- 보안 게이트 체크리스트(docs/docs_dev/11_migration_security_gate.md):
--  · 소유 워크스페이스: management(조직/인사 마스터) / 데이터 등급: Internal
--  · 접근 주체: 내부 사용자(조회 전원, 쓰기 admin/management) / Scope: global
--  · 신규 테이블 즉시 RLS 활성화 · SELECT/INSERT/UPDATE 정책 분리 · DELETE 미선언(soft delete)
--  · 판정은 app.* 헬퍼 경유 · SECURITY DEFINER 함수 search_path 고정 + 내부 권한검사 선행
--  · 개인정보 원본/파일/Export/권한변경 아님(부서 소속은 임직원 디렉토리에서 이미 노출) → 감사로그 없음
-- 근거: 20260708160000_org_versions.sql(버전/계보), docs_planning/3_7_workspace_management.md
-- =====================================================================

-- 버전별 인력 배치 ----------------------------------------------------------
create table if not exists public.dept_members (
  id            uuid primary key default gen_random_uuid(),
  version_id    uuid not null references public.org_versions(id),
  department_id uuid not null references public.departments(id),
  user_id       uuid not null references public.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- 한 버전에 임직원은 한 부서에만 소속(활성 행 기준)
create unique index if not exists uq_dept_members_version_user
  on public.dept_members (version_id, user_id) where deleted_at is null;
create index if not exists idx_dept_members_dept
  on public.dept_members (department_id) where deleted_at is null;
create index if not exists idx_dept_members_user
  on public.dept_members (user_id);

-- 백필: 기존 users.department_id → 시드 버전('현재 조직') 배치로 이관
insert into public.dept_members (version_id, department_id, user_id)
select '00e70000-0000-0000-0000-000000000001', u.department_id, u.id
  from public.users u
 where u.department_id is not null
   and u.deleted_at is null
   and not exists (
     select 1 from public.dept_members dm
      where dm.version_id = '00e70000-0000-0000-0000-000000000001'
        and dm.user_id = u.id
        and dm.deleted_at is null
   );

-- 오늘의 유효 버전 id(서버 측 해석) -----------------------------------------
-- 규칙: effective_from<=오늘 중 가장 늦게 시작한 PUBLISHED·미삭제 버전(공백 구간 직전 유지).
create or replace function public.current_org_version_id()
returns uuid
language sql
stable
set search_path = public, app
as $$
  select v.id
    from public.org_versions v
   where v.status = 'PUBLISHED'
     and v.deleted_at is null
     and v.effective_from <= current_date
   order by v.effective_from desc, v.created_at desc
   limit 1
$$;

revoke all on function public.current_org_version_id() from public;
grant execute on function public.current_org_version_id() to authenticated;

-- clone_org_version 확장: 부서 트리 + 인력 배치(dept_members)까지 복제 --------
-- 20260708160000의 정의를 대체(구조 복제 후 배치 복제 단계 추가).
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

  -- 3) 인력 배치 복사: 원본 배치를 계보로 새 버전 부서에 매핑
  insert into public.dept_members (version_id, department_id, user_id)
  select v_new, np.id, m.user_id
    from public.dept_members m
    join public.departments sd
      on sd.id = m.department_id and sd.version_id = p_src_version
    join public.departments np
      on np.version_id = v_new and np.lineage_id = sd.lineage_id
   where m.version_id = p_src_version
     and m.deleted_at is null;

  return v_new;
end $$;

revoke all on function public.clone_org_version(uuid, text, date, date) from public;
grant execute on function public.clone_org_version(uuid, text, date, date) to authenticated;

-- RLS: 인력 배치(조회 내부 전원, 쓰기 admin/management) -----------------------
alter table public.dept_members enable row level security;

drop policy if exists dept_members_select on public.dept_members;
create policy dept_members_select on public.dept_members for select
  using (app.current_app_user_id() is not null);

drop policy if exists dept_members_insert on public.dept_members;
create policy dept_members_insert on public.dept_members for insert
  with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists dept_members_update on public.dept_members;
create policy dept_members_update on public.dept_members for update
  using (app.is_admin() or app.can_write_workspace('management'))
  with check (app.is_admin() or app.can_write_workspace('management'));
