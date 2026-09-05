-- =====================================================================
-- 스타트업 상세 재배치: 역량 밴드 신규 컬럼(tech_profile / ip_profile)
--
-- 상세페이지의 세로 축을 '역량(다시 재지 않는 것)'과 '실적(기간마다 다시 재는 것)'으로
-- 가르면서, 역량 밴드에 카드 둘이 새로 선다. 정성 텍스트/목록이라 기존 business_profile·
-- team_profile과 같은 방식으로 jsonb 컬럼 2종을 더한다.
--   · tech_profile : { product, devStage, coreTech, devInsourcing, differentiator }
--   · ip_profile   : { rights:[{kind,title,no,status,date}],
--                      certifications:[{name,agency,date}],
--                      govProjects:[{name,role,period,amount}] }
--
-- 특허 출원/등록 '건수'는 저장하지 않는다 — rights 목록이 이미 아는 값이라, 적어 두면
-- 목록을 고쳤을 때 건수만 옛 값으로 남는다(같은 사실을 두 곳에 적지 않는다).
--
-- 함께 옮기는 값: business_profile.competitiveEdge → tech_profile.differentiator.
-- 경쟁 우위는 '남보다 낫다'가 아니라 '우리만 가진 것'으로 뜻이 좁아져 제품·기술 카드로
-- 자리를 옮긴다. 복사가 아니라 이동이다 — 두 곳에 남기면 어긋난 날 어느 쪽이 사실인지
-- 판정할 근거가 없다.
--
-- 값을 옮기는 UPDATE 동안 startups의 사용자 트리거를 끈다. 켜 두면 (1) 기여 로그
-- (trg_startups_contribution)가 행마다 'edited'를 쌓는데 마이그레이션에는 행위자가 없어
-- 누가 고쳤는지 답하지 못하는 기록이 남고, (2) updated_at 갱신 트리거가 전 행의 수정일을
-- 오늘로 밀어 상세 화면이 "오늘 누군가 고쳤다"고 거짓을 말한다. 스키마 이동은 업무 행위가
-- 아니므로 업무 기록에 남지 않아야 한다.
--
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 정책 상속 → 추가 정책 불요.
-- - 신규 테이블/뷰/정책/RPC/SECURITY DEFINER/Storage 정책 없음. DELETE 정책 없음.
-- - 개인정보 없음(기업 단위 정성 정보). 감사 로그 대상 행위 없음.
-- - 소유 워크스페이스: startup / 데이터 등급: Internal / 접근 주체: 내부 사용자.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260710150000_startups_business_team.sql(같은 방식의 선례),
--       20260721150000_entity_contribution_trigger_startup_global.sql(트리거명)
-- =====================================================================

alter table public.startups
  add column if not exists tech_profile jsonb not null default '{}'::jsonb,
  add column if not exists ip_profile   jsonb not null default '{}'::jsonb;

comment on column public.startups.tech_profile is
  '제품·기술 jsonb: { product, devStage, coreTech, devInsourcing, differentiator }. devStage=개발 단계, devInsourcing=개발 내재화, differentiator=차별 역량(구 business_profile.competitiveEdge).';
comment on column public.startups.ip_profile is
  '지식재산·인증 jsonb: { rights:[{kind,title,no,status,date}], certifications:[{name,agency,date}], govProjects:[{name,role,period,amount}] }. 특허 건수는 저장하지 않고 rights에서 센다.';

-- ── 값 이동: competitiveEdge → tech_profile.differentiator ────────────
alter table public.startups disable trigger user;

update public.startups
   set tech_profile = tech_profile
        || jsonb_build_object('differentiator', btrim(business_profile->>'competitiveEdge')),
       business_profile = business_profile - 'competitiveEdge'
 where coalesce(btrim(business_profile->>'competitiveEdge'), '') <> ''
   and coalesce(btrim(tech_profile->>'differentiator'), '') = '';

-- 빈 문자열로만 남은 옛 키를 걷는다(값이 없으므로 옮길 것도 없다).
update public.startups
   set business_profile = business_profile - 'competitiveEdge'
 where business_profile ? 'competitiveEdge';

alter table public.startups enable trigger user;
