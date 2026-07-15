-- =====================================================================
-- [Phase 7] 프로그램 담당자 다대다(program_managers) 전환
-- 배경: 담당자는 여럿일 수 있어 단일 컬럼(20260715120000_programs_manager.sql의 manager_id)을
--       조인 테이블로 대체한다. 직전 마이그레이션은 프로덕션에 이미 적용되어 불변이므로,
--       본 마이그레이션에서 manager_id 컬럼을 제거(신규 컬럼이라 데이터 없음)하고 junction을 도입한다.
-- 참고: startup_managers(20260714120000_startup_pool_lifecycle.sql)와 동일한 junction 패턴.
--       단, 프로그램 담당자는 리드 구분이 없어 is_lead 없이 순수 배정 관계로 둔다.
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블 program_managers → 생성 즉시 RLS 활성 + SELECT/INSERT/UPDATE/DELETE 정책 분리.
--   - 권한 판정은 app.can_read/write_workspace('ac') + app.can_access_program() 헬퍼 경유.
--   - junction(순수 배정 관계)이므로 배정 해제는 정상 운영 행위 → 하드 DELETE 정책 허용
--     (startup_managers 선례와 동일). 민감 이력 아님.
--   - 신규 RPC/Storage/SECURITY DEFINER 없음. 개인정보 원본/다운로드/Export 영향 없음(Internal 등급, 내부 사용자 참조).
-- =====================================================================

-- (1) 단일 담당자 컬럼 제거(조인 테이블로 대체). 신규 컬럼이라 이관할 데이터 없음.
drop index if exists public.idx_programs_manager;
alter table public.programs drop column if exists manager_id;

-- (2) 다중 담당자 junction. created_by(등록자)와 별개 축, 재지정 가능.
create table if not exists public.program_managers (
  program_id  uuid not null references public.programs(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  primary key (program_id, user_id)
);
create index if not exists idx_program_managers_user on public.program_managers (user_id);

-- (3) RLS: 열람=ac 읽기 권한자(+program 스코프), 변경=ac 쓰기 권한자(+program 스코프)
alter table public.program_managers enable row level security;

drop policy if exists program_managers_select on public.program_managers;
create policy program_managers_select on public.program_managers for select
  using (app.can_read_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_managers_insert on public.program_managers;
create policy program_managers_insert on public.program_managers for insert
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_managers_update on public.program_managers;
create policy program_managers_update on public.program_managers for update
  using (app.can_write_workspace('ac') and app.can_access_program(program_id))
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_managers_delete on public.program_managers;
create policy program_managers_delete on public.program_managers for delete
  using (app.can_write_workspace('ac') and app.can_access_program(program_id));

comment on table public.program_managers is
  '프로그램 담당자(다대다). 등록자(programs.created_by)와 별개 축이며 재지정 가능.';
