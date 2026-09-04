-- 20260904140000 — NETWORKS 구분 축에 '미지정'을 합친다(AND → OR).
--
-- 왜: 미분류를 사이드바 메뉴에서 내리고 목록의 구분 필터 선택지 하나로 옮겼다. AC 사업구분
-- (2026-08-03)·STARTUP/FUND 구분(2026-08-20)이 먼저 밟은 길과 같다 — 분류를 메뉴로 두면 그것이
-- '어디에 있는가'가 되어 지역·영역 같은 다른 축과 함께 걸 수 없다.
--
-- 그런데 통합 원장(20260904120000)의 목록 RPC는 구분 배열(p_categories)과 미분류 축
-- (p_uncategorized)을 **AND로** 묶고 있었다. 두 축이 각자 자기 메뉴를 갖던 시절에는 그것으로
-- 충분했으나(미분류 목록은 구분 조건을 걸지 않는다), 한 필터 안에 나란히 서는 순간
-- '투자사 또는 미지정'이 늘 0건이 된다 — 고를 수 있다고 말하면서 아무것도 답하지 않는 조합이다.
--
-- 무엇을: 두 인자를 한 축으로 합쳐 OR로 판정한다. 인자 시그니처는 그대로라 기존 호출은
-- 뜻이 바뀌지 않는다(배열만 주면 그 구분들, true만 주면 미지정만, 둘 다 주면 합집합).
-- 함수 본문은 20260904120000에서 그대로 가져오고 이 조건 한 블록만 바꾼다.
--
-- 보안: 두 함수 모두 SECURITY INVOKER 유지(public.networks의 RLS를 그대로 탄다). create or
-- replace는 소유자·권한을 보존하므로 revoke/grant를 다시 쓰지 않는다. 새 테이블·정책·
-- SECURITY DEFINER 추가 없음.

create or replace function public.all_network_entities(
  p_keyword          text    default null,
  p_limit            integer default 30,
  p_offset           integer default 0,
  -- 구분 코드. 빈 배열/NULL이면 거르지 않는다.
  p_categories       text[]  default null,
  -- 미지정 축: NULL=상관없음, true=미지정 포함, false=구분이 있는 행만.
  -- 별개 인자인 이유는 '값이 없다'를 배열 원소로 표현할 수 없어서다. 다만 판정은 구분
  -- 배열과 한 축이다(OR) — 목록 필터에서 '미지정'이 구분 선택지 옆에 서기 때문이다.
  p_uncategorized    boolean default null,
  -- 지역 축(DOMESTIC/OVERSEAS). 국가에서 파생된 열이라 국가 필터와 같은 사실을 굵게 묻는다.
  p_region_scope     text[]  default null,
  -- 권역은 행이 아니라 국가가 갖는다 — 국가를 조인해 그 권역으로 거른다.
  p_regions          uuid[]  default null,
  p_countries        uuid[]  default null,
  -- 국가 미확인 축: NULL=상관없음, true=국가가 비어 있는 행만.
  -- 옛 데이터를 채워 넣는 작업 대기열이라, 미분류와 같은 방식으로 축 하나를 둔다.
  p_country_unset    boolean default null,
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
  id                  uuid,
  name                text,
  affiliation         text,
  email               text,
  phone               text,
  linkedin_url        text,
  category            text,
  region_scope        text,
  region_tag_id       uuid,
  country_tag_id      uuid,
  region_name         text,
  country_name        text,
  profile             jsonb,
  expertise           jsonb,
  is_provisional      boolean,
  created_by          uuid,
  creator_name        text,
  created_at          timestamptz,
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
    select d.*,
           ct.region_tag_id as ct_region_tag_id,
           ct.name          as ct_country_name,
           coalesce(mm.activity_count, 0)::bigint as act,
           mm.satisfaction_avg as sat
      from public.networks d
      left join public.country_tags ct on ct.id = d.country_tag_id
      left join m mm on mm.entity_id = d.id
     where d.deleted_at is null
       and d.merged_into_id is null
       -- 구분과 미지정은 한 축이다(OR). 목록 필터에서 '미지정'이 구분 선택지 옆에 서므로
       -- '투자사 또는 미지정'이 표현돼야 한다 — 종전처럼 두 조건을 AND로 묶으면 그 조합은
       -- 늘 0건이 되고, 결과가 빈 이유가 화면 어디에도 보이지 않는다.
       and (case
              when (p_categories is null or cardinality(p_categories) = 0)
                   and p_uncategorized is null then true
              when (p_categories is null or cardinality(p_categories) = 0)
                then (p_uncategorized and d.category is null)
                     or (not p_uncategorized and d.category is not null)
              else d.category = any(p_categories)
                   or (coalesce(p_uncategorized, false) and d.category is null)
            end)
       and (p_region_scope is null or cardinality(p_region_scope) = 0
            or d.region_scope = any(p_region_scope))
       and (p_regions is null or cardinality(p_regions) = 0 or ct.region_tag_id = any(p_regions))
       and (p_countries is null or cardinality(p_countries) = 0 or d.country_tag_id = any(p_countries))
       and (p_country_unset is null
            or (p_country_unset and d.country_tag_id is null)
            or (not p_country_unset and d.country_tag_id is not null))
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
    f.id, f.name, f.affiliation, f.email, f.phone, f.linkedin_url,
    f.category, f.region_scope,
    f.ct_region_tag_id as region_tag_id,
    f.country_tag_id,
    r.name as region_name,
    f.ct_country_name as country_name,
    f.profile, f.expertise, f.is_provisional,
    f.created_by, u.name as creator_name, f.created_at, f.updated_at,
    -- 기여 이력은 '내 것' 목록의 축이다. 전체 목록에서는 남의 레코드에 내 기여 시각이 없어
    -- 뜻이 서지 않으므로 비운다(반환 열은 두 범위가 같은 규약을 쓰도록 유지한다).
    null::text        as last_action,
    null::timestamptz as last_contributed_at,
    f.act, f.sat,
    count(*) over () as total_count
  from filtered f
  left join public.users u       on u.id = f.created_by
  left join public.region_tags r on r.id = f.ct_region_tag_id
  order by f.name asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- 전체 범위와 인자·반환 열 규약이 같고 범위와 정렬(최근 기여순)만 다르다. 한 함수에 두
-- 계획을 넣으면 플래너가 어느 쪽도 제대로 세우지 못하므로 함수를 나눈다(20260731230000).
create or replace function public.my_network_entities(
  p_keyword          text    default null,
  p_limit            integer default 30,
  p_offset           integer default 0,
  p_categories       text[]  default null,
  p_uncategorized    boolean default null,
  p_region_scope     text[]  default null,
  p_regions          uuid[]  default null,
  p_countries        uuid[]  default null,
  p_country_unset    boolean default null,
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
  id                  uuid,
  name                text,
  affiliation         text,
  email               text,
  phone               text,
  linkedin_url        text,
  category            text,
  region_scope        text,
  region_tag_id       uuid,
  country_tag_id      uuid,
  region_name         text,
  country_name        text,
  profile             jsonb,
  expertise           jsonb,
  is_provisional      boolean,
  created_by          uuid,
  creator_name        text,
  created_at          timestamptz,
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
      c.entity_id,
      max(c.created_at) as last_at,
      (array_agg(c.action order by c.created_at desc))[1] as last_action
    from public.entity_contributions c
    where c.user_id = app.current_app_user_id()
      and c.entity_table = 'networks'
    group by c.entity_id
  ),
  m as (
    select * from public.network_entity_metrics()
  ),
  filtered as (
    select d.*,
           ct.region_tag_id as ct_region_tag_id,
           ct.name          as ct_country_name,
           coalesce(mc.last_action, 'created') as l_action,
           coalesce(mc.last_at, d.created_at)  as l_at,
           coalesce(mm.activity_count, 0)::bigint as act,
           mm.satisfaction_avg as sat
      from public.networks d
      left join public.country_tags ct on ct.id = d.country_tag_id
      left join mine mc on mc.entity_id = d.id
      left join m mm on mm.entity_id = d.id
     where d.deleted_at is null
       and d.merged_into_id is null
       -- 생성자이거나 기여자면 내 것으로 본다.
       and (d.created_by = app.current_app_user_id() or mc.entity_id is not null)
       -- 구분과 미지정은 한 축이다(OR). 목록 필터에서 '미지정'이 구분 선택지 옆에 서므로
       -- '투자사 또는 미지정'이 표현돼야 한다 — 종전처럼 두 조건을 AND로 묶으면 그 조합은
       -- 늘 0건이 되고, 결과가 빈 이유가 화면 어디에도 보이지 않는다.
       and (case
              when (p_categories is null or cardinality(p_categories) = 0)
                   and p_uncategorized is null then true
              when (p_categories is null or cardinality(p_categories) = 0)
                then (p_uncategorized and d.category is null)
                     or (not p_uncategorized and d.category is not null)
              else d.category = any(p_categories)
                   or (coalesce(p_uncategorized, false) and d.category is null)
            end)
       and (p_region_scope is null or cardinality(p_region_scope) = 0
            or d.region_scope = any(p_region_scope))
       and (p_regions is null or cardinality(p_regions) = 0 or ct.region_tag_id = any(p_regions))
       and (p_countries is null or cardinality(p_countries) = 0 or d.country_tag_id = any(p_countries))
       and (p_country_unset is null
            or (p_country_unset and d.country_tag_id is null)
            or (not p_country_unset and d.country_tag_id is not null))
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
    f.id, f.name, f.affiliation, f.email, f.phone, f.linkedin_url,
    f.category, f.region_scope,
    f.ct_region_tag_id as region_tag_id,
    f.country_tag_id,
    r.name as region_name,
    f.ct_country_name as country_name,
    f.profile, f.expertise, f.is_provisional,
    f.created_by, u.name as creator_name, f.created_at, f.updated_at,
    f.l_action as last_action,
    f.l_at     as last_contributed_at,
    f.act, f.sat,
    count(*) over () as total_count
  from filtered f
  left join public.users u       on u.id = f.created_by
  left join public.region_tags r on r.id = f.ct_region_tag_id
  order by f.l_at desc, f.name asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- 주석도 함께 고친다 — 인자 뜻이 바뀐 자리에 옛 설명이 남으면 다음 사람이 그것을 근거로 읽는다.
comment on function public.all_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) is
  'NETWORKS 통합 목록(볼 수 있는 전부). 구분·국가·권역·지역·영역·매칭·활동 축을 서버에서 건다. 구분과 미지정(p_uncategorized)은 한 축이라 OR로 합쳐 판정한다. 권역은 국가를 조인해 판정한다(행에 저장하지 않는다). SECURITY INVOKER — public.networks의 RLS를 그대로 따른다.';

comment on function public.my_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) is
  '호출자가 생성자이거나 기여자인 NETWORKS 통합 목록. all_network_entities와 인자·반환 열 규약이 같고 범위와 정렬(최근 기여순)만 다르다.';
