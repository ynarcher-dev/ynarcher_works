-- =====================================================================
-- [Phase 15] NETWORKS '내 네트워크' — 기여 이력 기반 10종 통합 목록 RPC
-- 배경: NETWORKS는 담당자 축이 없고(공동 관리 모델) 10종 엔티티가 물리적으로 분리되어 있어,
--   "내가 관여한 네트워크"를 한 목록으로 보려면 다형 기여 이력(entity_contributions)과
--   각 원장을 조인해야 한다. PostgREST로는 다형 조인·중복 제거·서버 페이지네이션이 불가하므로 RPC로 제공한다.
--
-- 판정 기준: entity_contributions.user_id = 호출자. action은 created/merged/enriched/edited 전부 포함한다
--   (created_by는 20260707150000에서 action='created' 기여로 백필되어 등록자 기준의 상위집합).
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: networks
--   - 데이터 등급: Personal (이메일·연락처 포함) → 목록 마스킹은 기존 화면 규칙을 그대로 따른다.
--   - 접근 주체: 내부 사용자. 게스트는 base 테이블 RLS로 차단된다.
--   - **SECURITY DEFINER를 쓰지 않는다(SECURITY INVOKER 기본).** 따라서 entity_contributions와
--     10종 원장의 기존 RLS가 그대로 적용되어 권한 우회 경로가 생기지 않는다.
--   - 호출자 판정은 app.current_app_user_id()로 하며 인자로 user_id를 받지 않는다
--     (남의 기여 이력을 조회하도록 유도할 수 없게 한다).
--   - 신규 테이블/정책/Storage/Export 경로 없음. 조회 전용.
-- 근거: 20260707150000_networks_contributions.sql(기여 이력), 20260707120000_networks_unify_profile_schema.sql(통일 컬럼),
--       apps/works/src/features/networks/config.ts(DIRECTORY_ENTITIES 10종)
-- =====================================================================

create or replace function public.my_network_entities(
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
  -- 디렉토리 10종 원장을 통일 컬럼으로 정규화한다(config.ts DIRECTORY_ENTITIES와 동일 목록).
  directory as (
    select 'van'::text          as t, x.id, x.name, x.affiliation, x.email, x.phone from public.van          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'exp',                  x.id, x.name, x.affiliation, x.email, x.phone from public.exp          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'experts',              x.id, x.name, x.affiliation, x.email, x.phone from public.experts      x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'investors',            x.id, x.name, x.affiliation, x.email, x.phone from public.investors    x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'corporates',           x.id, x.name, x.affiliation, x.email, x.phone from public.corporates   x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'institutions',         x.id, x.name, x.affiliation, x.email, x.phone from public.institutions x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'universities',         x.id, x.name, x.affiliation, x.email, x.phone from public.universities x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'vendors',              x.id, x.name, x.affiliation, x.email, x.phone from public.vendors      x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'etc',                  x.id, x.name, x.affiliation, x.email, x.phone from public.etc          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'others',               x.id, x.name, x.affiliation, x.email, x.phone from public.others       x where x.deleted_at is null and x.merged_into_id is null
  ),
  joined as (
    select d.t as entity_table, d.id, d.name, d.affiliation, d.email, d.phone,
           m.last_action, m.last_at
    from mine m
    join directory d on d.t = m.entity_table and d.id = m.entity_id
    where p_keyword is null or btrim(p_keyword) = ''
       or d.name ilike '%' || btrim(p_keyword) || '%'
       or d.affiliation ilike '%' || btrim(p_keyword) || '%'
  )
  select
    j.entity_table,
    j.id,
    j.name,
    j.affiliation,
    j.email,
    j.phone,
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
  '호출자가 등록·편집·병합에 관여한 NETWORKS 10종 통합 목록(기여 이력 기준). SECURITY INVOKER — base 테이블 RLS를 그대로 따른다.';
