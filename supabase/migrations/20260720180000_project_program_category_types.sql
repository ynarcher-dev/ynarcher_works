-- =====================================================================
-- [Phase 11] PROJECT 사업구분 3분류 확정 — 글로벌/신사업/기타
-- 배경: 20260720150000이 project_programs를 생성할 당시 사업구분은 ETC(기타) 단일이었고,
--   이후 GLOBAL(글로벌)/NEW_BIZ(신사업)이 추가되었습니다. 20260720150000 파일 자체도 갱신했으나
--   해당 마이그레이션이 이미 적용된 환경에서는 다시 실행되지 않으므로, 어느 상태에서 출발하든
--   동일한 결과가 되도록 제약을 멱등하게 재정의합니다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - CHECK 제약 교체만 수행합니다. 신규 테이블·RPC·정책·Storage·개인정보 경로가 없습니다.
--   - 값 확장(축소가 아님)이므로 기존 행은 전부 유효하며 백필이 필요 없습니다.
--   - RLS 정책은 category를 참조하지 않아 권한 경계에 영향이 없습니다.
-- 근거: 20260720150000_project_program_schema.sql, features/project/ProjectWorkspace.tsx(PROJECT_CATEGORIES)
-- =====================================================================

alter table public.project_programs
  drop constraint if exists project_programs_category_check;

alter table public.project_programs
  add constraint project_programs_category_check
  check (category is null or category in ('GLOBAL', 'NEW_BIZ', 'ETC'));

comment on column public.project_programs.category is
  '사업구분: GLOBAL(글로벌)/NEW_BIZ(신사업)/ETC(기타). null=미지정.';
