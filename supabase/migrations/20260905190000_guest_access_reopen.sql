-- =====================================================================
-- 차단 해제 — 닫은 문을 다시 연다 (2026-09-05)
--
-- 왜 필요한가:
--   차단(close_program_guest_access)에 짝이 없었다. 잘못 막았거나 사유가 풀린 대상을
--   되돌리는 유일한 길이 '로그인 열기'였는데, 그것은 **안내를 다시 보내는** 경로다 —
--   막은 적 있다는 사실을 굳이 알리지 않고 조용히 되돌리고 싶을 때 쓸 것이 없었다.
--
-- 무엇으로 되돌리는가 — **저장하지 않고 되묻는다**:
--   차단 직전 상태를 컬럼에 적어 두는 방법(blocked_from)을 쓰지 않는다. 그것은 사본이고,
--   사본은 어긋난다 — 차단해 둔 사이에 사업 기간이 지나면 적어 둔 '이용 중'은 이미 거짓이다.
--   원장은 이미 답을 갖고 있다: **`joined_at`이 있으면 이 사업에 들어와 본 것**(ACTIVE),
--   없으면 초대만 된 것(INVITED). 로그인 시점에 Edge Function이 찍는 값이라 신뢰할 수 있다.
--
--   그래서 세 경우가 한 규칙으로 정리된다:
--     * 초대 상태에서 막았다 → 해제하면 초대. 초대 레코드(유효기간 1년)가 그대로 살아 있어
--       받은 안내로 그냥 들어온다. 안내를 다시 보내지 않는다.
--     * 이용 중에 막았다 → 해제하면 이용 중. 차단 때 세션을 죽였으므로 다시 로그인해야 하고,
--       비밀번호는 본인 것 그대로다.
--     * 기간 만료 상태에서 막았다 → 해제해도 화면은 '기간 만료'다. **기간은 차단과 직교한
--       축**이고 사업이 갖는 값이라(3_9_1 §8), 여는 방법은 해제가 아니라 기간 연장이다.
--       여기서 login_status만 되돌리고 기간에 손대지 않는 것이 요점 — 해제가 기간까지
--       늘리면 담당자가 정한 종료일이 차단 한 번에 조용히 밀린다.
--
-- 세션 판(session_version)을 올리지 않는 이유:
--   차단 때 이미 올려 토큰을 죽였다. 해제는 새로 죽일 것이 없고, 올리면 그 계정이 참여 중인
--   **다른 사업의 살아 있는 세션**까지 끊는다(계정은 대상마다 하나다).
--
-- 함께 고치는 것 — 감사 액션 화이트리스트:
--   `app.log_guest_access`가 허용하는 액션이 OPEN·CLOSE·PASSWORD_RESET 셋뿐이라,
--   2026-09-05 오전에 들어온 접근 기간 RPC가 쓰는 'GUEST_ACCESS_WINDOW'는 **호출 순간
--   22023으로 죽었다**(기간 저장이 실제로는 한 번도 성공하지 못했다). 화이트리스트에 두
--   액션을 더한다. 목록을 없애지 않는 이유는 그것이 이 함수의 존재 이유이기 때문이다 —
--   actor를 호출자가 넘기지 못하게 막고, 남길 수 있는 액션을 열거해 둔 창구다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (명부 행마다 entity_key가 답한다)
--   - 데이터 등급: Internal (로그인 개방 상태)
--   - 접근 주체: 그 사업 담당자(PM·MEMBER) 전용 — 차단과 같은 기준이다
--   - Scope 기준: app.is_program_manager(program_id), 행마다 확인
--   - 신규 테이블/정책 없음. 신규 RPC 1종(reopen_program_guest_access)은 차단 RPC와 같은
--     이유로 SECURITY DEFINER다 — 명부의 UPDATE 정책에 기대면 담당자가 아닌 쓰기 권한자도
--     login_status를 직접 되돌릴 수 있고, 그러면 '담당자만'이 화면 장식이 된다.
--   - **차단된 행에만** 작용한다. NOT_ALLOWED(아직 열지 않은 행)를 건드리지 않는 것이
--     중요하다 — 건드리면 이 함수가 '문 열기'가 되어 안내 없이 문이 열린다.
--   - 감사 로그: 신규 액션 GUEST_ACCESS_REOPEN(payload에 되돌린 상태를 함께 남긴다).
--   - 운영 영향: 프론트(명부 선택 줄)가 같은 커밋에서 함께 바뀐다. Edge Function 무관.
-- 근거: docs/docs_planning/3_9_1_guest_unified_account.md §11.3
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 감사 액션 화이트리스트 확장
-- ---------------------------------------------------------------------
create or replace function app.log_guest_access(
  p_target_user_id uuid,
  p_action         text,
  p_after          text,
  p_data           jsonb,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if p_action not in (
    'GUEST_ACCESS_OPEN',
    'GUEST_ACCESS_CLOSE',
    'GUEST_ACCESS_REOPEN',
    'GUEST_ACCESS_WINDOW',
    'GUEST_PASSWORD_RESET'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, action, changed_workspace, after_permission, after_data, reason)
  values
    (app.current_app_user_id(), p_target_user_id, p_action, 'guest', p_after, p_data, p_reason);
end;
$fn$;

comment on function app.log_guest_access(uuid, text, text, jsonb, text) is
  '게스트 로그인 개방·차단·해제·기간·비밀번호 재설정 감사 기록. actor는 호출자가 넘기지 못하고 서버가 채운다. 액션 열거는 이 창구의 존재 이유이므로 새 액션이 생기면 여기에 함께 더한다 — 빠뜨리면 그 RPC는 호출 순간 22023으로 죽는다.';

-- ---------------------------------------------------------------------
-- (2) 차단 해제
-- ---------------------------------------------------------------------
create or replace function public.reopen_program_guest_access(
  p_participant_ids uuid[],
  p_reason          text default null
)
returns integer
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_uid    uuid := app.current_app_user_id();
  r        record;
  v_next   public.participant_login_status;
  v_count  integer := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return 0;
  end if;

  for r in
    select pp.id, pp.program_id, pp.user_id, pp.joined_at, pp.login_status
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 차단을 해제할 수 있습니다.' using errcode = '42501';
    end if;

    -- 차단된 행만 되돌린다. 아직 열지 않은 행(NOT_ALLOWED)까지 집으면 이 함수가
    -- 안내 없이 문을 여는 경로가 된다 — 문을 여는 일은 open_program_guest_access의 몫이다.
    if r.login_status <> 'BLOCKED' then
      continue;
    end if;

    -- 되돌릴 곳은 저장돼 있지 않고 원장이 답한다: 들어와 본 적이 있으면 이용 중, 없으면 초대.
    v_next := case
                when r.joined_at is not null then 'ACTIVE'::public.participant_login_status
                else 'INVITED'::public.participant_login_status
              end;

    update public.program_participants
       set login_status = v_next,
           updated_at   = now()
     where id = r.id;

    perform app.log_guest_access(
      r.user_id,
      'GUEST_ACCESS_REOPEN',
      'guest:login',
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id,
                         'restored_to', v_next),
      p_reason
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke all on function public.reopen_program_guest_access(uuid[], text) from public;
grant execute on function public.reopen_program_guest_access(uuid[], text) to authenticated;

comment on function public.reopen_program_guest_access(uuid[], text) is
  '차단된 명부 행의 게스트 로그인을 다시 연다(그 사업 담당자 전용). 되돌릴 상태는 저장하지 않고 원장에 되묻는다 — joined_at이 있으면 ACTIVE, 없으면 INVITED. 안내를 다시 보내지 않고(그건 open_program_guest_access의 일), 세션 판도 올리지 않는다(차단 때 이미 죽였고, 올리면 그 계정의 다른 사업 세션까지 끊긴다). 접근 기간에는 손대지 않는다 — 기간은 차단과 직교한 축이다. 근거: 3_9_1 §11.3';
