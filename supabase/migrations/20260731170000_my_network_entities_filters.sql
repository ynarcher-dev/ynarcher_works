-- =====================================================================
-- '내 네트워크' RPC에 목록 필터(네트워크 종류 · 구분) 추가
--
-- 배경: NETWORKS 목록에 필터가 붙으면서 디렉토리 9종·글로벌은 PostgREST 쿼리에 조건을 얹어
--   해결됐지만, '내 네트워크 관리'는 10종을 union하는 RPC가 서버 페이지네이션까지 소유한다.
--   클라이언트에서 거르면 지금 페이지에 실려 온 30건 안에서만 걸러져, 2페이지에 있는 대상이
--   사라진 것처럼 보인다. 그래서 필터를 RPC 안으로 넣는다.
--
--   필터 축은 이 목록에 실제로 노출된 열에서 고른다 — 종류가 섞인 목록이라 '어느 네트워크인가'
--   (entity_table)가 첫 축이고, 그다음이 구분(profile->>category)이다. 분야·매칭은 이 목록의
--   컬럼 구성(NETWORK_ORG_COLUMNS)에 없으므로 축으로 두지 않는다.
--
-- 반환 컬럼과 판정 기준(등록자 또는 기여자)은 20260720190000과 동일하다. 인자만 늘어난다.
--   인자 목록이 바뀌어 create or replace가 불가하므로 drop 후 재생성한다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - SECURITY INVOKER 유지. entity_contributions·10종 원장·users의 기존 RLS가 그대로 걸린다.
--   - 호출자 판정은 계속 app.current_app_user_id()이며 user_id를 인자로 받지 않는다
--     (인자로 받으면 남의 목록을 조회하는 경로가 열린다).
--   - 새 인자는 필터일 뿐 노출 범위를 넓히지 않는다 — 반환 행 집합은 항상 기존 조건의 부분집합이다.
--   - search_path 고정(app, public), GRANT EXECUTE는 authenticated 한정 — 유지.
--   - 신규 테이블/정책 없음. 감사 로그·파일·Export 영향 없음.
-- 근거: 20260720190000_my_network_entities_list_columns.sql
-- =====================================================================

drop function if exists public.my_network_entities(text, integer, integer);

create function public.my_network_entities(
  p_keyword    text default null,
  p_limit      integer default 30,
  p_offset     integer default 0,
  -- 네트워크 종류(원장 테이블명). 빈 배열/NULL이면 거르지 않는다.
  p_entities   text[] default null,
  -- 구분(profile->>category) 태그명. 빈 배열/NULL이면 거르지 않는다.
  p_categories text[] default null
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
      -- 필터: 빈 배열도 '거르지 않음'으로 본다(화면이 선택을 모두 해제한 상태).
      and (p_entities is null or cardinality(p_entities) = 0 or d.t = any(p_entities))
      and (p_categories is null or cardinality(p_categories) = 0
           or (d.profile ->> 'category') = any(p_categories))
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

grant execute on function public.my_network_entities(text, integer, integer, text[], text[]) to authenticated;

comment on function public.my_network_entities(text, integer, integer, text[], text[]) is
  '호출자가 생성자(created_by)이거나 기여자(entity_contributions)인 NETWORKS 10종 통합 목록. 종류·구분 필터 지원. SECURITY INVOKER — base 테이블 RLS를 그대로 따른다.';
