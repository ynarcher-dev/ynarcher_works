-- =====================================================================
-- [Phase 12] 조직 관리 — 조직 레벨(org_levels) 버전 스코프화(진짜 스냅샷)
-- 목적: 조직 레벨이 전역(모든 버전 공유)이라, 미래 예정 버전에서 레벨 이름을 바꾸면
--       현재 조직·인사관리 컬럼에 즉시 누수되던 문제를 해결한다. 레벨도 버전별 스냅샷으로
--       전환해, 부서·인력배치와 마찬가지로 발효일 전까지 현재에 영향을 주지 않게 한다.
-- 변경: org_levels에 version_id(소속 버전)+lineage_id(계보) 추가. 기존 레벨은 시드 버전에 귀속,
--       다른 기존 버전에는 계보 유지하며 복제하고 그 버전 부서의 level_id를 자기 버전 레벨로 재매핑.
--       clone_org_version이 레벨도 복제하고 부서 level_id를 새 버전 레벨(같은 계보)로 매핑하도록 확장.
-- 소유 워크스페이스: management / 데이터 등급: Internal / 접근 주체: 내부 사용자
-- Scope: global(회사 전체 조직도, 버전 스냅샷) / 감사 로그 대상 아님(구조 메타, 개인정보 아님)
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
-- 근거: 20260708150000_org_levels.sql, 20260708160000_org_versions.sql, 20260708200000_dept_hr_hidden.sql
-- =====================================================================

-- 1) 컬럼 추가: 소속 버전 + 계보 --------------------------------------------
alter table public.org_levels
  add column if not exists version_id uuid references public.org_versions(id),
  add column if not exists lineage_id uuid;

-- 2) 계보 백필 = 자기 자신(신규 레벨은 트리거가 채운다)
update public.org_levels
   set lineage_id = id
 where lineage_id is null;

-- 3) 기존(전역) 레벨을 시드 버전 '현재 조직'에 귀속
update public.org_levels
   set version_id = '00e70000-0000-0000-0000-000000000001'
 where version_id is null;

-- 4) 시드 외 기존 버전에도 레벨을 계보 유지하며 복제(각 버전이 자기 레벨 세트를 갖도록)
--    (그동안 부서 level_id가 전역/시드 레벨을 가리키던 것을 5)에서 자기 버전 레벨로 재매핑)
--    재실행 안전: 이미 그 (버전,계보) 레벨이 있으면 건너뛴다.
insert into public.org_levels (name, sort_order, version_id, lineage_id)
select l.name, l.sort_order, v.id, l.lineage_id
  from public.org_versions v
  cross join public.org_levels l
 where v.deleted_at is null
   and v.id <> '00e70000-0000-0000-0000-000000000001'
   and l.version_id = '00e70000-0000-0000-0000-000000000001'
   and l.deleted_at is null
   and not exists (
     select 1 from public.org_levels x
      where x.version_id = v.id and x.lineage_id = l.lineage_id and x.deleted_at is null
   );

-- 5) 시드 외 버전 부서의 level_id를 "자기 버전의 같은 계보 레벨"로 재매핑
--    UPDATE ... FROM에서 대상 테이블(d)은 JOIN ON에 참조할 수 없으므로 상관조건은 WHERE에 둔다.
update public.departments d
   set level_id = nl.id
  from public.org_levels ol,
       public.org_levels nl
 where d.level_id = ol.id
   and nl.lineage_id = ol.lineage_id
   and nl.version_id = d.version_id
   and nl.deleted_at is null
   and d.version_id <> '00e70000-0000-0000-0000-000000000001';

-- 6) 백필 완료 후 version_id 필수화(신규 삽입은 조직관리 UI가 항상 버전 지정)
alter table public.org_levels alter column version_id set not null;

create index if not exists idx_org_levels_version on public.org_levels (version_id);
create index if not exists idx_org_levels_lineage on public.org_levels (lineage_id);
-- 버전 내 계보 유일: 한 버전에 같은 레벨 계보는 한 행만 존재(clone 재매핑 1:1 보장)
create unique index if not exists uq_org_levels_version_lineage
  on public.org_levels (version_id, lineage_id) where deleted_at is null;

-- 7) 신규 레벨 계보 자동 채움(미지정 시 자기 자신) — departments 패턴과 동일
create or replace function app.set_org_level_lineage()
returns trigger
language plpgsql
as $$
begin
  if new.lineage_id is null then new.lineage_id := new.id; end if;
  return new;
end $$;

drop trigger if exists trg_org_levels_lineage on public.org_levels;
create trigger trg_org_levels_lineage
  before insert on public.org_levels
  for each row execute function app.set_org_level_lineage();

-- 8) clone_org_version 확장: 레벨 스냅샷 복제 + 부서 level_id 계보 매핑 --------
--    RLS 매트릭스/보안 게이트: SECURITY DEFINER + search_path 고정 + 내부 권한검사 선행 유지.
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

  -- 0) 레벨 복사(버전 스냅샷): 새 id, 계보 승계
  insert into public.org_levels (name, sort_order, version_id, lineage_id)
  select l.name, l.sort_order, v_new, l.lineage_id
    from public.org_levels l
   where l.version_id = p_src_version
     and l.deleted_at is null;

  -- 1) 부서 복사: parent_id 우선 null, 계보·노출제외 승계, level_id는 새 버전의 같은 계보 레벨로 매핑
  insert into public.departments
    (name, parent_id, level_id, sort_order, version_id, lineage_id, hr_hidden)
  select s.name, null, nl.id, s.sort_order, v_new, s.lineage_id, s.hr_hidden
    from public.departments s
    left join public.org_levels sl
      on sl.id = s.level_id
    left join public.org_levels nl
      on nl.version_id = v_new and nl.lineage_id = sl.lineage_id and nl.deleted_at is null
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
