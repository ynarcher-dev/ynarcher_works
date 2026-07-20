-- =====================================================================
-- 사업구분(program category) 신설: 사업 1건당 공공/민간/매출 3분류
--   * 값: PUBLIC(공공) / PRIVATE(민간) / REVENUE(매출), 미지정 허용(null)
--   * 등록/편집 폼에서 선택, 상세·목록에서 배지로 표시
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블 없음(기존 public.programs 에 nullable 컬럼 1개 추가).
--   - RLS 영향 없음: 구분값은 사업 소유 워크스페이스(AC) 데이터 등급 Internal,
--     기존 programs SELECT/INSERT/UPDATE 정책이 그대로 커버.
--   - 신규 함수/트리거/SECURITY DEFINER 없음. GRANT 변경 없음.
--   - CHECK 제약으로 허용값만 저장. 감사/개인정보/파일/Export 영향 없음. 멱등.
-- =====================================================================

alter table public.programs
  add column if not exists category text;

comment on column public.programs.category is '사업구분: PUBLIC(공공)/PRIVATE(민간)/REVENUE(매출). null=미지정.';

-- 허용값 제약(멱등: 있으면 건너뜀).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'programs_category_check'
  ) then
    alter table public.programs
      add constraint programs_category_check
      check (category is null or category in ('PUBLIC', 'PRIVATE', 'REVENUE'));
  end if;
end $$;
