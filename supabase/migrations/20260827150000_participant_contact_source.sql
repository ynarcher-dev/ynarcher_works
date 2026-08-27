-- =====================================================================
-- 기업 연락처의 출처를 원장 화면과 일치시킨다 (startups.email / startups.phone)
--
-- 배경: startups에는 연락처가 두 벌 있다.
--   · contact(jsonb) — 최초 스키마(20260705120400)의 자리. 지금은 어느 화면도 읽지 않는다.
--   · email / phone(text) — 20260710140000에서 생긴 자리. STARTUP 상세·검색·편집이 쓰는 실제 값.
--   20260827130000의 개방 RPC와 연동 DB 화면이 옛 자리(contact)를 읽는 바람에, 명부에 뜨는
--   연락처가 원장 화면의 값과 달랐다. 표시만의 문제가 아니다 — 그대로 두면 초대 레코드에
--   옛 주소가 실려 **인증번호가 엉뚱한 곳으로 나간다.**
--
-- 이 마이그레이션이 하는 일
--   (1) 스칼라 자리가 비어 있는 행만 옛 jsonb 값으로 채운다(값 유실 없이 한 자리로 모은다).
--       이미 값이 있는 행은 건드리지 않는다 — 화면에서 고친 현재 값이 언제나 이긴다.
--   (2) 개방 RPC가 스칼라 자리를 읽도록 바꾼다.
--   (3) contact 컬럼에 '레거시'를 명시해 다음 사람이 다시 읽지 않게 한다.
--       컬럼은 지우지 않는다(물리 삭제 금지). 읽지 않을 뿐이다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 신규 테이블·정책·Storage 없음. 함수 1개 재정의(기존과 동일한 SECURITY INVOKER,
--     인가 조건·반환 형태 불변, 읽는 컬럼만 교체). 권한 경계 변화 없음.
--   · 개인정보(연락처) 이동이 아니라 같은 원장 안에서의 자리 정리다. 노출 범위는 그대로
--     startups 정책이 판정하며, 명부·초대 레코드에 담기는 값의 출처만 정확해진다.
--   · UPDATE는 email/phone이 null인 행에 한정한다(기존 값 덮어쓰기 없음).
-- =====================================================================

-- (1) 옛 자리에만 있던 값을 현재 자리로 모은다.
update public.startups
   set email = nullif(trim(contact ->> 'email'), '')
 where email is null
   and nullif(trim(contact ->> 'email'), '') is not null;

update public.startups
   set phone = nullif(trim(contact ->> 'phone'), '')
 where phone is null
   and nullif(trim(contact ->> 'phone'), '') is not null;

comment on column public.startups.contact is
  '[레거시] 최초 스키마의 연락처 jsonb. 현재 값은 email/phone 컬럼이 소유하며 화면·RPC는 그쪽만 읽는다.';

-- (2) 개방 RPC: 기업 연락처를 스칼라 컬럼에서 읽는다(그 외 로직은 20260827130000과 동일).
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
      select s.representative, nullif(trim(s.email), ''), nullif(trim(s.phone), '')
        into v_name, v_email, v_phone
        from public.startups s
       where s.id = r.master_id and s.deleted_at is null;
      v_user_type := 'external_startup';
      v_company   := r.master_id;
    else
      select e.name, nullif(trim(e.email), ''), nullif(trim(e.phone), '')
        into v_name, v_email, v_phone
        from public.experts e
       where e.id = r.master_id and e.deleted_at is null;
      v_user_type := 'external_expert';
    end if;

    if v_name is null or (v_email is null and v_phone is null) then
      raise exception '원장에 성명 또는 연락처가 없어 로그인을 열 수 없습니다. NETWORKS에서 먼저 보완하십시오.'
        using errcode = '22023';
    end if;

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
           otp_hash          = null,
           otp_expires_at    = null,
           otp_attempts      = 0
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
  '연동 DB 명부 행의 게스트 로그인을 연다(담당자 전용, SECURITY INVOKER). 연락처는 원장 화면과 같은 자리(startups.email/phone, experts.email/phone)를 읽는다.';
