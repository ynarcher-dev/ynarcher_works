-- =====================================================================
-- 연동 DB 수동 매핑 + 게스트 로그인 개방 (AC)
--
-- 배경: 사업 참가자 명부는 모집 지원자가 흘러들어 저절로 차는 자동 매핑을 전제했으나,
--   실제 운영은 이미 원장에 있는 기업·전문가를 담당자가 직접 붙인다. 명부에 올리는 일과
--   로그인을 여는 일을 갈라, 참여 후보를 쌓아 두더라도 확정 전에는 문이 열리지 않게 한다.
--   확정 규칙: docs/docs_planning/3_4_4_ac_participant_pool.md (2026-08-27 전면 개정)
--
-- 이 마이그레이션이 하는 일
--   (1) 명부에 로그인 개방 축(login_status)과 원장 출처(master_table)를 더한다.
--   (2) 초대 레코드가 명부의 어느 줄인지 알도록 guest_invitations.participant_id를 더한다.
--       — 이것이 이번 개편의 핵심 연결선이다. 종전에는 로그인에 성공해도 새로 만들어진
--         계정이 명부 행과 이어지지 않아, 게스트 조회 범위의 판정 기준(participants.user_id)이
--         빈 채로 남았다. 그 상태로 문만 열면 로그인은 되고 화면만 비는 증상이 난다.
--   (3) 게스트가 보는 범위를 '항목 자체의 공개값'에서 '소속 메뉴(모듈)의 공유 범위'로 옮긴다.
--       — 종전 기준이던 program_timeline_items.visibility는 아무도 채우지 않아 전량
--         INTERNAL_ONLY다. 반면 운영자는 이미 모듈 카드에서 공유 범위를 켜고 끄고 있다.
--         두 곳에 공개 스위치를 두면 이중 관리가 되므로 실제로 쓰이는 쪽 하나만 남긴다.
--   (4) 여닫는 RPC 2종. 사업 담당자(program_managers PM·MEMBER)만 호출할 수 있다.
--
-- 사업 고정코드는 새로 만들지 않는다 — programs.code(6자리 영숫자, 전역 유니크,
--   20260716200000 + 20260731150000)가 이미 그 자리다. 코드를 하나 더 만들면 안내에
--   쓰는 코드와 로그인에 쓰는 코드가 갈린다.
--
-- 자동 차단(사업 종료·취소)은 상태를 저장하지 않고 판정 시점에 사업 상태를 함께 본다.
--   트리거로 login_status를 내려 저장하면 사업 상태를 되돌렸을 때 자동 복구되지 않아
--   '사업이 끝났다'와 '담당자가 막았다'라는 다른 두 사실이 한 칸에 섞인다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac(명부·초대) / guest(진입). 데이터 등급: Personal(외부인 성명·연락처).
--   · 접근 주체: 내부 사업 담당자(쓰기), 외부 스타트업·전문가(본인 행 읽기).
--   · Scope: program. 게스트는 세션에 고정된 사업 1건 + 그 사업의 공개 모듈로 한정된다.
--   · 신규 테이블 없음. RLS는 이미 켜진 표에 정책을 교체하는 방식이며, 교체 정책은 모두
--     기존보다 좁다(게스트 정책에 login_status·사업 생존·모듈 공유범위 조건이 더해진다).
--   · 신규 SECURITY DEFINER: app.is_program_manager / app.guest_* 판정 헬퍼 6종 /
--     app.log_guest_access / public.close_program_guest_access.
--     - 판정 헬퍼는 RLS에 가려 보이지 않는 행까지 세어야 성립하므로 DEFINER가 필요하다
--       (INVOKER면 게스트가 자기 참가 행을 못 봐 조회 범위가 항상 빈 집합이 된다).
--       모두 search_path 고정, 인자는 없거나 uuid 1개, 동적 SQL 없음.
--     - close_...는 users.session_version을 올려 발급된 토큰을 무효화해야 하는데 그 열은
--       계정 원장 소유라 사업 담당자에게 직접 UPDATE 권한을 줄 수 없다. 함수 안에서
--       담당자 여부를 먼저 검사하고, 갱신 대상을 그 참가자에 연결된 외부 게스트 계정으로
--       한정한다(내부 임직원 계정은 건드리지 않는다).
--     - log_guest_access는 audit_logs에 INSERT 정책이 없어(Default Deny) 필요한 최소 통로다.
--       actor는 호출자가 넘기지 못하고 서버가 current_app_user_id()로 채우며, action은
--       두 값으로 제한한다.
--   · open_program_guest_access는 SECURITY INVOKER다 — 원장(startups/experts)을 볼 권한이
--     없는 사람이 원장의 성명·연락처를 초대 레코드로 옮기는 일이 없도록, 읽기 실패가
--     그대로 거부가 되게 둔다. DEFINER로 만들면 각 원장의 RLS를 함수 안에 복제해야 한다.
--   · 감사 로그: 로그인 개방·차단은 권한 변경이므로 audit_logs에 적재한다
--     (action = GUEST_ACCESS_OPEN / GUEST_ACCESS_CLOSE, changed_workspace = 'guest').
--   · DELETE 정책 신설 없음. 물리 삭제 없음.
--   · 운영 영향: 기존 게스트 정책이 좁아진다. 명부에 있으나 아직 열리지 않은 대상은
--     로그인해도 아무것도 보지 못한다(의도된 Default Deny). 내부 화면 쿼리는 영향 없다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 참가자 로그인 상태
--     NOT_APPLICABLE: 내부 임직원 참가자 — WORKS로 들어오므로 문을 열 대상이 아니다.
--     저장하지 않는 표시값이 하나 있다: 사업이 종료·취소되면 화면은 '닫힘'으로 그리지만
--     원장 값은 그대로 둔다(위 머리말 참조).
-- ---------------------------------------------------------------------
do $$ begin
  create type public.participant_login_status as enum
    ('NOT_APPLICABLE', 'NOT_ALLOWED', 'INVITED', 'ACTIVE', 'BLOCKED');
exception when duplicate_object then null; end $$;

alter table public.program_participants
  add column if not exists master_table    text,
  add column if not exists login_status    public.participant_login_status not null default 'NOT_ALLOWED',
  add column if not exists login_opened_by uuid references public.users(id),
  add column if not exists login_opened_at timestamptz;

comment on column public.program_participants.master_table is
  '원장 출처(startups | experts). master_id는 FK가 아닌 soft ref라 어느 원장인지 열이 답한다.';
comment on column public.program_participants.login_status is
  '게스트 로그인 개방 상태. 명부 등록과 별개 축이며 사업 담당자만 바꾼다.';

alter table public.program_participants
  drop constraint if exists program_participants_master_table_chk;
alter table public.program_participants
  add constraint program_participants_master_table_chk
  check (master_table is null or master_table in ('startups', 'experts'));

-- 기존 행 보정: 어느 원장인지 되짚어 채운다(이후 유니크 인덱스가 성립하려면 필요하다).
update public.program_participants p
   set master_table = 'startups'
 where p.master_table is null
   and p.master_id is not null
   and exists (select 1 from public.startups s where s.id = p.master_id);

update public.program_participants p
   set master_table = 'experts'
 where p.master_table is null
   and p.master_id is not null
   and exists (select 1 from public.experts e where e.id = p.master_id);

-- 마스터 없이 계정으로만 잡힌 행(내부 인원)은 문을 열 대상이 아니다.
update public.program_participants
   set login_status = 'NOT_APPLICABLE'
 where master_id is null
   and login_status = 'NOT_ALLOWED';

-- 같은 대상을 같은 역할로 두 번 올리지 못하게 한다.
-- 기존 unique(program_id, user_id, role)로는 막히지 않는다 — 매핑 직후 user_id는 비어 있고
-- 널은 중복을 허용하므로 같은 기업이 몇 번이든 들어온다.
create unique index if not exists uq_program_participants_master
  on public.program_participants (program_id, master_table, master_id, role)
  where master_id is not null;

-- ---------------------------------------------------------------------
-- (2) 초대 레코드 ↔ 명부 행 연결선
-- ---------------------------------------------------------------------
alter table public.guest_invitations
  add column if not exists participant_id uuid references public.program_participants(id) on delete cascade;

comment on column public.guest_invitations.participant_id is
  '연동 DB 명부 행. 로그인 성공 시 이 행에 계정(user_id)을 되붙인다 — 게스트 조회 범위의 판정 기준.';

create unique index if not exists uq_guest_invitations_participant
  on public.guest_invitations (participant_id)
  where participant_id is not null;

-- ---------------------------------------------------------------------
-- (3) 판정 헬퍼
-- ---------------------------------------------------------------------

-- 사업 담당자(PM·MEMBER) 여부. 문을 여닫는 권한의 단일 판정처.
create or replace function app.is_program_manager(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.program_managers m
     where m.program_id = p_program_id
       and m.user_id = app.current_app_user_id()
  );
$$;

grant execute on function app.is_program_manager(uuid) to authenticated;

comment on function app.is_program_manager(uuid) is
  '현재 요청자가 해당 사업의 담당자(program_managers)인지. 게스트 로그인 개방·차단의 인가 기준.';

-- 게스트 세션에 고정된 사업. 로그인에 사용한 사업코드가 이 값을 정한다.
create or replace function app.guest_session_program_id()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  v_claim text := auth.jwt() ->> 'program_id';
begin
  if v_claim is null or v_claim = '' then
    return null;
  end if;
  return v_claim::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function app.guest_session_program_id() to authenticated;

comment on function app.guest_session_program_id() is
  '게스트 커스텀 JWT의 program_id 클레임. 코드가 곧 사업이므로 세션에 사업이 고정된다.';

-- 현재 게스트가 볼 수 있는 사업. 세 조건이 모두 성립해야 한다.
--   · 명부에 올라 있고 로그인이 열려 실제로 들어온 행(ACTIVE)
--   · 사업이 살아 있음(종료·취소·삭제가 아님) — 자동 차단이 여기서 즉시 반영된다
--   · 세션에 고정된 사업과 일치(클레임이 없는 구 토큰은 아무것도 보지 못한다)
create or replace function app.guest_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select p.program_id
    from public.program_participants p
    join public.programs g on g.id = p.program_id
   where p.user_id = app.current_app_user_id()
     and p.login_status = 'ACTIVE'
     and g.deleted_at is null
     and g.status not in ('FINISHED', 'CANCELLED')
     and p.program_id = app.guest_session_program_id();
$$;

comment on function app.guest_program_ids() is
  '게스트가 볼 수 있는 사업 집합(로그인 개방 + 사업 생존 + 세션 고정 사업 일치).';

-- 그 사업 안에서 공개된 메뉴(모듈). 게스트에게 보이는 모든 것의 뿌리다.
create or replace function app.guest_module_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select m.id
    from public.program_modules m
   where m.program_id in (select app.guest_program_ids())
     and m.visibility in ('GUEST_ONLY', 'PUBLIC');
$$;

comment on function app.guest_module_ids() is
  '게스트에게 공개된 모듈(공유 범위 일부공개·전체공개). 일정·슬롯·세션 노출의 단일 기준.';

create or replace function app.guest_slot_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select s.id
    from public.matching_slots s
    join public.matching_events e on e.id = s.matching_event_id
   where e.program_module_id in (select app.guest_module_ids());
$$;

create or replace function app.guest_booking_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select b.id
    from public.matching_bookings b
   where b.slot_id in (select app.guest_slot_ids());
$$;

create or replace function app.guest_mentoring_session_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select s.id
    from public.mentoring_sessions s
    join public.mentoring_relationships r on r.id = s.relationship_id
   where r.program_module_id in (select app.guest_module_ids());
$$;

-- 권한 변경 감사 기록. audit_logs에는 INSERT 정책이 없어(Default Deny) 이 통로만 쓴다.
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
  if p_action not in ('GUEST_ACCESS_OPEN', 'GUEST_ACCESS_CLOSE') then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, action, changed_workspace, after_permission, after_data, reason)
  values
    (app.current_app_user_id(), p_target_user_id, p_action, 'guest', p_after, p_data, p_reason);
end;
$$;

grant execute on function app.log_guest_access(uuid, text, text, jsonb, text) to authenticated;

comment on function app.log_guest_access(uuid, text, text, jsonb, text) is
  '게스트 로그인 개방·차단 감사 기록. actor는 호출자가 넘기지 못하고 서버가 채운다.';

-- ---------------------------------------------------------------------
-- (4) 게스트 정책 교체 — 모두 기존보다 좁다
-- ---------------------------------------------------------------------

-- 본인 명부 행 조회(변경 없음, 명시적 재선언)
drop policy if exists pp_guest_select on public.program_participants;
create policy pp_guest_select on public.program_participants for select
  using (app.is_guest() and user_id = app.current_app_user_id());

-- 일정: 소속 메뉴의 공유 범위를 따른다. 메뉴에 매이지 않은 항목은 게스트에게 없다.
drop policy if exists timeline_guest_select on public.program_timeline_items;
create policy timeline_guest_select on public.program_timeline_items for select
  using (
    app.is_guest()
    and program_module_id in (select app.guest_module_ids())
  );

-- 매칭 슬롯·예약: 전체 개방이던 것을 본인 사업의 공개 모듈로 좁힌다.
drop policy if exists slots_guest_select on public.matching_slots;
create policy slots_guest_select on public.matching_slots for select
  using (app.is_guest() and id in (select app.guest_slot_ids()));

drop policy if exists bookings_guest_select on public.matching_bookings;
create policy bookings_guest_select on public.matching_bookings for select
  using (app.is_guest() and slot_id in (select app.guest_slot_ids()));

drop policy if exists bookings_guest_insert on public.matching_bookings;
create policy bookings_guest_insert on public.matching_bookings for insert
  with check (app.is_guest() and slot_id in (select app.guest_slot_ids()));

-- 멘토링 세션과 그 산출물(만족도·5대 지표·상담일지)
drop policy if exists msessions_guest_select on public.mentoring_sessions;
create policy msessions_guest_select on public.mentoring_sessions for select
  using (app.is_guest() and id in (select app.guest_mentoring_session_ids()));

drop policy if exists msat_guest_insert on public.mentor_satisfaction_records;
create policy msat_guest_insert on public.mentor_satisfaction_records for insert
  with check (
    app.is_guest()
    and mentoring_session_id in (select app.guest_mentoring_session_ids())
  );

drop policy if exists mfb_guest_insert on public.mentor_feedback_records;
create policy mfb_guest_insert on public.mentor_feedback_records for insert
  with check (
    app.is_guest()
    and mentoring_session_id in (select app.guest_mentoring_session_ids())
  );

drop policy if exists clog_guest_insert on public.counseling_logs;
create policy clog_guest_insert on public.counseling_logs for insert
  with check (app.is_guest() and booking_id in (select app.guest_booking_ids()));

-- ---------------------------------------------------------------------
-- (5) 로그인 개방 RPC (SECURITY INVOKER)
--     원장을 볼 권한이 없으면 여기서 막힌다 — 그것이 의도다.
--     반환값은 안내 발송에 필요한 최소 정보다(사업코드 + 성명 + 연락처).
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
      select s.representative, nullif(s.contact ->> 'email', ''), nullif(s.contact ->> 'phone', '')
        into v_name, v_email, v_phone
        from public.startups s
       where s.id = r.master_id and s.deleted_at is null;
      v_user_type := 'external_startup';
      v_company   := r.master_id;
    else
      select e.name, nullif(e.email, ''), nullif(e.phone, '')
        into v_name, v_email, v_phone
        from public.experts e
       where e.id = r.master_id and e.deleted_at is null;
      v_user_type := 'external_expert';
    end if;

    if v_name is null or (v_email is null and v_phone is null) then
      raise exception '원장에 성명 또는 연락처가 없어 로그인을 열 수 없습니다. NETWORKS에서 먼저 보완하십시오.'
        using errcode = '22023';
    end if;

    -- 초대 레코드는 명부 행당 1건이다(uq_guest_invitations_participant).
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

    -- 이미 들어온 사람(ACTIVE)을 초대 전으로 되돌리지 않는다.
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
  '연동 DB 명부 행의 게스트 로그인을 연다(담당자 전용, SECURITY INVOKER). 초대 레코드를 만들고 안내 대상 정보를 돌려준다.';

-- ---------------------------------------------------------------------
-- (6) 로그인 차단 RPC (SECURITY DEFINER)
--     접속 중인 세션까지 끊어야 하므로 users.session_version을 올린다.
--     이 열은 계정 원장 소유라 사업 담당자에게 직접 UPDATE 권한을 줄 수 없다.
-- ---------------------------------------------------------------------
create or replace function public.close_program_guest_access(
  p_participant_ids uuid[],
  p_reason          text default null
)
returns integer
language plpgsql
security definer
set search_path = app, public
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
    select pp.id, pp.program_id, pp.user_id
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 게스트 로그인을 닫을 수 있습니다.' using errcode = '42501';
    end if;

    update public.program_participants
       set login_status = 'BLOCKED',
           updated_at   = now()
     where id = r.id;

    -- 발급된 토큰 무효화. 대상은 이 명부 행에 연결된 외부 게스트 계정으로 한정한다.
    if r.user_id is not null then
      update public.users
         set session_version = session_version + 1
       where id = r.user_id
         and user_type in ('external_startup', 'external_expert', 'temporary_guest');
    end if;

    perform app.log_guest_access(
      r.user_id,
      'GUEST_ACCESS_CLOSE',
      'guest:blocked',
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id),
      p_reason
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.close_program_guest_access(uuid[], text) from public;
grant execute on function public.close_program_guest_access(uuid[], text) to authenticated;

comment on function public.close_program_guest_access(uuid[], text) is
  '연동 DB 명부 행의 게스트 로그인을 닫고 접속 중인 세션까지 무효화한다(담당자 전용).';
