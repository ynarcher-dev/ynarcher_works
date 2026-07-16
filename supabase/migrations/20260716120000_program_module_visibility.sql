-- =====================================================================
-- [AC] 프로그램 모듈: 공유 범위(visibility) 추가 + 배정 방식 기본값 백필
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=ac / 등급=Internal / 접근=내부 사용자(게스트는 ac 전면 차단, Phase 13 예정) / scope=program
--   program_modules RLS는 20260705150500_ac_rls.sql에서 이미 활성(SELECT/INSERT/UPDATE 분리, DELETE 미선언).
--   본 변경은 컬럼 추가만으로 기존 program 스코프 정책이 그대로 커버되므로 신규 정책이 필요 없다.
-- =====================================================================

-- 모듈 공유 범위(3단계): 비공개(WORKS 내부만) / 일부공개(GUEST 참여기업) / 전체공개(공개 모집 등 누구나)
do $$ begin create type public.module_visibility as enum
  ('INTERNAL_ONLY','GUEST_ONLY','PUBLIC');
exception when duplicate_object then null; end $$;

-- 기본값은 최소 공개(비공개). 게스트/공개 노출은 운영자가 명시적으로 올려야 한다(Default Deny).
alter table public.program_modules
  add column if not exists visibility public.module_visibility not null default 'INTERNAL_ONLY';

-- 배정 방식(participation_mode)은 이제 사용자가 자유 선택하지 않고 모듈 타입별 기본값으로 강제한다.
-- 기존 행 중 비어 있는 값을 모듈 타입 기본값으로 백필한다(비즈니스 매칭은 STARTUP_FCFS를 기본으로).
update public.program_modules
   set participation_mode = case module_type
     when 'RECRUITMENT'       then 'OPEN_APPLICATION'
     when 'DOC_REVIEW'        then 'REVIEWER_ASSIGNMENT'
     when 'ONSITE_EVAL'       then 'REVIEWER_ASSIGNMENT'
     when 'DEMO_DAY'          then 'REVIEWER_ASSIGNMENT'
     when 'ORIENTATION'       then 'ADMIN_ONLY'
     when 'OUTCOMES'          then 'ADMIN_ONLY'
     when 'CUSTOM_ACTIVITY'   then 'ADMIN_ONLY'
     when 'MENTORING'         then 'MANUAL_ALLOCATION'
     when 'BUSINESS_MATCHING' then 'STARTUP_FCFS'
   end::public.participation_mode
 where participation_mode is null;
