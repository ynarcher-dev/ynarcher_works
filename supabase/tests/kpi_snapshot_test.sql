-- KPI 스냅샷 핵심 계산·보안 구조 회귀 테스트
begin;
select plan(7);

select is(
  app.kpi_score('BAND', '{"bands":[{"min":0,"max":100,"score":5},{"min":100,"max":null,"score":10}]}'::jsonb, 'ABSOLUTE', null, 120, null, null),
  10::numeric,
  '구간형 KPI는 열린 상단 구간 점수를 계산한다'
);

-- TARGET_RATE의 입력은 실적/목표를 백분율로 환산한 값이다(app.kpi_score: actual/target*100).
select is(
  app.kpi_score('BAND', '{"bands":[{"min":100,"max":120,"score":7}]}'::jsonb, 'TARGET_RATE', 100, 110, null, null),
  7::numeric,
  '목표 대비 KPI는 실적/목표 비율로 계산한다'
);

select is(
  app.kpi_score('GRADE_MAP', '{"grades":[{"grade":"S","score":15}]}'::jsonb, 'NONE', null, null, 'S', null),
  15::numeric,
  '등급형 KPI는 등급별 점수를 계산한다'
);

select is(
  app.kpi_score('PER_UNIT_CAP', '{"per_unit":[{"key":"계약","score":3},{"key":"상담","score":1}],"cap":10}'::jsonb, 'NONE', null, null, null, '{"계약":4,"상담":2}'::jsonb),
  10::numeric,
  '건별 합산형 KPI는 상한을 적용한다'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.kpi_assignments'::regclass),
  'KPI 할당 테이블은 RLS를 사용한다'
);

select ok(
  not has_table_privilege('anon', 'public.kpi_actual_revisions', 'SELECT'),
  '익명 사용자는 개인 KPI 실적을 조회할 수 없다'
);

select ok(
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.dept_members'::regclass
       and conname = 'dept_members_user_period_no_overlap'
  ),
  '한 조직 버전에서 임직원 소속 기간은 겹칠 수 없다'
);

select * from finish();
rollback;
