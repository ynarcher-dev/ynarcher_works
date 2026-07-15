-- =====================================================================
-- [데모/검증용] 투자기업(invested) 더미 스타트업 5건 시드
-- 목적: STARTUP 대시보드(투자기업 기준 산업/소재지/랭킹/업력/라운드 분포)가 다양한
--       값으로 렌더링되는지 검증하기 위한 샘플 투자기업. 값이 제각각이라 값순 농도
--       그라데이션·정렬이 실제로 보인다.
-- 특징:
--   - 고정 UUID(a0000000-...-0000000001NN) + `on conflict do nothing`으로 멱등(재적용 안전).
--   - 기존 시드(20260705240000_seed_dummy_data.sql)와 UUID 대역이 겹치지 않는다(101~105).
--   - 마이그레이션은 owner 권한으로 실행되어 RLS/게이팅을 우회하므로 그대로 적재된다.
-- 정리: 아래 5개 UUID + startup_managers 행을 삭제하면 원복된다(순수 데모 데이터).
-- 보안 게이트: 신규 테이블/RPC/Storage/SECURITY DEFINER 없음. 기존 테이블 데이터 INSERT만.
--   개인정보 원본/다운로드/Export/권한 변경 영향 없음(Internal 등급 데모 레코드).
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705240000_seed_dummy_data.sql(시드 패턴), 20260714120000_startup_pool_lifecycle.sql(invested 게이팅)
-- =====================================================================

-- 투자기업 5건. industries(jsonb)·location(text)·stage(text)·founded_on(date)·growth_metrics(jsonb)를
-- 다양하게 채워 대시보드 분포가 골고루 잡히게 한다. created_by 는 기존 시드 사용자(최에이씨).
insert into public.startups
  (id, name, biz_reg_no, representative, management_status, industry, industries, stage, location, founded_on, growth_metrics, created_by)
values
  ('a0000000-0000-0000-0000-000000000101','넥스트페이','221-81-00101','김넥스트','invested','핀테크','["핀테크"]','Series B','서울','2018-03-10',
   '{"finance":[],"revenue":[],"employee":[],"investment":[{"date":"2023-05","round":"Series B","valuation":30000000000,"fundingAmount":12000000000,"investor":"와이앤아처"}]}','e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000102','메디케어랩','221-81-00102','이메디','invested','헬스케어','["헬스케어"]','Series A','경기','2020-06-01',
   '{"finance":[],"revenue":[],"employee":[],"investment":[{"date":"2022-11","round":"Series A","valuation":12000000000,"fundingAmount":4000000000,"investor":"와이앤아처"}]}','e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000103','딥비전','221-81-00103','박비전','invested','AI/딥테크','["AI/딥테크"]','Pre-A','서울','2021-01-15',
   '{"finance":[],"revenue":[],"employee":[],"investment":[{"date":"2023-02","round":"Pre-A","valuation":8000000000,"fundingAmount":2000000000,"investor":"와이앤아처"}]}','e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000104','그린로지스','221-81-00104','최그린','invested','물류/SaaS','["물류/SaaS"]','Seed','부산','2022-09-01',
   '{"finance":[],"revenue":[],"employee":[],"investment":[{"date":"2024-03","round":"Seed","valuation":3000000000,"fundingAmount":800000000,"investor":"와이앤아처"}]}','e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000105','에듀브릿지','221-81-00105','정에듀','invested','에듀테크','["에듀테크"]','Series A','대전','2019-11-20',
   '{"finance":[],"revenue":[],"employee":[],"investment":[{"date":"2023-08","round":"Series A","valuation":15000000000,"fundingAmount":5000000000,"investor":"와이앤아처"}]}','e0000000-0000-0000-0000-000000000004')
on conflict do nothing;

-- 투자기업 리드 담당자 지정(invested 는 담당자 소유가 정상 상태). 지원 담당자는 생략.
insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
values
  ('a0000000-0000-0000-0000-000000000101','e0000000-0000-0000-0000-000000000003', true,'e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000102','e0000000-0000-0000-0000-000000000003', true,'e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000103','e0000000-0000-0000-0000-000000000008', true,'e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000104','e0000000-0000-0000-0000-000000000008', true,'e0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000105','e0000000-0000-0000-0000-000000000003', true,'e0000000-0000-0000-0000-000000000004')
on conflict do nothing;
