-- =====================================================================
-- [Phase 7] 입사일을 임직원 기본 인적 정보(users.profile.hire_date)로 이관
-- 목적: 인사 관리 화면에서 입사일을 편집·조회할 수 있게 한다.
--
-- 왜 hr_profiles.hire_date를 쓰지 않는가:
--   hr_profiles는 연차(annual_leave_total/used)를 함께 담고 있어 RLS가
--   can_read_workspace('management')로 잠겨 있다(20260705210000). 입사일은
--   회사·직책·직급과 같은 기본 인적 정보라 임직원 전원이 볼 수 있어야 하는데,
--   그 테이블을 열면 연차까지 함께 열리므로 등급이 맞지 않는다.
--   실제로 HUB 대시보드의 근속일(D+n)이 MANAGEMENT 권한자 외에는 조용히 비어 있었다.
--   회사/직책/직급/호봉이 이미 users.profile에 있으므로 입사일도 같은 자리로 모은다.
--
-- hr_profiles.hire_date는 남겨두되(연차 로직과 함께 쓰이는 인사 원장) 화면의 원천은
-- users.profile.hire_date 하나다. 기존 값이 유실되지 않도록 여기서 한 번 백필한다.
--
-- 보안 게이트 체크리스트(11_migration_security_gate.md):
--  · 소유 워크스페이스: management(임직원 마스터) / 데이터 등급: Personal
--  · 신규 테이블/컬럼/RPC/Storage 정책 없음 — 기존 users.profile jsonb 데이터 백필만
--  · RLS 정책 변경 없음: 조회는 users_select(내부 임직원 전원, 20260708140000),
--    수정은 users_update(admin / management write, 20260708130000) 그대로 적용된다
--  · 본인 수정 RPC(update_my_profile)의 키 화이트리스트에는 hire_date가 없다 →
--    본인이 자기 입사일을 바꿀 수 없다(의도한 경계)
--  · SECURITY DEFINER 함수 없음 / DELETE 없음 / 개인정보 Export 아님
-- 근거: 20260705210000_management_schema.sql(hr_profiles+RLS),
--       20260708120000_users_profile_columns.sql, 20260708140000(users_select 확대)
-- =====================================================================

-- 기존 인사 원장의 입사일을 users.profile로 백필한다.
-- 이미 profile.hire_date가 있는 행은 화면에서 입력된 최신값이므로 건드리지 않는다.
update public.users u
   set profile = coalesce(u.profile, '{}'::jsonb)
                 || jsonb_build_object('hire_date', to_char(h.hire_date, 'YYYY-MM-DD'))
  from public.hr_profiles h
 where h.user_id = u.id
   and h.hire_date is not null
   and coalesce(u.profile, '{}'::jsonb) ->> 'hire_date' is null;
