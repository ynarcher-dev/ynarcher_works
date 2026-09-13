-- =====================================================================
-- ADMIN — GUEST 연락처 수정과 비밀번호 초기화
--
-- 두 창구를 ADMIN에게만 연다.
--   · admin_update_guest_contact  : 로그인 아이디(이메일)와 연락처(전화)를 계정에서 고친다.
--   · admin_reset_guest_password  : 개인 비밀번호를 지워 계정을 **개시 상태**로 되돌린다.
--     그 뒤의 로그인은 현재 연락처로 들어와 **개인 비밀번호를 정한 뒤에야** 세션을 받는다.
--
-- 사용자 확정(2026-09-13): 전화번호 기반 ADMIN 초기화를 운영 창구로 둔다. 종전의
-- "담당자 초기화를 두지 않는다(재설정 링크만)"는 판단을 이 결정이 대체한다. 링크 경로
-- (guest-password-reset)는 그대로 남아 있고, 이 함수는 링크가 닿지 않는 계정을 위한
-- ADMIN 전용 경로다. 정본은 3_9_1 §6.2.
--
-- 보안 게이트(11_migration_security_gate.md):
--   · 새 테이블·새 정책·Storage 변경 없음. 새 함수 3종 모두 SECURITY DEFINER이며
--     search_path를 비우고(`set search_path = ''`) 함수 첫 줄에서 app.is_admin()을 재검증한다.
--   · 실행권한은 public·anon·service_role에서 회수하고 공개 RPC 둘만 authenticated에 연다.
--     감사 헬퍼(app.log_guest_change)는 어떤 앱 롤에도 열지 않는다 — DEFINER 함수 안에서만 불린다.
--   · guest_credentials는 정책 없는 Secret 원장이다. 이 함수는 그 표에 **null만 쓰고
--     한 칸도 읽어 돌려주지 않는다.** 해시·잠금 값은 여전히 어느 롤에도 나가지 않는다.
--   · 개인정보(이메일·전화) 변경과 비밀번호 초기화는 audit_logs에 **변경 전/후**로 남긴다.
--     audit_logs의 SELECT 정책은 app.is_admin() 하나이므로 원본 값을 남겨도 ADMIN 밖으로
--     나가지 않는다(ADMIN은 guest_accounts_list에서 이미 원본 연락처를 본다).
--   · 원장(startups·networks·ma_sellers·ma_buyers)은 건드리지 않는다. 계정의 로그인 자격은
--     users가 갖고, 원장 연락처는 그 원장의 게이트가 따로 본다.
-- =====================================================================

begin;

-- 재설정 링크를 발급 시점의 세션 판에 묶는다. 뒤의 ADMIN 함수도 링크를 비울 때 이 칸을
-- 함께 비워야 하므로 함수 정의보다 먼저 추가한다.
alter table public.guest_credentials
  add column if not exists reset_session_version integer;

comment on column public.guest_credentials.reset_session_version is
  '재설정 링크를 발급한 시점의 users.session_version. 소진 때 현재 판과 다르면 그 링크는 죽는다 — 연락처 수정·초기화·접근 차단 뒤에 옛 링크가 살아나지 않게 하는 유일한 근거다.';

-- ---------------------------------------------------------------------
-- (1) 감사 헬퍼 — 변경 전 값을 받을 자리를 만든다
--
--     기존 app.log_guest_access(5인자)는 after만 받았다. 연락처 수정은 "무엇이 무엇으로
--     바뀌었는가"가 기록의 본체이므로 before가 필요하다. 액션 허용목록을 두 벌로 늘리지
--     않기 위해, 6인자 본체를 만들고 기존 5인자는 그 본체에 before=null로 위임한다
--     (시그니처가 그대로라 기존 ACL·호출부는 손대지 않는다).
-- ---------------------------------------------------------------------
create or replace function app.log_guest_change(
  p_target_user_id uuid,
  p_action         text,
  p_after          text,
  p_before_data    jsonb,
  p_after_data     jsonb,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_action not in (
    'GUEST_ACCESS_OPEN',
    'GUEST_ACCESS_CLOSE',
    'GUEST_ACCESS_REOPEN',
    'GUEST_ACCESS_REMOVE',
    'GUEST_ACCESS_WINDOW',
    'GUEST_ACCOUNT_ISSUE',
    'GUEST_ACCOUNT_RESTORE',
    'GUEST_ACCOUNT_SUSPEND',
    'GUEST_ACCOUNT_HARD_DELETE',
    'GUEST_CONTACT_UPDATE',
    'GUEST_IDENTITY_ADD',
    'GUEST_PASSWORD_RESET',
    'GUEST_PASSWORD_RESET_SEND'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, changed_workspace,
    after_permission, before_data, after_data, reason
  ) values (
    app.current_app_user_id(), p_target_user_id, p_action, 'guest',
    p_after, p_before_data, p_after_data, p_reason
  );
end;
$fn$;

-- 이 헬퍼를 부르는 것은 같은 마이그레이션의 DEFINER 함수들과 app.log_guest_access뿐이다.
-- 그 함수들 안에서는 실효 사용자가 소유자이므로, 앱 롤에 실행권한을 줄 이유가 없다.
revoke all on function app.log_guest_change(uuid, text, text, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;

comment on function app.log_guest_change(uuid, text, text, jsonb, jsonb, text) is
  'GUEST 감사 로그 적재 본체(변경 전/후 동시). 액션 허용목록이 여기 한 곳에 있고 app.log_guest_access(5인자)가 before=null로 위임한다. 앱 롤에 실행권한을 주지 않는다.';

-- 기존 5인자 헬퍼는 시그니처·ACL을 유지한 채 본체만 위임으로 바꾼다.
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
set search_path = ''
as $fn$
begin
  perform app.log_guest_change(
    p_target_user_id, p_action, p_after, null, p_data, p_reason
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- (2) 연락처 수정 — 계정만 고친다
--
--     이메일은 로그인 아이디이고 전화는 개시 상태의 초기 비밀번호다. 둘 중 하나라도
--     바뀌면 이미 발급된 세션과 단명 티켓을 죽인다(session_version + 1). is_active는
--     건드리지 않는다 — 정지 여부는 다른 창구(set_guest_account_active)의 사실이다.
--
--     두 칸 모두 현재 값을 함께 보낸다. "빈 값 = 유지"로 두면 연락처를 지우려는 요청과
--     구분할 수 없고, 계정은 두 값이 모두 있어야 개시할 수 있다(create_guest_account와 같은 요구).
-- ---------------------------------------------------------------------
create or replace function public.admin_update_guest_contact(
  p_user_id uuid,
  p_email   text,
  p_phone   text,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account    public.users%rowtype;
  v_email      text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone      text := nullif(btrim(coalesce(p_phone, '')), '');
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_norm_email text;
  v_norm_phone text;
  v_holder     text;
  v_email_changed boolean;
  v_phone_changed boolean;
  v_reset_cleared boolean := false;
  v_version    integer;
begin
  if not app.is_admin() then
    raise exception 'GUEST 연락처는 시스템 관리자만 수정할 수 있습니다.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception '수정 사유를 입력해야 합니다.' using errcode = '22023';
  end if;
  if v_email is null or v_phone is null then
    raise exception '이메일과 연락처를 모두 입력해야 합니다(바꾸지 않는 칸도 현재 값을 보냅니다).'
      using errcode = '22023';
  end if;

  v_norm_email := app.norm_email(v_email);
  v_norm_phone := app.norm_phone(v_phone);

  -- 형식 검사. 이메일은 로그인 아이디라 공백·다중 @를 허용하지 않고, 전화는 숫자만 남겨
  -- 9~15자리를 요구한다(02-123-4567 = 9자리, 국가번호 포함 최대 15자리 — E.164).
  if length(v_email) > 254 or v_norm_email !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception '이메일 형식이 올바르지 않습니다: %', v_email using errcode = '22023';
  end if;
  if v_norm_phone is null or length(v_norm_phone) < 9 or length(v_norm_phone) > 15 then
    raise exception '연락처는 숫자 9~15자리여야 합니다.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id and u.deleted_at is null
   for update;
  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not app.is_guest_user_type(v_account.user_type) then
    raise exception 'GUEST 계정이 아닙니다. 임직원 연락처는 인사 원장이 소유합니다.'
      using errcode = '22023';
  end if;

  -- 중복은 **정지된 계정까지** 본다. 정지는 되돌릴 수 있으므로, 정지 계정의 아이디를
  -- 다른 계정에 붙이면 해제하는 순간 살아 있는 계정 둘이 같은 아이디를 갖는다.
  -- 이메일은 내부 임직원까지 포함한 전체 활성 users에서 하나다(uq_users_email_live와 같은 범위).
  -- 조건을 인덱스 식(lower(btrim(email)))과 같은 모양으로 적는다. app.norm_email과 값은
  -- 같지만, 같은 식으로 물어야 부분 유일 인덱스를 타고 판정이 인덱스와 어긋나지 않는다.
  select u.name into v_holder
    from public.users u
   where u.id <> p_user_id
     and u.deleted_at is null
     and lower(btrim(u.email)) = v_norm_email
   limit 1;
  if v_holder is not null then
    raise exception '이 이메일은 이미 다른 계정(%)이 쓰고 있습니다.', v_holder
      using errcode = '23505';
  end if;

  -- 전화는 개시 상태의 초기 비밀번호이므로 GUEST 계정 사이에서 하나다
  -- (uq_users_guest_phone과 같은 범위 — 임직원 전화는 자격증명이 아니라 여기서 보지 않는다).
  select u.name into v_holder
    from public.users u
   where u.id <> p_user_id
     and u.deleted_at is null
     and app.is_guest_user_type(u.user_type)
     and app.norm_phone(u.phone) = v_norm_phone
   limit 1;
  if v_holder is not null then
    raise exception '이 연락처는 이미 다른 GUEST 계정(%)이 쓰고 있습니다.', v_holder
      using errcode = '23505';
  end if;

  v_email_changed := app.norm_email(v_account.email) is distinct from v_norm_email;
  v_phone_changed := app.norm_phone(v_account.phone) is distinct from v_norm_phone;

  -- 표기만 다른 재전송(대소문자·하이픈)은 값이 같으므로 아무 일도 하지 않는다.
  -- 세션을 죽이지도, 감사 로그에 빈 줄을 남기지도 않는다.
  if not v_email_changed and not v_phone_changed then
    return jsonb_build_object(
      'user_id', p_user_id,
      'changed', false,
      'email_changed', false,
      'phone_changed', false,
      'session_version', v_account.session_version
    );
  end if;

  update public.users
     set email = v_email,
         phone = v_phone,
         -- 아이디·초기 비밀번호가 바뀌면 옛 세션과 단명 티켓(설정·선택)은 그 자리에서 죽는다.
         -- is_active는 이 창구의 사실이 아니므로 그대로 둔다.
         session_version = session_version + 1,
         updated_at = now()
   where id = p_user_id
  returning session_version into v_version;

  -- 살아 있는 재설정 링크도 함께 죽인다. 링크는 **옛 연락처로 나간 열쇠**이므로, 주소나
  -- 번호가 바뀐 뒤에도 그것이 통하면 방금 끊어 낸 옛 수신처가 계정을 다시 가져간다.
  -- **비밀번호 해시는 건드리지 않는다** — 연락처 수정은 초기화가 아니다(초기화는 별개
  -- 창구이며 사유를 따로 받는다). 잠금 카운터도 그대로 둔다: 그것은 시도 이력의 사실이다.
  update public.guest_credentials
     set reset_token_hash = null,
         reset_expires_at = null,
         reset_session_version = null
   where user_id = p_user_id
     and (reset_token_hash is not null
          or reset_expires_at is not null
          or reset_session_version is not null);
  v_reset_cleared := found;

  perform app.log_guest_change(
    p_user_id,
    'GUEST_CONTACT_UPDATE',
    'guest:contact',
    jsonb_build_object('email', v_account.email, 'phone', v_account.phone),
    jsonb_build_object(
      'email', v_email,
      'phone', v_phone,
      'reset_link_cleared', v_reset_cleared
    ),
    v_reason
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'changed', true,
    'email_changed', v_email_changed,
    'phone_changed', v_phone_changed,
    'reset_link_cleared', v_reset_cleared,
    'session_version', v_version
  );
end;
$fn$;

revoke all on function public.admin_update_guest_contact(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.admin_update_guest_contact(uuid, text, text, text)
  to authenticated;

comment on function public.admin_update_guest_contact(uuid, text, text, text) is
  'ADMIN 전용 GUEST 로그인 아이디(이메일)·연락처 수정. users만 고치고 원장은 건드리지 않는다. 중복은 정지 계정까지 보며, 값이 바뀌면 session_version을 올려 세션과 단명 티켓을 무효화하고 살아 있는 재설정 링크를 비운다(비밀번호 해시·잠금과 is_active는 유지). 변경 전/후를 audit_logs에 남긴다. 근거: 3_9_1 §6.2';

-- ---------------------------------------------------------------------
-- (3) 비밀번호 초기화 — 계정을 개시 상태로 되돌린다
--
--     해시를 비우면 그 계정은 다시 "현재 연락처가 초기 비밀번호"인 상태가 된다. 종전
--     링크 경로가 해시를 비우지 않았던 이유(링크만 열고 그만두면 그 상태로 남는다)는
--     그대로 유효하지만, 이 경로는 **ADMIN이 사유를 적어 의도적으로** 되돌리는 창구이며
--     사용자가 그 운영을 확정했다(2026-09-13).
--
--     개시 상태의 로그인은 세션을 주지 않는다 — guest-auth-login이 설정 티켓만 발급하고,
--     개인 비밀번호를 정한 뒤에 비로소 세션이 열린다(3_9_1 §6).
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

  -- 연락처가 없거나 너무 짧으면 초기화가 **로그인할 수 없는 계정**을 만든다. 먼저
  -- 연락처를 고치라고 답하는 편이 정직하다(admin_update_guest_contact와 같은 기준).
  if v_account.phone is null
     or app.norm_phone(v_account.phone) is null
     or length(app.norm_phone(v_account.phone)) < 9 then
    raise exception '연락처가 없어 초기화할 수 없습니다. 먼저 연락처를 수정하십시오.'
      using errcode = '22023';
  end if;

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
    jsonb_build_object('has_password', false, 'initial_password', 'users.phone'),
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
  'ADMIN 전용 GUEST 비밀번호 초기화. 해시·설정시각·재설정 토큰·잠금을 비워 계정을 개시 상태로 되돌리고 session_version을 올린다(is_active 유지). 그 뒤의 로그인은 현재 연락처로 들어와 개인 비밀번호를 정한 뒤에만 세션을 받는다. 값은 한 칸도 호출자에게 돌려주지 않는다. 근거: 3_9_1 §6.2';

-- ---------------------------------------------------------------------
-- (4) 비밀번호 커밋 — 읽은 상태가 그대로여야 쓴다(비교 후 교체)
--
--     Edge의 설정·변경 경로는 "계정을 읽고 → 해시를 만들고(수백 ms) → 자격증명을
--     덮어쓴다"였다. 그 사이에 ADMIN이 초기화하거나 연락처를 고치면, 읽은 시점의 사실로
--     만든 해시가 **초기화 뒤에** 얹힌다 — 판(session_version)을 티켓에 실어도 그 대조는
--     읽는 시점의 일이라 이 창을 닫지 못한다(TOCTOU). 그래서 마지막 쓰기를 조건부로 만든다.
--
--     조건 셋을 한 트랜잭션에서 함께 본다.
--       · 계정이 살아 있고 활성이며 GUEST인가
--       · 세션 판이 **호출자가 확인했던 그 값**인가 (`p_expected_session_version`)
--       · 저장된 해시가 **호출자가 읽었던 그 값**인가 (`p_expected_password_hash`,
--         개시 상태면 null — 행이 없는 것과 같게 본다)
--     하나라도 어긋나면 아무것도 쓰지 않고 사유만 돌려준다. 호출자는 그것을 만료·충돌로
--     답해야 하며 성공으로 착지해서는 안 된다.
--
--     잠금 순서는 ADMIN 창구와 **같다: users 먼저, guest_credentials 나중.** 두 경로가
--     서로 다른 순서로 잠그면 교착이 생긴다.
--
--     `p_consume_ticket`은 단명 티켓으로 온 경로(설정·재설정)에서 true다. 성공하면 판을
--     올려 그 티켓을 그 자리에서 소진하고, **오른 판을 돌려준다** — 호출자가 계정을 다시
--     읽어 판을 얻으면 그 재조회 자체가 새 경합 창이 된다. 로그인 상태의 변경 경로는
--     false다: 소진할 티켓이 없고, 판을 올리면 방금 비밀번호를 바꾼 본인의 세션이 끊긴다.
--
--     보안 게이트: SECURITY **INVOKER**다. 실행권한을 service_role에만 주므로 문이 하나
--     닫혀 있고, 본문이 호출자 권한으로 돌기 때문에 표 권한(guest_credentials는
--     service_role에만 열려 있다)이 두 번째 문으로 남는다 — DEFINER로 만들면 그 두 번째
--     문이 사라진다. `search_path`는 비우고 모든 객체를 스키마로 적는다. app 헬퍼를 부르지
--     않는 이유도 INVOKER이기 때문이다(service_role에 app 스키마 USAGE를 새로 주고 싶지
--     않다). 그래서 GUEST 유형 목록만 여기에 적혀 있다 — SSOT는 app.is_guest_user_type이며
--     유형이 바뀌면 이 함수의 회귀 테스트가 함께 깨진다.
-- ---------------------------------------------------------------------
create or replace function public.guest_password_commit(
  p_user_id                  uuid,
  p_expected_session_version integer,
  p_expected_password_hash   text,
  p_new_password_hash        text,
  p_consume_ticket           boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_account public.users%rowtype;
  v_hash    text;
  v_exists  boolean;
  v_version integer;
begin
  if p_user_id is null
     or p_expected_session_version is null
     or nullif(btrim(coalesce(p_new_password_hash, '')), '') is null then
    raise exception '필수 인자가 비어 있습니다.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id
   for update;
  if not found
     or v_account.deleted_at is not null
     or not v_account.is_active
     or v_account.user_type not in ('external_startup', 'external_expert', 'temporary_guest')
  then
    return jsonb_build_object('committed', false, 'reason', 'account_unavailable');
  end if;

  if v_account.session_version is distinct from p_expected_session_version then
    return jsonb_build_object('committed', false, 'reason', 'version_mismatch');
  end if;

  select c.password_hash into v_hash
    from public.guest_credentials c
   where c.user_id = p_user_id
   for update;
  v_exists := found;

  -- 행이 없는 것과 해시가 null인 것은 같은 사실이다(개시 상태).
  if v_hash is distinct from nullif(btrim(coalesce(p_expected_password_hash, '')), '') then
    return jsonb_build_object('committed', false, 'reason', 'password_changed');
  end if;

  if v_exists then
    update public.guest_credentials
       set password_hash    = p_new_password_hash,
           password_set_at  = now(),
           login_attempts   = 0,
           locked_until     = null,
           reset_token_hash = null,
           reset_expires_at = null
     where user_id = p_user_id;
  else
    insert into public.guest_credentials
      (user_id, password_hash, password_set_at, login_attempts, locked_until,
       reset_token_hash, reset_expires_at)
    values (p_user_id, p_new_password_hash, now(), 0, null, null, null);
  end if;

  v_version := v_account.session_version;
  if coalesce(p_consume_ticket, false) then
    update public.users
       set session_version = session_version + 1,
           updated_at = now()
     where id = p_user_id
    returning session_version into v_version;
  end if;

  return jsonb_build_object('committed', true, 'session_version', v_version);
end;
$fn$;

revoke all on function public.guest_password_commit(uuid, integer, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.guest_password_commit(uuid, integer, text, text, boolean)
  to service_role;

comment on function public.guest_password_commit(uuid, integer, text, text, boolean) is
  '게스트 비밀번호의 유일한 쓰기 경로(비교 후 교체). 계정 생존·활성·GUEST 여부, 기대 session_version, 기대 password_hash가 모두 맞을 때만 저장하고 어긋나면 사유만 돌려준다. 티켓 경로는 성공 시 판을 올려 티켓을 소진하고 오른 판을 돌려준다. INVOKER이며 실행권한은 service_role 전용이다. 근거: 3_9_1 §6.2.1';

-- ---------------------------------------------------------------------
-- (5) 재설정 링크 — 발급도 소진도 계정 상태에 묶는다
--
--     종전 경로(guest-password-reset)는 Edge Function 안에서 네 단계를 따로 밟았다:
--     계정을 읽고 → 토큰을 만들고 → 자격증명에 upsert하고 → 읽은 시점의 주소로 보냈다.
--     그 사이에 ADMIN이 이메일을 고치면(연락처 수정은 판을 올리고 살아 있는 링크를 비운다),
--     **비운 자리에 옛 스냅샷의 토큰이 다시 얹히고 그 링크가 옛 주소로 나갔다.** 소진도
--     같았다 — 토큰으로 행을 찾고, 계정을 따로 읽고, 조건 없이 비웠기 때문에 같은 링크로
--     두 요청이 동시에 들어오면 둘 다 설정 티켓을 받았다.
--
--     그래서 두 동작을 각각 한 함수·한 트랜잭션으로 내린다.
--       · 발급: users를 먼저 잠그고 생존·활성·GUEST와 **기대 판**을 확인한 뒤에만 토큰을
--         저장하며, 그때의 판을 `reset_session_version`에 함께 적는다.
--       · 소진: 같은 순서로 잠그고(users → guest_credentials) 해시·만료·계정 상태와
--         **적어 둔 판**을 확인한 뒤, 해시를 조건에 넣은 UPDATE로 **정확히 한 번** 비운다.
--         돌려주는 판은 그 검증을 통과한 값이며, 호출자는 그것으로 설정 티켓을 서명한다 —
--         계정을 다시 읽으면 그 재조회가 새 경합 창이 되고, 그 사이에 오른 판을 티켓에 실어
--         옛 링크가 새 자격으로 승격된다.
--
--     발급 시점의 판을 적어 두는 것이 핵심이다. 이후 어떤 이유로든 판이 오르면(연락처 수정,
--     초기화, 담당자의 접근 차단) 그 링크는 소진 단계에서 죽는다. 이 마이그레이션 이전에
--     나간 링크는 그 칸이 비어 있어 함께 죽는다 — 수명이 30분이라 유예를 두지 않는다.
--
--     보안 게이트: 새 표·정책·Storage 변경 없음. 새 칸 하나는 Secret 원장(정책 없음,
--     앱 롤 REVOKE)에 들어가므로 표 권한은 그대로다. 두 함수는 guest_password_commit과 같은
--     모양이다 — SECURITY INVOKER, `search_path` 고정, 실행권한은 service_role 전용.
--     값(토큰 원문)은 DB에 들어오지 않는다: 함수가 받는 것은 해시뿐이다.
-- ---------------------------------------------------------------------
create or replace function public.guest_reset_token_issue(
  p_user_id                  uuid,
  p_expected_session_version integer,
  p_token_hash               text,
  p_expires_at               timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_account public.users%rowtype;
begin
  if p_user_id is null
     or p_expected_session_version is null
     or nullif(btrim(coalesce(p_token_hash, '')), '') is null
     or p_expires_at is null then
    raise exception '필수 인자가 비어 있습니다.' using errcode = '22023';
  end if;
  if p_expires_at <= now() then
    raise exception '만료 시각이 이미 지났습니다.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id
   for update;
  if not found
     or v_account.deleted_at is not null
     or not v_account.is_active
     or v_account.user_type not in ('external_startup', 'external_expert', 'temporary_guest')
  then
    return jsonb_build_object('issued', false, 'reason', 'account_unavailable');
  end if;

  -- 호출자가 수신처를 읽은 그 시점의 계정이어야 한다. 판이 올랐다면 그 사이에 주소나
  -- 번호가 바뀐 것이므로, 저장을 거절해 **옛 주소로 링크가 나가는 길**을 닫는다.
  if v_account.session_version is distinct from p_expected_session_version then
    return jsonb_build_object('issued', false, 'reason', 'version_mismatch');
  end if;

  insert into public.guest_credentials
    (user_id, reset_token_hash, reset_expires_at, reset_session_version,
     login_attempts, locked_until)
  values (p_user_id, p_token_hash, p_expires_at, v_account.session_version, 0, null)
  on conflict (user_id) do update
    set reset_token_hash      = p_token_hash,
        reset_expires_at      = p_expires_at,
        reset_session_version = v_account.session_version,
        login_attempts        = 0,
        locked_until          = null;

  return jsonb_build_object('issued', true, 'session_version', v_account.session_version);
end;
$fn$;

revoke all on function public.guest_reset_token_issue(uuid, integer, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.guest_reset_token_issue(uuid, integer, text, timestamptz)
  to service_role;

comment on function public.guest_reset_token_issue(uuid, integer, text, timestamptz) is
  '재설정 링크 토큰 저장(조건부). users를 먼저 잠그고 생존·활성·GUEST와 기대 session_version이 맞을 때만 해시를 적으며 그 판을 reset_session_version에 함께 남긴다. 원문 토큰은 받지 않는다. INVOKER이며 실행권한은 service_role 전용이다. 근거: 3_9_1 §6.2.3';

create or replace function public.guest_reset_token_consume(p_token_hash text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_hash    text := nullif(btrim(coalesce(p_token_hash, '')), '');
  v_user_id uuid;
  v_account public.users%rowtype;
  v_cred    public.guest_credentials%rowtype;
  v_rows    integer;
begin
  if v_hash is null then
    raise exception '필수 인자가 비어 있습니다.' using errcode = '22023';
  end if;

  -- 주인을 먼저 찾되 여기서는 잠그지 않는다. 잠금 순서를 users → guest_credentials로
  -- 고정해야 ADMIN 창구·비밀번호 커밋과 교착하지 않으며, 잠근 뒤에 해시를 다시 본다.
  select c.user_id into v_user_id
    from public.guest_credentials c
   where c.reset_token_hash = v_hash;
  if not found then
    return jsonb_build_object('consumed', false, 'reason', 'not_found');
  end if;

  select u.* into v_account
    from public.users u
   where u.id = v_user_id
   for update;
  if not found
     or v_account.deleted_at is not null
     or not v_account.is_active
     or v_account.user_type not in ('external_startup', 'external_expert', 'temporary_guest')
  then
    return jsonb_build_object('consumed', false, 'reason', 'account_unavailable');
  end if;

  select c.* into v_cred
    from public.guest_credentials c
   where c.user_id = v_user_id
   for update;
  -- 잠금을 얻기까지 사이에 다른 요청이 먼저 소진했거나 ADMIN이 비웠을 수 있다.
  if not found or v_cred.reset_token_hash is distinct from v_hash then
    return jsonb_build_object('consumed', false, 'reason', 'not_found');
  end if;
  if v_cred.reset_expires_at is null or v_cred.reset_expires_at <= now() then
    return jsonb_build_object('consumed', false, 'reason', 'expired');
  end if;
  -- 발급 때 적어 둔 판과 다르면 그 링크는 옛 계정 상태의 것이다(연락처 수정·초기화·차단).
  -- 이 마이그레이션 이전에 발급된 링크는 칸이 비어 있어 같은 자리에서 죽는다.
  if v_cred.reset_session_version is distinct from v_account.session_version then
    return jsonb_build_object('consumed', false, 'reason', 'version_mismatch');
  end if;

  -- 해시를 조건에 넣어 비운다. 같은 링크로 두 요청이 들어오면 하나만 1행을 고친다.
  -- **비밀번호 해시는 비우지 않는다** — 비우면 계정이 개시 상태로 돌아가 계정 생성 때
  -- 확정한 전화번호가 다시 통하고, 사용자가 링크만 열고 그만두면 그 상태로 남는다.
  -- 덮어쓸 권한은 티켓의 rst 표시가 준다(3_9_1 §6.2.1).
  update public.guest_credentials
     set reset_token_hash      = null,
         reset_expires_at      = null,
         reset_session_version = null,
         login_attempts        = 0,
         locked_until          = null
   where user_id = v_user_id
     and reset_token_hash = v_hash;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('consumed', false, 'reason', 'not_found');
  end if;

  -- 이름까지 함께 돌려주는 이유: 호출자가 계정을 다시 읽지 않아야 한다. 그 재조회가
  -- 새 경합 창이고, 거기서 읽은 판으로 티켓을 서명하면 옛 링크가 새 자격으로 승격된다.
  return jsonb_build_object(
    'consumed', true,
    'user_id', v_user_id,
    'session_version', v_account.session_version,
    'name', v_account.name
  );
end;
$fn$;

revoke all on function public.guest_reset_token_consume(text)
  from public, anon, authenticated;
grant execute on function public.guest_reset_token_consume(text)
  to service_role;

comment on function public.guest_reset_token_consume(text) is
  '재설정 링크 소진(원자적). users → guest_credentials 순서로 잠그고 해시·만료·계정 상태·발급 시점 판을 확인한 뒤 해시를 조건에 넣은 UPDATE로 정확히 한 번 비운다. 검증한 판과 이름을 돌려주므로 호출자는 계정을 다시 읽지 않는다. INVOKER이며 실행권한은 service_role 전용이다. 근거: 3_9_1 §6.2.3';

commit;
