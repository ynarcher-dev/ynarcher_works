-- =====================================================================
-- 기여 로그를 DB 트리거로 이관 (2단계-B) — NETWORKS 원장 전체
--
-- 왜 한 번에 가야 하는가
--   트리거를 붙이는 순간, 아직 손으로 기록하는 경로는 전부 두 줄씩 남는다. 그래서 이
--   슬라이스는 쪼갤 수 없다 — 트리거와 함께 이관·병합·대량 업로드까지 같은 마이그레이션에서
--   RPC로 옮긴다. 앞선 두 슬라이스(사업 3종 20260721140000, startups·global 20260721150000)를
--   먼저 끝낸 것도 이 덩어리를 최대한 작게 만들기 위해서였다.
--
-- 손으로 기록하던 시절의 실제 결함(전수 조사 결과)
--   - 누락: EntityFormModal 수정, useReassignCategory(미분류 일괄 이관), ImporterModal 경로에
--     기록 호출이 없어 변경이 통째로 이력에서 빠졌다.
--   - 중복: 구분 변경은 NetworkForm과 useMoveEntity 양쪽이 각각 'created'를 남겨 두 줄이 됐다.
--   - 비원자성: 이관은 '대상 insert → 원본 soft-delete'가 별개 요청이라, 뒤가 실패하면
--     클라이언트가 방금 만든 행을 물리 삭제해 되돌리는 보상 로직에 기대고 있었다.
--     RPC 한 트랜잭션으로 옮기면 보상 삭제 자체가 필요 없어진다(물리 삭제 금지 규약에도 부합).
--
-- 설계 — 컨텍스트를 실은 INVOKER RPC + DEFINER 기록 트리거
--   원장을 바꾸는 일은 전부 SECURITY INVOKER RPC가 한다. 따라서 쓰기 권한은 이 함수들이
--   판정하지 않고 각 원장의 기존 RLS가 그대로 판정한다(정책 복제 없음 = 드리프트 없음).
--   RPC는 사유·배치 같은 '트리거가 알 수 없는 정보'만 트랜잭션 GUC(app.contribution_ctx)에
--   실어 주고, 기록은 20260721150000에서 만든 app.log_entity_contribution()이 담당한다.
--
-- 병합 기록의 방향을 바로잡는다
--   종전에는 정본(primary)에만 "중복 'X' 병합"을 남겼다. 트리거는 실제로 바뀌는 행(중복)에서
--   돌므로 그대로 두면 기록이 반대편에 남는다. 그런데 중복 행은 병합 후 목록에서 사라져
--   이력을 열어 볼 수 없다 — 정본 쪽 기록이 실질적으로 유일하게 읽히는 기록이다.
--   그래서 RPC가 양쪽에 남긴다. 중복에는 '어디로 흡수됐는지'(트리거), 정본에는
--   '무엇을 흡수했는지'(명시 기록). 감사에도 열람에도 구멍이 없다.
--
-- 소유 워크스페이스: networks · 데이터 등급: Internal · 접근 주체: 내부 사용자(임직원)
-- Scope: 워크스페이스(networks 쓰기)
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260721150000(기록 트리거·컨텍스트 규약), 20260707150000(로그 원장·행위자 스탬프)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 원장 판정 — 카탈로그에서 직접 읽는다
--     RPC의 허용 목록을 손으로 나열하면 트리거를 붙인 원장 집합과 언젠가 반드시 어긋난다.
--     어긋나는 방향이 나쁘다 — 트리거 없는 원장이 목록에 들어가면 사유는 사라지고 로그도
--     남지 않는 조용한 유실이 된다. 그래서 '기록 트리거가 실제로 붙어 있는가'를 판정 기준으로 삼는다.
-- ---------------------------------------------------------------------
create or replace function app.has_contribution_trigger(p_key text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
    select 1
      from pg_trigger t
      join pg_class     c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc      p on p.oid = t.tgfoid
     where n.nspname = 'public'
       and c.relname = p_key
       and p.proname = 'log_entity_contribution'
       and not t.tgisinternal
  );
$$;

grant execute on function app.has_contribution_trigger(text) to authenticated;

comment on function app.has_contribution_trigger(text) is
  '해당 원장에 변동 이력 기록 트리거가 붙어 있는가. RPC 허용 목록의 단일 원천 — 손으로 나열한 목록이 트리거 집합과 어긋나는 것을 구조적으로 막는다.';

-- ---------------------------------------------------------------------
-- (1-b) 기록 트리거를 컬럼 구성에 둔감하게 고쳐 둔다
--     20260721150000의 정의는 OLD.deleted_at을 직접 참조한다. 원장이 둘일 때는 문제가 없었지만
--     이제 11종에 붙으므로, 어느 하나가 deleted_at을 갖지 않으면 그 원장의 모든 쓰기가
--     런타임 오류로 막힌다. 판정을 jsonb 경유로 바꿔 컬럼이 없으면 그냥 해당 분기를 타지 않게 한다
--     (merged_into_id는 이미 같은 이유로 jsonb 경유였다). 나머지 동작은 동일하다.
-- ---------------------------------------------------------------------
create or replace function app.log_entity_contribution()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_key    text := TG_ARGV[0];
  v_raw    text := current_setting('app.contribution_ctx', true);
  v_ctx    jsonb := coalesce(nullif(v_raw, '')::jsonb, '{}'::jsonb);
  v_old    jsonb;
  v_new    jsonb := to_jsonb(NEW);
  v_action text;
begin
  if TG_OP = 'INSERT' then
    v_action := 'created';
  else
    v_old := to_jsonb(OLD);

    -- 소프트 삭제 전환. 사유는 컨텍스트로만 들어온다(원장에 사유 컬럼이 없다).
    if v_old->>'deleted_at' is null and v_new->>'deleted_at' is not null then
      v_action := 'deactivated';

    -- 병합 지정.
    elsif (v_new ? 'merged_into_id')
      and v_old->>'merged_into_id' is null
      and v_new->>'merged_into_id' is not null then
      v_action := 'merged';

    -- updated_at은 BEFORE UPDATE 트리거가 매번 갱신하므로 비교에서 뺀다.
    -- 빼지 않으면 '아무것도 바뀌지 않은 저장'까지 전부 편집으로 쌓인다.
    elsif (v_old - 'updated_at') is distinct from (v_new - 'updated_at') then
      v_action := 'edited';

    else
      return NEW;
    end if;
  end if;

  insert into public.entity_contributions (entity_table, entity_id, action, source, batch_id, note)
  values (
    v_key,
    NEW.id,
    coalesce(v_ctx->>'action', v_action),
    coalesce(v_ctx->>'source', 'manual'),
    nullif(v_ctx->>'batch_id', '')::uuid,
    nullif(v_ctx->>'note', '')
  );

  return NEW;
end $$;

-- ---------------------------------------------------------------------
-- (2) NETWORKS 원장에 기록 트리거 부착
--     은퇴했거나(vendors) 하위호환으로만 남은(partners) 원장도 포함한다 — 화면에서 내렸을 뿐
--     테이블과 데이터는 살아 있고, 어떤 경로로든 바뀐다면 그 사실은 남아야 한다.
--     존재하지 않는 테이블은 건너뛴다(환경별 편차 방어).
-- ---------------------------------------------------------------------
do $$
declare
  v_tables text[] := array[
    'experts', 'van', 'exp', 'investors', 'corporates',
    'institutions', 'universities', 'vendors', 'etc', 'others', 'partners'
  ];
  t text;
begin
  foreach t in array v_tables
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice '건너뜀(테이블 없음): %', t;
      continue;
    end if;
    execute format('drop trigger if exists %I on public.%I;', 'trg_' || t || '_contribution', t);
    execute format(
      'create trigger %I after insert or update on public.%I
         for each row execute function app.log_entity_contribution(%L);',
      'trg_' || t || '_contribution', t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (3) 비활성화 RPC의 허용 목록을 카탈로그 판정으로 교체
--     본문은 20260721150000과 동일하고 화이트리스트 조건만 바뀐다.
-- ---------------------------------------------------------------------
create or replace function public.deactivate_entity(
  p_entity_key text,
  p_id         uuid,
  p_reason     text
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_rows integer;
begin
  if not app.has_contribution_trigger(p_entity_key) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  perform set_config('app.contribution_ctx',
                     jsonb_build_object('note', btrim(p_reason))::text,
                     true);

  execute format(
    'update public.%I set deleted_at = now() where id = $1 and deleted_at is null',
    p_entity_key
  ) using p_id;
  get diagnostics v_rows = row_count;

  -- 0행이면 대상이 없거나 RLS가 막은 것이다. 둘을 구분해 알려주지 않는다.
  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- (4) jsonb → 원장 INSERT 공용부
--     jsonb_populate_record를 그대로 쓰면 빠진 컬럼이 NULL로 채워져 기본값(id·created_at·
--     created_by 등)을 덮어쓴다. 그래서 '넘어온 키'만 컬럼 목록으로 세워 insert한다.
--     대상은 기록 트리거가 붙은 원장으로 한정하고, 행 자체는 INVOKER로 쓰므로 RLS가 판정한다.
-- ---------------------------------------------------------------------
create or replace function app.insert_entity_row(p_table text, p_values jsonb)
returns uuid
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_cols text;
  v_id   uuid;
begin
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'empty_values' using errcode = '22023';
  end if;

  select string_agg(format('%I', k), ', ' order by k)
    into v_cols
    from jsonb_object_keys(p_values) as k;

  execute format(
    'insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) returning id',
    p_table, v_cols, v_cols, p_table
  ) using p_values into v_id;

  return v_id;
end $$;

grant execute on function app.insert_entity_row(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- (5) 구분 이관 — 대상 등록 + 원본 비활성화를 한 트랜잭션으로
--     수동 이관(구분 변경·미분류 일괄 지정)과 업로드 재분류가 같은 함수를 쓴다.
--     실패하면 통째로 롤백되므로, 클라이언트가 방금 만든 행을 물리 삭제해 되돌리던
--     보상 로직이 사라진다.
-- ---------------------------------------------------------------------
create or replace function public.reassign_entity(
  p_from          text,
  p_to            text,
  p_id            uuid,
  p_values        jsonb,
  p_source        text default 'manual',
  p_batch_id      uuid default null,
  p_target_action text default null,   -- 업로드 재분류는 'merged'로 남긴다
  p_note_target   text default null,
  p_note_source   text default null
)
returns uuid
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_new_id uuid;
  v_rows   integer;
begin
  if not app.has_contribution_trigger(p_from) or not app.has_contribution_trigger(p_to) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_from = p_to then
    raise exception 'same_entity' using errcode = '22023';
  end if;
  if p_source not in ('manual', 'upload') then
    raise exception 'invalid_source' using errcode = '22023';
  end if;

  -- 대상 등록. 컨텍스트는 문장 단위로 갈아 끼운다(AFTER 트리거는 각 문장 끝에 돈다).
  perform set_config('app.contribution_ctx',
                     jsonb_build_object(
                       'source', p_source,
                       'batch_id', p_batch_id,
                       'action', p_target_action,
                       'note', p_note_target
                     )::text,
                     true);
  v_new_id := app.insert_entity_row(p_to, p_values);

  -- 원본 비활성화. 이관은 '옮긴 것'이므로 사유를 남겨 단순 폐기와 구분한다.
  perform set_config('app.contribution_ctx',
                     jsonb_build_object(
                       'source', p_source,
                       'batch_id', p_batch_id,
                       'note', coalesce(p_note_source, '구분 변경 이관')
                     )::text,
                     true);
  execute format(
    'update public.%I set deleted_at = now() where id = $1 and deleted_at is null',
    p_from
  ) using p_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;

  return v_new_id;
end $$;

comment on function public.reassign_entity(text, text, uuid, jsonb, text, uuid, text, text, text) is
  '구분 이관: 대상 원장 등록 + 원본 비활성화를 한 트랜잭션으로. 수동 이관과 업로드 재분류 공용. SECURITY INVOKER — 쓰기 권한은 각 원장 RLS가 판정한다.';

revoke all on function public.reassign_entity(text, text, uuid, jsonb, text, uuid, text, text, text) from public;
grant execute on function public.reassign_entity(text, text, uuid, jsonb, text, uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- (6) 중복 병합 — 양쪽에 기록
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
begin
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_primary_id = p_duplicate_id then
    raise exception 'same_record' using errcode = '22023';
  end if;

  -- 중복 행: 어디로 흡수됐는지(트리거가 'merged'로 기록).
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

  -- 정본 행: 무엇을 흡수했는지. 정본은 값이 바뀌지 않으므로 트리거가 볼 것이 없다 —
  -- 원장 변경이 아니라 순수 기록이라 여기서 직접 남긴다(행위자는 스탬프 트리거가 채운다).
  insert into public.entity_contributions (entity_table, entity_id, action, source, note)
  values (p_table, p_primary_id, 'merged', 'manual', coalesce(nullif(btrim(p_note), ''), '중복 병합'));
end $$;

comment on function public.merge_entity(text, uuid, uuid, text) is
  '중복 병합: 중복 행에 merged_into_id 지정 + 정본에 흡수 기록. 병합된 중복은 목록에서 사라져 이력을 열 수 없으므로 정본 쪽 기록이 실질적으로 읽히는 기록이다.';

revoke all on function public.merge_entity(text, uuid, uuid, text) from public;
grant execute on function public.merge_entity(text, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (7) 대량 업로드 — 신규 등록
--     행 배열을 받아 배치 컨텍스트를 건 채로 등록하고 생성된 id를 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.upload_insert_entities(
  p_table    text,
  p_rows     jsonb,
  p_batch_id uuid default null
)
returns uuid[]
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_row jsonb;
  v_ids uuid[] := '{}';
begin
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_required' using errcode = '22023';
  end if;

  perform set_config('app.contribution_ctx',
                     jsonb_build_object('source', 'upload', 'batch_id', p_batch_id)::text,
                     true);

  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    v_ids := v_ids || app.insert_entity_row(p_table, v_row);
  end loop;

  return v_ids;
end $$;

comment on function public.upload_insert_entities(text, jsonb, uuid) is
  '대량 업로드 신규 등록: 배치 컨텍스트(source=upload, batch_id)를 건 채로 행들을 등록한다. 원장 등록과 이력이 한 트랜잭션이라 부분 성공이 남지 않는다.';

revoke all on function public.upload_insert_entities(text, jsonb, uuid) from public;
grant execute on function public.upload_insert_entities(text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (8) 대량 업로드 — 제자리 보강/재활성화
--     보강할 값이 없는 '재유입'(같은 행이 다시 올라왔을 뿐 바꿀 것이 없음)은 원장이
--     바뀌지 않으므로 트리거가 볼 것이 없다. 이건 원장 변경이 아니라 순수 기록이라
--     직접 남긴다 — 종전 화면도 같은 판단으로 '업로드 재유입'을 남기고 있었다.
-- ---------------------------------------------------------------------
create or replace function public.upload_enrich_entity(
  p_table    text,
  p_id       uuid,
  p_values   jsonb,
  p_batch_id uuid default null,
  p_note     text default null
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_cols text;
  v_set  text;
  v_rows integer;
begin
  if not app.has_contribution_trigger(p_table) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;

  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    -- 바꿀 값이 없는 재유입: 기록만 남긴다.
    insert into public.entity_contributions (entity_table, entity_id, action, source, batch_id, note)
    values (p_table, p_id, 'enriched', 'upload', p_batch_id, nullif(btrim(coalesce(p_note, '')), ''));
    return;
  end if;

  perform set_config('app.contribution_ctx',
                     jsonb_build_object(
                       'source', 'upload',
                       'batch_id', p_batch_id,
                       'action', 'enriched',
                       'note', p_note
                     )::text,
                     true);

  select string_agg(format('%I', k), ', ' order by k),
         string_agg(format('%I = r.%I', k, k), ', ' order by k)
    into v_cols, v_set
    from jsonb_object_keys(p_values) as k;

  execute format(
    'update public.%I t set %s from (select %s from jsonb_populate_record(null::public.%I, $1)) r where t.id = $2',
    p_table, v_set, v_cols, p_table
  ) using p_values, p_id;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
end $$;

comment on function public.upload_enrich_entity(text, uuid, jsonb, uuid, text) is
  '대량 업로드 제자리 보강/재활성화. 보강할 값이 없는 재유입은 원장 변경이 아니므로 기록만 남긴다.';

revoke all on function public.upload_enrich_entity(text, uuid, jsonb, uuid, text) from public;
grant execute on function public.upload_enrich_entity(text, uuid, jsonb, uuid, text) to authenticated;
