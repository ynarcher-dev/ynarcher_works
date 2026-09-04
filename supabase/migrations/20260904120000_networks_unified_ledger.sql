-- =====================================================================
-- NETWORKS 통합 원장 — 구분과 지역을 직교한 두 축으로
--
-- 배경: 네트워크 원장이 11종이었다. 국내는 구분마다 물리 테이블 하나(experts·van·exp·
--   investors·corporates·institutions·universities·etc·vendors·others), 해외는 원장 하나
--   (global_networks)에 구분을 스칼라 3값으로 담았다. 같은 사실(구분)을 한쪽은 테이블
--   이름으로, 다른 쪽은 컬럼 값으로 적었고, 국내 원장은 profile->>'category'에 라벨을 한 번
--   더 적어 한 레코드의 구분이 두 곳에 살았다.
--
--   분리가 만든 실제 결손은 둘이다. (1) 해외 구분이 3값뿐이라 해외 대학·해외 전문가·해외
--   BAN이 성립하지 않았다. (2) 국내 원장에 권역·국가·링크드인 칸이 없어 해외로 옮겨 간
--   사람을 그대로 둘 수 없었다. 등록·업로드가 갈려 있어 정보를 넣기 전에 "어느 원장인가"를
--   사람이 먼저 판단해야 했고, 그 판단이 틀리면 이관이 곧 행 이동이었다.
--
-- 이 마이그레이션이 하는 일: 원장 11종을 public.networks 하나로 합치고, 구분(category)과
--   국가(country_tag_id)를 서로 독립한 두 축으로 세운다. 그러면 해외 대학과 국내 기업이
--   같은 문법으로 서고, 구분이 늘어도 테이블이 늘지 않으며, 미분류 이관이 행 이동이 아니라
--   UPDATE 한 줄이 된다(id가 보존되므로 그 레코드에 붙은 자료·피드백·회의록 링크가 살아 있다).
--
-- 통합이 값싼 이유: 바깥에서 이 원장들을 FK로 가리키는 표가 없다. 전수 조사 결과
--   `references public.experts(id)` 류는 전부 자기 자신의 merged_into_id뿐이고, 바깥 연결은
--   모두 다형 키(문자열 + uuid)다. 식별자가 uuid라 표를 옮겨도 값이 그대로이므로 이관은
--   참조 재배선 없이 "행을 옮기고 다형 키 문자열만 갱신"으로 끝난다.
--
-- 지역을 국가가 답하게 하는 이유(2026-09-04 사용자 확정): 종전에는 '국내'가 원장 자체였고
--   국가는 해외 행에만 붙었다. 그래서 국내 행의 국가 칸이 비어 있었고, 표는 "한국인가,
--   아직 안 넣었는가"를 답하지 못했다. 이제 한국도 다른 나라와 같은 국가 한 줄이며
--   (country_tags.is_domestic이 자국임을 표시), 담당자가 고르는 칸은 국가 하나다.
--   국내/해외(region_scope)는 그 국가에서 파생되어 저장되는 열이고 트리거가 채운다 —
--   손으로 고르는 두 번째 칸을 두면 "해외로 표시했는데 국가는 한국"이 생긴다.
--   권역(북미·동남아…)도 행에 저장하지 않는다. 국가가 이미 알고 있으므로 조인해 읽는다.
--
-- 함께 고치는 결함(2026-08-26 회귀): app.can_link_minute_target이 20260826220000에서
--   app.can_link_entity_target 위임으로 바뀌면서 networks 분기가 통째로 빠졌다. 그 함수는
--   program/ma_program/project_program/startup만 알고 나머지는 false를 돌려주는데,
--   set_minute_links는 "통과분만 반영"하므로 회의록에 네트워크 인물을 걸면 오류 없이
--   조용히 사라졌다. 이번에 그 분기를 되살린다(통합 후 값은 'network' 하나다).
--
-- 이관하지 않는 것: public.partners. 은퇴한 지 오래고 어느 목록에도 서지 않으며 스키마
--   형태도 다르다(name/partner_type/memo). 합치면 지금까지 보이지 않던 행이 '전체 네트워크'에
--   갑자기 서게 되므로 손대지 않는다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 소유 워크스페이스: networks. 데이터 등급: Personal(이름·이메일·연락처 포함).
--   - 신규 표 public.networks는 RLS를 켜고 정책 3종(select/insert/update)을 종전 원장과
--     동일한 표현식(app.can_read_workspace('networks') / can_write_workspace('networks'))으로
--     만든다. DELETE 정책은 만들지 않는다(물리 삭제 금지 — 비활성화는 deleted_at).
--     원장이 11벌에서 1벌로 줄 뿐 어느 사용자가 볼 수 있는 행의 집합은 종전과 같다.
--   - 신규 SECURITY DEFINER 함수 없음. 목록 RPC 2종은 SECURITY INVOKER(기본)라
--     public.networks의 RLS가 호출자 기준으로 그대로 걸린다. DEFINER로 만들면 정책을 함수
--     안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다.
--   - app.can_link_entity_target은 기존 SECURITY DEFINER를 유지한다(각 원장 SELECT 정책을
--     재현하는 판정 함수). 이번 변경은 networks 분기를 되살리며, 그 분기도 종전과 같이
--     can_read_workspace('networks') + 살아 있는 행 존재를 함께 본다 — 권한이 넓어지지 않는다.
--   - GRANT EXECUTE는 authenticated 한정. anon 정책·Storage 정책 변경 없음.
--   - 구 원장 11종은 드롭하지 않고 `_retired_` 접두사로 개명한다(이 환경은 pg_dump가 Docker를
--     요구해 백업을 뜰 수 없다). 개명 후에도 각자의 RLS 정책이 그대로라 접근 범위가 넓어지지
--     않는다. 표 이름이 바뀌므로 그 이름으로 함수 본문을 전수 조사했다(아래 §7 주석).
--   - 다형 키 정규화는 값의 이름만 옮긴다(뜻이 바뀌지 않는다). access_logs.resource_type은
--     고치지 않는다 — 감사 로그는 그때 무엇에 접근했는지의 기록이라 사후에 이름을 바꾸면
--     사실이 아닌 기록이 된다.
--   - 개인정보 노출 범위 불변: 검색어가 이메일·연락처에 닿는지는 화면의 민감정보 정책이
--     인자로 정하고 서버가 같은 인자로 강제한다. 목록은 페이지당 상한이 걸린다.
-- 근거: docs/docs_planning/3_3_4_networks_unified_ledger.md(설계 정본),
--       20260903100000_program_module_ledger_unify.sql(_retired_ 개명 선례),
--       20260820140000_network_lists_domestic_global_split.sql(목록 RPC 규약),
--       20260721160000_entity_contribution_trigger_networks.sql(기여 트리거 카탈로그 게이트)
-- =====================================================================

-- ── 0. 국가 기준정보 보강 — 지역의 단일 원천을 국가로 세운다 ──────────
-- 종전에는 '국내'가 원장 자체였고 국가는 해외 행에만 붙었다. 그래서 국내 행에는 국가가
-- 없었고, 표는 "한국인가, 아직 안 넣었는가"를 답하지 못했다. 이제 한국도 다른 나라와
-- 같은 국가 한 줄이며, 국내/해외는 그 국가가 답한다(2026-09-04 사용자 확정).
--
-- `is_domestic`은 국가의 성격이지 네트워크 행의 성격이 아니다 — 그래서 국가 원장이 갖는다.
alter table public.country_tags
  add column if not exists is_domestic boolean not null default false;

comment on column public.country_tags.is_domestic is
  '자국 여부. 네트워크 행의 국내/해외는 이 값에서 파생된다(행마다 따로 저장하지 않는다).';

-- 권역 목록이 북미·유럽 같은 해외 대륙권뿐이라 한국이 설 자리가 없다. '국내' 권역을 만들고
-- 그 아래 한국만 둔다 — '기타'에 넣으면 브라질·남아공과 한 칸에 묶여 집계가 뒤섞인다.
-- sort_order 0으로 맨 앞에 세운다.
insert into public.region_tags (name, sort_order)
select '국내', 0
 where not exists (
   select 1 from public.region_tags where name = '국내' and deleted_at is null
 );

insert into public.country_tags (name, sort_order, region_tag_id, is_domestic)
select '한국', 0, r.id, true
  from public.region_tags r
 where r.name = '국내' and r.deleted_at is null
   and not exists (
     select 1 from public.country_tags where name = '한국' and deleted_at is null
   );

-- 이미 있던 '한국' 행(수동 추가분)도 자국으로 맞춘다.
update public.country_tags
   set is_domestic = true
 where name = '한국' and deleted_at is null and is_domestic is distinct from true;

-- ── 1. 통합 원장 ──────────────────────────────────────────────────────
create table if not exists public.networks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  affiliation    text,                                      -- 소속
  email          text,
  phone          text,
  linkedin_url   text,                                      -- 종전 글로벌 전용 → 전체 공통
  -- 구분. 값은 코드이며 라벨은 화면 상수(CATEGORY_LABEL)가 소유한다.
  -- null은 미분류다 — 종전 others 원장이 표 하나로 표현하던 성격을 빈 값이 대신한다.
  category       text,
  -- 국가. 지역 축의 유일한 입력값이다. 한국도 다른 나라와 같은 한 줄이며,
  -- 권역(북미·동남아…)은 여기에 저장하지 않는다 — 국가가 이미 알고 있고(country_tags),
  -- 따로 적으면 국가를 고쳤을 때 권역만 옛 값으로 남는다.
  country_tag_id uuid references public.country_tags(id),
  -- 국내/해외. 사람이 고르는 칸이 아니라 국가에서 자동으로 파생되어 저장되는 열이다
  -- (§5의 트리거가 채운다). 목록 필터·인덱스가 쓸 빠른 축으로만 둔다.
  region_scope   text not null default 'DOMESTIC',
  expertise      jsonb not null default '[]'::jsonb,
  profile        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid,                                      -- 자기참조 FK는 데이터 이관 후 건다(§3)
  created_by     uuid references public.users(id) default app.current_app_user_id(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint networks_category_chk check (
    category is null or category in (
      'experts', 'van', 'exp', 'investors',
      'corporates', 'institutions', 'universities', 'etc', 'vendors'
    )
  ),
  constraint networks_region_scope_chk check (region_scope in ('DOMESTIC', 'OVERSEAS'))
);

-- country_tag_id에 NOT NULL을 지금 걸지 않는다. 국가를 모르는 채로 넘어온 옛 해외 행이
-- 있을 수 있고, 지금 잠그면 그 행은 저장 자체가 막혀 국가를 채워 넣을 수도 없다.
-- 신규 등록은 화면이 즉시 필수로 막고, 목록의 '국가 미확인' 축으로 남은 행을 채운 뒤
-- 별도 마이그레이션에서 NOT NULL로 잠근다.

comment on table public.networks is
  'NETWORKS 통합 원장. 구분(category)과 국가(country_tag_id)가 직교한 두 축이며, 종전 원장 11종(국내 10 + 글로벌 1)을 대체한다. 구분이 null이면 미분류(분류 전 임시 상태).';
comment on column public.networks.category is
  '구분 코드(experts|van|exp|investors|corporates|institutions|universities|etc|vendors). null = 미분류. 라벨은 화면 상수가 소유한다.';
comment on column public.networks.country_tag_id is
  '국가(country_tags). 지역 축의 유일한 입력값 — 한국도 여기에 명시한다. 권역은 국가에서 조인해 읽는다. null은 국가 미확인(옛 데이터)이며 신규 등록에서는 허용하지 않는다.';
comment on column public.networks.region_scope is
  '국내/해외(DOMESTIC|OVERSEAS). 국가에서 파생되어 저장되는 열이며 손으로 고치지 않는다 — app.sync_network_region_scope() 트리거가 채운다.';
comment on column public.networks.profile is
  '사진·부서·직책·매칭여부·소속이력 등(jsonb). 구분 라벨은 담지 않는다 — 그 사실은 category 컬럼 하나가 답한다.';

-- ── 2. 인덱스 ─────────────────────────────────────────────────────────
-- 목록 쿼리가 내는 모양(soft delete + 미병합 조건 + 부분일치 검색 + 이름 정렬)을 그대로
-- 부분 인덱스로 받는다. 조건이 인덱스에 들어가 있어야 플래너가 쓸 수 있다(20260731220000).
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_networks_name
  on public.networks (name) where deleted_at is null and merged_into_id is null;
create index if not exists idx_networks_category
  on public.networks (category) where deleted_at is null and merged_into_id is null;
create index if not exists idx_networks_region_scope
  on public.networks (region_scope) where deleted_at is null and merged_into_id is null;
create index if not exists idx_networks_country_tag on public.networks (country_tag_id);
create index if not exists idx_networks_merged_into on public.networks (merged_into_id);
create index if not exists idx_networks_created_by  on public.networks (created_by);

-- 부분일치 검색용 trigram GIN. opclass의 스키마는 카탈로그에서 찾아 붙인다 —
-- pg_trgm이 어느 스키마에 설치돼 있는지는 환경마다 다르고, 이름을 박아 두면 그 환경에서
-- 인덱스 생성이 통째로 실패한다(20260731220000이 같은 이유로 쓰는 방식).
do $trgm$
declare
  v_opclass text;
  c text;
begin
  select quote_ident(n.nspname) || '.gin_trgm_ops'
    into v_opclass
    from pg_opclass o
    join pg_am a on a.oid = o.opcmethod
    join pg_namespace n on n.oid = o.opcnamespace
   where o.opcname = 'gin_trgm_ops' and a.amname = 'gin'
   limit 1;

  if v_opclass is null then
    raise exception 'pg_trgm 확장의 gin_trgm_ops를 찾을 수 없습니다 — 확장 설치를 먼저 확인하세요.';
  end if;

  foreach c in array array['name', 'affiliation', 'email', 'phone']
  loop
    execute format(
      'create index if not exists %I on public.networks using gin (%I %s) '
      || 'where deleted_at is null and merged_into_id is null',
      'idx_networks_' || c || '_trgm', c, v_opclass
    );
  end loop;
end $trgm$;

-- ── 3. 데이터 이관 ────────────────────────────────────────────────────
-- id를 보존한다. 다형 키가 가리키는 대상이 그대로여야 자료·피드백·회의록 링크·코드가 살아 있다.
-- profile의 중복 라벨('category' 키)은 걷는다 — 값은 category 컬럼이 승계한다.
-- 화면이 읽지 않는 옛 스칼라는 값이 있을 때만 profile.legacy 아래로 접어 넣는다(원장에서
-- 조용히 사라지게 두지 않는다). 구 원장은 §7에서 _retired_로 남으므로 원본도 보존된다.
--
-- 원장마다 컬럼 구성이 조금씩 달라(옛 스칼라의 이름과 수) 한 문장으로 묶지 않고 원장별로
-- 적는다. union all로 묶으면 컬럼 순서가 한 원장만 어긋나도 조용히 값이 밀린다.
do $migrate$
declare
  v_moved int;
  v_total int := 0;
  -- 국내 원장에서 넘어오는 행의 국가. 한국도 다른 나라와 같은 국가 한 줄이다.
  v_kr    uuid;
begin
  select id into v_kr from public.country_tags
   where name = '한국' and deleted_at is null limit 1;
  if exists (select 1 from public.networks) then
    raise notice 'public.networks에 이미 행이 있어 이관을 건너뜁니다(멱등).';
    return;
  end if;

  -- (1) 전문가 · EXP · 기타 — 옛 스칼라 없음.
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         coalesce(x.profile, '{}'::jsonb) - 'category',
         'experts', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.experts x;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'experts → networks: %건', v_moved;

  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         coalesce(x.profile, '{}'::jsonb) - 'category',
         'exp', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.exp x;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'exp → networks: %건', v_moved;

  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         coalesce(x.profile, '{}'::jsonb) - 'category',
         'etc', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.etc x;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'etc → networks: %건', v_moved;

  -- (2) BAN — 옛 스칼라 category/representative/memo/contact.
  --     여기서 x.category는 자유 서술 구분이라 통합 원장의 category(코드)와 뜻이 다르다.
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         'van', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.van x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'category',       nullif(btrim(coalesce(x.category, '')), ''),
        'representative', nullif(btrim(coalesce(x.representative, '')), ''),
        'memo',           nullif(btrim(coalesce(x.memo, '')), ''),
        'contact',        nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'van → networks: %건', v_moved;

  -- (3) 외주/거래(은퇴) — 행은 목록에 계속 담기되 구분 선택지에는 서지 않는다.
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         'vendors', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.vendors x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'category',       nullif(btrim(coalesce(x.category, '')), ''),
        'representative', nullif(btrim(coalesce(x.representative, '')), ''),
        'memo',           nullif(btrim(coalesce(x.memo, '')), ''),
        'contact',        nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'vendors → networks: %건', v_moved;

  -- (4) 미분류 — 구분은 null이 답한다.
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         null, v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.others x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'category',       nullif(btrim(coalesce(x.category, '')), ''),
        'representative', nullif(btrim(coalesce(x.representative, '')), ''),
        'memo',           nullif(btrim(coalesce(x.memo, '')), ''),
        'contact',        nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'others → networks(미분류): %건', v_moved;

  -- (5) 투자사
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         'investors', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.investors x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'investor_type',  nullif(btrim(coalesce(x.investor_type, '')), ''),
        'representative', nullif(btrim(coalesce(x.representative, '')), ''),
        'focus',          nullif(btrim(coalesce(x.focus, '')), ''),
        'contact',        nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'investors → networks: %건', v_moved;

  -- (6) 기업
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         'corporates', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.corporates x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'biz_reg_no',     nullif(btrim(coalesce(x.biz_reg_no, '')), ''),
        'representative', nullif(btrim(coalesce(x.representative, '')), ''),
        'industry',       nullif(btrim(coalesce(x.industry, '')), ''),
        'contact',        nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'corporates → networks: %건', v_moved;

  -- (7) 기관
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         'institutions', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.institutions x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'institution_type', nullif(btrim(coalesce(x.institution_type, '')), ''),
        'representative',   nullif(btrim(coalesce(x.representative, '')), ''),
        'region',           nullif(btrim(coalesce(x.region, '')), ''),
        'contact',          nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'institutions → networks: %건', v_moved;

  -- (8) 대학
  insert into public.networks (
    id, name, affiliation, email, phone, expertise, profile, category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case when l.legacy = '{}'::jsonb then '{}'::jsonb
                   else jsonb_build_object('legacy', l.legacy) end,
         'universities', v_kr, 'DOMESTIC',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.universities x
    cross join lateral (
      select jsonb_strip_nulls(jsonb_build_object(
        'university_type', nullif(btrim(coalesce(x.university_type, '')), ''),
        'department',      nullif(btrim(coalesce(x.department, '')), ''),
        'region',          nullif(btrim(coalesce(x.region, '')), ''),
        'contact',         nullif(x.contact, '{}'::jsonb))) as legacy
    ) l;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'universities → networks: %건', v_moved;

  -- (9) 글로벌 — 구분 3값을 코드로 옮기고 국가·링크드인을 그대로 승계한다.
  --     구분이 없던 행은 미분류(null)로 남는다.
  --     권역은 컬럼으로 옮기지 않는다(국가가 이미 알고 있다). 다만 국가를 모르고 권역만
  --     있던 행은 그 권역이 유일한 단서라, 나중에 국가를 채워 넣을 사람을 위해
  --     profile.legacy.region에 이름으로 남긴다.
  insert into public.networks (
    id, name, affiliation, email, phone, linkedin_url, expertise, profile,
    category, country_tag_id, region_scope,
    is_provisional, merged_into_id, created_by, created_at, updated_at, deleted_at)
  select x.id, x.name, x.affiliation, x.email, x.phone, x.linkedin_url, x.expertise,
         (coalesce(x.profile, '{}'::jsonb) - 'category')
           || case
                when x.country_tag_id is null and r.name is not null
                  then jsonb_build_object('legacy', jsonb_build_object('region', r.name))
                else '{}'::jsonb
              end,
         case x.category
           when '기업'   then 'corporates'
           when '기관'   then 'institutions'
           when '투자자' then 'investors'
           else null
         end,
         x.country_tag_id,
         -- 국가가 있으면 아래 동기화 UPDATE가 다시 판정한다. 국가를 모르는 행은
         -- 글로벌 원장에서 왔다는 사실이 곧 해외라는 뜻이므로 그대로 둔다.
         'OVERSEAS',
         x.is_provisional, x.merged_into_id, x.created_by, x.created_at, x.updated_at, x.deleted_at
    from public.global_networks x
    left join public.region_tags r on r.id = x.region_tag_id;
  get diagnostics v_moved = row_count; v_total := v_total + v_moved;
  raise notice 'global_networks → networks(해외): %건', v_moved;

  -- 국가를 아는 행의 국내/해외를 국가에서 다시 판정한다(§5 트리거는 이 이관 뒤에 붙는다).
  update public.networks n
     set region_scope = case when c.is_domestic then 'DOMESTIC' else 'OVERSEAS' end
    from public.country_tags c
   where c.id = n.country_tag_id
     and n.region_scope is distinct from (case when c.is_domestic then 'DOMESTIC' else 'OVERSEAS' end);

  select count(*) into v_moved from public.networks where country_tag_id is null;
  if v_moved > 0 then
    raise notice '국가 미확인 %건 — 목록의 ''국가 미확인'' 축에서 채운 뒤 NOT NULL로 잠근다.', v_moved;
  end if;

  raise notice 'NETWORKS 통합 이관 합계: %건', v_total;
end $migrate$;

-- 병합 참조 자기 FK는 이관 이후에 건다. 이관 중에 걸어 두면 "정본보다 중복 행이 먼저
-- 들어오는" 순서에서 실패한다(같은 문장 안이라도 행 단위로 검사된다).
alter table public.networks drop constraint if exists networks_merged_into_id_fkey;
alter table public.networks
  add constraint networks_merged_into_id_fkey
  foreign key (merged_into_id) references public.networks(id);

-- ── 4. RLS ────────────────────────────────────────────────────────────
alter table public.networks enable row level security;

drop policy if exists networks_select on public.networks;
create policy networks_select on public.networks for select
  using (app.can_read_workspace('networks'));

drop policy if exists networks_insert on public.networks;
create policy networks_insert on public.networks for insert
  with check (app.can_write_workspace('networks'));

drop policy if exists networks_update on public.networks;
create policy networks_update on public.networks for update
  using (app.can_write_workspace('networks'))
  with check (app.can_write_workspace('networks'));

-- DELETE 정책은 만들지 않는다 = 모두 거부(물리 삭제 금지, 비활성화는 deleted_at).

-- ── 5. 트리거 ─────────────────────────────────────────────────────────
-- 기여 로그 트리거는 데이터 이관이 끝난 뒤에 붙인다. 먼저 붙이면 이관 INSERT마다
-- '등록' 기여가 새로 쌓여 원래 이력 위에 오늘 날짜가 덮인다.
drop trigger if exists trg_networks_updated_at on public.networks;
create trigger trg_networks_updated_at
  before update on public.networks
  for each row execute function app.set_updated_at();

-- 국내/해외를 국가에서 파생시킨다. 담당자가 고르는 칸은 국가 하나이고, region_scope는
-- 그 국가가 자국인지(country_tags.is_domestic)를 옮겨 적은 값일 뿐이다. 화면이 무엇을
-- 보내든 여기서 다시 계산하므로 "해외로 저장했는데 국가는 한국"이 만들어지지 않는다.
-- 국가를 모르는 행(옛 데이터)은 판정할 근거가 없으므로 들어온 값을 그대로 둔다.
create or replace function app.sync_network_region_scope()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_domestic boolean;
begin
  if NEW.country_tag_id is null then
    return NEW;
  end if;
  select c.is_domestic into v_domestic
    from public.country_tags c
   where c.id = NEW.country_tag_id;
  if v_domestic is null then
    return NEW;
  end if;
  NEW.region_scope := case when v_domestic then 'DOMESTIC' else 'OVERSEAS' end;
  return NEW;
end $$;

comment on function app.sync_network_region_scope() is
  'networks.region_scope를 국가(country_tags.is_domestic)에서 파생시킨다. 지역의 단일 원천은 국가 하나이며 이 열은 그 사실을 옮겨 적은 빠른 축이다.';

drop trigger if exists trg_networks_region_scope on public.networks;
create trigger trg_networks_region_scope
  before insert or update of country_tag_id on public.networks
  for each row execute function app.sync_network_region_scope();

-- 파괴적 작업(비활성화·병합) 가드는 세우지 않는다. NETWORKS는 담당자 원장이 없는 영구
-- 공동관리이고, 종전 가드는 기여 로그(app.is_entity_contributor)로 판정해 두 가지가 깨졌다 —
-- 지우려는 레코드에 자기 기여를 먼저 한 줄 넣으면 통과했고(우회), 기여 기록이 0건이면 오히려
-- 공용 허용으로 폴백했다(유실 시 전면 개방). 그래서 2026-07-21에 트리거와 헬퍼를 함께 걷었고
-- (20260721120000_networks_shared_management_guard.sql) 복원하지 않기로 확정했다.
-- 안전장치는 그대로다 — 비활성화는 물리 삭제가 아닌 soft delete이고 사유가 필수이며
-- 기여 로그에 'deactivated'로 남아 되돌리기와 추적이 모두 가능하다.

drop trigger if exists trg_networks_affiliation_history on public.networks;
create trigger trg_networks_affiliation_history
  before update on public.networks
  for each row execute function app.track_affiliation_history();

drop trigger if exists trg_networks_merge_audit on public.networks;
create trigger trg_networks_merge_audit
  after update of merged_into_id on public.networks
  for each row execute function app.audit_networks_merge();

drop trigger if exists trg_networks_contribution on public.networks;
create trigger trg_networks_contribution
  after insert or update on public.networks
  for each row execute function app.log_entity_contribution('networks');

-- ── 6. 다형 키 정규화 ─────────────────────────────────────────────────
-- 원장 이름을 값으로 들고 있던 다형 키를 한 값으로 모은다. 옛 값을 남기고 매핑 함수로
-- 우회하지 않는다 — 매핑을 두면 조인마다 그 함수를 태워야 하고, 한 곳이라도 빠지면
-- 목록에서 조용히 사라지는 행이 생긴다.
update public.entity_contributions
   set entity_table = 'networks'
 where entity_table in ('experts', 'van', 'exp', 'investors', 'corporates',
                        'institutions', 'universities', 'etc', 'vendors',
                        'others', 'global_networks');

update public.entity_codes
   set entity_table = 'networks'
 where entity_table in ('experts', 'van', 'exp', 'investors', 'corporates',
                        'institutions', 'universities', 'etc', 'vendors',
                        'others', 'global_networks');

-- 자료(attachments)·피드백(entity_feedback)·회의록 링크는 단수 키를 쓴다(minuteLinks.ts와 일치).
update public.attachments
   set target_type = 'network'
 where target_type in ('expert', 'van', 'exp', 'investor', 'corporate', 'institution',
                       'university', 'etc', 'other', 'vendor', 'global_network');

update public.entity_feedback
   set target_type = 'network'
 where target_type in ('expert', 'van', 'exp', 'investor', 'corporate', 'institution',
                       'university', 'etc', 'other', 'vendor', 'global_network');

-- 회의록 링크: CHECK를 먼저 풀고 값을 옮긴 뒤 새 목록으로 다시 건다.
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_target_type_check;
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_attendee_target_check;

update public.meeting_minute_links
   set target_type = 'network'
 where target_type in ('expert', 'van', 'exp', 'investor', 'corporate', 'institution',
                       'university', 'etc', 'other', 'vendor', 'global_network');

alter table public.meeting_minute_links
  add constraint meeting_minute_links_target_type_check
  check (target_type in ('program', 'ma_program', 'project_program', 'startup', 'fund', 'network'));

-- 사업·스타트업·펀드는 회의에 참석하지 않는다 — 외부 참석자 역할은 네트워크 원장에만 허용한다.
alter table public.meeting_minute_links
  add constraint meeting_minute_links_attendee_target_check
  check (role <> 'EXTERNAL_ATTENDEE' or target_type = 'network');

comment on constraint meeting_minute_links_target_type_check on public.meeting_minute_links is
  '회의록 연동 대상 종류. NETWORKS 원장 통합(20260904120000)으로 종전 10종 단수 키가 network 하나가 되었다.';

-- 사업 참가자: 전문가 원장이 통합되면서 '어느 원장인가'는 networks 하나가 답하고,
-- '전문가인가'는 그 행의 category가 답한다(문자열 하나가 두 조건이 된다).
alter table public.program_participants
  drop constraint if exists program_participants_master_table_chk;
update public.program_participants
   set master_table = 'networks'
 where master_table = 'experts';
alter table public.program_participants
  add constraint program_participants_master_table_chk
  check (master_table is null or master_table in ('startups', 'networks'));

comment on column public.program_participants.master_table is
  '참가자가 어느 원장에서 온 사람인가(startups | networks). networks 행의 구분(전문가·기업 등)은 그 행의 category가 답한다.';

-- ── 7. 구 원장 개명 ───────────────────────────────────────────────────
-- 드롭하지 않는다 — 이 환경은 pg_dump가 Docker를 요구해 백업을 뜰 수 없다. 되돌릴 수단
-- 없이 지우지 않는다는 규칙(20260903100000)을 그대로 따른다. `_retired_` 접두사는
-- '쓰지 않는다'를 이름 자체가 말하게 한다.
--
-- 표 이름으로 함수 본문 전수 조사(2026-09-03의 교훈 — rename/drop은 함수 본문을 의존성으로
-- 추적하지 않아, 조회하던 함수가 살아남아 호출 순간 42P01로 죽는다):
--   · app.network_entities_union(뷰)            → §8에서 드롭
--   · public.network_directory_entities()        → §8에서 드롭
--   · public.global_network_entities()           → §8에서 드롭
--   · public.my_network_entities()               → §8에서 재작성
--   · public.all_network_entities()              → §8에서 재작성
--   · app.can_link_entity_target()               → §8에서 재작성(networks 분기 복구)
--   · public.open_program_guest_access()         → §8에서 재작성(experts 조회 → networks)
--   · public.reset_program_guest_password()      → experts를 조회하지 않는다(확인 완료)
--   · public.hub_expert_ranking()                → 20260903150000에서 이미 드롭됨
--   · public.reassign_entity()/deactivate_entity()/merge_entity()/upload_*()
--     → 표 이름을 인자로 받는 제네릭 함수라 본문에 원장 이름이 없다. 통합 후에는
--       'networks' 하나를 받는다(카탈로그 게이트 app.has_contribution_trigger가 §5의
--       기여 트리거로 통과한다).
do $retire$
declare
  t text;
begin
  foreach t in array array[
    'experts', 'van', 'exp', 'investors', 'corporates', 'institutions',
    'universities', 'etc', 'vendors', 'others', 'global_networks'
  ] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I rename to %I', t, '_retired_' || t);
      execute format(
        'comment on table public.%I is %L',
        '_retired_' || t,
        format('[은퇴] %s — 20260904120000에서 public.networks로 통합됨. 쓰지 않는다(이관 검증 후 별도 마이그레이션으로 삭제).', t)
      );
      raise notice 'public.% → public._retired_%', t, t;
    end if;
  end loop;
end $retire$;

-- ── 8. 조회면 재작성 ──────────────────────────────────────────────────
-- 원장이 하나가 되어 union 뷰가 할 일이 없다. 목록 RPC가 통합 원장을 직접 읽는다.
drop view if exists app.network_entities_union;

drop function if exists public.network_directory_entities(
  text, text, boolean, boolean, text[], text, integer, integer, numeric, numeric, integer, integer);
drop function if exists public.global_network_entities(
  text, boolean, uuid[], uuid[], text[], boolean, boolean, integer, integer);
drop function if exists public.my_network_entities(
  text, integer, integer, text[], boolean, boolean, text[], text, integer, integer, numeric, numeric);
drop function if exists public.all_network_entities(
  text, integer, integer, text[], boolean, boolean, text[], text, integer, integer, numeric, numeric);

-- (8-1) 전체 범위 목록 ------------------------------------------------------
create function public.all_network_entities(
  p_keyword          text    default null,
  p_limit            integer default 30,
  p_offset           integer default 0,
  -- 구분 코드. 빈 배열/NULL이면 거르지 않는다.
  p_categories       text[]  default null,
  -- 미분류 축: NULL=상관없음, true=미분류만, false=분류된 것만.
  -- 구분 배열과 별개 인자인 이유는 '값이 없다'를 배열 원소로 표현할 수 없어서다.
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
       and (p_categories is null or cardinality(p_categories) = 0 or d.category = any(p_categories))
       and (p_uncategorized is null
            or (p_uncategorized and d.category is null)
            or (not p_uncategorized and d.category is not null))
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

revoke all on function public.all_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) from public;
grant execute on function public.all_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) to authenticated;

comment on function public.all_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) is
  'NETWORKS 통합 목록(볼 수 있는 전부). 구분·국가·권역·지역·영역·매칭·활동 축을 서버에서 건다. 권역은 국가를 조인해 판정한다(행에 저장하지 않는다). SECURITY INVOKER — public.networks의 RLS를 그대로 따른다.';

-- (8-2) 내 것 범위 목록 ----------------------------------------------------
-- 전체 범위와 인자·반환 열 규약이 같고 범위와 정렬(최근 기여순)만 다르다. 한 함수에 두
-- 계획을 넣으면 플래너가 어느 쪽도 제대로 세우지 못하므로 함수를 나눈다(20260731230000).
create function public.my_network_entities(
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
       and (p_categories is null or cardinality(p_categories) = 0 or d.category = any(p_categories))
       and (p_uncategorized is null
            or (p_uncategorized and d.category is null)
            or (not p_uncategorized and d.category is not null))
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

revoke all on function public.my_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) from public;
grant execute on function public.my_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) to authenticated;

comment on function public.my_network_entities(
  text, integer, integer, text[], boolean, text[], uuid[], uuid[], boolean, boolean, boolean,
  text[], text, integer, integer, numeric, numeric) is
  '호출자가 생성자이거나 기여자인 NETWORKS 통합 목록. all_network_entities와 인자·반환 열 규약이 같고 범위와 정렬(최근 기여순)만 다르다.';
-- (8-3) 연동 대상 열람 판정 — networks 분기 복구 ----------------------------
-- 20260826220000이 회의록 헬퍼를 이 함수로 위임시키면서 networks 분기가 통째로 빠졌다.
-- set_minute_links는 통과분만 반영하므로, 그 이후로 회의록에 네트워크 인물을 걸면 오류
-- 없이 조용히 사라졌다. 통합으로 종전 10종 단수 키가 'network' 하나가 되었으므로 분기도
-- 하나다.
create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'project_program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
      and exists (select 1 from public.project_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.networks x
                   where x.id = p_target_id and x.deleted_at is null and x.merged_into_id is null)
    else false
  end;
$$;
revoke all on function app.can_link_entity_target(text, uuid) from public;
grant execute on function app.can_link_entity_target(text, uuid) to authenticated;

comment on function app.can_link_entity_target(text, uuid) is
  '요청자가 연동 대상 원장 행을 열람 가능한가(각 원장 SELECT 정책 재현 + 소프트삭제·병합·미존재 배제). 회의록 연동·결재 프로젝트 연동이 공유한다. NETWORKS는 통합 원장 하나이므로 키도 network 하나다.';

-- (8-4) 게스트 로그인 개방 — 전문가 원장 조회를 통합 원장으로 -----------------
-- 20260903120000의 본문을 그대로 다시 세우고 참가자 원장 판정 분기 한 곳만 바꾼다.
-- master_table이 startups가 아니면 통합 원장(networks)에서 이름·연락처를 읽는다(종전 experts).
-- 본문을 요약해 다시 쓰지 않는 이유: 이 함수는 초대 레코드 갱신·명부 상태 전이·접근 로그를
-- 함께 처리하므로, 줄여 쓰면 그 부수 효과가 조용히 사라진다.
create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table (
  participant_id uuid,
  program_code   text,
  target_name    text,
  email          text,
  phone          text
)
language plpgsql
as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  r           record;
  v_prog      jsonb;
  v_code      text;
  v_status    text;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_user_type text;
  v_company   uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return;
  end if;

  for r in
    select pp.id, pp.program_id, pp.role, pp.master_table, pp.master_id, pp.login_status
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    v_prog   := app.program_row(r.program_id);
    v_code   := v_prog ->> 'code';
    v_status := v_prog ->> 'status';

    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    if v_status in ('FINISHED', 'CANCELLED') then
      raise exception '종료·취소된 사업은 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;
    if r.master_id is null or r.master_table is null then
      raise exception '원장에 연결되지 않은 참가자는 로그인 대상이 아닙니다.' using errcode = '22023';
    end if;
    if v_code is null then
      raise exception '사업코드가 없어 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;

    v_name := null; v_email := null; v_phone := null; v_company := null;

    if r.master_table = 'startups' then
      select s.representative, nullif(s.contact ->> 'email', ''), nullif(s.contact ->> 'phone', '')
        into v_name, v_email, v_phone
        from public.startups s
       where s.id = r.master_id and s.deleted_at is null;
      v_user_type := 'external_startup';
      v_company   := r.master_id;
    else
      select e.name, nullif(e.email, ''), nullif(e.phone, '')
        into v_name, v_email, v_phone
        from public.networks e
       where e.id = r.master_id and e.deleted_at is null and e.merged_into_id is null;
      v_user_type := 'external_expert';
    end if;

    if v_name is null or (v_email is null and v_phone is null) then
      raise exception '원장에 성명 또는 연락처가 없어 로그인을 열 수 없습니다. NETWORKS에서 먼저 보완하십시오.'
        using errcode = '22023';
    end if;

    update public.guest_invitations
       set business_code     = v_code,
           name              = v_name,
           email             = v_email,
           phone             = v_phone,
           invited_user_type = v_user_type::public.user_type,
           company_id        = v_company,
           target_type       = 'PROGRAM',
           target_id         = r.program_id,
           invite_expires_at = now() + interval '1 year',
           otp_hash          = null,
           otp_expires_at    = null,
           otp_attempts      = 0
     where guest_invitations.participant_id = r.id;

    if not found then
      insert into public.guest_invitations
        (business_code, name, email, phone, invited_user_type, company_id,
         target_type, target_id, participant_id, created_by, invite_expires_at)
      values
        (v_code, v_name, v_email, v_phone, v_user_type::public.user_type, v_company,
         'PROGRAM', r.program_id, r.id, v_uid, now() + interval '1 year');
    end if;

    update public.program_participants pp
       set login_status    = case when pp.login_status = 'ACTIVE' then 'ACTIVE'::public.participant_login_status
                                  else 'INVITED'::public.participant_login_status end,
           invited_at      = coalesce(pp.invited_at, now()),
           login_opened_by = v_uid,
           login_opened_at = now(),
           updated_at      = now()
     where pp.id = r.id;

    perform app.log_guest_access(
      null,
      'GUEST_ACCESS_OPEN',
      'guest:login',
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id, 'role', r.role,
                         'master_table', r.master_table, 'master_id', r.master_id),
      null
    );

    participant_id := r.id;
    program_code   := v_code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.open_program_guest_access(uuid[]) from public;
grant execute on function public.open_program_guest_access(uuid[]) to authenticated;

comment on function public.open_program_guest_access(uuid[]) is
  '명부 행의 게스트 로그인을 연다(사업 담당자 전용, SECURITY INVOKER). AC·M&A·PROJECT 공용이며 참가자 원장은 startups 또는 통합 원장 networks다.';
