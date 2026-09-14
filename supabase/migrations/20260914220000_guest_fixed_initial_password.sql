-- =====================================================================
-- GUEST 고정 초기 비밀번호 — 개시값을 연락처에서 `ynarcher`로 옮긴다
--
-- 사용자 확정(2026-09-14): GUEST 계정의 **최초 비밀번호와 ADMIN 초기화 결과는 모두
-- 고정 문자열 `ynarcher`**다. 종전 정책(계정 생성 때 확정한 연락처 숫자만)을 이 결정이
-- 대체하며, 그에 따라 연락처는 자격증명이 아니게 되어 선택 칸이 되었다
-- (20260914210000_guest_account_affiliation.sql).
--
-- **저장 방식은 바뀌지 않는다.** 개시 상태의 표현은 여전히
-- `guest_credentials.password_hash IS NULL`이며, 그 상태에서만 개시값이 통한다.
-- 고정값의 해시를 미리 심지 않는 이유가 여기 있다 — 심으면 "본인이 정했는가"
-- (`app.guest_has_password`)가 개시 상태를 참으로 답하게 되고, 첫 로그인에서 반드시
-- 비밀번호를 정하게 하는 문(§6 — 개시값으로는 세션을 주지 않고 설정 티켓만 준다)이
-- 그 자리에서 열린다. 개시값을 아는 것은 로그인 함수 하나뿐이다
-- (`supabase/functions/_shared/password.ts`의 INITIAL_GUEST_PASSWORD).
--
-- 그래서 DB에서 실제로 바뀌는 것은 둘뿐이다.
--   · admin_reset_guest_password의 **연락처 전제 조건 철회**. 연락처가 개시값이던 시절에는
--     번호 없는 계정을 초기화하면 로그인할 수 없는 계정이 되었으므로 거부하는 것이 옳았다.
--     개시값이 고정된 지금 그 거부는 **초기화를 못 하게 막기만 한다.**
--   · 개시값이 무엇인지 말하는 주석·감사 기록의 표기.
--
-- 이미 본인이 정해 둔 비밀번호는 이 파일이 건드리지 않는다. 해시가 있는 계정은 그대로
-- 자기 비밀번호로 들어오며, 개시값은 그 계정에 통하지 않는다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md §2)
--   · 새 표·새 정책·새 인덱스·Storage 변경 없음. 새 SECURITY DEFINER 신설 없음
--     (기존 admin_reset_guest_password의 본문만 바꾼다 — 시그니처가 같아 ACL이 유지되지만
--     규칙상 아래에서 다시 명시한다).
--   · 데이터 등급: 개시값은 **비밀이 아니다.** 전 계정 공통이고 오프라인으로 전달되며,
--     그래서 그것만으로는 아무것도 열지 못한다 — 개시값으로 들어온 세션은 발급되지 않고
--     10분짜리 설정 티켓만 나간다(3_9_1 §6). 잔여 위험은 종전과 같은 자리에 남는다:
--     비밀번호를 정하기 전 계정의 **이메일**을 아는 제3자가 먼저 설정 티켓을 받을 수 있다.
--     종전에는 이메일 + 연락처 둘을 알아야 했으므로 **이 결정으로 그 조건이 하나 줄었다.**
--     사용자가 운영 정책으로 확정한 사항이며, 완화(계정 개시 구간의 자격증명 오프라인 취급,
--     계정 단위 잠금, 세션 미발급)는 그대로 유지된다. 기록은 SECURITY_REVIEW.md `F-0`이 진다.
--   · 감사: 초기화는 종전대로 GUEST_PASSWORD_RESET을 변경 전/후와 함께 남긴다. after의
--     `initial_password` 값만 'users.phone'에서 'fixed'로 바뀐다 — 감사 로그에 개시값
--     문자열 자체를 적지 않는다(값이 아니라 **정책 이름**을 남긴다).
--   · 되돌리기: 이 파일은 데이터를 옮기지 않는다. 함수 정의를 이전 것으로 되돌리면
--     종전 동작으로 복귀하며, 그때는 Edge의 개시값 판정도 함께 되돌려야 한다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- (1) 개시 상태가 무엇인지 말하는 주석
--
--     값이 아니라 **어디에 적혀 있는지**를 가리킨다. 문자열을 DB 주석에 박아 두면
--     Edge 상수와 두 곳이 되고, 한쪽만 바뀐 날 어느 쪽이 정본인지 답할 수 없다.
-- ---------------------------------------------------------------------
comment on column public.guest_credentials.password_hash is
  'null이면 개시 상태. 이때만 고정 초기 비밀번호가 통하며(값은 Edge의 INITIAL_GUEST_PASSWORD 하나가 소유한다), 그 로그인은 세션이 아니라 비밀번호 설정 티켓만 받는다. 한 번 정하고 나면 새 사업에 추가되어도 개시값은 통하지 않는다.';

comment on column public.users.phone is
  '연락처. 2026-09-14부터 GUEST 계정에서도 **자격증명이 아니다**(초기 비밀번호는 고정값으로 옮겨졌다) — 선택 칸이며 유일성도 요구하지 않는다. 개인정보이므로 목록·상세 마스킹은 앱 계층과 guest_accounts_list가 강제한다.';

-- ---------------------------------------------------------------------
-- (2) admin_reset_guest_password — 연락처 전제 조건 철회
--
--     본문의 나머지는 20260913130000 그대로다: 해시·설정시각·재설정 토큰·잠금을 한 번에
--     비우고 session_version을 올려 세션과 단명 티켓을 죽인다. is_active는 유지한다.
-- ---------------------------------------------------------------------
create or replace function public.admin_reset_guest_password(
  p_user_id uuid,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account      public.users%rowtype;
  v_reason       text := nullif(btrim(coalesce(p_reason, '')), '');
  v_had_password boolean;
  v_version      integer;
begin
  if not app.is_admin() then
    raise exception 'GUEST 비밀번호는 시스템 관리자만 초기화할 수 있습니다.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception '초기화 사유를 입력해야 합니다.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id and u.deleted_at is null
   for update;
  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not app.is_guest_user_type(v_account.user_type) then
    raise exception 'GUEST 계정이 아닙니다.' using errcode = '22023';
  end if;

  -- 연락처를 보지 않는다(2026-09-14). 개시값이 연락처였을 때는 번호 없는 계정을
  -- 초기화하면 로그인할 수 없는 계정이 되었지만, 고정값이 된 지금 그 확인은 초기화를
  -- 막기만 한다 — 연락처가 없는 계정도 초기화한 뒤 정상적으로 개시할 수 있다.

  v_had_password := app.guest_has_password(p_user_id);

  -- 해시·설정시각·재설정 토큰·잠금을 한 번에 비운다. 살아 있던 재설정 링크도 여기서
  -- 죽는다 — 초기화 뒤에 옛 링크가 통하면 그 링크가 계정을 다시 가져간다.
  insert into public.guest_credentials (
    user_id, password_hash, password_set_at,
    login_attempts, locked_until, reset_token_hash, reset_expires_at,
    reset_session_version
  ) values (p_user_id, null, null, 0, null, null, null, null)
  on conflict (user_id) do update
    set password_hash    = null,
        password_set_at  = null,
        login_attempts   = 0,
        locked_until     = null,
        reset_token_hash = null,
        reset_expires_at = null,
        reset_session_version = null;

  -- 발급된 세션과 단명 티켓(설정·선택)을 죽인다. is_active는 유지한다 — 초기화는
  -- 정지도 해제도 아니다.
  update public.users
     set session_version = session_version + 1,
         updated_at = now()
   where id = p_user_id
  returning session_version into v_version;

  perform app.log_guest_change(
    p_user_id,
    'GUEST_PASSWORD_RESET',
    'guest:credentials',
    jsonb_build_object('has_password', v_had_password),
    -- 개시값 문자열 자체는 남기지 않는다. 남기는 것은 **어떤 정책으로 되돌렸는가**다.
    jsonb_build_object('has_password', false, 'initial_password', 'fixed'),
    v_reason
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'had_password', v_had_password,
    'session_version', v_version,
    'sessions_invalidated', true
  );
end;
$fn$;

revoke all on function public.admin_reset_guest_password(uuid, text)
  from public, anon, service_role;
grant execute on function public.admin_reset_guest_password(uuid, text)
  to authenticated;

comment on function public.admin_reset_guest_password(uuid, text) is
  'ADMIN 전용 GUEST 비밀번호 초기화. 해시·설정시각·재설정 토큰·잠금을 비워 계정을 개시 상태로 되돌리고 session_version을 올린다(is_active 유지). 그 뒤의 로그인은 고정 초기 비밀번호로 들어와 개인 비밀번호를 정한 뒤에만 세션을 받는다(2026-09-14 — 연락처 전제 조건 없음). 값은 한 칸도 호출자에게 돌려주지 않는다. 근거: 3_9_1 §6.2';

commit;
