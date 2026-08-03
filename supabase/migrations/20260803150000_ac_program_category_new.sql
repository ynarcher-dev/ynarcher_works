-- =====================================================================
-- AC 사업구분에 NEW(신규) 추가
-- 배경: 기존 공공/민간/매출/기타 4분류로는 아직 성격이 확정되지 않은 신규 건을 담을 칸이
--   없어 전부 '기타'로 흘러들었다. '기타'는 어느 분류에도 속하지 않는다는 뜻이지
--   '이제 막 시작해 분류가 정해지지 않았다'는 뜻이 아니라, 두 사실이 한 칸에 섞여 있었다.
--   AC 전용 확장이므로 M&A·PROJECT 원장의 CHECK 제약은 건드리지 않는다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - CHECK 제약 교체만 수행한다. 신규 테이블·RPC·정책·Storage·개인정보 경로 없음.
--   - 값 확장(축소가 아님)이므로 기존 행은 전부 유효하며 백필이 필요 없다.
--   - RLS 정책은 category를 참조하지 않으므로 권한 경계에 영향이 없다.
-- 근거: 20260720160000_ac_program_category_etc.sql
-- =====================================================================

alter table public.programs
  drop constraint if exists programs_category_check;

alter table public.programs
  add constraint programs_category_check
  check (category is null or category in ('PUBLIC', 'PRIVATE', 'REVENUE', 'NEW', 'ETC'));

comment on column public.programs.category is
  '사업구분: PUBLIC(공공)/PRIVATE(민간)/REVENUE(매출)/NEW(신규)/ETC(기타). null=미지정.';
