-- =====================================================================
-- [Phase 12] 조직 관리 — 부서 인사관리 컬럼 노출 제외(hr_hidden)
-- 목적: 특정 조직(예: 지주성 상위 껍데기)을 인사관리 조직 컬럼 파생에서 제외한다.
--       조직관리 트리에는 그대로 남되, 임직원 소속을 티어 컬럼으로 펼칠 때 이 노드는 건너뛴다
--       (이름이 컬럼에 뜨지 않음). 하위 조직·소속 인원은 인사관리에 정상 노출.
-- 영향: departments에 boolean 컬럼 추가(default false, 기존 행 노출 유지). RLS 변경 없음.
--       clone_org_version이 hr_hidden도 승계하도록 갱신(버전 스냅샷 일관).
-- 근거: 20260708170000_dept_members.sql(clone 정의), docs_planning/3_7_workspace_management.md
-- =====================================================================

alter table public.departments
  add column if not exists hr_hidden boolean not null default false;

-- clone_org_version 갱신: 부서 복사 시 hr_hidden 승계(나머지 로직 동일)
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

  -- 1) 부서 복사: 새 id, parent_id 우선 null, 계보·노출제외 승계
  insert into public.departments
    (name, parent_id, level_id, sort_order, version_id, lineage_id, hr_hidden)
  select s.name, null, s.level_id, s.sort_order, v_new, s.lineage_id, s.hr_hidden
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
