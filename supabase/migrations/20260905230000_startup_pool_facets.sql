-- 20260905230000 — STARTUP 기업 목록: 필터 한 벌(app.startup_pool_filtered) + 목록 RPC + 요약 집계 RPC
--
-- 왜: 목록 위 요약 카드가 구분 한 줄(5칸)에서 권역·투자단계 두 줄(약 19칸)로 바뀐다.
-- 종전 카드는 타일마다 목록 조회를 한 번씩 쐈다(5회). 같은 방식으로 줄을 늘리면 요약만으로
-- 스무 번 가까이 호출하게 되므로, NETWORKS가 먼저 밟은 길(20260905210000)을 그대로 따라
-- 집계를 서버 한 번으로 모은다.
--
-- 다만 NETWORKS와 한 가지가 다르다. 거기서는 집계 함수가 목록 RPC를 그대로 호출했는데,
-- 그러면 집계 한 번에 원장 전 행의 표시용 JSON까지 만들게 된다. 여기서는 **필터 판정만 가진
-- 함수**(app.startup_pool_filtered)를 아래에 두고 목록과 집계가 나란히 그것을 부른다.
-- 판정이 한 곳이라는 성질은 같고(조건을 복제하면 카드와 표가 어긋나는 날 어느 쪽이 사실인지
-- 판정할 근거가 없다), 집계가 행을 조립하는 비용만 사라진다.
--
-- 축과 '미지정'은 AND가 아니라 OR로 묶는다(20260904140000에서 NETWORKS가 고친 결함).
-- 권역 타일과 미지정 타일을 함께 누르면 '수도권 또는 미지정'이어야 하고, AND로 두면 그 조합이
-- 늘 0건이 되어 고를 수 있다고 말하면서 아무것도 답하지 않는다.
--
-- 두 줄 모두 미지정 칸을 **누를 수 있게** 둔다. 한 축에 칸의 성격이 하나여야 하기 때문이다 —
-- 옆 칸은 눌리는데 이 칸만 안 눌리면 같은 줄에서 칸마다 하는 일이 달라진다. 소재지·투자단계는
-- 등록 시 필수가 아니라 미지정이 계속 생기므로, 그 칸은 옛 데이터의 잔여가 아니라 채워 넣을
-- 대기열이다(NETWORKS의 '국가 미확인'과 성격이 다르다).
--
-- 보안 게이트(11_migration_security_gate.md):
--   · 소유 워크스페이스 startup, 데이터 등급 Internal/Personal(기업 연락처 포함), 접근 주체 내부 사용자.
--   · 세 함수 모두 **SECURITY INVOKER** — public.startups·startup_managers·users의 RLS가 그대로
--     따라온다. 이 마이그레이션이 여는 문은 없고, 종전 PostgREST 조회와 보이는 행이 같다.
--   · 새 테이블·정책·트리거·Storage 정책 없음. SECURITY DEFINER 없음(그래서 함수 내부 권한
--     검사도 두지 않는다 — 판정은 RLS가 한다).
--   · GRANT EXECUTE는 authenticated로만. anon·public에서는 revoke한다.
--   · 검색 범위(p_search_email/phone)는 화면 마스킹 정책과 짝이며 **보안 경계가 아니다** —
--     행 자체는 종전과 같이 그대로 내려간다(경계를 서버로 옮기는 일은 별건이다).
-- =====================================================================

-- 1) 필터 한 벌 -------------------------------------------------------------
-- 목록과 집계가 함께 부르는 유일한 판정. 반환은 식별자와 두 축의 키뿐이다.
create or replace function app.startup_pool_filtered(
  p_keyword       text    default null,
  -- 지정 시 담당자(startup_managers) 또는 생성자(created_by)가 이 사용자인 기업만('내 관리기업').
  -- 담당자는 투자기업 전용 개념이라 생성자 축을 함께 봐야 발굴·보육·기타 기업도 잡힌다.
  p_mine_user     uuid    default null,
  p_locations     text[]  default null,
  -- 권역은 행이 아니라 소재지 태그가 갖는다 — location_tags를 이름으로 이어 그 권역으로 거른다.
  p_regions       uuid[]  default null,
  -- 권역 미지정 축: NULL=상관없음, true=권역이 비어 있는 행만. 배열과는 OR로 묶인다.
  p_region_unset  boolean default null,
  p_industries    text[]  default null,
  p_stages        text[]  default null,
  p_stage_unset   boolean default null,
  p_categories    text[]  default null,
  p_statuses      text[]  default null,
  p_age_min       integer default null,
  p_age_max       integer default null,
  p_search_email  boolean default false,
  p_search_phone  boolean default false
)
returns table (
  id            uuid,
  stage         text,
  region_tag_id uuid,
  updated_at    timestamptz
)
language sql
stable
security invoker
set search_path = app, public
as $$
  select s.id,
         nullif(btrim(coalesce(s.stage, '')), '') as stage,
         lt.region_tag_id,
         s.updated_at
    from public.startups s
    -- 소재지는 태그명 문자열이지 FK가 아니다(20260715100100). 태그에 없는 값(옛 자유 입력)은
    -- 권역이 비어 미지정 칸에 선다 — 조용히 다른 칸에 섞이지 않는다.
    left join public.location_tags lt
           on lt.name = s.location and lt.deleted_at is null
   where s.deleted_at is null
     and s.merged_into_id is null
     -- 범위: '내 관리기업'. 전체 범위에서는 조건이 붙지 않는다.
     and (p_mine_user is null
          or s.created_by = p_mine_user
          or exists (select 1 from public.startup_managers sm
                      where sm.startup_id = s.id and sm.user_id = p_mine_user))
     -- 검색어: 기업명·대표자·사업자번호 + 담당자 이름. 이메일·연락처는 목록에서 공개된
     -- 경우에만 닿는다(가려진 값을 검색창이 되짚어 주지 않도록).
     and (p_keyword is null or btrim(p_keyword) = ''
          or s.name ilike '%' || btrim(p_keyword) || '%'
          or s.representative ilike '%' || btrim(p_keyword) || '%'
          or s.biz_reg_no ilike '%' || btrim(p_keyword) || '%'
          or (p_search_email and s.email ilike '%' || btrim(p_keyword) || '%')
          or (p_search_phone and s.phone ilike '%' || btrim(p_keyword) || '%')
          or exists (select 1
                       from public.startup_managers sm
                       join public.users u on u.id = sm.user_id
                      where sm.startup_id = s.id
                        and u.name ilike '%' || btrim(p_keyword) || '%'
                        -- 담당자는 내부 임직원만 된다. 게스트를 섞으면 아무 레코드에도
                        -- 걸리지 않는 id가 조건에 들어갈 뿐이다(userTypes.ts와 같은 규칙).
                        and not app.is_guest_user_type(u.user_type)))
     and (p_locations is null or cardinality(p_locations) = 0
          or s.location = any(p_locations))
     -- 권역과 미지정은 한 축이다(OR). 배열만 주면 그 권역들, true만 주면 미지정만, 둘 다 주면 합집합.
     and (case
            when (p_regions is null or cardinality(p_regions) = 0)
                 and p_region_unset is null then true
            when (p_regions is null or cardinality(p_regions) = 0)
              then (p_region_unset and lt.region_tag_id is null)
                   or (not p_region_unset and lt.region_tag_id is not null)
            else lt.region_tag_id = any(p_regions)
                 or (coalesce(p_region_unset, false) and lt.region_tag_id is null)
          end)
     -- 분야는 배열 컬럼(industries)이라 하나라도 겹치면 통과(?|).
     and (p_industries is null or cardinality(p_industries) = 0
          or s.industries ?| p_industries)
     -- 투자단계도 권역과 같은 규약(배열 OR 미지정). 빈 문자열은 미지정으로 본다.
     and (case
            when (p_stages is null or cardinality(p_stages) = 0)
                 and p_stage_unset is null then true
            when (p_stages is null or cardinality(p_stages) = 0)
              then (p_stage_unset and nullif(btrim(coalesce(s.stage, '')), '') is null)
                   or (not p_stage_unset and nullif(btrim(coalesce(s.stage, '')), '') is not null)
            else s.stage = any(p_stages)
                 or (coalesce(p_stage_unset, false)
                     and nullif(btrim(coalesce(s.stage, '')), '') is null)
          end)
     and (p_categories is null or cardinality(p_categories) = 0
          or s.management_status = any(p_categories))
     and (p_statuses is null or cardinality(p_statuses) = 0
          or s.pool_status = any(p_statuses))
     -- 업력(년차) 범위 → 설립일 경계. 최소 N년차 = N년 전 또는 그 이전 설립,
     -- 최대 N년차 = (N+1)년 전보다 나중 설립(만 나이 N년 초과분 제외).
     and (p_age_min is null
          or s.founded_on <= (current_date - make_interval(years => p_age_min)))
     and (p_age_max is null
          or s.founded_on > (current_date - make_interval(years => p_age_max + 1)))
$$;

comment on function app.startup_pool_filtered(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean) is
  'STARTUP 기업 목록의 필터 판정 한 벌. 목록(startup_pool_entities)과 요약 집계(startup_facet_counts)가 나란히 부른다 — 조건이 한 곳에 있어야 표와 카드가 어긋나지 않는다. 권역은 location_tags를 이름으로 이어 얻고, 권역·투자단계는 각자 미지정 축과 OR로 묶인다. SECURITY INVOKER — startups의 RLS를 그대로 따른다.';

revoke all on function app.startup_pool_filtered(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean) from public, anon;
grant execute on function app.startup_pool_filtered(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean) to authenticated;

-- 2) 목록 RPC ---------------------------------------------------------------
-- 반환은 행 하나당 표시용 JSON 한 덩이다. 컬럼을 나열하지 않는 이유는 목록이 원장 전체를
-- 그대로 쓰기 때문이다(종전 select '*'와 같은 범위) — 컬럼이 하나 늘 때마다 함수를 고쳐야
-- 한다면 원장과 목록이 어긋나는 날이 온다.
create or replace function public.startup_pool_entities(
  p_keyword       text    default null,
  p_limit         integer default 30,
  p_offset        integer default 0,
  p_mine_user     uuid    default null,
  p_locations     text[]  default null,
  p_regions       uuid[]  default null,
  p_region_unset  boolean default null,
  p_industries    text[]  default null,
  p_stages        text[]  default null,
  p_stage_unset   boolean default null,
  p_categories    text[]  default null,
  p_statuses      text[]  default null,
  p_age_min       integer default null,
  p_age_max       integer default null,
  p_search_email  boolean default false,
  p_search_phone  boolean default false
)
returns table (
  row_json    jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = app, public
as $$
  with f as (
    select * from app.startup_pool_filtered(
      p_keyword, p_mine_user, p_locations, p_regions, p_region_unset,
      p_industries, p_stages, p_stage_unset, p_categories, p_statuses,
      p_age_min, p_age_max, p_search_email, p_search_phone)
  ),
  total as (select count(*)::bigint as c from f),
  page as (
    select f.id from f order by f.updated_at desc nulls last, f.id limit p_limit offset p_offset
  )
  select
    to_jsonb(s)
      || jsonb_build_object(
           -- 생성자(created_by)는 권한을 갖지 않는 축이라 목록 열에는 서지 않지만,
           -- 종전 임베드와 모양을 맞춰 그대로 싣는다('내 관리기업' 범위가 이 축을 쓴다).
           'creator', case when cu.id is null then null
                           else jsonb_build_object('id', cu.id, 'name', cu.name) end,
           'managers', coalesce(mg.managers, '[]'::jsonb))
      as row_json,
    (select c from total) as total_count
    from page
    join public.startups s on s.id = page.id
    left join public.users cu on cu.id = s.created_by
    left join lateral (
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', sm.user_id,
                 'is_lead', sm.is_lead,
                 'user', case when mu.id is null then null
                              else jsonb_build_object('id', mu.id, 'name', mu.name) end)
               order by sm.is_lead desc) as managers
        from public.startup_managers sm
        left join public.users mu on mu.id = sm.user_id
       where sm.startup_id = s.id
    ) mg on true
   order by s.updated_at desc nulls last, s.id
$$;

comment on function public.startup_pool_entities(
  text, integer, integer, uuid, text[], uuid[], boolean, text[], text[], boolean,
  text[], text[], integer, integer, boolean, boolean) is
  'STARTUP 기업 목록 한 페이지. 필터 판정은 app.startup_pool_filtered가 소유하고 여기서는 정렬·페이지·표시용 JSON 조립만 한다. row_json은 startups 행 전체 + creator/managers 임베드이며 total_count는 필터 반영 건수다. SECURITY INVOKER.';

revoke all on function public.startup_pool_entities(
  text, integer, integer, uuid, text[], uuid[], boolean, text[], text[], boolean,
  text[], text[], integer, integer, boolean, boolean) from public, anon;
grant execute on function public.startup_pool_entities(
  text, integer, integer, uuid, text[], uuid[], boolean, text[], text[], boolean,
  text[], text[], integer, integer, boolean, boolean) to authenticated;

-- 3) 요약 카드 집계 RPC ------------------------------------------------------
-- 축은 자기 자신을 빼고 센다: 권역 축 집계에서는 권역 조건을, 투자단계 축 집계에서는 단계
-- 조건을 뺀다. 그래야 타일이 필터로 동작한다(고른 칸만 남고 나머지가 0이 되지 않는다).
-- 나머지 축(검색어·구분·소재지·분야·관리현황·업력)은 그대로 반영되어 "지금 보고 있는
-- 목록의 구성"이 된다. 그래서 두 축의 합은 필터가 둘 다 걸렸을 때 서로 다른 수다.
create or replace function public.startup_facet_counts(
  p_keyword       text    default null,
  p_mine_user     uuid    default null,
  p_locations     text[]  default null,
  p_regions       uuid[]  default null,
  p_region_unset  boolean default null,
  p_industries    text[]  default null,
  p_stages        text[]  default null,
  p_stage_unset   boolean default null,
  p_categories    text[]  default null,
  p_statuses      text[]  default null,
  p_age_min       integer default null,
  p_age_max       integer default null,
  p_search_email  boolean default false,
  p_search_phone  boolean default false
)
returns table (
  axis text,
  key  text,
  cnt  bigint
)
language sql
stable
security invoker
set search_path = app, public
as $$
  -- 권역 축 — 권역 조건(p_regions·p_region_unset)을 빼고 센다.
  -- 소재지 조건은 남긴다: 소재지는 권역의 아래 단이라, 시·도를 골라 둔 채 권역 칸을 보면
  -- 그 시·도가 속한 권역만 서는 것이 사실이다.
  select 'region'::text,
         coalesce(f.region_tag_id::text, 'UNSET'),
         count(*)::bigint
    from app.startup_pool_filtered(
           p_keyword, p_mine_user, p_locations, null::uuid[], null::boolean,
           p_industries, p_stages, p_stage_unset, p_categories, p_statuses,
           p_age_min, p_age_max, p_search_email, p_search_phone) f
   group by 2
  union all
  -- 투자단계 축 — 단계 조건(p_stages·p_stage_unset)을 빼고 센다.
  select 'stage'::text,
         coalesce(f.stage, 'UNSET'),
         count(*)::bigint
    from app.startup_pool_filtered(
           p_keyword, p_mine_user, p_locations, p_regions, p_region_unset,
           p_industries, null::text[], null::boolean, p_categories, p_statuses,
           p_age_min, p_age_max, p_search_email, p_search_phone) f
   group by 2
$$;

comment on function public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean) is
  'STARTUP 목록 요약 카드(권역·투자단계) 집계. app.startup_pool_filtered를 그대로 불러 축별로 묶으므로 필터 판정이 목록과 어긋나지 않는다. 각 축은 자기 조건을 빼고 세어 타일이 필터로 동작한다. 값이 비어 있는 행의 키는 ''UNSET''. SECURITY INVOKER.';

revoke all on function public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean) from public, anon;
grant execute on function public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean) to authenticated;
