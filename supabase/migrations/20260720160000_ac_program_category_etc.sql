-- =====================================================================
-- [Phase 8] AC 사업구분에 ETC(기타) 추가
-- 배경: M&A·PROJECT가 AC와 동일한 사업 원장 구조를 공유하면서 세 워크스페이스 모두
--   '기타' 분류를 갖도록 정렬한다. AC는 기존 공공/민간/매출 3분류에 ETC를 더한다.
--   (M&A는 20260720140000에서, PROJECT는 20260720150000에서 이미 ETC를 포함해 생성됨)
--
-- 보안 게이트(11_migration_security_gate.md):
--   - CHECK 제약 교체만 수행한다. 신규 테이블·RPC·정책·Storage·개인정보 경로 없음.
--   - 값 확장(축소가 아님)이므로 기존 행은 전부 유효하며 백필이 필요 없다.
--   - RLS 정책은 category를 참조하지 않으므로 권한 경계에 영향이 없다.
-- 근거: 20260720100000_program_category.sql:22-26
-- =====================================================================

alter table public.programs
  drop constraint if exists programs_category_check;

alter table public.programs
  add constraint programs_category_check
  check (category is null or category in ('PUBLIC', 'PRIVATE', 'REVENUE', 'ETC'));

comment on column public.programs.category is
  '사업구분: PUBLIC(공공)/PRIVATE(민간)/REVENUE(매출)/ETC(기타). null=미지정.';
