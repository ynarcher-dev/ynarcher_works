-- =====================================================================
-- 소속 이력(affiliation history) — 동일인의 소속·부서·직책 변형을 원장 트리거가 보존
--
-- 왜 필요한가
--   대량 업로드·수정·병합에서 동일인으로 확인된 뒤에도 '소속·부서·직책'이 다르면, 지금은
--   그 다른 값이 통째로 버려진다(업로드 보강은 빈 칸만 채우고, 수정은 덮어쓴다). 사람이
--   회사를 옮기거나 직급이 바뀐 사실은 남아야 하는 정보다 — 현재값(화면 부제)은 최신으로
--   두되(신규를 현재로 승격), 직전 조합은 이력으로 보존한다.
--
-- 설계 — 이력의 소유자는 원장 BEFORE UPDATE 트리거
--   CLAUDE.md의 '변동 이력은 화면이 아니라 원장 트리거가 남긴다' 원칙을 그대로 따른다.
--   세 경로(업로드 보강 upload_enrich_entity · 수정 update_entity · 병합 merge_entity)가
--   모두 원장 UPDATE를 거치므로, 트리거 하나가 세 경로를 한 번에 덮는다. 클라이언트마다
--   중복 구현하면 반드시 어긋난다.
--
--   이력 배열(profile.affiliation_history)의 소유권도 트리거가 가진다. 화면은 profile을
--   통째로 새로 만들어 저장할 수 있어(NetworkForm), 그때 배열이 떨어져 나가면 이력이 유실된다.
--   그래서 트리거는 '들어온 배열이 OLD보다 짧으면(=떨궜으면) OLD를 복원'한다. 정상 경로는
--   기존 배열을 그대로(또는 병합 흡수로 더 길게) 실어 오므로 그대로 신뢰한다.
--
-- 소유 워크스페이스: networks · 데이터 등급: Internal · 접근 주체: 내부 사용자(임직원)
-- Scope: 워크스페이스(networks 쓰기 — 각 원장 기존 RLS가 그대로 판정)
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260721160000(기록 트리거·컨텍스트 규약·카탈로그 판정), 20260707120000(통일 profile 스키마)
--
-- 보안 게이트 체크리스트
--   - 새 테이블/RLS 없음: 이력은 기존 profile(jsonb) 안에 저장 — 각 원장 RLS를 그대로 상속한다.
--   - 함수는 SECURITY INVOKER(정의자 권한 상승 없음), search_path 고정, NEW 행만 수정.
--   - merge_entity는 종전대로 SECURITY INVOKER — 쓰기 권한은 각 원장 RLS가 판정(정책 복제 없음).
--   - GRANT 변경 없음(merge_entity는 재정의만, 기존 grant 유지).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 원장이 소속 3축 컬럼(affiliation + profile)을 갖는가 — 카탈로그 판정
--     사업(programs 등) 원장은 인물 소속 개념이 없어 트리거를 붙이지 않는다.
-- ---------------------------------------------------------------------
create or replace function app.entity_has_affiliation(p_table text)
returns boolean
language sql
stable
set search_path = app, public
as $$
  select exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = p_table and column_name = 'affiliation'
         )
     and exists (
           select 1 from information_schema.columns
            where table_schema = 'public' and table_name = p_table and column_name = 'profile'
         );
$$;

grant execute on function app.entity_has_affiliation(text) to authenticated;

comment on function app.entity_has_affiliation(text) is
  '해당 원장이 소속 3축(affiliation 컬럼 + profile jsonb)을 갖는가. 소속 이력 트리거 부착과 병합 흡수의 대상 판정 단일 원천.';

-- ---------------------------------------------------------------------
-- (2) 소속 이력 트리거 — 직전 3축 조합을 profile.affiliation_history에 보존
-- ---------------------------------------------------------------------
create or replace function app.track_affiliation_history()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_ctx      jsonb := coalesce(nullif(current_setting('app.contribution_ctx', true), '')::jsonb, '{}'::jsonb);
  -- 3축의 '내용 비교'용 정규화 스냅샷(공백 트림·빈값 제거). 표시는 원값을 쓰되 비교만 정규화한다.
  v_old3     jsonb := jsonb_strip_nulls(jsonb_build_object(
                        'affiliation', nullif(btrim(coalesce(OLD.affiliation, '')), ''),
                        'department',  nullif(btrim(coalesce(OLD.profile->>'department', '')), ''),
                        'position',    nullif(btrim(coalesce(OLD.profile->>'position', '')), '')));
  v_new3     jsonb := jsonb_strip_nulls(jsonb_build_object(
                        'affiliation', nullif(btrim(coalesce(NEW.affiliation, '')), ''),
                        'department',  nullif(btrim(coalesce(NEW.profile->>'department', '')), ''),
                        'position',    nullif(btrim(coalesce(NEW.profile->>'position', '')), '')));
  v_old_hist jsonb := coalesce(OLD.profile->'affiliation_history', '[]'::jsonb);
  v_new_hist jsonb := coalesce(NEW.profile->'affiliation_history', '[]'::jsonb);
  v_hist     jsonb;
begin
  -- 이력 배열의 소유자는 트리거다. 정상 저장은 기존 배열을 그대로(또는 병합 흡수로 더 길게)
  -- 실어 오지만, profile을 통째로 새로 만들어 배열을 떨군 저장은 OLD보다 짧다 — 그때 OLD를 복원한다.
  if jsonb_array_length(v_new_hist) >= jsonb_array_length(v_old_hist) then
    v_hist := v_new_hist;
  else
    v_hist := v_old_hist;
  end if;

  -- 3축이 실제로 바뀌었고 직전 값이 비어있지 않으면, 직전 조합을 이력으로 덧붙인다(append-only).
  if v_old3 <> '{}'::jsonb and v_old3 is distinct from v_new3 then
    v_hist := v_hist || jsonb_build_object(
      'affiliation', OLD.affiliation,
      'department',  OLD.profile->>'department',
      'position',    OLD.profile->>'position',
      'source',      coalesce(v_ctx->>'source', 'manual'),
      'note',        v_ctx->>'note',
      'at',          now()
    );
  end if;

  -- 빈 이력이면 키를 만들지 않는다(profile 오염 방지).
  if v_hist <> '[]'::jsonb then
    NEW.profile := jsonb_set(coalesce(NEW.profile, '{}'::jsonb), '{affiliation_history}', v_hist, true);
  end if;

  return NEW;
end $$;

comment on function app.track_affiliation_history() is
  '소속 이력 트리거(BEFORE UPDATE). 소속·부서·직책이 바뀌면 직전 조합을 profile.affiliation_history에 보존한다(신규를 현재로 승격·기존을 이력으로). 배열의 소유자로서 클라이언트의 profile 통째 교체로 이력이 유실되는 것도 막는다.';

-- ---------------------------------------------------------------------
-- (3) NETWORKS 원장에 트리거 부착 — 소속 3축을 가진 원장만
--     기록(contribution) 트리거와 같은 원장 집합을 순회하되, 컬럼 유무로 한 번 더 거른다.
-- ---------------------------------------------------------------------
do $$
declare
  v_tables text[] := array[
    'experts', 'van', 'exp', 'investors', 'corporates',
    'institutions', 'universities', 'vendors', 'etc', 'others', 'partners',
    -- 글로벌 네트워크(독립 단일 마스터)도 소속·부서·직책이 부제를 이루므로 동일하게 이력을 남긴다.
    'global_networks'
  ];
  t text;
begin
  foreach t in array v_tables
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    if not app.entity_has_affiliation(t) then
      continue;
    end if;
    execute format('drop trigger if exists %I on public.%I;', 'trg_' || t || '_affiliation_history', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function app.track_affiliation_history();',
      'trg_' || t || '_affiliation_history', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (4) 중복 병합 — 중복 쪽 소속 3축(및 그 이력)을 정본 이력으로 흡수
--     본문은 20260721160000과 동일하고, 소속 흡수 블록만 끝에 덧붙인다.
--     정본의 현재 3축은 그대로 두고 이력 배열만 키우므로 (3)의 트리거가 직전 3축을
--     또 보존하는 이중 기록이 발생하지 않는다. 흡수할 것이 없으면 UPDATE가 0행이라 조용하다.
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

  -- 소속 흡수: 중복 쪽 소속·부서·직책(및 그 이력)을 정본의 소속 이력으로 흡수한다.
  -- 정본의 현재 3축은 손대지 않는다(누가 정본인지는 사용자가 정했다). 흡수할 내용이 있을 때만
  -- 1행이 갱신돼 기록 트리거가 '병합 이력 흡수'로 남긴다.
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
  '중복 병합: 중복 행에 merged_into_id 지정 + 정본에 흡수 기록 + 중복 쪽 소속 3축을 정본 소속 이력으로 흡수. 병합된 중복은 목록에서 사라져 이력을 열 수 없으므로 정본 쪽 기록이 실질적으로 읽히는 기록이다.';

revoke all on function public.merge_entity(text, uuid, uuid, text) from public;
grant execute on function public.merge_entity(text, uuid, uuid, text) to authenticated;
