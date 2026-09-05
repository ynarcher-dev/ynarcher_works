-- NETWORKS 목록 요약 카드(구분·권역)의 집계를 서버 한 번으로 모은다.
--
-- 배경: 두 카드가 상시로 서게 되면서(2026-09-05) 화면이 요약만으로 12번을 호출했다.
-- 구성 현황은 타일마다 목록 RPC를 한 번씩(10회), 권역별 현황은 행 5000개를 끌어와
-- 클라이언트에서 셌다. 후자는 원장이 해외만일 때는 안전했지만 국내를 포함하게 되면
-- 상한에 닿는 날 **조용히 틀린 수**를 낸다 — 오류가 아니라 그냥 적게 센다.
--
-- 필터 판정을 여기서 다시 쓰지 않는다. 목록 RPC를 그대로 호출해 그 결과를 묶을 뿐이다 —
-- 조건을 복제하면 목록과 카드가 어긋나는 날이 오고, 어긋났을 때 어느 쪽이 사실인지
-- 판정할 근거가 없다. 그래서 이 함수에는 축 두 개를 어떻게 빼는지만 들어 있다.
--
-- 축은 자기 자신을 빼고 센다: 구분 축 집계에서는 구분 조건을, 권역 축 집계에서는 권역
-- 조건을 뺀다. 그래야 타일이 필터로 동작한다(고른 칸만 남고 나머지가 0이 되지 않는다).
-- 나머지 축(국가·영역·활동·매칭·검색어)은 그대로 반영되어 "지금 보고 있는 목록의 구성"이 된다.
--
-- 보안: SECURITY INVOKER다. 안에서 부르는 목록 RPC 두 개도 INVOKER이므로
-- public.networks의 RLS가 그대로 따라온다 — 이 함수가 여는 문은 없다.

create or replace function public.network_facet_counts(
  p_scope            text,
  p_keyword          text    default null,
  p_categories       text[]  default null,
  p_uncategorized    boolean default null,
  p_regions          uuid[]  default null,
  p_countries        uuid[]  default null,
  p_search_email     boolean default false,
  p_search_phone     boolean default false,
  p_expertise        text[]  default null,
  p_match            text    default null,
  p_activity_min     integer default null,
  p_activity_max     integer default null
)
returns table (axis text, key text, cnt bigint)
language plpgsql
stable
security invoker
set search_path = app, public
as $fn$
declare
  -- 호출자가 준 문자열로 함수 이름을 만들지 않는다 — 두 값 중 하나로 고정한다.
  target text := case p_scope when 'mine' then 'my_network_entities' else 'all_network_entities' end;
  -- 목록 RPC는 페이지 함수라 limit이 필수다. 집계에서는 자르지 않는다.
  no_limit constant integer := 2147483647;
begin
  -- 구분 축 — 구분 조건(p_categories·p_uncategorized)을 빼고 센다.
  -- 구분이 비어 있는 행은 목록 필터와 같은 키('UNSET')로 모은다.
  return query execute format($q$
    select 'category'::text,
           coalesce(e.category, 'UNSET')::text,
           count(*)::bigint
      from public.%I($1, $2, 0,
                     null::text[], null::boolean, null::text[],
                     $3, $4, null::boolean,
                     $5, $6, $7, $8, $9, $10) e
     group by 2
  $q$, target)
  using p_keyword, no_limit, p_regions, p_countries,
        p_search_email, p_search_phone, p_expertise, p_match,
        p_activity_min, p_activity_max;

  -- 권역 축 — 권역 조건(p_regions)을 빼고 센다. 국가 조건은 남긴다:
  -- 국가는 권역의 아래 단이라, 국가를 골라 둔 채 권역 칸을 보면 그 국가가 속한 권역만
  -- 서는 것이 사실이다.
  -- 권역이 비어 있는 행(국가를 아직 모르는 옛 행)은 'UNSET'으로 모은다.
  return query execute format($q$
    select 'region'::text,
           coalesce(e.region_tag_id::text, 'UNSET'),
           count(*)::bigint
      from public.%I($1, $2, 0,
                     $3, $4, null::text[],
                     null::uuid[], $5, null::boolean,
                     $6, $7, $8, $9, $10, $11) e
     group by 2
  $q$, target)
  using p_keyword, no_limit, p_categories, p_uncategorized, p_countries,
        p_search_email, p_search_phone, p_expertise, p_match,
        p_activity_min, p_activity_max;
end;
$fn$;

comment on function public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer) is
  'NETWORKS 목록 요약 카드(구분·권역) 집계. 목록 RPC(my_/all_network_entities)를 그대로 호출해 묶으므로 필터 판정이 목록과 어긋나지 않는다. 각 축은 자기 조건을 빼고 세어 타일이 필터로 동작한다. 구분·권역이 비어 있는 행의 키는 ''UNSET''. SECURITY INVOKER — public.networks의 RLS를 그대로 따른다.';

revoke all on function public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer)
  from public, anon;

grant execute on function public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer)
  to authenticated;
