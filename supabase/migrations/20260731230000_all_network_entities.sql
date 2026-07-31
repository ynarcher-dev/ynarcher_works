-- =====================================================================
-- NETWORKS '전체 네트워크' 통합 목록 RPC
--
-- 배경: 사이드바 '전체 네트워크'는 지금까지 차트 대시보드였고, 통합 목록은 '내 네트워크'
--   하나뿐이었다. 두 화면이 답해야 하는 것은 같다 — 원장 11종을 한 표로 보는 것 —
--   이고 다른 것은 범위 하나뿐이므로(내가 관여한 것 / 볼 수 있는 전부), 목록은 같은 열·같은
--   필터·같은 상세 진입을 그대로 쓰고 범위만 갈라진다.
--
-- 왜 my_network_entities에 스코프 인자를 붙이지 않았나: 두 범위는 빠른 계획이 서로 다르다.
--   '내 것'은 기여 로그를 조인해 '내가 마지막으로 손댄 순'으로 정렬한다 — 범위가 한 사람이
--   만진 것으로 이미 좁아 조인 비용이 문제되지 않는다. '전체'는 그 조인이 의미가 없고
--   (남의 레코드에 내 기여 시각은 없다) 정렬도 이름순이라, 조인을 걷어내야 원장별 인덱스를
--   앞에서부터 30건만 읽고 멈출 수 있다. 한 함수에 두 계획을 넣으면 플래너가 어느 쪽도
--   제대로 세우지 못하므로 함수를 나눈다. 화면에서 보는 규약(인자·반환 열)은 동일하다.
--
-- 총 건수를 윈도우 함수로 세지 않는 이유: `count(*) over ()`는 전체 결과를 다 만들어야
--   값이 나오는 계산이라, 같은 쿼리에 `limit 30`이 있어도 원장 11종을 끝까지 훑게 만든다.
--   즉 페이지네이션이 무력화된다. 총 건수를 상관없는(uncorrelated) 하위 질의로 떼어내면
--   본문은 30건에서 멈추고 건수는 별도 집계로 한 번만 계산된다. 행마다 같은 값이 실려 오는
--   기존 규약(`total_count`)은 그대로라 화면은 손대지 않는다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 뷰 `app.network_entities_union`: `security_invoker = true`로 만든다. 원장 11종
--     각각의 기존 RLS가 호출자 기준으로 그대로 걸리므로 이 뷰로 볼 수 있는 행은 그 사용자가
--     원래 볼 수 있던 행과 정확히 같다. 노출 경계를 넓히지 않는다.
--     (public.portable_assets가 쓴 '뷰 안에 단일 가드' 방식과 다른 이유: 저 뷰는 컬럼을
--      추려 한 겹 가림막을 두는 자리지만, 이 뷰는 원장마다 다른 RLS를 그대로 살려야 한다.)
--   - 뷰를 `app` 스키마에 둔다. PostgREST에 노출되는 스키마가 아니므로 클라이언트가 이 뷰를
--     직접 조회할 수 없고, 진입점은 아래 RPC 하나로 유지된다.
--   - `revoke all from public` 후 `authenticated`에만 select 부여.
--   - 신규 함수는 SECURITY INVOKER(기본). DEFINER를 쓰지 않으므로 원장 RLS를 우회하지 않는다.
--     호출자 판정을 함수 안에 복제할 필요가 없고, 복제본이 권한 구멍이 될 여지도 없다.
--   - `search_path = app, public` 고정. `GRANT EXECUTE`는 `authenticated` 한정.
--   - 신규 테이블·정책·Storage·DELETE 없음. 개인정보 노출 범위 불변 — 이메일·연락처는
--     검색 참여 여부를 화면의 민감정보 정책이 인자로 정하고, 값 자체의 노출은 기존 목록
--     마스킹 정책이 그대로 판정한다.
--   - 감사 로그 영향 없음(조회 전용, 대량 Export 경로 아님 — 페이지당 상한이 걸린다).
-- 근거: 20260731200000_my_network_entities_global.sql(원장 11종 정규화 형태·반환 열 규약),
--       20260731220000_list_search_sort_indexes.sql(이름 정렬·부분일치 검색 인덱스)
-- =====================================================================

-- 1) 원장 11종 정규화 뷰 -------------------------------------------------------
-- my_network_entities가 함수 안에 갖고 있던 union을 밖으로 뽑는다. 원장이 늘거나 컬럼
-- 규약이 바뀔 때 고칠 자리를 하나로 모으기 위한 것이며, 뷰는 참조될 때 인라인되므로
-- 조건과 limit이 각 원장 쪽으로 내려가 인덱스가 그대로 쓰인다.
create or replace view app.network_entities_union
  with (security_invoker = true) as
  select 'van'::text            as entity_table, x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.van          x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'exp',                    x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.exp          x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'experts',                x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.experts      x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'investors',              x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.investors    x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'corporates',             x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.corporates   x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'institutions',           x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.institutions x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'universities',           x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.universities x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'vendors',                x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.vendors      x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'etc',                    x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.etc          x where x.deleted_at is null and x.merged_into_id is null
  union all
  select 'others',                 x.id, x.name, x.affiliation, x.email, x.phone, x.profile, x.expertise, x.created_by, x.created_at, x.updated_at from public.others       x where x.deleted_at is null and x.merged_into_id is null
  union all
  -- 글로벌은 구분이 스칼라 컬럼(category)이라 다른 원장과 같은 자리(profile.category)로 옮겨 담는다.
  -- 값이 없으면 열쇠를 만들지 않는다(빈 문자열을 넣으면 '구분 없음'과 '빈 구분'이 뒤섞인다).
  select 'global_networks',        x.id, x.name, x.affiliation, x.email, x.phone,
         case when x.category is null then coalesce(x.profile, '{}'::jsonb)
              else coalesce(x.profile, '{}'::jsonb) || jsonb_build_object('category', x.category) end,
         x.expertise, x.created_by, x.created_at, x.updated_at
    from public.global_networks x where x.deleted_at is null and x.merged_into_id is null;

revoke all on app.network_entities_union from public;
grant select on app.network_entities_union to authenticated;

comment on view app.network_entities_union is
  'NETWORKS 원장 11종(디렉토리 10 + 글로벌)을 통일 컬럼으로 정규화한 통합 조회면. security_invoker — 원장별 RLS가 호출자 기준으로 그대로 걸린다. app 스키마에 두어 PostgREST 직접 조회를 막고 진입점을 RPC로 한정한다.';

-- 2) 전체 스코프 통합 목록 RPC -------------------------------------------------
create or replace function public.all_network_entities(
  p_keyword      text    default null,
  p_limit        integer default 30,
  p_offset       integer default 0,
  -- 네트워크 종류(원장 테이블명). 빈 배열/NULL이면 거르지 않는다. 이 목록의 유일한 필터 축이다.
  p_entities     text[]  default null,
  p_search_email boolean default false,
  p_search_phone boolean default false
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
  select
    d.entity_table,
    d.id,
    d.name,
    d.affiliation,
    d.email,
    d.phone,
    d.profile,
    d.expertise,
    d.created_by,
    u.name as creator_name,
    d.updated_at,
    -- 기여 이력은 '내 네트워크'의 축이다. 전체 목록에서는 남의 레코드에 내 기여 시각이 없어
    -- 뜻이 서지 않으므로 비운다(반환 열은 두 목록이 같은 규약을 쓰도록 유지한다).
    null::text        as last_action,
    null::timestamptz as last_contributed_at,
    (
      select count(*)
        from app.network_entities_union c
       where (p_entities is null or cardinality(p_entities) = 0 or c.entity_table = any(p_entities))
         and (p_keyword is null or btrim(p_keyword) = ''
              or c.name ilike '%' || btrim(p_keyword) || '%'
              or c.affiliation ilike '%' || btrim(p_keyword) || '%'
              or (p_search_email and c.email ilike '%' || btrim(p_keyword) || '%')
              or (p_search_phone and c.phone ilike '%' || btrim(p_keyword) || '%'))
    ) as total_count
  from app.network_entities_union d
  left join public.users u on u.id = d.created_by
  -- 필터: 빈 배열도 '거르지 않음'으로 본다(화면이 선택을 모두 해제한 상태).
  where (p_entities is null or cardinality(p_entities) = 0 or d.entity_table = any(p_entities))
    -- 검색 범위: 이름·소속은 항상, 이메일·연락처는 목록에서 공개된 경우에만 닿는다.
    and (p_keyword is null or btrim(p_keyword) = ''
         or d.name ilike '%' || btrim(p_keyword) || '%'
         or d.affiliation ilike '%' || btrim(p_keyword) || '%'
         or (p_search_email and d.email ilike '%' || btrim(p_keyword) || '%')
         or (p_search_phone and d.phone ilike '%' || btrim(p_keyword) || '%'))
  -- 디렉토리 목록과 같은 이름순. 원장별 (name) 부분 인덱스를 병합해 읽으므로 limit이
  -- 앞에서 끊긴다. 동명이인 페이지가 흔들리지 않도록 원장명을 보조 기준으로 둔다.
  order by d.name asc, d.entity_table asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.all_network_entities(text, integer, integer, text[], boolean, boolean) to authenticated;

comment on function public.all_network_entities(text, integer, integer, text[], boolean, boolean) is
  '호출자가 볼 수 있는 NETWORKS 통합 목록 전체(디렉토리 10종 + 글로벌). ''내 네트워크''(my_network_entities)와 인자·반환 열 규약이 같고 범위와 정렬만 다르다. SECURITY INVOKER — 원장별 RLS를 그대로 따른다.';
