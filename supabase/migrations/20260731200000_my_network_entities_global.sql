-- =====================================================================
-- '내 네트워크' RPC: 글로벌 네트워크 편입 + 필터 축 정리(네트워크 하나로)
--
-- 배경 1(축 중복): 이 목록의 필터는 '네트워크'와 '구분' 둘이었는데, 디렉토리 행의
--   profile->>category는 그 행이 놓인 원장의 라벨과 같은 값이다 — 같은 축을 두 번 물은 셈이라
--   '전문가 네트워크'와 구분 '전문가'를 함께 골라야 결과가 나오고, 엇갈리게 고르면 0건이 됐다.
--   게다가 구분 선택지는 ADMIN 구분 원장(category_tags) 전체라 이 목록에 존재할 수 없는 값
--   (임직원·게스트·협력사 등)까지 섞여 있었다. 축은 '어느 네트워크인가' 하나로 남긴다.
--
-- 배경 2(글로벌 누락): '내 네트워크'는 내가 만들었거나 손댄 네트워크를 모으는 자리인데
--   글로벌 네트워크만 빠져 있었다. 기여 로그(entity_contributions)는 이미 'global_networks'
--   키로 쌓이고 있어 판정 기준은 그대로 쓸 수 있다. 열 구성은 디렉토리와 공용(조직형 컬럼)이므로
--   글로벌이 채울 수 있는 값만 싣는다 — 구분은 스칼라 컬럼(category)이라 다른 원장과 같은
--   자리(profile->>category)로 옮겨 담고, 권역·국가·링크드인은 이 목록에 열이 없어 싣지 않는다.
--
-- 인자 목록이 바뀌어 create or replace가 불가하므로 drop 후 재생성한다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - SECURITY INVOKER 유지. entity_contributions·원장 11종·users의 기존 RLS가 그대로 걸린다.
--     글로벌도 global_networks의 자기 RLS로 판정되므로 노출 경계가 넓어지지 않는다.
--   - 호출자 판정은 계속 app.current_app_user_id()이며 user_id를 인자로 받지 않는다.
--   - 반환 컬럼 불변. p_categories 제거는 조건을 하나 없애는 것이라 행 집합이 넓어질 수 있으나,
--     그 범위는 여전히 '내가 만들었거나 기여한 것' 안이다.
--   - search_path 고정(app, public), GRANT EXECUTE는 authenticated 한정.
--   - 신규 테이블/정책 없음. 감사 로그·파일·Export 영향 없음.
-- 근거: 20260731190000_network_directory_search_metrics.sql
-- =====================================================================

drop function if exists public.my_network_entities(text, integer, integer, text[], text[], boolean, boolean);

create function public.my_network_entities(
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
  -- 디렉토리 10종 + 글로벌을 통일 컬럼으로 정규화합니다(config.ts DIRECTORY_ENTITIES + 글로벌).
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
    union all
    -- 글로벌: 구분이 스칼라 컬럼(category)이라 다른 원장과 같은 자리(profile.category)로 옮겨 담는다.
    -- 값이 없으면 열쇠를 만들지 않는다(빈 문자열을 넣으면 '구분 없음'과 '빈 구분'이 뒤섞인다).
    select 'global_networks',      x.id, x.name, x.affiliation, x.email, x.phone,
           case when x.category is null then coalesce(x.profile, '{}'::jsonb)
                else coalesce(x.profile, '{}'::jsonb) || jsonb_build_object('category', x.category) end,
           x.expertise, x.created_by, x.created_at, x.updated_at
      from public.global_networks x where x.deleted_at is null and x.merged_into_id is null
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
      -- 검색 범위: 이름·소속은 항상, 이메일·연락처는 목록에서 공개된 경우에만 닿는다.
      and (p_keyword is null or btrim(p_keyword) = ''
           or d.name ilike '%' || btrim(p_keyword) || '%'
           or d.affiliation ilike '%' || btrim(p_keyword) || '%'
           or (p_search_email and d.email ilike '%' || btrim(p_keyword) || '%')
           or (p_search_phone and d.phone ilike '%' || btrim(p_keyword) || '%'))
      -- 필터: 빈 배열도 '거르지 않음'으로 본다(화면이 선택을 모두 해제한 상태).
      and (p_entities is null or cardinality(p_entities) = 0 or d.t = any(p_entities))
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

grant execute on function public.my_network_entities(text, integer, integer, text[], boolean, boolean) to authenticated;

comment on function public.my_network_entities(text, integer, integer, text[], boolean, boolean) is
  '호출자가 생성자(created_by)이거나 기여자(entity_contributions)인 NETWORKS 통합 목록(디렉토리 10종 + 글로벌). 필터 축은 네트워크 종류 하나이며 이메일·연락처 검색 범위를 인자로 받는다. SECURITY INVOKER — base 테이블 RLS를 그대로 따른다.';
