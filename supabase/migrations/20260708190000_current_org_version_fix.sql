-- =====================================================================
-- [Phase 12] 조직 관리 — current_org_version_id() 활성 규칙 정정(종료일 반영)
-- 배경: 기존 함수는 effective_from<=오늘 중 최신 시작만 골라, 종료일이 지난(끝난) 버전도
--       '현재'로 잘못 선택했다(예: [07-05,07-07) 버전이 07-08에도 활성으로 잡힘).
-- 정정: 1) 오늘을 포함하는 버전([시작,종료), 종료 null=무기한) 중 가장 늦게 시작한 것.
--       2) 없으면(공백) 가장 최근에 종료된 버전 유지(직전). 그것도 없으면 null.
--       클라이언트 activeOrgVersionId와 동일 규칙.
-- 영향: 신규 테이블/정책 없음. 함수 본문만 교체(SECURITY INVOKER, search_path 고정 유지).
-- 근거: 20260708170000_dept_members.sql(함수 최초 정의)
-- =====================================================================

create or replace function public.current_org_version_id()
returns uuid
language sql
stable
set search_path = public, app
as $$
  with pub as (
    select id, effective_from, effective_to, created_at
      from public.org_versions
     where status = 'PUBLISHED' and deleted_at is null
  ),
  containing as (
    select id from pub
     where effective_from <= current_date
       and (effective_to is null or current_date < effective_to)
     order by effective_from desc, created_at desc
     limit 1
  ),
  ended as (
    select id from pub
     where effective_to is not null and effective_to <= current_date
     order by effective_to desc, created_at desc
     limit 1
  )
  select coalesce((select id from containing), (select id from ended));
$$;
