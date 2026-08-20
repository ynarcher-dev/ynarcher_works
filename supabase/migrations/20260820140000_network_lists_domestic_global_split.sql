-- =====================================================================
-- NETWORKS 목록 재편: 국내 통합 목록에 지표·필터를 싣고, 글로벌에 '내 것' 범위를 연다
--
-- 배경: 사이드바가 원장별 8개 메뉴(전문가·투자사·BAN·EXP·기업·기관·대학·기타)를 나열하던
--   구조를 접고, 국내는 통합 목록 한 쌍(내 업로드 DB / 전체 네트워크), 글로벌도 같은 한 쌍,
--   미분류는 그대로 한 줄 — 다섯 줄로 정리한다. 분류를 메뉴로 두면 그것이 '어디에 있는가'가
--   되어 영역·활동 같은 다른 축과 함께 걸 수 없고, 원장을 하나 늘릴 때마다 사이드바가 길어진다
--   (AC 사업구분 2026-08-03, STARTUP 구분 2026-08-20이 먼저 밟은 길과 같다).
--
-- 이 마이그레이션이 여는 것은 셋이다.
--
--   1) 통합 목록에 활동·만족도 집계를 싣는다. 원장별 목록이 사라지면서 그 목록이 보여 주던
--      영역·활동·만족도 열도 함께 사라지는데, 통합 목록 RPC는 지금 이 두 집계를 돌려주지
--      않는다. 디렉토리 목록이 쓰던 network_entity_metrics()를 같은 방식으로 조인한다.
--      조직형(기업·기관·대학·기타)은 참여 원장에 행이 없어 활동 0·만족도 NULL로 남는다 —
--      열은 서되 값이 비는 형태이며, 이는 통합 목록이 원장별로 열을 갈지 않기 위한 대가다.
--
--   2) 통합 목록에 영역·매칭·활동·만족도 필터 축을 연다. 원장별 목록이 갖고 있던 축이라
--      메뉴만 접고 축을 버리면 '영역으로 전문가를 좁히는' 일 자체가 사라진다. 필터 축은
--      그 목록에 실제로 노출된 열에서만 고른다는 규칙(filters.ts)은 그대로다 — 위 1)로
--      네 열이 통합 목록에 서기 때문에 축으로 둘 수 있다.
--
--   3) 글로벌 목록에 '내 것' 범위를 연다. 종전에 글로벌은 '전체' 하나뿐이었고 내가 올린
--      글로벌 레코드는 국내가 섞인 통합 '내 네트워크'에서만 보였다. 국내와 글로벌을 각각
--      한 쌍으로 세우려면 글로벌도 같은 범위 축을 가져야 한다. 판정 기준은 국내와 같다 —
--      생성자(created_by)이거나 기여자(entity_contributions)면 내 것.
--      글로벌 목록은 국내와 열이 달라(권역·국가·링크드인) 통합 RPC로 흡수할 수 없으므로,
--      종전 PostgREST 조회를 대신하는 전용 RPC를 둔다. 범위 판정이 기여 로그와의 조인이라
--      클라이언트에서 id를 먼저 긁어 와 in()으로 거르면 그 id 목록의 상한이 곧 목록의 상한이
--      된다 — 서버가 범위·검색·필터·페이지네이션을 한 곳에서 처리해야 한다.
--
-- 인자 목록이 바뀌므로 통합 RPC 둘은 drop 후 재생성한다. 반환 열은 뒤에 두 개
-- (activity_count·satisfaction_avg)를 더할 뿐이라 기존 호출부의 열 규약은 유지된다.
--
-- 아울러 my_network_entities가 함수 안에 들고 있던 원장 11종 union을 걷어내고
-- app.network_entities_union 뷰를 쓰게 한다(20260731230000이 all_network_entities용으로
-- 뽑아 둔 그 뷰다). 같은 union이 두 벌 있으면 원장이 늘 때 한쪽만 고쳐질 수 있다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 소유 워크스페이스: networks. 데이터 등급: Personal(이메일·연락처 포함).
--   - 신규/재생성 RPC 3종 모두 SECURITY INVOKER(기본). 원장 11종·global_networks·
--     entity_contributions·users·region_tags·country_tags의 기존 RLS가 호출자 기준으로
--     그대로 걸린다. DEFINER로 만들면 각 원장의 정책을 함수 안에 복제해야 하고 그 복제본이
--     곧 권한 구멍이 된다.
--   - 활동·만족도 집계만 기존 network_entity_metrics()(SECURITY DEFINER)를 경유하는데,
--     그 함수는 첫 조건이 app.can_read_workspace('networks')이고 반환값이 건수·평균이라
--     개인 평가 원문이 넘어가지 않는다. 이번 변경은 그 함수를 호출하는 자리를 늘릴 뿐
--     함수 자체와 노출 경계를 건드리지 않는다.
--   - 호출자 판정은 app.current_app_user_id()이며 user_id를 인자로 받지 않는다.
--   - search_path = app, public 고정. GRANT EXECUTE는 authenticated 한정.
--   - 신규 테이블·정책·트리거·Storage·DELETE 없음. soft delete 규약 불변
--     (deleted_at is null / merged_into_id is null 조건 유지).
--   - 개인정보 노출 범위 불변: 이메일·연락처가 검색어에 닿는지는 화면의 민감정보 정책이
--     인자로 정하고(서버가 같은 인자로 강제), 값 자체의 노출은 기존 목록 마스킹이 판정한다.
--   - 감사 로그 영향 없음(조회 전용, 페이지당 상한이 걸리는 목록 경로).
-- 근거: 20260731190000_network_directory_search_metrics.sql(집계·필터 규약),
--       20260731200000_my_network_entities_global.sql(원장 11종 정규화·반환 열 규약),
--       20260731230000_all_network_entities.sql(union 뷰·총 건수 분리)
-- =====================================================================

-- ── 1. 국내/글로벌 통합 목록: 전체 범위 ────────────────────────────────
drop function if exists public.all_network_entities(text, integer, integer, text[], boolean, boolean);

create function public.all_network_entities(
  p_keyword          text    default null,
  p_limit            integer default 30,
  p_offset           integer default 0,
  -- 구분(원장 테이블명). 빈 배열/NULL이면 거르지 않는다.
  -- 화면은 이 인자로 목록의 담는 범위도 정한다 — 국내 목록은 국내 원장만, 글로벌은 글로벌만.
  p_entities         text[]  default null,
  p_search_email     boolean default false,
  p_search_phone     boolean default false,
  -- 아래 넷은 디렉토리 목록(network_directory_entities)이 갖고 있던 축을 그대로 옮긴 것이다.
  -- 영역(expertise jsonb 배열). 하나라도 들어 있으면 통과(?| 연산자).
  p_expertise        text[]  default null,
  -- 매칭 가능여부. 'possible' | 'impossible' | NULL(거르지 않음).
  p_match            text    default null,
  -- 활동 건수 범위. 집계가 없는 인물은 0건으로 본다(0은 실제 값이다).
  p_activity_min     integer default null,
  p_activity_max     integer default null,
  -- 만족도 범위. 평가가 없으면(NULL) 어느 쪽 경계로도 잡히지 않는다 —
  -- 만족도로 거른다는 것은 '평가가 있는 인물 중에서'라는 뜻이다.
  p_satisfaction_min numeric default null,
  p_satisfaction_max numeric default null
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
  activity_count      bigint,
  satisfaction_avg    numeric,
  total_count         bigint
)
language sql
stable
set search_path = app, public
as $$
  with m as (
    select * from public.network_entity_metrics()
  ),
  filtered as (
    select d.entity_table, d.id, d.name, d.affiliation, d.email, d.phone,
           d.profile, d.expertise, d.created_by, d.updated_at,
           coalesce(mm.activity_count, 0)::bigint as activity_count,
           mm.satisfaction_avg
      from app.network_entities_union d
      left join m mm on mm.entity_id = d.id
     where (p_entities is null or cardinality(p_entities) = 0 or d.entity_table = any(p_entities))
       -- 검색 범위: 이름·소속은 항상, 이메일·연락처는 목록에서 공개된 경우에만 닿는다.
       and (p_keyword is null or btrim(p_keyword) = ''
            or d.name ilike '%' || btrim(p_keyword) || '%'
            or d.affiliation ilike '%' || btrim(p_keyword) || '%'
            or (p_search_email and d.email ilike '%' || btrim(p_keyword) || '%')
            or (p_search_phone and d.phone ilike '%' || btrim(p_keyword) || '%'))
       and (p_expertise is null or cardinality(p_expertise) = 0 or d.expertise ?| p_expertise)
       -- 매칭 배지와 같은 규칙: 값이 비어 있으면 '가능'이 기본이다.
       and (p_match is null
            or (p_match = 'possible'
                and coalesce(nullif(d.profile ->> 'match_available', ''), 'true') in ('true', 'available'))
            or (p_match = 'impossible'
                and coalesce(nullif(d.profile ->> 'match_available', ''), 'true') not in ('true', 'available')))
       and (p_activity_min is null or coalesce(mm.activity_count, 0) >= p_activity_min)
       and (p_activity_max is null or coalesce(mm.activity_count, 0) <= p_activity_max)
       and (p_satisfaction_min is null or mm.satisfaction_avg >= p_satisfaction_min)
       and (p_satisfaction_max is null or mm.satisfaction_avg <= p_satisfaction_max)
  )
  select
    f.entity_table,
    f.id,
    f.name,
    f.affiliation,
    f.email,
    f.phone,
    f.profile,
    f.expertise,
    f.created_by,
    u.name as creator_name,
    f.updated_at,
    -- 기여 이력은 '내 것' 목록의 축이다. 전체 목록에서는 남의 레코드에 내 기여 시각이 없어
    -- 뜻이 서지 않으므로 비운다(반환 열은 두 범위가 같은 규약을 쓰도록 유지한다).
    null::text        as last_action,
    null::timestamptz as last_contributed_at,
    f.activity_count,
    f.satisfaction_avg,
    -- 총 건수는 윈도우로 읽는다. 20260731230000은 이를 하위 질의로 떼어내 본문이 30건에서
    -- 멈추게 했지만, 활동·만족도가 열로 서면서 그 전제가 성립하지 않는다 — 두 값은 참여 원장을
    -- 통째로 집계해야 나오는 파생값이라(network_entity_metrics는 SECURITY DEFINER라 인라인되지
    -- 않는다) 한 건만 보여도 집계는 전부 돌고, 그 집계에 걸리는 필터는 조기 종료를 막는다.
    -- 이 상태에서 조건을 두 벌로 두면 같은 무거운 훑기를 두 번 하게 된다. 디렉토리 목록
    -- (network_directory_entities)이 같은 이유로 처음부터 윈도우 카운트를 쓴다.
    count(*) over () as total_count
  from filtered f
  left join public.users u on u.id = f.created_by
  -- 디렉토리 목록과 같은 이름순. 동명이인 페이지가 흔들리지 않도록 원장명을 보조 기준으로 둔다.
  order by f.name asc, f.entity_table asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.all_network_entities(
  text, integer, integer, text[], boolean, boolean, text[], text, integer, integer, numeric, numeric
) to authenticated;

comment on function public.all_network_entities(
  text, integer, integer, text[], boolean, boolean, text[], text, integer, integer, numeric, numeric
) is
  '호출자가 볼 수 있는 NETWORKS 통합 목록 전체. 담는 원장 범위·필터 축은 p_entities가 정하며(국내 목록은 국내 원장만, 글로벌은 글로벌만 넘긴다) 영역·매칭·활동·만족도 필터와 활동·만족도 집계를 함께 처리한다. SECURITY INVOKER — 원장별 RLS를 그대로 따른다.';

-- ── 2. 국내/글로벌 통합 목록: 내 것 범위 ───────────────────────────────
drop function if exists public.my_network_entities(text, integer, integer, text[], boolean, boolean);

create function public.my_network_entities(
  p_keyword          text    default null,
  p_limit            integer default 30,
  p_offset           integer default 0,
  p_entities         text[]  default null,
  p_search_email     boolean default false,
  p_search_phone     boolean default false,
  p_expertise        text[]  default null,
  p_match            text    default null,
  p_activity_min     integer default null,
  p_activity_max     integer default null,
  p_satisfaction_min numeric default null,
  p_satisfaction_max numeric default null
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
  activity_count      bigint,
  satisfaction_avg    numeric,
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
  m as (
    select * from public.network_entity_metrics()
  ),
  -- 생성자(created_by)이거나 기여자(mine)이면 내 것으로 본다.
  -- 기여 로그가 없는 등록 건은 '등록(created)' + 등록 시각으로 표기한다.
  filtered as (
    select d.entity_table, d.id, d.name, d.affiliation, d.email, d.phone,
           d.profile, d.expertise, d.created_by, d.updated_at,
           coalesce(mc.last_action, 'created') as last_action,
           coalesce(mc.last_at, d.created_at)  as last_at,
           coalesce(mm.activity_count, 0)::bigint as activity_count,
           mm.satisfaction_avg
      from app.network_entities_union d
      left join mine mc on mc.entity_table = d.entity_table and mc.entity_id = d.id
      left join m mm on mm.entity_id = d.id
     where (d.created_by = app.current_app_user_id() or mc.entity_id is not null)
       and (p_entities is null or cardinality(p_entities) = 0 or d.entity_table = any(p_entities))
       and (p_keyword is null or btrim(p_keyword) = ''
            or d.name ilike '%' || btrim(p_keyword) || '%'
            or d.affiliation ilike '%' || btrim(p_keyword) || '%'
            or (p_search_email and d.email ilike '%' || btrim(p_keyword) || '%')
            or (p_search_phone and d.phone ilike '%' || btrim(p_keyword) || '%'))
       and (p_expertise is null or cardinality(p_expertise) = 0 or d.expertise ?| p_expertise)
       and (p_match is null
            or (p_match = 'possible'
                and coalesce(nullif(d.profile ->> 'match_available', ''), 'true') in ('true', 'available'))
            or (p_match = 'impossible'
                and coalesce(nullif(d.profile ->> 'match_available', ''), 'true') not in ('true', 'available')))
       and (p_activity_min is null or coalesce(mm.activity_count, 0) >= p_activity_min)
       and (p_activity_max is null or coalesce(mm.activity_count, 0) <= p_activity_max)
       and (p_satisfaction_min is null or mm.satisfaction_avg >= p_satisfaction_min)
       and (p_satisfaction_max is null or mm.satisfaction_avg <= p_satisfaction_max)
  )
  select
    f.entity_table,
    f.id,
    f.name,
    f.affiliation,
    f.email,
    f.phone,
    f.profile,
    f.expertise,
    f.created_by,
    u.name as creator_name,
    f.updated_at,
    f.last_action,
    f.last_at as last_contributed_at,
    f.activity_count,
    f.satisfaction_avg,
    count(*) over () as total_count
  from filtered f
  left join public.users u on u.id = f.created_by
  order by f.last_at desc, f.name asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.my_network_entities(
  text, integer, integer, text[], boolean, boolean, text[], text, integer, integer, numeric, numeric
) to authenticated;

comment on function public.my_network_entities(
  text, integer, integer, text[], boolean, boolean, text[], text, integer, integer, numeric, numeric
) is
  '호출자가 생성자(created_by)이거나 기여자(entity_contributions)인 NETWORKS 통합 목록. all_network_entities와 인자·반환 열 규약이 같고 범위와 정렬(최근 기여순)만 다르다. SECURITY INVOKER — 원장별 RLS를 그대로 따른다.';

-- ── 3. 글로벌 네트워크 목록(범위 축 포함) ──────────────────────────────
-- 종전에는 화면이 PostgREST로 직접 조회했다(권역·국가 태그 임베드 + count exact).
-- '내 것' 범위가 기여 로그와의 조인이라 그 방식으로는 서버에서 거를 수 없어 RPC로 내린다.
-- 반환 열은 종전 조회가 화면에 주던 것과 같고, 조인 임베드였던 권역·국가·생성자만
-- 평면 컬럼(region_name/country_name/creator_name)으로 돌려준다 — 통합 목록 RPC가 쓰는
-- 규약과 같으며, 화면이 기존 중첩 형태로 되담는다.
create or replace function public.global_network_entities(
  p_keyword      text    default null,
  -- true면 내가 생성했거나 기여한 글로벌 레코드만. 국내 통합 목록의 '내 것' 판정과 같은 기준이다.
  p_mine         boolean default false,
  p_regions      uuid[]  default null,
  p_countries    uuid[]  default null,
  -- 구분(category) 고정 3값(기업/기관/투자자). 국내와 달리 원장이 아니라 스칼라 속성이라 축이 된다.
  p_categories   text[]  default null,
  p_search_email boolean default false,
  p_search_phone boolean default false,
  p_limit        integer default 30,
  p_offset       integer default 0
)
returns table (
  id             uuid,
  name           text,
  affiliation    text,
  email          text,
  phone          text,
  linkedin_url   text,
  category       text,
  region_tag_id  uuid,
  country_tag_id uuid,
  region_name    text,
  country_name   text,
  profile        jsonb,
  expertise      jsonb,
  is_provisional boolean,
  created_by     uuid,
  creator_name   text,
  created_at     timestamptz,
  updated_at     timestamptz,
  total_count    bigint,
  total_all      bigint
)
language sql
stable
set search_path = app, public
as $$
  with scoped as (
    select g.*
      from public.global_networks g
     where g.deleted_at is null
       and g.merged_into_id is null
       and (not p_mine
            or g.created_by = app.current_app_user_id()
            or exists (
                 select 1
                   from public.entity_contributions c
                  where c.entity_table = 'global_networks'
                    and c.entity_id = g.id
                    and c.user_id = app.current_app_user_id()))
  ),
  filtered as (
    select s.*
      from scoped s
     where (p_keyword is null or btrim(p_keyword) = ''
            or s.name ilike '%' || btrim(p_keyword) || '%'
            or s.affiliation ilike '%' || btrim(p_keyword) || '%'
            or (p_search_email and s.email ilike '%' || btrim(p_keyword) || '%')
            or (p_search_phone and s.phone ilike '%' || btrim(p_keyword) || '%'))
       and (p_regions is null or cardinality(p_regions) = 0 or s.region_tag_id = any(p_regions))
       and (p_countries is null or cardinality(p_countries) = 0 or s.country_tag_id = any(p_countries))
       and (p_categories is null or cardinality(p_categories) = 0 or s.category = any(p_categories))
  )
  select
    f.id, f.name, f.affiliation, f.email, f.phone,
    f.linkedin_url, f.category, f.region_tag_id, f.country_tag_id,
    r.name as region_name,
    c.name as country_name,
    f.profile, f.expertise, f.is_provisional,
    f.created_by, u.name as creator_name,
    f.created_at, f.updated_at,
    count(*) over () as total_count,
    -- 검색·필터를 걷어낸 범위 안의 전체 건수(목록 하단 "n건 중 m건" 표기의 분모).
    -- 범위(p_mine)는 걷어내지 않는다 — '내 업로드 DB'의 분모는 내 것 전체다.
    (select count(*) from scoped) as total_all
  from filtered f
  left join public.region_tags  r on r.id = f.region_tag_id
  left join public.country_tags c on c.id = f.country_tag_id
  left join public.users        u on u.id = f.created_by
  order by f.name asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

grant execute on function public.global_network_entities(
  text, boolean, uuid[], uuid[], text[], boolean, boolean, integer, integer
) to authenticated;

comment on function public.global_network_entities(
  text, boolean, uuid[], uuid[], text[], boolean, boolean, integer, integer
) is
  '글로벌 네트워크 목록(범위·검색·권역/국가/구분 필터·서버 페이지네이션). p_mine은 국내 통합 목록과 같은 기준(생성자 또는 기여자)으로 내 것을 가른다. SECURITY INVOKER — global_networks·entity_contributions의 RLS를 그대로 따른다.';
