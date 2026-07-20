-- =====================================================================
-- [Phase 15] '내 네트워크' RPC 반환 컬럼 확장 — 표준 마스터 목록 컬럼 지원
-- 배경: '내 네트워크'를 다른 네트워크 목록과 동일한 표 구성(이름·소속·부서·직책/직급·이메일·
--   연락처·구분 + 담당자·등록자·수정일·관리)으로 렌더하려면 공용 리스트뷰(MasterListView)가
--   요구하는 필드가 더 필요합니다. 부서/직책/구분은 profile(jsonb)에, 등록자명은 users 조인에 있습니다.
--
-- 20260720170000은 이미 운영에 적용되었으므로 파일을 수정하지 않고 여기서 함수를 재정의합니다.
--   반환 타입(returns table)이 바뀌므로 create or replace가 불가하여 drop 후 재생성합니다.
--
-- 판정 기준은 그대로입니다: 등록자(created_by = 호출자) 또는 기여자(entity_contributions).
--
-- 보안 게이트(11_migration_security_gate.md):
--   - SECURITY DEFINER를 쓰지 않습니다(SECURITY INVOKER). entity_contributions·10종 원장·users의
--     기존 RLS가 그대로 적용되어 권한 우회 경로가 없습니다.
--   - 호출자 판정은 계속 app.current_app_user_id()로 하며 user_id를 인자로 받지 않습니다.
--   - search_path 고정(app, public), GRANT EXECUTE는 authenticated 한정 — 유지.
--   - 이메일·연락처(Personal)를 반환하나 이는 기존 디렉토리 목록과 동일 범위이며,
--     화면 마스킹은 공용 리스트뷰의 민감정보 정책 토글이 담당합니다.
-- 근거: 20260720170000_my_network_entities.sql, apps/works/src/features/master/MasterListView.tsx
-- =====================================================================

drop function if exists public.my_network_entities(text, integer, integer);

create function public.my_network_entities(
  p_keyword text default null,
  p_limit   integer default 30,
  p_offset  integer default 0
)
returns table (
  entity_table        text,
  id                  uuid,
  name                text,
  affiliation         text,
  email               text,
  phone               text,
  profile             jsonb,
  expertise           jsonb,
  created_by          uuid,
  creator_name        text,
  updated_at          timestamptz,
  last_action         text,
  last_contributed_at timestamptz,
  total_count         bigint
)
language sql
stable
set search_path = app, public
as $$
  with mine as (
    select
      c.entity_table,
      c.entity_id,
      max(c.created_at) as last_at,
      (array_agg(c.action order by c.created_at desc))[1] as last_action
    from public.entity_contributions c
    where c.user_id = app.current_app_user_id()
    group by c.entity_table, c.entity_id
  ),
  -- 디렉토리 10종 원장을 통일 컬럼으로 정규화합니다(config.ts DIRECTORY_ENTITIES와 동일 목록).
  directory as (
    select 'van'::text          as t, x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.van          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'exp',                  x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.exp          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'experts',              x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.experts      x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'investors',            x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.investors    x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'corporates',           x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.corporates   x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'institutions',         x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.institutions x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'universities',         x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.universities x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'vendors',              x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.vendors      x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'etc',                  x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.etc          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'others',               x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.others       x where x.deleted_at is null and x.merged_into_id is null
  ),
  -- 등록자(created_by) 또는 기여자(mine) 중 하나라도 해당하면 내 네트워크로 봅니다.
  -- 기여 로그가 없는 등록 건은 '등록(created)' + 등록 시각으로 표기합니다.
  joined as (
    select d.t as entity_table, d.id, d.name, d.affiliation, d.email, d.phone,
           d.profile, d.expertise, d.created_by, u.name as creator_name, d.updated_at,
           coalesce(m.last_action, 'created') as last_action,
           coalesce(m.last_at, d.created_at)  as last_at
    from directory d
    left join mine m on m.entity_table = d.t and m.entity_id = d.id
    left join public.users u on u.id = d.created_by
    where (d.created_by = app.current_app_user_id() or m.entity_id is not null)
      and (p_keyword is null or btrim(p_keyword) = ''
           or d.name ilike '%' || btrim(p_keyword) || '%'
           or d.affiliation ilike '%' || btrim(p_keyword) || '%')
  )
  select
    j.entity_table,
    j.id,
    j.name,
    j.affiliation,
    j.email,
    j.phone,
    j.profile,
    j.expertise,
    j.created_by,
    j.creator_name,
    j.updated_at,
    j.last_action,
    j.last_at as last_contributed_at,
    count(*) over () as total_count
  from joined j
  order by j.last_at desc, j.name asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.my_network_entities(text, integer, integer) to authenticated;

comment on function public.my_network_entities(text, integer, integer) is
  '호출자가 등록자(created_by)이거나 기여자(entity_contributions)인 NETWORKS 10종 통합 목록. SECURITY INVOKER — base 테이블 RLS를 그대로 따른다.';
