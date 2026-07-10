-- =====================================================================
-- 스타트업 풀 상세: '설립일(설립년도)' 컬럼 추가
-- - 기본 데이터에 노출하며, 프론트에서 오늘 기준 기업 나이(D+일수)를 자동 계산한다.
--   일수 계산을 위해 연도(년)가 아닌 date 타입으로 저장한다(년만 알면 D+ 계산이 부정확).
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재. 신규 컬럼은 기존
--        테이블 정책을 그대로 상속하므로 추가 정책이 필요 없다.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
--   개인정보·다운로드·Export·권한 변경 영향 없음(Internal 등급 nullable date 1종).
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260710120000_startups_pool_columns.sql, 20260710200000_startups_company_form.sql
-- =====================================================================

alter table public.startups
  add column if not exists founded_on date;

comment on column public.startups.founded_on is
  '설립일(설립년도). 오늘 기준 기업 나이(D+일수) 자동 계산의 기준일.';
