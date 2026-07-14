-- =====================================================================
-- [Phase 2] NETWORKS 마스터 등록자(created_by) 자동 기록 + 기존 행 백필
-- 목적: 마스터 레코드 등록 시 등록자(created_by)를 현재 로그인 사용자로 자동
--       채워, 목록/상세의 "등록자" 표시가 비지 않도록 한다.
-- 배경: 기존에는 created_by에 default/트리거가 없고 INSERT 경로(useCreateEntity·
--       promote_to_invested·대량업로드)도 값을 넣지 않아 모든 행이 NULL이 되어
--       등록자 컬럼이 "-"로 표시되었다.
-- 범위: NETWORKS 표시 엔티티 13종. 담당자(startup_managers)와는 별개 축이다.
-- 처리:
--   (1) 기본값: 신규 등록분은 app.current_app_user_id()로 등록자를 자동 기록.
--   (2) 백필: 기존 NULL 행은 원 등록자 이력이 없어, 운영자 요청(2026-07-14)에 따라
--            현 운영자 계정(dev@ynarcher.com / 염재민)으로 일괄 근사 귀속한다.
--            대상 계정이 없는 환경(로컬/CI 등 데이터 없음)에서는 백필을 건너뛴다.
-- 보안: RLS/정책 변경 없음(기존 유지). default 표현식은 auth.jwt() 직접 파싱이 아니라
--       app.current_app_user_id() 헬퍼를 경유한다. 세션이 없으면 NULL이 되어 신규
--       실패를 유발하지 않는다. NOT NULL 제약은 추가하지 않는다.
-- 근거: docs/docs_dev/11_migration_security_gate.md
--       docs/docs_planning/3_3_1_startup_pool_classification.md §4.0(등록자 정의)
-- =====================================================================

do $$
declare
  t text;
  -- NETWORKS 표시 엔티티(마스터 SSOT). 등록자 컬럼을 노출하는 대상 전체.
  tables text[] := array[
    'startups', 'experts', 'partners',
    'van', 'investors', 'corporates', 'institutions', 'universities', 'others',
    'vendors', 'etc', 'exp', 'global_networks'
  ];
  backfill_uid uuid;
begin
  -- (1) 신규 등록분 등록자 자동 기록 기본값.
  foreach t in array tables loop
    execute format(
      'alter table public.%I alter column created_by set default app.current_app_user_id();',
      t
    );
  end loop;

  -- (2) 기존 NULL 행 일괄 백필(현 운영자 계정으로 근사 귀속). 이메일 우선, 이름 폴백.
  select id
    into backfill_uid
    from public.users
   where deleted_at is null
     and (lower(email) = lower('dev@ynarcher.com') or name = '염재민')
   order by (lower(email) = lower('dev@ynarcher.com')) desc, created_at
   limit 1;

  if backfill_uid is null then
    raise notice '백필 대상 계정(dev@ynarcher.com / 염재민)이 없어 기존 행 백필을 건너뜁니다.';
  else
    foreach t in array tables loop
      execute format(
        'update public.%I set created_by = %L where created_by is null;',
        t, backfill_uid
      );
    end loop;
  end if;
end $$;
