-- =====================================================================
-- [Phase 15] NETWORKS '내 네트워크' — 기여 이력 기반 10종 통합 목록 RPC
-- 배경: NETWORKS는 담당자 축이 없고(공동 관리 모델) 10종 엔티티가 물리적으로 분리되어 있어,
--   "내가 관여한 네트워크"를 한 목록으로 보려면 다형 기여 이력(entity_contributions)과
--   각 원장을 조인해야 한다. PostgREST로는 다형 조인·중복 제거·서버 페이지네이션이 불가하므로 RPC로 제공한다.
--
-- 판정 기준: **등록자(created_by = 호출자) 또는 기여자(entity_contributions.user_id = 호출자)**.
--   기여 action은 created/merged/enriched/edited를 전부 포함한다.
--   두 축을 모두 보는 이유: 20260707150000이 기존 created_by를 action='created' 기여로 백필했으나,
--   생성 시 기여를 자동 기록하는 트리거 가드는 아직 켜지지 않았다(같은 파일 헤더 주석).
--   따라서 백필 이후 등록된 건은 기여 로그가 없을 수 있어, 기여 이력만 보면 누락이 생긴다.
--   (다른 워크스페이스의 '내 ~' 탭도 동일하게 '등록자 또는 담당자' 정의를 따른다.)
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
    select 'van'::text          as t, x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.van          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'exp',                  x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.exp          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'experts',              x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.experts      x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'investors',            x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.investors    x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'corporates',           x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.corporates   x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'institutions',         x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.institutions x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'universities',         x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.universities x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'vendors',              x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.vendors      x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'etc',                  x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.etc          x where x.deleted_at is null and x.merged_into_id is null
    union all
    select 'others',               x.id, x.name, x.affiliation, x.email, x.phone, x.created_by, x.created_at from public.others       x where x.deleted_at is null and x.merged_into_id is null
  ),
  -- 등록자(created_by) 또는 기여자(mine) 중 하나라도 해당하면 내 네트워크로 본다.
  -- 기여 로그가 없는 등록 건은 '등록(created)' + 등록 시각으로 표기한다.
  joined as (
    select d.t as entity_table, d.id, d.name, d.affiliation, d.email, d.phone,
           coalesce(m.last_action, 'created') as last_action,
           coalesce(m.last_at, d.created_at)  as last_at
    from directory d
    left join mine m on m.entity_table = d.t and m.entity_id = d.id
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
