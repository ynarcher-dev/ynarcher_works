-- =====================================================================
-- NETWORKS 목록: 검색 범위 확장(소속·이메일·연락처) + 활동·만족도 실집계와 레인지 필터
--
-- 배경 1(검색): 디렉토리 9종 목록은 이름 하나로만 검색됐다. 목록에 소속·이메일·연락처가
--   열로 서 있는데 그 값으로는 찾을 수 없어, 화면에 보이는 값을 그대로 쳐도 결과가 비었다.
--   이메일·연락처는 ADMIN 민감정보 정책이 가리는 열이므로 "가려져 있으면 검색어가 닿지 않고,
--   공개면 닿는다"를 서버에서 강제한다 — 가려진 값을 검색으로 되짚으면 마스킹이 무력해진다
--   (STARTUP 발굴기업 목록의 searchScope와 같은 규칙, useStartupPoolPage 참조).
--
-- 배경 2(활동·만족도): 두 열은 실집계 미연동이라 항상 '-'였다. 레인지 필터를 붙이려면
--   값이 먼저 있어야 하므로 집계를 여기서 정의한다.
--     * 활동 = 그 인물이 참여한 사업(프로그램) 수 — program_participants.master_id 기준 distinct.
--     * 만족도 = 멘토로 참여한 세션의 스타트업 평가 평균 — mentor_satisfaction_records.score.
--   두 원장 모두 AC 소유라 NETWORKS 열람자가 직접 읽을 수 없다. 그래서 집계만 SECURITY DEFINER로
--   열되(hub_expert_ranking과 동일 패턴) 함수 안에서 networks 읽기 권한을 먼저 검사한다.
--   반환값은 건수·평균이라 개인 평가 원문은 넘어가지 않는다.
--
-- 배경 3(페이지네이션): 레인지 필터는 집계 결과에 걸리므로 클라이언트에서 거를 수 없다 —
--   지금 페이지에 실려 온 30건 안에서만 걸러져 2페이지의 대상이 사라진 것처럼 보인다.
--   그래서 '내 네트워크'(my_network_entities)와 같이 목록 조회 자체를 RPC로 내린다.
--
-- 보안 게이트(11_migration_security_gate.md) — 항목별 결과는 커밋 본문 참조.
--   - 소유 워크스페이스: networks. 데이터 등급: Personal(이메일·연락처 포함).
--   - network_entity_metrics(): SECURITY DEFINER + search_path 고정 + 함수 첫 조건이
--     app.can_read_workspace('networks'). 권한이 없으면 0행 → 목록은 활동 0·만족도 없음으로 보인다.
--   - network_directory_entities(): SECURITY INVOKER(기본). 9종 원장·users의 기존 RLS가 그대로
--     걸린다. DEFINER로 만들면 원장 RLS를 함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다.
--   - 테이블명은 인자로 받되 화이트리스트(DIRECTORY_ENTITIES) 밖이면 예외 — 임의 테이블 조회 불가.
--   - 이메일·연락처 검색은 호출자가 켤 수 있는 인자지만, 노출 범위를 넓히지 않는다.
--     반환 컬럼은 인자와 무관하게 동일하고(원래도 email/phone을 돌려준다), 마스킹은 화면 정책이
--     담당한다. 이 인자는 '검색어가 어디까지 닿는가'만 정한다.
--   - 신규 테이블/정책 없음. 감사 로그·파일·Export 영향 없음.
--   - GRANT EXECUTE는 authenticated 한정.
-- 근거: 20260705160000_ac_reporting_rpcs.sql, 20260731170000_my_network_entities_filters.sql
-- =====================================================================

-- ── 1. 활동·만족도 집계 ───────────────────────────────────────────────
-- program_participants.master_id는 테이블 구분자가 없는 soft ref(uuid)라 어느 원장의 id든
-- 그대로 매칭된다. 평가 기록(mentor_satisfaction_records)은 참여 행을 경유해 인물로 접힌다.
create or replace function public.network_entity_metrics()
returns table (
  entity_id        uuid,
  activity_count   bigint,
  satisfaction_avg numeric
)
language sql
stable
security definer
set search_path = app, public
as $$
  with act as (
    select pp.master_id as entity_id,
           count(distinct pp.program_id) as cnt
      from public.program_participants pp
     where pp.master_id is not null
     group by pp.master_id
  ),
  sat as (
    select pp.master_id as entity_id,
           round(avg(msr.score)::numeric, 1) as avg_score
      from public.mentor_satisfaction_records msr
      join public.program_participants pp on pp.id = msr.mentor_participant_id
     where pp.master_id is not null
     group by pp.master_id
  )
  select a.entity_id, a.cnt, s.avg_score
    from act a
    left join sat s on s.entity_id = a.entity_id
   -- 권한 게이트: NETWORKS 열람 권한이 없으면 0행(집계값이 목록으로 새어 나가지 않는다).
   where app.can_read_workspace('networks');
$$;

grant execute on function public.network_entity_metrics() to authenticated;

comment on function public.network_entity_metrics() is
  'NETWORKS 인물의 활동(참여 사업 수)·만족도(멘토 평가 평균) 집계. AC 원장을 우회 집계하므로 SECURITY DEFINER이며 함수 내부에서 networks 읽기 권한을 검사한다.';

-- ── 2. 디렉토리 목록 조회 ─────────────────────────────────────────────
create or replace function public.network_directory_entities(
  -- 원장 테이블명(DIRECTORY_ENTITIES). 화이트리스트 밖이면 예외.
  p_table              text,
  p_keyword            text    default null,
  -- 검색어가 이메일·연락처까지 닿는지. 목록 마스킹 정책이 공개로 연 필드만 화면이 켠다.
  p_search_email       boolean default false,
  p_search_phone       boolean default false,
  -- 구분(profile->>category)은 인자로 두지 않는다 — 목록 하나가 곧 구분 하나라
  -- 어느 값을 골라도 결과가 그대로거나 0건이다(filters.ts의 축 정의와 같은 이유).
  -- 분야(expertise jsonb 배열). 하나라도 들어 있으면 통과(?| 연산자).
  p_expertise          text[]  default null,
  -- 매칭 가능여부. 'possible' | 'impossible' | NULL(거르지 않음).
  p_match              text    default null,
  -- 활동 건수 범위. 집계가 없는 인물은 0건으로 본다(0은 실제 값이다).
  p_activity_min       integer default null,
  p_activity_max       integer default null,
  -- 만족도 범위. 평가가 없으면(NULL) 어느 쪽 경계로도 잡히지 않는다 —
  -- 만족도로 거른다는 것은 '평가가 있는 인물 중에서'라는 뜻이다.
  p_satisfaction_min   numeric default null,
  p_satisfaction_max   numeric default null,
  p_limit              integer default 30,
  p_offset             integer default 0
)
returns table (
  id               uuid,
  name             text,
  affiliation      text,
  email            text,
  phone            text,
  profile          jsonb,
  expertise        jsonb,
  is_provisional   boolean,
  created_by       uuid,
  creator_name     text,
  created_at       timestamptz,
  updated_at       timestamptz,
  activity_count   bigint,
  satisfaction_avg numeric,
  total_count      bigint
)
language plpgsql
stable
set search_path = app, public
as $$
declare
  -- config.ts DIRECTORY_ENTITIES + 은퇴 원장(vendors, 조회 하위호환)와 같은 목록.
  v_allowed constant text[] := array[
    'van','exp','experts','investors','corporates',
    'institutions','universities','vendors','etc','others'
  ];
begin
  if p_table is null or not (p_table = any (v_allowed)) then
    raise exception 'unknown network directory table: %', coalesce(p_table, '(null)');
  end if;

  return query execute format($q$
    with m as (
      select * from public.network_entity_metrics()
    ),
    base as (
      select e.id, e.name, e.affiliation, e.email, e.phone, e.profile, e.expertise,
             e.is_provisional, e.created_by, u.name as creator_name,
             e.created_at, e.updated_at,
             coalesce(m.activity_count, 0)::bigint as activity_count,
             m.satisfaction_avg,
             -- 매칭 배지와 같은 규칙: 값이 비어 있으면 '가능'이 기본이다.
             coalesce(nullif(e.profile ->> 'match_available', ''), 'true')
               in ('true', 'available') as match_ok
        from public.%I e
        left join public.users u on u.id = e.created_by
        left join m on m.entity_id = e.id
       where e.deleted_at is null
         and e.merged_into_id is null
    ),
    filtered as (
      select b.*
        from base b
       where ($1 is null or btrim($1) = ''
              or b.name ilike '%%' || btrim($1) || '%%'
              or b.affiliation ilike '%%' || btrim($1) || '%%'
              or ($2 and b.email ilike '%%' || btrim($1) || '%%')
              or ($3 and b.phone ilike '%%' || btrim($1) || '%%'))
         and ($4 is null or cardinality($4) = 0
              or b.expertise ?| $4)
         and ($5 is null
              or ($5 = 'possible' and b.match_ok)
              or ($5 = 'impossible' and not b.match_ok))
         and ($6 is null or b.activity_count >= $6)
         and ($7 is null or b.activity_count <= $7)
         and ($8 is null or b.satisfaction_avg >= $8)
         and ($9 is null or b.satisfaction_avg <= $9)
    )
    select f.id, f.name, f.affiliation, f.email, f.phone, f.profile, f.expertise,
           f.is_provisional, f.created_by, f.creator_name, f.created_at, f.updated_at,
           f.activity_count, f.satisfaction_avg,
           count(*) over () as total_count
      from filtered f
     order by f.name asc
     limit greatest($10, 0)
    offset greatest($11, 0)
  $q$, p_table)
  using p_keyword, p_search_email, p_search_phone, p_expertise,
        p_match, p_activity_min, p_activity_max, p_satisfaction_min, p_satisfaction_max,
        p_limit, p_offset;
end;
$$;

grant execute on function public.network_directory_entities(
  text, text, boolean, boolean, text[], text, integer, integer, numeric, numeric, integer, integer
) to authenticated;

comment on function public.network_directory_entities(
  text, text, boolean, boolean, text[], text, integer, integer, numeric, numeric, integer, integer
) is
  'NETWORKS 디렉토리 9종 목록(검색·필터·활동/만족도 레인지·서버 페이지네이션). SECURITY INVOKER — 원장 RLS를 그대로 따르며, 테이블명은 화이트리스트로 제한한다.';

-- ── 3. '내 네트워크' 검색 범위를 같은 규칙으로 맞춘다 ─────────────────
-- 이름·소속은 이미 검색됐고(20260731170000), 이메일·연락처는 마스킹 정책이 열렸을 때만 닿게 한다.
-- 인자 목록이 바뀌어 create or replace가 불가하므로 drop 후 재생성한다.
drop function if exists public.my_network_entities(text, integer, integer, text[], text[]);

create function public.my_network_entities(
  p_keyword      text    default null,
  p_limit        integer default 30,
  p_offset       integer default 0,
  p_entities     text[]  default null,
  p_categories   text[]  default null,
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
      -- 검색 범위: 이름·소속은 항상, 이메일·연락처는 목록에서 공개된 경우에만 닿는다.
      and (p_keyword is null or btrim(p_keyword) = ''
           or d.name ilike '%' || btrim(p_keyword) || '%'
           or d.affiliation ilike '%' || btrim(p_keyword) || '%'
           or (p_search_email and d.email ilike '%' || btrim(p_keyword) || '%')
           or (p_search_phone and d.phone ilike '%' || btrim(p_keyword) || '%'))
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

grant execute on function public.my_network_entities(text, integer, integer, text[], text[], boolean, boolean) to authenticated;

comment on function public.my_network_entities(text, integer, integer, text[], text[], boolean, boolean) is
  '호출자가 생성자(created_by)이거나 기여자(entity_contributions)인 NETWORKS 10종 통합 목록. 종류·구분 필터와 이메일·연락처 검색 범위 인자를 지원한다. SECURITY INVOKER — base 테이블 RLS를 그대로 따른다.';
