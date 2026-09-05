-- =====================================================================
-- 게스트 접근 기간을 참여 줄에서 **사업**으로 올린다 (2026-09-05)
--
-- 무엇이 달라지는가:
--   종전에는 기간이 `program_participants.access_starts_at/ends_at`에 있어 담당자가
--   기업 한 곳씩 정했다. 이제 사업 원장 3종의 `guest_access_ends_at` 한 칸이 답하고,
--   그 사업의 참여 기업·참여 전문가 전원이 같은 기간을 쓴다.
--
-- 왜 올리는가:
--   기간은 실무에서 **사업의 사실**이지 기업의 사실이 아니다. 사업 하나에 참여 기업이
--   스무 곳이면 종전 구조는 같은 값을 스무 번 적게 했고, 그 스무 값이 어긋날 수 있다는
--   것 자체가 결함이었다 — "이 사업 게스트는 언제까지 들어오나"에 원장이 답을 못 한다.
--   나중에 담은 기업이 무엇을 물려받는지도 정할 근거가 없었다(개방 시점의 기본값을
--   각자 따로 받았을 뿐이다).
--
--   2026-09-05 오전의 결정("기간은 계정이 아니라 참여 줄이 갖는다")과 충돌하지 않는다.
--   그 결정이 가른 것은 **계정 vs 사업**이었다 — 한 계정이 세 사업에 걸리므로 계정에
--   종료일 하나를 달면 답이 없다는 것. 기간을 사업 원장으로 올려도 사업마다 다른 기간을
--   갖는다는 사실은 그대로다. 좁아진 것은 '사업 안에서 기업마다 다를 수 있다'는 자유뿐이고,
--   그 자유가 실제로 필요한 경우(중도 탈락)는 기간이 아니라 **차단**이 답한다.
--
-- 시작일을 두지 않는 이유:
--   연결한 순간이 곧 시작이다. 시작일을 따로 두면 "연결됨인데 아직 못 들어옴"이라는
--   상태가 하나 더 생기고, 담당자는 그것을 상태 열에서 읽을 방법이 없다.
--
-- 함께 더하는 것 — program_participants.created_by:
--   명부 표에 '생성자' 열을 세운다. 이 원장에는 그 컬럼이 없어 화면이 늘 빈 값을 보여
--   주고 있었다(표준 컬럼이 자동으로 서면서 생긴 빈 열). 생성자는 어떤 권한도 주지 않는
--   서술 값이며, 값은 화면이 보내지 않고 트리거가 찍는다.
--
-- 참여 줄 access_* 컬럼을 이 파일에서 지우지 않는 이유:
--   Edge Function(guestAccount·guestSession)이 아직 그 컬럼을 select 한다. 먼저 지우면
--   재배포 전까지 게스트 로그인이 통째로 실패한다(없는 컬럼 조회 → 요청 거절). 여기서는
--   값만 비워 판정에서 빼고(비우면 '제한 없음'이라 사업 기준과 모순되지 않는다),
--   컬럼은 재배포를 확인한 뒤 후속 마이그레이션에서 걷는다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (사업 원장 3종 · 명부는 entity_key가 답한다)
--   - 데이터 등급: Internal (기간·생성자 — 개인정보 아님)
--   - 접근 주체: 내부 사용자(읽기), 사업 담당자 PM·MEMBER(쓰기), 게스트(판정 대상)
--   - Scope 기준: app.is_program_manager(program_id) — 종전 RPC와 같은 기준을 그대로 쓴다
--   - 신규 테이블 없음. 신규 정책 없음(컬럼 추가는 기존 정책이 그대로 덮는다).
--   - 신규 RPC 1종: public.set_program_guest_access_window(uuid, timestamptz) — SECURITY
--     INVOKER다. DEFINER로 만들면 사업 원장의 RLS를 우회하게 되어 정책을 함수 안에
--     복제해야 하고, 그 복제본이 곧 권한 구멍이 된다.
--   - 폐지 RPC 1종: public.set_participant_access_window(uuid, timestamptz, timestamptz)
--   - 감사 로그: GUEST_ACCESS_WINDOW를 그대로 쓰되 payload가 participant_id에서
--     program_id로 바뀐다(대상이 줄에서 사업으로 올라갔으므로).
--   - 컬럼 참조 전수 조사: access_starts_at / access_ends_at 를 본문에 담은 함수 4종
--     (guest_program_ids · guest_my_participations · open_program_guest_access ·
--      guest_accounts_list)을 이 파일에서 함께 재작성한다. 본문은 의존성으로 추적되지
--     않아, 고치지 않으면 호출 순간에만 죽는다.
--   - 운영 영향: 프론트(WORKS 명부·기간 모달·사업 정보 카드)와 Edge Function 2종이
--     같은 커밋에서 함께 바뀐다.
-- 근거: docs/docs_planning/3_9_1_guest_unified_account.md §8,
--       docs/docs_planning/3_4_4_ac_participant_pool.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 사업 원장 3종에 게스트 접근 종료일
--
--     null은 '제한 없음'이다. 사업 종료·취소와 개별 차단은 별개 축으로 여전히 막는다.
-- ---------------------------------------------------------------------
alter table public.programs         add column if not exists guest_access_ends_at timestamptz;
alter table public.ma_programs      add column if not exists guest_access_ends_at timestamptz;
alter table public.project_programs add column if not exists guest_access_ends_at timestamptz;

comment on column public.programs.guest_access_ends_at is
  '이 사업 게스트의 접근 종료. null이면 제한 없음. 참여 기업·전문가 전원에게 같이 걸린다(기업별 예외는 두지 않는다 — 한 곳만 막을 일은 차단이 답한다). 기본값은 사업 종료일 + 14일이며 첫 개방 때 open_program_guest_access가 채운다. 근거: 3_9_1 §8';
comment on column public.ma_programs.guest_access_ends_at is
  '이 사업 게스트의 접근 종료. null이면 제한 없음. 근거: 3_9_1 §8';
comment on column public.project_programs.guest_access_ends_at is
  '이 사업 게스트의 접근 종료. null이면 제한 없음. 근거: 3_9_1 §8';

-- ---------------------------------------------------------------------
-- (2) 참여 줄에 흩어져 있던 값을 사업으로 모은다
--
--     한 사업 안에서 값이 갈려 있으면 **넓은 쪽**을 취한다. 좁히면 어제까지 들어오던
--     게스트가 오늘 갑자기 막히고, 담당자는 그 사실을 어디서도 통보받지 못한다.
--     그래서 열려 있는 줄(INVITED·ACTIVE) 중 '제한 없음'이 하나라도 있으면 사업도
--     제한 없음으로 두고, 전부 값이 있을 때만 그 최댓값을 옮긴다.
-- ---------------------------------------------------------------------
do $mig$
declare
  r record;
begin
  for r in
    select * from (values
      ('programs',         'program'),
      ('ma_programs',      'ma_program'),
      ('project_programs', 'project_program')
    ) as t(tbl, entity_key)
  loop
    execute format($f$
      with w as (
        select pp.program_id,
               bool_or(pp.access_ends_at is null) as has_open_ended,
               max(pp.access_ends_at)             as max_end
          from public.program_participants pp
         where pp.entity_key = %L
           and pp.login_status in ('INVITED', 'ACTIVE')
         group by pp.program_id
      )
      update public.%I p
         set guest_access_ends_at = w.max_end
        from w
       where w.program_id = p.id
         and p.guest_access_ends_at is null
         and not w.has_open_ended
         and w.max_end is not null
    $f$, r.entity_key, r.tbl);
  end loop;
end;
$mig$;

-- 옮긴 뒤 줄 값을 비운다. 컬럼은 남지만 판정에는 끼지 않는다 — 남겨 두면 아직 옛 컬럼을
-- 읽는 Edge Function이 사업 기준보다 좁게 막아, 화면과 로그인이 서로 다른 답을 한다.
update public.program_participants
   set access_starts_at = null,
       access_ends_at   = null
 where access_starts_at is not null
    or access_ends_at   is not null;

comment on column public.program_participants.access_starts_at is
  '[폐지 예정 2026-09-05] 판정에 쓰이지 않는다. 접근 기간은 사업 원장의 guest_access_ends_at이 답한다. Edge Function 재배포 후 컬럼을 걷는다.';
comment on column public.program_participants.access_ends_at is
  '[폐지 예정 2026-09-05] 판정에 쓰이지 않는다. 접근 기간은 사업 원장의 guest_access_ends_at이 답한다. Edge Function 재배포 후 컬럼을 걷는다.';

-- ---------------------------------------------------------------------
-- (3) 명부 행의 생성자
--
--     권한을 주지 않는 서술 값이라 목록에 세워도 관리 주체를 흐리지 않는다(관리 주체는
--     사업 담당자다). 값은 화면이 보내지 않는다 — 보내게 하면 임포터·RPC처럼 화면을
--     거치지 않는 경로에서 비고, 보낸 값을 그대로 믿으면 남의 이름을 적을 수 있다.
-- ---------------------------------------------------------------------
alter table public.program_participants
  add column if not exists created_by uuid references public.users(id);

comment on column public.program_participants.created_by is
  '이 참여 줄을 명부에 담은 사람. 어떤 권한도 주지 않는 서술 값이며 트리거가 찍는다. 옛 행은 알 수 없어 null이다.';

create or replace function app.stamp_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_program_participants_stamp on public.program_participants;
create trigger trg_program_participants_stamp
  before insert on public.program_participants
  for each row execute function app.stamp_participant_insert();

-- ---------------------------------------------------------------------
-- (4) 게스트 조회 판정 — 기간을 사업 원장에서 읽는다
-- ---------------------------------------------------------------------
create or replace function app.guest_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $fn$
  with live as (
    select id, guest_access_ends_at from public.programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.ma_programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.project_programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
  )
  select p.program_id
    from public.program_participants p
    join live g on g.id = p.program_id
   where p.user_id = app.current_app_user_id()
     and p.login_status = 'ACTIVE'
     and p.program_id = app.guest_session_program_id()
     and (g.guest_access_ends_at is null or g.guest_access_ends_at > now());
$fn$;

comment on function app.guest_program_ids() is
  '게스트가 볼 수 있는 사업 집합(로그인 개방 + 사업 생존 + 세션 고정 맥락 일치 + 사업의 접근 기간 유효). 기간은 사업이 갖는다. 근거: 3_9_1 §7~§8';

-- ---------------------------------------------------------------------
-- (5) 본인의 열린 참여 목록 — 반환 열 이름은 그대로 두고 출처만 사업으로 옮긴다
-- ---------------------------------------------------------------------
create or replace function public.guest_my_participations()
returns table (
  participant_id uuid,
  program_id     uuid,
  entity_key     text,
  workspace      text,
  code           text,
  title          text,
  persona        text,
  access_ends_at timestamptz
)
language sql
stable
security definer
set search_path = app, public
as $fn$
  with live as (
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at
      from public.programs         where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'ma_program', id, code, title, guest_access_ends_at
      from public.ma_programs      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'project_program', id, code, title, guest_access_ends_at
      from public.project_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
  )
  select p.id,
         p.program_id,
         p.entity_key,
         app.entity_key_workspace(p.entity_key),
         g.code,
         g.title,
         p.master_table,
         g.guest_access_ends_at
    from public.program_participants p
    join live g
      on g.id = p.program_id
     and g.entity_key = p.entity_key
   where p.user_id = app.current_app_user_id()
     and p.login_status in ('INVITED', 'ACTIVE')
     and (g.guest_access_ends_at is null or g.guest_access_ends_at > now())
   order by g.title;
$fn$;

comment on function public.guest_my_participations() is
  '호출자 본인의 열린 참여 목록. 세션 고정 맥락을 보지 않는다 — 맥락을 고르기 전에 부르는 목록이기 때문이다. 접근 기간은 사업 원장이 답한다. 근거: 3_9_1 §7~§8';

-- ---------------------------------------------------------------------
-- (6) 문 열기 RPC — 기간 기본값을 참여 줄이 아니라 **사업**에 채운다
--
--     기본값을 채우는 자리가 첫 개방인 것은 그대로다(담당자가 아무것도 하지 않아도
--     기간이 있다는 것이 요점이다). 달라진 것은 채워지는 곳이 스무 줄이 아니라 사업
--     한 칸이라는 점이고, 이미 값이 있으면 건드리지 않는다 — 담당자가 정한 값을 새
--     참가자를 담을 때마다 되돌리면 그 설정에 아무 뜻이 없다.
-- ---------------------------------------------------------------------
create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table (
  participant_id uuid,
  program_code   text,
  target_name    text,
  email          text,
  phone          text,
  account_is_new boolean
)
language plpgsql
as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  r           record;
  v_prog      jsonb;
  v_code      text;
  v_status    text;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_company   uuid;
  v_account   uuid;
  v_table     text;
  v_had       boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return;
  end if;

  for r in
    select pp.id, pp.program_id, pp.master_table, pp.master_id, pp.login_status
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    v_prog   := app.program_row(r.program_id);
    v_code   := v_prog ->> 'code';
    v_status := v_prog ->> 'status';

    if not app.is_program_manager(r.program_id) then
      raise exception '사업 담당자(PM·MEMBER)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    if v_status in ('FINISHED', 'CANCELLED') then
      raise exception '종료·취소된 사업은 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;
    if r.master_id is null or r.master_table is null then
      raise exception '원장에 연결되지 않은 참가자는 로그인 대상이 아닙니다.' using errcode = '22023';
    end if;

    -- 계정이 이미 있었는지를 발급 전에 본다(발급은 멱등이라 사후에는 구분되지 않는다).
    -- 이 인격에 매핑이 있거나, 같은 이메일의 계정이 이미 있으면 '기존'이다 — 후자를 함께
    -- 보는 이유는 같은 사람이 다른 자격으로 이미 들어와 있을 수 있고, 그 사람에게는
    -- 초기 비밀번호가 아니라 "기존 비밀번호로 들어오세요"라고 안내해야 하기 때문이다.
    select exists (
      select 1
        from public.guest_identities gi
        join public.users u on u.id = gi.user_id and u.deleted_at is null
       where gi.master_table = r.master_table
         and gi.master_id    = r.master_id
      union all
      select 1
        from public.users u
       where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
         and u.deleted_at is null
         and lower(u.email) = lower(
               case when r.master_table = 'startups'
                    then (select nullif(s.contact ->> 'email', '') from public.startups s where s.id = r.master_id)
                    else (select nullif(n.email, '') from public.networks n where n.id = r.master_id)
               end)
    ) into v_had;

    -- 계정 확보. 원장에 값이 모자라면 여기서 사유와 함께 멈춘다.
    v_account := public.issue_guest_account(r.master_table, r.master_id);

    select u.name, u.email, u.phone, u.company_id
      into v_name, v_email, v_phone, v_company
      from public.users u
     where u.id = v_account;

    -- 초대 레코드는 명부 행당 1건. 사업코드는 로그인 요소가 아니라 안내·식별용으로 남는다.
    update public.guest_invitations
       set business_code     = v_code,
           name              = v_name,
           email             = v_email,
           phone             = v_phone,
           company_id        = v_company,
           app_user_id       = v_account,
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
         app_user_id, target_type, target_id, participant_id, created_by, invite_expires_at)
      select v_code, v_name, v_email, v_phone, u.user_type, v_company,
             v_account, 'PROGRAM', r.program_id, r.id, v_uid, now() + interval '1 year'
        from public.users u where u.id = v_account;
    end if;

    -- 이 사업에 아직 기간이 없으면 기본값(사업 종료일 + 14일)을 채운다. 원장이 셋이라
    -- 테이블 이름을 판정해 동적으로 쓴다. INVOKER라 여기서도 사업 원장의 RLS가 걸리며,
    -- 바로 위에서 담당자임을 확인했으므로 통과한다.
    v_table := case app.program_ws(r.program_id)
                 when 'ac'      then 'programs'
                 when 'mna'     then 'ma_programs'
                 when 'project' then 'project_programs'
               end;
    if v_table is not null and (v_prog ->> 'guest_access_ends_at') is null then
      execute format(
        'update public.%I set guest_access_ends_at = $2, updated_at = now()'
        || ' where id = $1 and guest_access_ends_at is null', v_table)
        using r.program_id, app.default_access_end(r.program_id);
    end if;

    update public.program_participants pp
       set user_id         = coalesce(pp.user_id, v_account),
           login_status    = case when pp.login_status = 'ACTIVE' then 'ACTIVE'::public.participant_login_status
                                  else 'INVITED'::public.participant_login_status end,
           invited_at      = coalesce(pp.invited_at, now()),
           login_opened_by = v_uid,
           login_opened_at = now(),
           updated_at      = now()
     where pp.id = r.id;

    perform app.log_guest_access(
      v_account,
      'GUEST_ACCESS_OPEN',
      'guest:login',
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id,
                         'master_table', r.master_table, 'master_id', r.master_id,
                         'account_is_new', not v_had),
      null
    );

    participant_id := r.id;
    program_code   := v_code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    account_is_new := not v_had;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.open_program_guest_access(uuid[]) from public;
grant execute on function public.open_program_guest_access(uuid[]) to authenticated;

comment on function public.open_program_guest_access(uuid[]) is
  '명부 행에 게스트 계정을 연결하고 문을 연다(사업 담당자 전용, SECURITY INVOKER). 계정이 없으면 만들어 붙이므로 담당자는 신규·기존을 구분하지 않는다. 그 사업에 접근 기간이 아직 없으면 기본값(사업 종료일 + 14일)도 여기서 채운다 — 채우는 곳은 참여 줄이 아니라 사업이다. 근거: 3_9_1 §8·§11.3';

-- ---------------------------------------------------------------------
-- (7) 게스트 계정 목록(ADMIN) — 참여 줄 요약의 기간도 사업에서 읽는다
-- ---------------------------------------------------------------------
create or replace function public.guest_accounts_list(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  user_id        uuid,
  name           text,
  email          text,
  phone          text,
  user_type      text,
  is_active      boolean,
  company_name   text,
  /** 이 계정이 가진 인격들 — [{master_table, master_id, name}]. 참가기업·참가전문가 둘 다 가질 수 있다. */
  identities     jsonb,
  has_password   boolean,
  created_at     timestamptz,
  last_login_at  timestamptz,
  program_count  integer,
  open_count     integer,
  programs       jsonb,
  total_count    bigint
)
language plpgsql
stable
security invoker
set search_path = app, public
as $fn$
#variable_conflict use_column
-- OUT 파라미터 이름이 조회 안의 컬럼과 겹친다. 아래는 전부 별칭으로 한정해 두었지만,
-- 한정을 빠뜨린 한 줄이 조용히 상수로 바뀌는 편이 더 나쁘다.
declare
  v_raw boolean := app.is_admin();
begin
  -- 없는 것과 못 보는 것이 같은 화면이 되지 않도록, 빈 목록이 아니라 사유로 답한다.
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception '내부 사용자만 게스트 계정 목록을 볼 수 있습니다.' using errcode = '42501';
  end if;

  return query
  with ledger as (
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at from public.programs where deleted_at is null
    union all
    select 'ma_program', id, code, title, guest_access_ends_at from public.ma_programs where deleted_at is null
    union all
    select 'project_program', id, code, title, guest_access_ends_at from public.project_programs where deleted_at is null
  ),
  accounts as (
    select u.id, u.name, u.email, u.phone, u.user_type::text as user_type, u.is_active,
           u.created_at, u.company_id
      from public.users u
     where app.is_guest_user_type(u.user_type)
       and u.deleted_at is null
       and (
         nullif(btrim(coalesce(p_search, '')), '') is null
         or u.name  ilike '%' || btrim(p_search) || '%'
         or u.email ilike '%' || btrim(p_search) || '%'
       )
  ),
  links as (
    select pp.user_id                                                     as user_id,
           count(*)::int                                                   as program_count,
           count(*) filter (where pp.login_status in ('INVITED', 'ACTIVE'))::int as open_count,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'program_id',     pp.program_id,
                 'entity_key',     pp.entity_key,
                 'workspace',      app.entity_key_workspace(pp.entity_key),
                 'code',           l.code,
                 'title',          l.title,
                 -- 이 줄의 자격. 같은 계정이 한 사업에 두 자격으로 걸리면 줄이 둘이다.
                 'master_table',   pp.master_table,
                 'login_status',   pp.login_status,
                 -- 기간은 사업이 갖는다. 같은 사업의 두 줄은 같은 값을 본다.
                 'access_ends_at', l.guest_access_ends_at
               )
               order by l.title
             ) filter (where l.id is not null),
             '[]'::jsonb
           ) as programs
      from public.program_participants pp
      left join ledger l on l.id = pp.program_id and l.entity_key = pp.entity_key
     where pp.user_id is not null
     group by pp.user_id
  ),
  logins as (
    select gi.app_user_id as user_id, max(gi.used_at) as last_login_at
      from public.guest_invitations gi
     where gi.app_user_id is not null
     group by gi.app_user_id
  ),
  -- 인격 목록. 유형(user_type)은 계정을 처음 세운 자격의 잔재라 이제 화면을 가르지 않는다 —
  -- 이 계정이 무엇으로 참여하는지는 여기가 답한다.
  personas as (
    select gi.user_id,
           jsonb_agg(
             jsonb_build_object(
               'master_table', gi.master_table,
               'master_id',    gi.master_id,
               'name',         coalesce(s.name, n.name)
             )
             order by gi.master_table
           ) as identities
      from public.guest_identities gi
      left join public.startups s on gi.master_table = 'startups' and s.id = gi.master_id
      left join public.networks n on gi.master_table = 'networks' and n.id = gi.master_id
     group by gi.user_id
  )
  select a.id,
         a.name,
         case when v_raw then a.email else app.mask_email(a.email) end,
         case when v_raw then a.phone else app.mask_phone(a.phone) end,
         a.user_type,
         a.is_active,
         s.name,
         coalesce(p.identities, '[]'::jsonb),
         (c.password_hash is not null),
         a.created_at,
         g.last_login_at,
         coalesce(k.program_count, 0),
         coalesce(k.open_count, 0),
         coalesce(k.programs, '[]'::jsonb),
         count(*) over ()
    from accounts a
    left join links   k on k.user_id = a.id
    left join logins  g on g.user_id = a.id
    left join personas p on p.user_id = a.id
    left join public.guest_credentials c on c.user_id = a.id
    left join public.startups s on s.id = a.company_id
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

revoke all on function public.guest_accounts_list(text, integer, integer) from public;
grant execute on function public.guest_accounts_list(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- (8) 접근 기간 설정 — 대상이 참여 줄에서 사업으로 올라간다
--
--     종전 RPC(set_participant_access_window)는 걷는다. 남겨 두면 화면에는 없는 경로가
--     원장에 살아 있어, 사업 값과 줄 값이 어긋나도 아무도 그 사실을 알지 못한다.
--
--     SECURITY INVOKER다 — 동적 UPDATE도 호출자 권한으로 돌아 사업 원장의 RLS가 그대로
--     걸린다. 함수 안의 담당자 검사는 그 위에 얹는 두 번째 문이며, 어느 하나가 빠져도
--     막힌다.
-- ---------------------------------------------------------------------
drop function if exists public.set_participant_access_window(uuid, timestamptz, timestamptz);

create or replace function public.set_program_guest_access_window(
  p_program_id uuid,
  p_ends       timestamptz default null
)
returns void
language plpgsql
set search_path = app, public
as $fn$
declare
  v_ws    text;
  v_table text;
begin
  if p_program_id is null then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  v_ws := app.program_ws(p_program_id);
  v_table := case v_ws
               when 'ac'      then 'programs'
               when 'mna'     then 'ma_programs'
               when 'project' then 'project_programs'
             end;
  if v_table is null then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  if not app.is_program_manager(p_program_id) then
    raise exception '사업 담당자(PM·MEMBER)만 접근 기간을 정할 수 있습니다.' using errcode = '42501';
  end if;

  -- 지난 날짜를 막지 않는다. 이미 끝난 사업의 문을 지금 닫는 것이 실제 운용이고,
  -- 담당자가 오늘 이후만 고를 수 있으면 그 일을 할 방법이 없다.
  execute format('update public.%I set guest_access_ends_at = $2, updated_at = now() where id = $1', v_table)
    using p_program_id, p_ends;

  perform app.log_guest_access(
    null,
    'GUEST_ACCESS_WINDOW',
    'guest:login',
    jsonb_build_object('program_id', p_program_id, 'workspace', v_ws, 'ends', p_ends),
    null
  );
end;
$fn$;

revoke all on function public.set_program_guest_access_window(uuid, timestamptz) from public;
grant execute on function public.set_program_guest_access_window(uuid, timestamptz) to authenticated;

comment on function public.set_program_guest_access_window(uuid, timestamptz) is
  '이 사업 게스트의 접근 종료일을 정한다(사업 담당자 전용, SECURITY INVOKER). null이면 제한 없음. 참여 기업·전문가 전원에게 같이 걸린다 — 기업별 예외는 두지 않고, 한 곳만 막을 일은 차단이 답한다. 근거: 3_9_1 §8';
