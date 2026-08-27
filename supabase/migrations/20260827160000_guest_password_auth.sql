-- =====================================================================
-- 게스트 인증을 OTP에서 비밀번호로 바꾼다
--
-- 배경: OTP는 인증번호를 보낼 수단이 있어야 성립하는데, 이 프로젝트에는 아직 발송
--   어댑터가 없다(2026-08-27 확인). 그래서 참여자가 사업코드·성명·연락처를 맞게 입력해도
--   영원히 오지 않을 번호를 기다리는 화면에서 멈췄다. 인증 수단을 참여자가 이미 가지고
--   있는 것(원장에 적힌 전화번호)으로 바꾸면 발송 없이도 로그인이 성립한다.
--
-- 새 규칙 (사용자 확정, 2026-08-27)
--   · 로그인 3요소: 이메일(ID) + 비밀번호 + 사업코드.
--   · 초기 비밀번호는 원장의 전화번호(숫자만)다.
--   · 초기 비밀번호로 처음 들어오면 새 비밀번호를 정해야 하고, 정한 뒤부터는 그것으로 들어온다.
--
-- 이 규칙의 귀결 하나: 이제 매핑에 **이메일과 전화가 모두** 필요하다. 종전에는 둘 중 하나면
--   됐지만, 이메일은 ID이고 전화는 초기 비밀번호라 한쪽만으로는 로그인이 성립하지 않는다.
--   개방 RPC의 검증을 그에 맞춰 좁힌다 — 화면에서 막는 것은 보안이 아니다.
--
-- 비밀번호는 이 DB가 검사하지 않는다. 해시는 Edge Function이 PBKDF2로 만들어 여기 담아만
--   두며(_shared/password.ts), 원문은 어디에도 저장하지 않는다. 함수가 service_role로만
--   이 열을 읽으므로 클라이언트에는 해시조차 나가지 않는다(guest_invitations의 게스트용
--   SELECT 정책은 없다 — 내부 실무자만 조회하며 그 정책은 이 마이그레이션이 건드리지 않는다).
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 신규 테이블·Storage·정책 없음. 기존 표에 컬럼 4개 추가, 함수 2개(1개 재정의 + 1개 신설).
--   · 신설 reset_program_guest_password는 SECURITY INVOKER다 — 초대 레코드 쓰기는 이미
--     'ac 쓰기' 정책이 판정하고 있어 우회할 이유가 없다. 담당자(PM·MEMBER) 여부는 함수가
--     추가로 검사한다(워크스페이스 쓰기 권한만으로는 남의 사업 문을 만질 수 없다).
--   · 비밀번호 초기화는 권한 변경에 준하므로 audit_logs에 남긴다(GUEST_PASSWORD_RESET).
--   · 잠금 상태(login_attempts·locked_until)를 원장에 두어 무차별 대입을 서버가 센다.
--   · OTP 컬럼은 지우지 않는다(물리 삭제 금지). 읽지 않을 뿐이며 주석으로 레거시를 명시한다.
-- =====================================================================

alter table public.guest_invitations
  add column if not exists password_hash   text,
  add column if not exists password_set_at timestamptz,
  add column if not exists login_attempts  integer not null default 0,
  add column if not exists locked_until    timestamptz;

comment on column public.guest_invitations.password_hash is
  '게스트 비밀번호 해시(PBKDF2-SHA256, Edge Function이 생성). null이면 아직 초기 비밀번호(원장 전화번호) 상태다.';
comment on column public.guest_invitations.password_set_at is
  '참여자가 비밀번호를 직접 정한 시각. null이면 초기 상태.';
comment on column public.guest_invitations.login_attempts is
  '연속 로그인 실패 횟수. 성공 시 0으로 되돌린다.';
comment on column public.guest_invitations.locked_until is
  '무차별 대입 잠금 해제 시각. 이 시각까지는 비밀번호가 맞아도 거절한다.';

comment on column public.guest_invitations.otp_hash is
  '[레거시] OTP 인증 시절의 열. 2026-08-27 비밀번호 인증으로 전환하며 사용을 멈췄다.';
comment on column public.guest_invitations.otp_expires_at is
  '[레거시] OTP 인증 시절의 열.';
comment on column public.guest_invitations.otp_attempts is
  '[레거시] OTP 인증 시절의 열. 실패 횟수는 login_attempts가 센다.';

-- ---------------------------------------------------------------------
-- 감사 액션에 비밀번호 초기화를 더한다.
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
as $$
begin
  if p_action not in ('GUEST_ACCESS_OPEN', 'GUEST_ACCESS_CLOSE', 'GUEST_PASSWORD_RESET') then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, action, changed_workspace, after_permission, after_data, reason)
  values
    (app.current_app_user_id(), p_target_user_id, p_action, 'guest', p_after, p_data, p_reason);
end;
$$;

-- ---------------------------------------------------------------------
-- 개방 RPC: 이메일·전화가 모두 있어야 연다(이메일=ID, 전화=초기 비밀번호).
-- 그 외 로직은 20260827150000과 같다.
-- ---------------------------------------------------------------------
create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table (
  participant_id uuid,
  program_code   text,
  target_name    text,
  email          text,
  phone          text
)
language plpgsql
as $$
declare
  v_uid       uuid := app.current_app_user_id();
  r           record;
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
    select pp.id, pp.program_id, pp.role, pp.master_table, pp.master_id, pp.login_status,
           g.code as code, g.status::text as program_status
      from public.program_participants pp
      join public.programs g on g.id = pp.program_id
     where pp.id = any (p_participant_ids)
  loop
    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    if r.program_status in ('FINISHED', 'CANCELLED') then
      raise exception '종료·취소된 사업은 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;
    if r.master_id is null or r.master_table is null then
      raise exception '원장에 연결되지 않은 참가자는 로그인 대상이 아닙니다.' using errcode = '22023';
    end if;
    if r.code is null then
      raise exception '사업코드가 없어 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;

    v_name := null; v_email := null; v_phone := null; v_company := null;

    if r.master_table = 'startups' then
      select s.representative,
             nullif(trim(s.email), ''),
             nullif(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), '')
        into v_name, v_email, v_phone
        from public.startups s
       where s.id = r.master_id and s.deleted_at is null;
      v_user_type := 'external_startup';
      v_company   := r.master_id;
    else
      select e.name,
             nullif(trim(e.email), ''),
             nullif(regexp_replace(coalesce(e.phone, ''), '\D', '', 'g'), '')
        into v_name, v_email, v_phone
        from public.experts e
       where e.id = r.master_id and e.deleted_at is null;
      v_user_type := 'external_expert';
    end if;

    -- 이메일과 전화가 모두 있어야 한다: 이메일은 ID, 전화는 초기 비밀번호다.
    if v_name is null or v_email is null or v_phone is null then
      raise exception '원장에 성명·이메일·연락처가 모두 있어야 로그인을 열 수 있습니다. NETWORKS에서 먼저 보완하십시오.'
        using errcode = '22023';
    end if;

    -- 초대 레코드는 명부 행당 1건이다. 이미 정한 비밀번호는 다시 열어도 유지한다 —
    -- 담당자가 문을 여닫는 일과 참여자가 자기 비밀번호를 갖는 일은 별개 축이다.
    update public.guest_invitations
       set business_code     = r.code,
           name              = v_name,
           email             = v_email,
           phone             = v_phone,
           invited_user_type = v_user_type::public.user_type,
           company_id        = v_company,
           target_type       = 'PROGRAM',
           target_id         = r.program_id,
           invite_expires_at = now() + interval '1 year',
           login_attempts    = 0,
           locked_until      = null
     where guest_invitations.participant_id = r.id;

    if not found then
      insert into public.guest_invitations
        (business_code, name, email, phone, invited_user_type, company_id,
         target_type, target_id, participant_id, created_by, invite_expires_at)
      values
        (r.code, v_name, v_email, v_phone, v_user_type::public.user_type, v_company,
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
    program_code   := r.code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    return next;
  end loop;
end;
$$;

revoke all on function public.open_program_guest_access(uuid[]) from public;
grant execute on function public.open_program_guest_access(uuid[]) to authenticated;

comment on function public.open_program_guest_access(uuid[]) is
  '연동 DB 명부 행의 게스트 로그인을 연다(담당자 전용, SECURITY INVOKER). 이메일=ID, 전화=초기 비밀번호이므로 둘 다 있어야 열린다.';

-- ---------------------------------------------------------------------
-- 비밀번호 초기화: 다시 원장의 전화번호로 되돌린다(분실 대응).
-- ---------------------------------------------------------------------
create or replace function public.reset_program_guest_password(p_participant_ids uuid[])
returns integer
language plpgsql
as $$
declare
  v_uid   uuid := app.current_app_user_id();
  r       record;
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return 0;
  end if;

  for r in
    select pp.id, pp.program_id
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 비밀번호를 초기화할 수 있습니다.' using errcode = '42501';
    end if;

    update public.guest_invitations
       set password_hash   = null,
           password_set_at = null,
           login_attempts  = 0,
           locked_until    = null
     where guest_invitations.participant_id = r.id;

    if found then
      v_count := v_count + 1;
      perform app.log_guest_access(
        null,
        'GUEST_PASSWORD_RESET',
        'guest:password-reset',
        jsonb_build_object('participant_id', r.id, 'program_id', r.program_id),
        null
      );
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.reset_program_guest_password(uuid[]) from public;
grant execute on function public.reset_program_guest_password(uuid[]) to authenticated;

comment on function public.reset_program_guest_password(uuid[]) is
  '게스트 비밀번호를 초기 상태(원장 전화번호)로 되돌린다(담당자 전용, SECURITY INVOKER).';
