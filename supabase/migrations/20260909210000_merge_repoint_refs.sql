-- =====================================================================
-- 병합이 참조를 정본으로 옮긴다 — merge_entity의 빈자리를 메운다
--
-- 무엇이 문제였나
--   `public.merge_entity()`는 중복 행에 `merged_into_id`를 세우고 양쪽에 기여 로그를 남길
--   뿐, **그 행을 가리키던 것들은 그대로 둔다.** 목록은 병합된 행을 거르므로 중복은 화면에서
--   사라지는데, 그 행에 붙어 있던 자료·코멘트·회의록 링크·명단 줄·연결은 **사라진 행을 계속
--   가리킨다.** 정본을 열면 그것들이 없고, 원본은 어디서도 열 수 없다.
--
--   NETWORKS에서는 참을 만했다(참조가 대부분 다형 소프트 참조이고 자료도 적었다). `startups`가
--   들어오면 뜻이 달라진다 — 하드 FK가 여럿이고, 중복 행으로 사업 명단에 담아 자료까지 올린
--   뒤 병합하는 것이 실제로 일어나는 순서다.
--
-- 두 갈래 중 '옮긴다'를 택했다(2026-09-09 사용자 확정)
--   대안은 '조회가 병합을 따라 읽는다'(참조는 그대로 두고 볼 때마다 `merged_into_id`를
--   따라간다)였다. 데이터를 건드리지 않아 되돌릴 수 있지만, 조회 지점마다 손이 가고 한 곳을
--   빠뜨리면 그 화면에서만 옛 행이 보인다 — 옮기는 쪽은 한 번에 끝나고 그 뒤로는 어느 조회도
--   병합을 알 필요가 없다.
--
-- 무엇을 옮기고 무엇을 두는가 — 기준은 하나: **그 행의 소유물인가, 그 행에 일어난 일인가**
--   옮긴다: 자료·코멘트·회의록 링크·참가자 명단 줄, 그리고 하드 FK 전부(담당자·투자·연결).
--           이것들은 "이 회사의 것"이고, 회사가 하나로 합쳐졌으면 함께 따라와야 한다.
--   두 둔다: 기여 로그·감사 로그·접근 로그·부여 코드. 이것들은 "그 행에 일어난 일"이라
--           사후에 주인을 바꾸면 거짓 기록이 된다(merge_entity가 이미 양쪽에 병합 사실을
--           남기므로, 중복 쪽 이력은 '정본으로 병합됨'에서 끊기는 것이 사실 그대로다).
--
-- 겹치면 옮기지 않고 **멈춘다**
--   정본과 중복이 같은 사업 명단에 함께 있으면 옮기는 순간 유일 제약에 걸린다. 이때 조용히
--   한쪽을 지우지 않는다 — 지우는 일에는 저마다 제 경로가 있고(명부 빼기는 따라쓰기 확인과
--   감사 로그를 강제한다), 병합이 그 경로를 우회하면 그 강제가 화면 장식이 된다.
--   되돌릴 수 있는 것(소프트 삭제 원장)만 병합이 접고, 나머지는 사유를 들어 거절한다.
--
-- 하드 FK는 손으로 나열하지 않는다
--   `pg_constraint`가 답한다(`app.module_content_tables`와 같은 근거). 손 목록은 원장이 하나
--   늘어난 날 조용히 빠지고, 빠진 자리가 곧 '병합했는데 그 연결만 옛 행을 가리키는' 경로다.
--   자기 참조(`merged_into_id`)도 함께 걸리므로 **병합 사슬이 저절로 펴진다** — C가 B로,
--   B가 A로 합쳐지면 C도 A를 가리키게 된다.
--
-- 다형 참조는 카탈로그가 답한다
--   FK가 아니라 문자열 키라 `pg_constraint`가 모른다. 그래서 선언한다 — 그리고 **선언에서
--   빠진 표는 옮겨지지 않는다**는 사실이 이 파일의 가장 큰 위험이므로, 다형 참조를 새로
--   만드는 사람이 여기를 함께 열도록 주석과 보안 게이트 체크리스트가 함께 가리킨다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: 원장마다 다르다(startup·networks·mna). 함수는 원장을 인자로 받는다
--   · 데이터 등급: Personal (옮기는 대상에 자료·연락 이력이 포함된다)
--   · 접근 주체: 내부 사용자만. 실행 자격은 아래 'SECURITY INVOKER' 항목이 답한다
--   · Scope 기준: global(원장 단위)
--   · 감사 로그: 병합 자체는 원장 트리거가 `audit_logs`에 적재한다(20260909200000).
--     재배선은 그 병합의 일부라 별도 행을 만들지 않는다 — 한 행위가 두 줄로 남으면
--     감사에서 병합 건수를 셀 수 없다
--   · 운영 영향: `merge_entity`의 동작이 넓어진다. 종전 호출(NETWORKS 병합 콘솔)은 그대로
--     동작하며 달라지는 것은 자료·코멘트가 정본으로 따라온다는 점이다
--
-- SECURITY INVOKER를 유지한다
--   DEFINER로 만들면 각 원장·각 참조 표의 RLS를 우회하게 되어, 정책을 함수 안에 복제해야 하고
--   그 복제본이 곧 권한 구멍이 된다(CLAUDE.md 기여 로그 항목의 근거 그대로).
--
--   대가는 분명하다 — **옮길 권한이 없는 표의 UPDATE는 0행에 걸려 조용히 지나간다.** 그래서
--   병합을 부르는 자리를 ADMIN으로 좁힌다: 관리자는 원장과 참조 표의 정책을 모두 통과하므로
--   '일부만 옮겨진 병합'이 생기지 않는다. 화면을 넓히려면 이 문장을 먼저 다시 읽어야 한다.
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블 없음 / DELETE 정책 신설 없음 / Storage 무관
--   · 새 함수 둘 다 `set search_path = app, public` 고정
--   · `merge_entity`는 INVOKER 유지(각 표의 RLS가 그대로 판정한다)
--   · 멱등(create or replace)
--
-- 근거: 20260722140000(merge_entity), 20260902180000(카탈로그로 대상 찾기 선례),
--       20260909200000(병합 축·감사)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 다형 참조 카탈로그 — FK가 아니라 문자열 키로 이 원장을 가리키는 표들
--
--     겹쳤을 때 무엇을 하는가(on_conflict)와 **무엇이 같으면 겹친 것인가**(conflict_cols)를
--     함께 선언한다. 뒤엣것이 없으면 대상 키만으로 겹침을 판정하게 되어, 유일 제약이 없는
--     표(자료·코멘트)에서 멀쩡한 줄을 치운다.
-- ---------------------------------------------------------------------
create or replace function app.merge_ref_tables(p_ledger text)
returns table (
  rel_name    text,
  type_col    text,
  id_col      text,
  type_value  text,
  /**
   * **무엇이 같으면 같은 줄인가** — 그 표의 유일 제약에서 대상 키를 뺀 나머지다.
   *
   * `null`이면 겹침이 성립하지 않는다(유일 제약이 없다). 이 구분이 결정적이다 — 자료와
   * 코멘트는 같은 회사에 여러 건이 정상이므로, 대상 키만으로 "겹쳤다"고 보면 **정본에 자료가
   * 하나라도 있을 때 중복 쪽 자료가 전부 접힌다.**
   */
  conflict_cols text[],
  /**
   * 겹쳤을 때 무엇을 하는가. 겹치지 않으면 셋 다 그냥 옮긴다.
   *
   *  'soft'   — 중복 쪽 줄을 접는다(deleted_at). 되돌릴 수 있는 원장에만 쓴다.
   *  'delete' — 중복 쪽 줄을 지운다. 업무 기록이 아니라 **연결 자체**인 표에만 쓴다
   *             (회의록 링크는 "이 회의록이 이 회사를 가리킨다"는 사실 하나이고, 정본에
   *             같은 링크가 이미 있으면 중복 링크는 아무 사실도 더하지 않는다).
   *  'block'  — 옮기지 않고 병합을 거절한다. 지우는 일에 제 경로가 있는 원장들이다.
   */
  on_conflict text
)
language sql
stable
set search_path = app, public
as $$
  select v.rel_name, v.type_col, v.id_col, v.type_value, v.conflict_cols, v.on_conflict
    from (values
      -- 자료. 이 원장의 소유물 중 가장 잃으면 안 되는 것이다(스토리지 실물이 딸려 있다).
      -- 유일 제약이 없다 — 같은 회사에 자료 여럿이 정상이므로 겹침이 성립하지 않는다.
      ('attachments', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        null::text[], 'move'),
      -- 코멘트·피드백. 같은 이유로 겹침이 성립하지 않는다(두 사람이 각각 쓴 글이다).
      ('entity_feedback', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        null::text[], 'move'),
      -- 회의록 상호참조. **M&A 두 원장은 대상이 아니다**(CHECK가 사업 3종·스타트업·펀드·
      -- 네트워크만 허용한다) — 없는 키로 훑으면 조용히 0행이므로 아예 빼 둔다.
      -- `unique (minute_id, target_type, target_id)`가 있고 소프트 삭제가 없어 'delete'다.
      ('meeting_minute_links', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network' end,
        array['minute_id'], 'delete'),
      -- 참가자 명단. 한 사업에 같은 원장 행은 한 줄이고 소프트 삭제 원장이라, 겹치면 중복 쪽
      -- 줄을 접는다(다시 담을 수 있다).
      ('program_participant_entries', 'master_table', 'master_id', p_ledger,
        array['entity_key', 'program_id'], 'soft'),
      -- GUEST 명부. 빼는 일에 제 경로(따라쓰기 확인 + 감사 로그)가 있어 병합이 대신하지 않는다.
      ('program_participants', 'master_table', 'master_id', p_ledger,
        array['entity_key', 'program_id'], 'block'),
      -- 게스트 계정 매핑. 한 원장 행에 사람마다 한 줄이며(3_9_2), 두 행에 같은 사람이 걸려
      -- 있으면 어느 계정이 살아남는가는 사람이 정할 일이다(ADMIN 축).
      ('guest_identities', 'master_table', 'master_id', p_ledger,
        array['user_id'], 'block')
    ) as v(rel_name, type_col, id_col, type_value, conflict_cols, on_conflict)
   where v.type_value is not null
     -- 원장이 늘어도 표가 실제로 있을 때만 훑는다(마이그레이션 순서 무관).
     and to_regclass('public.' || v.rel_name) is not null;
$$;

comment on function app.merge_ref_tables(text) is
  '중복 병합에서 정본으로 옮길 다형 참조 표 목록. FK가 아니라 문자열 키라 pg_constraint가 모르므로 선언한다 — 다형 참조를 새로 만들면 여기를 함께 열어야 하고, 빠뜨리면 병합 후 그 참조만 사라진 행을 가리킨다. 겹침 판정 키(conflict_cols)를 함께 들며, 그 키가 없으면 겹침이 성립하지 않는다. on_conflict가 block인 표는 겹치면 병합을 거절한다 — 지우는 일에 제 경로가 있는 원장들이다.';

-- ---------------------------------------------------------------------
-- (1-b) 충돌 키를 SQL 조건으로 편다.
--
--     키가 없으면(`null`) 겹침이 성립하지 않으므로 `false`를 돌려준다 — `true`로 두면
--     대상 키만 같아도 겹친 것이 되어, 유일 제약이 없는 표에서 멀쩡한 줄을 치운다.
--     **판정을 못 하는 쪽으로 기울 때는 아무것도 치우지 않는 쪽이 안전하다.**
-- ---------------------------------------------------------------------
create or replace function app.merge_conflict_join(p_cols text[])
returns text
language sql
immutable
as $$
  select coalesce(
    (select string_agg(format('p.%I is not distinct from d.%I', c, c), ' and ')
       from unnest(p_cols) as c),
    'false'
  );
$$;

comment on function app.merge_conflict_join(text[]) is
  '충돌 키 목록을 `p.칸 is not distinct from d.칸` 조건으로 편다. 키가 없으면 false — 겹침이 성립하지 않는 표에서 멀쩡한 줄을 치우지 않는다. is not distinct from을 쓰는 것은 키에 null이 들어갈 수 있어서다(= 로 비교하면 null끼리 영영 안 걸린다).';

-- ---------------------------------------------------------------------
-- (2) 하드 FK로 이 원장을 가리키는 열 — 카탈로그가 답한다(손 목록 금지)
--     자기 참조(merged_into_id)도 함께 걸려 병합 사슬이 저절로 펴진다.
-- ---------------------------------------------------------------------
create or replace function app.merge_fk_columns(p_ledger text)
returns table (rel_name text, fk_col text)
language sql
stable
set search_path = app, public
as $$
  select cl.relname::text, a.attname::text
    from pg_constraint c
    join pg_class     cl on cl.oid = c.conrelid
    join pg_namespace n  on n.oid  = cl.relnamespace
    join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and n.nspname = 'public'
     and c.confrelid = ('public.' || p_ledger)::regclass
     and array_length(c.conkey, 1) = 1
     -- 폐기한 옛 원장(_retired_*)은 아무도 읽지 않는 백업이라 건드리지 않는다.
     and cl.relname not like '\_retired\_%';
$$;

comment on function app.merge_fk_columns(text) is
  '이 원장을 하드 FK로 가리키는 (표, 열) 목록. 손 목록이 아니라 pg_constraint가 답하므로 참조가 하나 늘어도 자동 반영된다. 자기 참조(merged_into_id)를 포함해 병합 사슬이 펴진다.';

-- ---------------------------------------------------------------------
-- (3) merge_entity — 종전 동작에 재배선을 더한다
-- ---------------------------------------------------------------------
create or replace function public.merge_entity(
  p_table        text,
  p_primary_id   uuid,
  p_duplicate_id uuid,
  p_note         text default null
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_rows integer;
  r      record;
  v_hit  integer;
begin
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_primary_id = p_duplicate_id then
    raise exception 'same_record' using errcode = '22023';
  end if;

  -- ── (a) 옮길 수 없는 겹침을 **먼저** 본다 ─────────────────────────
  -- 절반만 옮긴 뒤 거절하면 그 트랜잭션은 되돌아가지만, 순서를 뒤로 두면 실패할 때마다
  -- 무거운 UPDATE를 헛돌린다. 그리고 거절 사유가 무엇인지 말하려면 옮기기 전에 알아야 한다.
  for r in select * from app.merge_ref_tables(p_table) where on_conflict = 'block' loop
    execute format(
      'select count(*)::int from public.%I d
        where d.%I = $1 and d.%I = $2
          and exists (select 1 from public.%I p
                       where p.%I = $1 and p.%I = $3 and %s)',
      r.rel_name, r.type_col, r.id_col, r.rel_name, r.type_col, r.id_col,
      app.merge_conflict_join(r.conflict_cols)
    ) into v_hit using r.type_value, p_duplicate_id, p_primary_id;
    if v_hit > 0 then
      -- 사유에 표 이름을 담는다 — "병합할 수 없습니다" 한 줄이면 무엇을 먼저 정리해야
      -- 하는지 담당자가 알 수 없다.
      raise exception 'merge_conflict:%', r.rel_name using errcode = '23505';
    end if;
  end loop;

  -- ── (b) 중복 행: 어디로 흡수됐는지(트리거가 'merged'로 기록) ──────
  perform set_config('app.contribution_ctx',
                     jsonb_build_object('note', '정본으로 병합됨')::text,
                     true);
  execute format(
    'update public.%I set merged_into_id = $1 where id = $2 and merged_into_id is null',
    p_table
  ) using p_primary_id, p_duplicate_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;

  -- ── (c) 정본 행: 무엇을 흡수했는지 ────────────────────────────────
  -- 정본은 값이 바뀌지 않으므로 트리거가 볼 것이 없다 — 원장 변경이 아니라 순수 기록이라
  -- 여기서 직접 남긴다(행위자는 스탬프 트리거가 채운다).
  insert into public.entity_contributions (entity_table, entity_id, action, source, note)
  values (p_table, p_primary_id, 'merged', 'manual', coalesce(nullif(btrim(p_note), ''), '중복 병합'));

  -- ── (d) 다형 참조를 정본으로 옮긴다 ───────────────────────────────
  perform set_config('app.contribution_ctx',
                     jsonb_build_object('source', 'manual', 'note', '중복 병합으로 이관')::text,
                     true);
  for r in select * from app.merge_ref_tables(p_table) where on_conflict <> 'block' loop
    -- 겹치는 줄만 먼저 치운다. **겹침이 성립하는 표에만** 이 단계가 있다 — 유일 제약이 없는
    -- 표(자료·코멘트)에서 대상 키만으로 겹침을 판정하면, 정본에 자료가 하나라도 있을 때
    -- 중복 쪽 자료가 전부 접힌다.
    if r.on_conflict = 'soft' then
      execute format(
        'update public.%I d set deleted_at = now()
          where d.%I = $1 and d.%I = $2 and d.deleted_at is null
            and exists (select 1 from public.%I p
                         where p.%I = $1 and p.%I = $3 and p.deleted_at is null and %s)',
        r.rel_name, r.type_col, r.id_col, r.rel_name, r.type_col, r.id_col,
        app.merge_conflict_join(r.conflict_cols)
      ) using r.type_value, p_duplicate_id, p_primary_id;
    elsif r.on_conflict = 'delete' then
      execute format(
        'delete from public.%I d
          where d.%I = $1 and d.%I = $2
            and exists (select 1 from public.%I p
                         where p.%I = $1 and p.%I = $3 and %s)',
        r.rel_name, r.type_col, r.id_col, r.rel_name, r.type_col, r.id_col,
        app.merge_conflict_join(r.conflict_cols)
      ) using r.type_value, p_duplicate_id, p_primary_id;
    end if;

    -- 남은 줄을 정본으로 옮긴다.
    execute format(
      'update public.%I set %I = $3 where %I = $1 and %I = $2',
      r.rel_name, r.id_col, r.type_col, r.id_col
    ) using r.type_value, p_duplicate_id, p_primary_id;
  end loop;

  -- ── (e) 하드 FK를 정본으로 옮긴다 ─────────────────────────────────
  -- 유일 제약에 걸리면 그대로 터뜨린다. 여기서 한쪽을 지우는 판단을 하지 않는 이유는
  -- (a)와 같다 — 무엇을 지울지는 그 표의 일이고, 병합이 대신 정하면 그 표의 규칙이 무너진다.
  -- 거절은 트랜잭션 전체를 되돌리므로 절반만 옮겨진 상태가 남지 않는다.
  for r in select * from app.merge_fk_columns(p_table) loop
    execute format('update public.%I set %I = $2 where %I = $1', r.rel_name, r.fk_col, r.fk_col)
      using p_duplicate_id, p_primary_id;
  end loop;

  -- ── (f) 소속 3축 흡수(소속 컬럼을 가진 원장만 — 현재 NETWORKS) ────
  if app.entity_has_affiliation(p_table) then
    perform set_config('app.contribution_ctx',
                       jsonb_build_object('source', 'manual', 'note', '병합 이력 흡수')::text,
                       true);
    execute format($m$
      update public.%1$I p
         set profile = jsonb_set(
               coalesce(p.profile, '{}'::jsonb),
               '{affiliation_history}',
               coalesce(p.profile->'affiliation_history', '[]'::jsonb)
                 || coalesce(d.profile->'affiliation_history', '[]'::jsonb)
                 || case
                      when (coalesce(btrim(d.affiliation), '') is distinct from coalesce(btrim(p.affiliation), '')
                            or coalesce(btrim(d.profile->>'department'), '') is distinct from coalesce(btrim(p.profile->>'department'), '')
                            or coalesce(btrim(d.profile->>'position'), '') is distinct from coalesce(btrim(p.profile->>'position'), ''))
                       and coalesce(btrim(d.affiliation), '') || coalesce(btrim(d.profile->>'department'), '') || coalesce(btrim(d.profile->>'position'), '') <> ''
                      then jsonb_build_array(jsonb_build_object(
                             'affiliation', d.affiliation,
                             'department',  d.profile->>'department',
                             'position',    d.profile->>'position',
                             'source', 'merge', 'note', '중복 병합 흡수', 'at', now()))
                      else '[]'::jsonb
                    end,
               true)
        from public.%1$I d
       where p.id = $1 and d.id = $2
         and (
           coalesce(d.profile->'affiliation_history', '[]'::jsonb) <> '[]'::jsonb
           or (
             (coalesce(btrim(d.affiliation), '') is distinct from coalesce(btrim(p.affiliation), '')
              or coalesce(btrim(d.profile->>'department'), '') is distinct from coalesce(btrim(p.profile->>'department'), '')
              or coalesce(btrim(d.profile->>'position'), '') is distinct from coalesce(btrim(p.profile->>'position'), ''))
             and coalesce(btrim(d.affiliation), '') || coalesce(btrim(d.profile->>'department'), '') || coalesce(btrim(d.profile->>'position'), '') <> ''
           )
         )
    $m$, p_table) using p_primary_id, p_duplicate_id;
  end if;
end $$;

comment on function public.merge_entity(text, uuid, uuid, text) is
  '중복 병합: 중복 행에 merged_into_id 지정 + 양쪽에 기여 기록 + **참조를 정본으로 이관**(자료·코멘트·회의록 링크·참가자 명단·하드 FK 전부) + 소속 3축 흡수. 기여·감사·접근 로그와 부여 코드는 옮기지 않는다(그 행에 일어난 일이라 주인을 바꾸면 거짓 기록이 된다). GUEST 명부·게스트 계정 매핑이 겹치면 옮기지 않고 merge_conflict로 거절한다 — 지우는 일에는 저마다 제 경로가 있다.';

revoke all on function public.merge_entity(text, uuid, uuid, text) from public;
grant execute on function public.merge_entity(text, uuid, uuid, text) to authenticated;

grant execute on function app.merge_ref_tables(text) to authenticated;
grant execute on function app.merge_conflict_join(text[]) to authenticated;
grant execute on function app.merge_fk_columns(text) to authenticated;
