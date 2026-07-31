-- =====================================================================
-- 목록 공통 검색·정렬 인덱스 (pg_trgm)
--
-- 배경: 모든 목록 화면(STARTUP·NETWORKS 11종·AC/M&A/PROJECT·FUND)은 같은 모양의 쿼리를
--   낸다 — soft delete를 거르고, 부분일치(`ilike '%kw%'`)로 검색하고, 한 컬럼으로 정렬해
--   30건씩 끊는다. 그런데 지금까지 이 모양을 받아 줄 인덱스가 하나도 없었다.
--   원장마다 있는 `idx_*_name`은 평범한 btree라 `'%kw%'`(앞이 열린 패턴)에는 쓰이지 않고,
--   정렬에 쓰이더라도 soft delete 조건을 인덱스가 갖고 있지 않아 걸러내는 일이 남는다.
--   결과적으로 검색 한 번이 매번 원장 전체를 순차 스캔했다. 지금은 건수가 적어 드러나지 않지만
--   '전체 ~' 목록이 열리면 스캔 대상이 곧바로 원장 전체가 된다.
--
-- 설계: 화면이 내는 쿼리 모양이 하나이므로 인덱스 규칙도 하나로 찍어낸다.
--   1) 검색 컬럼마다 trigram GIN — `ilike '%kw%'`를 인덱스로 받는다.
--   2) 정렬 컬럼마다 btree — LIMIT 30이 정렬 전체를 만들지 않고 앞에서 끊게 한다.
--   둘 다 화면 쿼리와 같은 soft delete 조건을 건 부분 인덱스로 만든다. 조건이 인덱스에
--   들어가 있어야 플래너가 그 인덱스를 쓸 수 있고, 죽은 행이 인덱스에 쌓이지도 않는다.
--
-- OR 검색은 전부 아니면 전무다: 검색어 하나가 여러 컬럼에 OR로 걸리므로(예: 이름 or 소속
--   or 이메일) 그중 한 컬럼이라도 인덱스가 없으면 플래너는 BitmapOr를 포기하고 순차 스캔으로
--   되돌아간다. 그래서 목록 검색에 참여하는 컬럼은 조건부로 참여하는 것(이메일·연락처 —
--   민감정보 마스킹 정책에 따라 검색 범위에서 빠질 수 있다)까지 빠짐없이 건다.
--
-- 한계(알고 넘어감): trigram 인덱스는 검색어에서 3글자 조합을 뽑아 찾는다. 1~2글자
--   검색어는 뽑을 조합이 없어 인덱스를 타지 못하고 순차 스캔으로 되돌아간다. 다만 1~2글자
--   검색은 어차피 결과가 원장 대부분이라 좁히는 의미가 크지 않다.
--
-- 쓰기 비용: GIN 인덱스는 INSERT/UPDATE를 무겁게 한다. 대용량 업로드가 다소 느려질 수
--   있으나 GIN 기본값(fastupdate)이 갱신을 모아 처리하므로 건별 등록에는 영향이 작다.
--   조회가 압도적으로 잦은 원장 성격상 읽기를 택한다.
--
-- 기존 `idx_*_name`은 남긴다. 이 마이그레이션의 부분 인덱스는 목록 쿼리에만 대응하고,
--   중복 검출·병합 등 soft delete를 거르지 않는 조회는 여전히 기존 인덱스를 쓴다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 인덱스만 추가한다. 테이블·컬럼·뷰·정책·함수·트리거 변경 없음.
--   - RLS 무관: 인덱스는 접근 경계를 바꾸지 않는다. 인덱스가 있든 없든 사용자가 볼 수 있는
--     행의 집합은 각 테이블의 기존 RLS 정책이 그대로 결정한다.
--   - 신규 RPC/SECURITY DEFINER/GRANT/Storage 정책 없음. 감사 로그 영향 없음.
--   - 개인정보(이메일·연락처)를 인덱싱하지만 노출 경계는 변하지 않는다 — 검색 범위 자체는
--     화면이 민감정보 정책(useMaskPolicy)에 따라 조건을 넣고 빼며 결정하고, 인덱스는 그
--     조건이 들어왔을 때 빨리 답할 뿐이다. 가려진 필드는 조건에서 빠지므로 인덱스도 쓰이지 않는다.
--   - 잠금: CONCURRENTLY는 트랜잭션 안에서 쓸 수 없어 사용하지 않는다. 인덱스 생성 동안
--     해당 테이블 쓰기가 잠시 막힌다. 현재 원장 규모에서는 짧으며, 커질수록 비싸지므로 지금 건다.
-- 근거: 20260731190000_network_directory_search_metrics.sql(디렉토리 검색 RPC),
--       apps/works/src/features/startup/startupPoolHooks.ts,
--       apps/works/src/features/program/programsPoolHooks.ts
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

do $$
declare
  -- (원장, soft delete 조건, 검색 컬럼, 정렬식)
  -- 조건·컬럼·정렬은 각 목록 화면이 실제로 내는 쿼리에서 그대로 가져온다. 화면이 조건을
  -- 바꾸면 부분 인덱스가 안 맞아 조용히 안 쓰이게 되므로, 여기를 함께 고쳐야 한다.
  spec constant jsonb := '[
    {"t":"experts",         "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"investors",       "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"van",             "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"exp",             "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"corporates",      "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"institutions",    "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"universities",    "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"vendors",         "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"etc",             "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"others",          "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"global_networks", "p":"deleted_at is null and merged_into_id is null", "s":["name","affiliation","email","phone"], "o":"name"},
    {"t":"startups",        "p":"deleted_at is null and merged_into_id is null", "s":["name","representative","biz_reg_no","email","phone"], "o":"name"},
    {"t":"programs",         "p":"deleted_at is null", "s":["title"], "o":"created_at desc"},
    {"t":"ma_programs",      "p":"deleted_at is null", "s":["title"], "o":"created_at desc"},
    {"t":"project_programs", "p":"deleted_at is null", "s":["title"], "o":"created_at desc"},
    {"t":"funds",            "p":"deleted_at is null", "s":["name","code"], "o":"vintage_year desc nulls last"}
  ]'::jsonb;
  item  jsonb;
  col   text;
  tbl   text;
  pred  text;
  -- gin_trgm_ops가 실제로 설치된 스키마를 카탈로그에서 찾아 붙인다. pg_trgm이 이전에
  -- 다른 스키마(public 등)에 깔려 있었다면 `create extension if not exists ... with schema`가
  -- 옮겨 주지 않으므로, 스키마명을 고정해 쓰면 "연산자 클래스 없음"으로 실패한다.
  trgm_ops text;
begin
  select quote_ident(n.nspname) || '.gin_trgm_ops'
    into trgm_ops
    from pg_opclass o
    join pg_namespace n on n.oid = o.opcnamespace
    join pg_am a on a.oid = o.opcmethod
   where o.opcname = 'gin_trgm_ops' and a.amname = 'gin'
   limit 1;

  if trgm_ops is null then
    raise exception 'pg_trgm 확장의 gin_trgm_ops를 찾을 수 없습니다 — 확장 설치를 먼저 확인하세요.';
  end if;

  for item in select * from jsonb_array_elements(spec) loop
    tbl  := item->>'t';
    pred := item->>'p';

    -- 원장이 아직 없는 환경(부분 적용된 로컬 등)에서는 조용히 건너뛴다.
    if to_regclass('public.' || quote_ident(tbl)) is null then
      continue;
    end if;

    -- 검색: 부분일치용 trigram GIN.
    for col in select jsonb_array_elements_text(item->'s') loop
      -- 컬럼이 없으면 건너뛴다. 원장 11종은 프로필 스키마를 통일했지만, 통일 이전 상태로
      -- 남아 있는 환경에서 마이그레이션 전체가 멈추지 않게 한다.
      if not exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = tbl and column_name = col
      ) then
        continue;
      end if;

      execute format(
        'create index if not exists %I on public.%I using gin (%I %s) where %s',
        'idx_' || tbl || '_' || col || '_trgm', tbl, col, trgm_ops, pred
      );
    end loop;

    -- 정렬: 목록의 기본 정렬을 그대로 인덱스로 갖는다(LIMIT이 앞에서 끊기도록).
    execute format(
      'create index if not exists %I on public.%I (%s) where %s',
      'idx_' || tbl || '_list_order', tbl, item->>'o', pred
    );
  end loop;
end $$;

-- 담당자 검색 역조회: 모든 목록이 검색어로 users.name을 먼저 훑어 사용자 id를 얻은 뒤
-- 그 id로 원장을 되짚는다. 원장마다 인덱스를 깔아도 이 한 번의 순차 스캔이 남으면
-- 검색 응답은 그만큼에서 멈춘다. 목록 공통 경로이므로 여기도 함께 건다.
-- users는 soft delete를 거르지 않고 조회하므로 부분 인덱스로 만들지 않는다.
create index if not exists idx_users_name_trgm
  on public.users using gin (name extensions.gin_trgm_ops);

comment on index public.idx_users_name_trgm is
  '담당자 이름 부분일치 검색(모든 목록 화면의 담당자 역조회 공통 경로).';
