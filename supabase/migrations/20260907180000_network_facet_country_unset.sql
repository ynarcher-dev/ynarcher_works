-- 권역 카드의 '미지정' 칸이 필터가 된다(2026-09-07).
--
-- 종전에는 이 칸이 건수가 0보다 클 때만 서고 눌리지도 않았다. 그런데 **타일은 곧 필터**이고
-- 한 축에 칸의 성격은 하나여야 한다 — 옆 칸은 눌리는데 이 칸만 안 눌리면 같은 줄에서 칸마다
-- 하는 일이 달라진다(STARTUP 요약 카드가 먼저 정한 규칙이고, 근거는 CLAUDE.md의
-- '목록 위 요약 카드는 축이고, 축은 접어야 선다' 항목에 있다).
--
-- **목록 쪽은 이미 준비돼 있었다** — `p_country_unset`이 두 목록 RPC에 그대로 있다. 화면이
-- 그 인자를 부르지 않게 된 것은 2026-09-05에 `국가 미확인` 필터 칩을 걷으면서였고, 그때
-- 지역 축의 소유자가 필터 바에서 권역 카드로 옮겨 갔다. 이제 그 카드가 이 인자의 유일한
-- 소유자가 된다. 빠져 있던 것은 집계 함수 하나뿐이라 여기서 그 구멍만 메운다.
--
-- **축마다 어느 조건을 빼는지가 이 함수의 전부다.**
--   * 구분 축은 국가 조건을 **남긴다** — `p_countries`를 남기는 것과 같은 이유다. 국가를
--     골라 둔 채 구분 칸을 보면 그 국가의 구분 분포가 서는 것이 사실이다.
--   * 권역 축은 국가 없음을 **뺀다** — 그것이 이 축 자신의 '미지정' 칸이기 때문이다. 빼지
--     않으면 그 칸을 누르는 순간 다른 권역 칸이 전부 0이 되어, 필터를 풀 방법이 화면에서
--     사라진다(자기 조건을 뺀 수여야 타일이 필터로 동작한다).
-- 권역 축은 이미 이 자리에 `null`을 넘기고 있었으므로 실제로 바뀌는 줄은 구분 축뿐이다.
--
-- 보안 게이트: 새 테이블·정책·Storage 없음. 인자 하나를 더 받아 기존 목록 RPC에 그대로
-- 넘기는 변경이라 판정은 여전히 그 RPC(와 그 아래 RLS)가 한다. `p_scope`로 함수 이름을
-- 만들지 않는 기존 방어(두 값 중 하나로 고정)도 그대로다.

begin;

-- 인자를 하나 늘리는 것은 `create or replace`가 아니라 **새 오버로드**다 — 인자 목록이
-- 다르면 다른 함수이고, 새 인자에 기본값이 있으므로 옛 12인자 호출이 두 함수 모두에
-- 들어맞아 42725(function is not unique)로 죽는다. 그래서 옛 시그니처를 먼저 걷는다.
drop function if exists public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer);

create or replace function public.network_facet_counts(
  p_scope text,
  p_keyword text default null,
  p_categories text[] default null,
  p_uncategorized boolean default null,
  p_regions uuid[] default null,
  p_countries uuid[] default null,
  p_search_email boolean default false,
  p_search_phone boolean default false,
  p_expertise text[] default null,
  p_match text default null,
  p_activity_min integer default null,
  p_activity_max integer default null,
  p_country_unset boolean default null
)
returns table(axis text, key text, cnt bigint)
language plpgsql stable set search_path = app, public as $fn$
declare
  -- 호출자가 준 문자열로 함수 이름을 만들지 않는다 — 두 값 중 하나로 고정한다.
  target text := case p_scope when 'mine' then 'my_network_entities' else 'all_network_entities' end;
  -- 목록 RPC는 페이지 함수라 limit이 필수다. 집계에서는 자르지 않는다.
  no_limit constant integer := 2147483647;
begin
  -- 구분 축 — 구분 조건(p_categories·p_uncategorized)을 빼고 센다.
  -- 국가 조건은 둘 다 남긴다(p_countries·p_country_unset).
  -- 구분이 비어 있는 행은 목록 필터와 같은 키('UNSET')로 모은다.
  return query execute format($q$
    select 'category'::text,
           coalesce(e.category, 'UNSET')::text,
           count(*)::bigint
      from public.%I($1, $2, 0,
                     null::text[], null::boolean, null::text[],
                     $3, $4, $5,
                     $6, $7, $8, $9, $10, $11) e
     group by 2
  $q$, target)
  using p_keyword, no_limit, p_regions, p_countries, p_country_unset,
        p_search_email, p_search_phone, p_expertise, p_match,
        p_activity_min, p_activity_max;

  -- 권역 축 — 이 축 자신의 조건을 빼고 센다: 권역 목록(p_regions)과 '미지정'(p_country_unset).
  -- 국가 목록은 남긴다: 국가는 권역의 아래 단이라, 국가를 골라 둔 채 권역 칸을 보면 그
  -- 국가가 속한 권역만 서는 것이 사실이다.
  -- 권역이 비어 있는 행(국가를 아직 모르는 행)은 'UNSET'으로 모은다.
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

-- 드롭과 함께 사라진 실행 권한을 원래대로 되돌린다. `anon`에는 주지 않는다 —
-- 옛 함수도 `authenticated`와 `service_role`만 갖고 있었고, 이 집계는 로그인한
-- 내부 사용자의 목록 화면에서만 쓰인다.
grant execute on function public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer, boolean)
  to authenticated, service_role;

commit;
