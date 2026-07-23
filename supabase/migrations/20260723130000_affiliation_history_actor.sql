-- =====================================================================
-- 소속 이력에 '갱신한 사람'(actor) 스탬프 추가
--
-- 왜 필요한가
--   소속 이력(profile.affiliation_history) 한 항목은 '직전 조합 + 출처 + 사유 + 시각'만
--   남기고 누가 그 변경을 만들었는지는 담지 않았다. 이력을 읽는 사람은 "언제·무엇이 바뀌었나"는
--   알 수 있어도 "누가 바꿨나"를 알 수 없었다. 변동 이력(entity_contributions)에는 행위자가
--   찍히지만, 소속 이력은 별도 배열이라 그 자리에 함께 보여야 한 줄로 읽힌다.
--
-- 설계 — 소유자는 그대로 원장 트리거
--   이력 배열의 소유자는 여전히 app.track_affiliation_history()다(20260722140000). 이 함수만
--   고쳐 append하는 항목에 'by'(행위자명 스냅샷)를 더한다. 세 경로(업로드 보강·수정·병합)가 모두
--   원장 UPDATE를 거치므로 트리거 하나로 전부 덮인다. 클라이언트는 손대지 않는다.
--
--   행위자명은 표시 전용 스냅샷이다 — 당시 표기를 보존하며 이후 개명은 소급하지 않는다
--   (entity_contributions.user_name과 같은 규약). 함수는 SECURITY INVOKER 그대로이고, 읽는
--   대상은 '현재 세션 사용자 본인'의 이름뿐이라 users_select 정책(본인/내부 임직원 조회 허용,
--   20260708140000)에 걸리지 않는다 — 권한 상승 없이 읽힌다.
--
--   기존 항목(마이그레이션 이전 생성분)에는 'by'가 없다. 백필하지 않는다 — 당시 행위자를
--   사후에 확정할 근거가 없고(소속 이력 항목과 기여 로그를 시각으로만 잇는 근사는 오귀속 위험),
--   화면은 'by'가 없으면 사람 표기를 생략한다.
--
-- 소유 워크스페이스: networks · 데이터 등급: Internal · 접근 주체: 내부 사용자(임직원)
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260722140000(소속 이력 트리거 원본), 20260721120000(행위자명 스냅샷 규약)
--
-- 보안 게이트 체크리스트
--   - 새 테이블/RLS/RPC/Storage 정책 없음: 기존 INVOKER 트리거 함수 1개만 재정의.
--   - SECURITY INVOKER 유지(정의자 권한 상승 없음), search_path 고정, NEW 행만 수정.
--   - 읽는 데이터는 '본인' 이름뿐 — users RLS를 우회하지 않고 그대로 통과한다.
--   - GRANT 변경 없음.
-- =====================================================================

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
  -- 행위자명 스냅샷(현재 세션 사용자 본인). 표시 전용 — 이후 개명은 소급하지 않는다.
  v_actor    text;
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
    -- 본인 이름만 조회하므로 users_select(본인/내부 조회 허용)를 그대로 통과한다.
    select u.name into v_actor from public.users u where u.id = app.current_app_user_id();
    v_hist := v_hist || jsonb_build_object(
      'affiliation', OLD.affiliation,
      'department',  OLD.profile->>'department',
      'position',    OLD.profile->>'position',
      'by',          v_actor,
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
  '소속 이력 트리거(BEFORE UPDATE). 소속·부서·직책이 바뀌면 직전 조합을 profile.affiliation_history에 보존하며, 그 항목에 갱신한 사람(by, 표시용 이름 스냅샷)을 함께 남긴다. 배열의 소유자로서 클라이언트의 profile 통째 교체로 이력이 유실되는 것도 막는다.';
