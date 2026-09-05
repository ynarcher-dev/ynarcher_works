-- 20260905240000 — STARTUP 요약 카드의 둘째 축을 투자단계에서 구분으로 바꾼다
--
-- 왜: 카드 두 줄을 세우며(20260905230000) 둘째 줄에 투자단계를 두었으나, 사용자 지정으로
-- **구분(발굴·보육·투자·기타)**이 그 자리를 갖는다. 구분은 '이 기업이 우리와 어떤 관계인가'라
-- 목록에 들어와 가장 먼저 묻는 축이고, 그래서 순서도 구분이 위·권역이 아래다.
-- 투자단계는 축을 잃는 대신 필터 바의 다중선택으로 돌아간다 — 카드가 소유하지 않는 축이라야
-- 필터 칩이 설 수 있다(같은 값을 두 컨트롤이 묻지 않는다는 규칙은 그대로다).
--
-- 무엇을: 구분에도 '미지정' 축을 붙인다(`p_category_unset`). 권역 줄이 미지정 칸을 누를 수
-- 있게 둔 것과 같은 이유다 — 한 축에 칸의 성격이 하나여야 하고, 값이 비어 있는 행도 목록의
-- 행이므로 카드의 합이 곧 전체여야 한다. 축과 미지정은 AND가 아니라 **OR**로 묶는다.
--
-- 인자를 더하는 일이라 `create or replace`로는 안 된다(끝에 기본값 인자를 붙이면 새 함수가
-- 하나 더 생겨 호출이 모호해진다). 세 함수를 함께 드롭하고 다시 만든다 — 한 트랜잭션 안이라
-- 중간에 목록이 끊기는 구간은 없다. 본문에서 바뀌는 것은 구분 판정 한 블록과 집계의 둘째
-- 축뿐이고 나머지는 20260905230000 그대로다.
--
-- 보안 게이트(11_migration_security_gate.md): 세 함수 모두 SECURITY INVOKER 유지(startups의
-- RLS를 그대로 탄다), search_path=app,public 고정, public·anon revoke 후 authenticated 한정
-- grant. 신규 테이블·정책·트리거·Storage 없음. 내려가는 컬럼 범위 불변(권한·노출 변화 없음).
-- =====================================================================

drop function if exists public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean);
drop function if exists public.startup_pool_entities(
  text, integer, integer, uuid, text[], uuid[], boolean, text[], text[], boolean,
  text[], text[], integer, integer, boolean, boolean);
drop function if exists app.startup_pool_filtered(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], text[],
  integer, integer, boolean, boolean);

-- 1) 필터 한 벌 -------------------------------------------------------------
create function app.startup_pool_filtered(
  p_keyword        text    default null,
  p_mine_user      uuid    default null,
  p_locations      text[]  default null,
  p_regions        uuid[]  default null,
  p_region_unset   boolean default null,
  p_industries     text[]  default null,
  p_stages         text[]  default null,
  p_stage_unset    boolean default null,
  p_categories     text[]  default null,
  -- 구분 미지정 축: NULL=상관없음, true=구분이 비어 있는 행만. 배열과는 OR로 묶인다.
  p_category_unset boolean default null,
  p_statuses       text[]  default null,
  p_age_min        integer default null,
  p_age_max        integer default null,
  p_search_email   boolean default false,
  p_search_phone   boolean default false
)
returns table (
  id            uuid,
  category      text,
  region_tag_id uuid,
  updated_at    timestamptz
)
language sql
stable
security invoker
set search_path = app, public
as $$
  select s.id,
         nullif(btrim(coalesce(s.management_status, '')), '') as category,
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
     and (p_industries is null or cardinality(p_industries) = 0
          or s.industries ?| p_industries)
     -- 투자단계는 카드에서 필터 바로 돌아갔지만 미지정 축은 서버에 남긴다 — 인자를 지우면
     -- 되살릴 때 다시 함수를 드롭해야 하고, 주지 않으면 조건이 붙지 않아 비용도 없다.
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
     -- 구분도 권역과 같은 규약(배열 OR 미지정). 빈 문자열은 미지정으로 본다.
     and (case
            when (p_categories is null or cardinality(p_categories) = 0)
                 and p_category_unset is null then true
            when (p_categories is null or cardinality(p_categories) = 0)
              then (p_category_unset
                    and nullif(btrim(coalesce(s.management_status, '')), '') is null)
                   or (not p_category_unset
                       and nullif(btrim(coalesce(s.management_status, '')), '') is not null)
            else s.management_status = any(p_categories)
                 or (coalesce(p_category_unset, false)
                     and nullif(btrim(coalesce(s.management_status, '')), '') is null)
          end)
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
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], boolean, text[],
  integer, integer, boolean, boolean) is
  'STARTUP 기업 목록의 필터 판정 한 벌. 목록(startup_pool_entities)과 요약 집계(startup_facet_counts)가 나란히 부른다 — 조건이 한 곳에 있어야 표와 카드가 어긋나지 않는다. 권역은 location_tags를 이름으로 이어 얻고, 권역·구분·투자단계는 각자 미지정 축과 OR로 묶인다. SECURITY INVOKER — startups의 RLS를 그대로 따른다.';

revoke all on function app.startup_pool_filtered(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], boolean, text[],
  integer, integer, boolean, boolean) from public, anon;
grant execute on function app.startup_pool_filtered(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], boolean, text[],
  integer, integer, boolean, boolean) to authenticated;

-- 2) 목록 RPC ---------------------------------------------------------------
create function public.startup_pool_entities(
  p_keyword        text    default null,
  p_limit          integer default 30,
  p_offset         integer default 0,
  p_mine_user      uuid    default null,
  p_locations      text[]  default null,
  p_regions        uuid[]  default null,
  p_region_unset   boolean default null,
  p_industries     text[]  default null,
  p_stages         text[]  default null,
  p_stage_unset    boolean default null,
  p_categories     text[]  default null,
  p_category_unset boolean default null,
  p_statuses       text[]  default null,
  p_age_min        integer default null,
  p_age_max        integer default null,
  p_search_email   boolean default false,
  p_search_phone   boolean default false
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
      p_industries, p_stages, p_stage_unset, p_categories, p_category_unset,
      p_statuses, p_age_min, p_age_max, p_search_email, p_search_phone)
  ),
  total as (select count(*)::bigint as c from f),
  page as (
    select f.id from f order by f.updated_at desc nulls last, f.id limit p_limit offset p_offset
  )
  select
    to_jsonb(s)
      || jsonb_build_object(
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
  text[], boolean, text[], integer, integer, boolean, boolean) is
  'STARTUP 기업 목록 한 페이지. 필터 판정은 app.startup_pool_filtered가 소유하고 여기서는 정렬·페이지·표시용 JSON 조립만 한다. row_json은 startups 행 전체 + creator/managers 임베드이며 total_count는 필터 반영 건수다. SECURITY INVOKER.';

revoke all on function public.startup_pool_entities(
  text, integer, integer, uuid, text[], uuid[], boolean, text[], text[], boolean,
  text[], boolean, text[], integer, integer, boolean, boolean) from public, anon;
grant execute on function public.startup_pool_entities(
  text, integer, integer, uuid, text[], uuid[], boolean, text[], text[], boolean,
  text[], boolean, text[], integer, integer, boolean, boolean) to authenticated;

-- 3) 요약 카드 집계 RPC(구분 · 권역) ----------------------------------------
create function public.startup_facet_counts(
  p_keyword        text    default null,
  p_mine_user      uuid    default null,
  p_locations      text[]  default null,
  p_regions        uuid[]  default null,
  p_region_unset   boolean default null,
  p_industries     text[]  default null,
  p_stages         text[]  default null,
  p_stage_unset    boolean default null,
  p_categories     text[]  default null,
  p_category_unset boolean default null,
  p_statuses       text[]  default null,
  p_age_min        integer default null,
  p_age_max        integer default null,
  p_search_email   boolean default false,
  p_search_phone   boolean default false
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
  -- 구분 축 — 구분 조건(p_categories·p_category_unset)을 빼고 센다.
  select 'category'::text,
         coalesce(f.category, 'UNSET'),
         count(*)::bigint
    from app.startup_pool_filtered(
           p_keyword, p_mine_user, p_locations, p_regions, p_region_unset,
           p_industries, p_stages, p_stage_unset, null::text[], null::boolean,
           p_statuses, p_age_min, p_age_max, p_search_email, p_search_phone) f
   group by 2
  union all
  -- 권역 축 — 권역 조건(p_regions·p_region_unset)을 빼고 센다.
  -- 소재지 조건은 남긴다: 소재지는 권역의 아래 단이라, 시·도를 골라 둔 채 권역 칸을 보면
  -- 그 시·도가 속한 권역만 서는 것이 사실이다.
  select 'region'::text,
         coalesce(f.region_tag_id::text, 'UNSET'),
         count(*)::bigint
    from app.startup_pool_filtered(
           p_keyword, p_mine_user, p_locations, null::uuid[], null::boolean,
           p_industries, p_stages, p_stage_unset, p_categories, p_category_unset,
           p_statuses, p_age_min, p_age_max, p_search_email, p_search_phone) f
   group by 2
$$;

comment on function public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], boolean, text[],
  integer, integer, boolean, boolean) is
  'STARTUP 목록 요약 카드(구분·권역) 집계. app.startup_pool_filtered를 그대로 불러 축별로 묶으므로 필터 판정이 목록과 어긋나지 않는다. 각 축은 자기 조건을 빼고 세어 타일이 필터로 동작한다. 값이 비어 있는 행의 키는 ''UNSET''. SECURITY INVOKER.';

revoke all on function public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], boolean, text[],
  integer, integer, boolean, boolean) from public, anon;
grant execute on function public.startup_facet_counts(
  text, uuid, text[], uuid[], boolean, text[], text[], boolean, text[], boolean, text[],
  integer, integer, boolean, boolean) to authenticated;
