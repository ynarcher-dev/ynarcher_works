-- =====================================================================
-- 참가자 명부에서 '역할(role)' 축을 걷는다 (2026-09-05)
--
-- 왜 지우는가:
--   명부의 자격은 2026-09-05에 상위 탭 둘(참여 기업 / 참여 전문가)로 올라갔고, 그 자격은
--   **어느 원장에서 왔는가**(master_table: startups / networks)가 답한다. 역할 enum 7종은
--   그 위에 얹힌 두 번째 분류축이었는데, 실제로 답하는 질문이 없다 —
--     * 화면을 가르지 않는다(게스트가 볼 메뉴는 자격이 정한다).
--     * 권한을 가르지 않는다(문은 login_status가, 기간은 access_* 가 답한다).
--     * 나머지 5값(MENTOR·JUDGE·INVESTOR·STAFF·OBSERVER)은 2026-09-03에 걷힌 정형 모듈
--       7종(서면·대면평가·멘토링·매칭·데모데이…)이 쓰던 값이라 지금은 근거 화면이 없다.
--   남은 둘(STARTUP·EXPERT)은 master_table의 사본일 뿐이고, 사본은 언제나 어긋날 수 있다 —
--   '참여 전문가' 탭에서 담은 행의 역할을 STARTUP으로 고를 수 있었다.
--
-- 함께 걷는 것: role_tags(자유 태그 배열). 어느 화면도 읽지 않았고 역할과 같은 축이다.
--
-- 중복 처리:
--   유일 인덱스가 (program_id, master_table, master_id, role)이라, role이 다르면 같은 대상이
--   한 사업에 두 줄로 들어올 수 있었다. role을 걷으면 그 두 줄은 같은 사실을 두 번 적은 것이
--   되므로 한 줄로 합친다. 물리 삭제 금지 원칙과 충돌하지 않는다 — 지우는 것은 업무 기록이
--   아니라 같은 기록의 사본이며, 사본을 남기면 "어느 줄이 이 대상의 참여인가"에 답할 수 없다.
--   지는 줄을 다른 표가 참조하고 있으면 합치지 않고 **멈춘다**(합치는 편이 나은지 사람이 판단).
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (행마다 entity_key가 답한다 — 변경 없음)
--   - 데이터 등급: Internal (개인정보 포함 — 마스킹 정책 변경 없음)
--   - 접근 주체: 내부 사용자 + 게스트(SELECT 한정) — 변경 없음
--   - Scope 기준: app.can_access_ws_program(app.entity_key_workspace(entity_key), program_id) — 변경 없음
--   - 신규 테이블/정책/SECURITY DEFINER 없음. 재작성하는 함수 3종은 인가 조건을 그대로 두고
--     사라진 컬럼 참조만 뺀다(guest_my_participations는 반환 열이 줄어 drop 후 재생성).
--   - 감사 로그: 게스트 문 열기 로그(GUEST_ACCESS_OPEN)의 payload에서 'role' 키가 빠진다.
--     남은 키(participant_id·program_id·master_table·master_id)로 대상은 그대로 특정된다.
--   - 운영 영향: 프론트(WORKS 명부·모달·컬럼, GUEST 마이페이지)와 Edge Function(guestAccount·
--     guest-auth-refresh)이 같은 커밋에서 함께 바뀐다. 표를 지우는 것이 아니라 컬럼을
--     지우므로 함수 본문 전수 조사를 이 파일에서 마쳤다(pp.role / p.role / r.role 3곳).
-- 근거: docs/docs_planning/3_9_1_guest_unified_account.md,
--       docs/docs_planning/3_4_4_ac_participant_pool.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) role이 갈라 두었던 중복 줄을 한 줄로 합친다
-- ---------------------------------------------------------------------
do $$
declare
  v_ref  record;
  v_cnt  bigint;
  v_dups bigint;
begin
  create temporary table _pp_dedup on commit drop as
  with ranked as (
    select id,
           first_value(id) over w as keep_id,
           row_number()    over w as rn
      from public.program_participants
     where master_id is not null
       and master_table is not null
    window w as (
      partition by entity_key, program_id, master_table, master_id
      -- 살아 있는 줄을 남긴다 — 실제로 들어온 적 있는 줄이 그 대상의 참여다.
      order by case login_status
                 when 'ACTIVE'      then 0
                 when 'INVITED'     then 1
                 when 'BLOCKED'     then 2
                 when 'NOT_ALLOWED' then 3
                 else 4
               end,
               created_at
    )
  )
  select id, keep_id from ranked where rn > 1;

  select count(*) into v_dups from _pp_dedup;
  if v_dups = 0 then
    raise notice '명부 중복 없음 — 합칠 줄이 없습니다.';
    return;
  end if;

  -- 지는 줄을 다른 표가 물고 있으면 멈춘다. guest_invitations는 on delete cascade로 따라오고
  -- 그 행은 이 참여 줄에 딸린 초대 기록이라 함께 사라지는 것이 맞다.
  for v_ref in
    select c.conrelid::regclass::text as tbl, a.attname as col
      from pg_constraint c
      join pg_attribute  a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype   = 'f'
       and c.confrelid = 'public.program_participants'::regclass
       and c.conrelid <> 'public.guest_invitations'::regclass
  loop
    execute format(
      'select count(*) from %s t join _pp_dedup d on d.id = t.%I', v_ref.tbl, v_ref.col
    ) into v_cnt;
    if v_cnt > 0 then
      raise exception '중복 명부 줄을 %.%가 참조하고 있어 합칠 수 없습니다(%건). 사람이 먼저 정리해야 합니다.',
        v_ref.tbl, v_ref.col, v_cnt;
    end if;
  end loop;

  -- 남는 줄이 아직 계정에 붙지 않았는데 지는 줄에 계정이 있으면 그 연결만 옮긴다.
  update public.program_participants k
     set user_id    = l.user_id,
         updated_at = now()
    from _pp_dedup d
    join public.program_participants l on l.id = d.id
   where k.id = d.keep_id
     and k.user_id is null
     and l.user_id is not null;

  delete from public.program_participants p
   using _pp_dedup d
   where p.id = d.id;

  raise notice '명부 중복 %건을 한 줄로 합쳤습니다.', v_dups;
end $$;

-- ---------------------------------------------------------------------
-- (2) 컬럼을 걷는다
--     cascade인 이유: role이 낀 유일 제약 두 개(uq_program_participants_master,
--     unique(program_id, user_id, role))가 컬럼에 딸려 있고, 이름은 원장이 만들어진
--     경로마다 다를 수 있어 손으로 나열하면 한쪽이 남는다.
-- ---------------------------------------------------------------------
-- cascade는 이 컬럼에 딸린 무엇이든 함께 지운다. 인덱스·제약은 그것이 의도지만 정책까지
-- 조용히 사라지면 그 순간 접근면이 넓어진다. 그런 정책이 있으면 여기서 멈춘다.
do $$
declare
  v_pol text;
begin
  select string_agg(p.polname, ', ')
    into v_pol
    from pg_policy p
   where p.polrelid = 'public.program_participants'::regclass
     and (
       coalesce(pg_get_expr(p.polqual,      p.polrelid), '') ~ '\mrole(_tags)?\M'
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~ '\mrole(_tags)?\M'
     );
  if v_pol is not null then
    raise exception '정책 %가 role 컬럼을 참조합니다. cascade로 함께 지워지므로 먼저 다시 쓰세요.', v_pol;
  end if;
end $$;

alter table public.program_participants drop column if exists role      cascade;
alter table public.program_participants drop column if exists role_tags cascade;

-- 같은 대상을 한 사업에 두 번 올리지 못하게 한다. role이 빠졌으므로 이제 축은
-- '어느 사업의 어느 원장 행인가' 하나다.
create unique index if not exists uq_program_participants_master
  on public.program_participants (entity_key, program_id, master_table, master_id)
  where master_id is not null;

comment on index public.uq_program_participants_master is
  '한 사업에 같은 원장 행은 한 줄. 자격은 master_table이 답하므로 기업과 전문가는 서로 다른 줄이다.';

-- ---------------------------------------------------------------------
-- (3) 사라진 컬럼을 읽던 함수 3종 재작성
--     본문(문자열)은 의존성으로 추적되지 않는다 — 컬럼을 지워도 함수는 살아남아
--     호출 순간에만 죽는다. 그래서 여기서 함께 고친다.
-- ---------------------------------------------------------------------

-- (3-1) 열린 참여 목록 — 반환 열이 줄어 drop 후 재생성한다.
drop function if exists public.guest_my_participations();

create function public.guest_my_participations()
returns table (
  participant_id uuid,
  program_id     uuid,
  entity_key     text,
  workspace      text,
  code           text,
  title          text,
  /** 이 줄의 자격 — startups(참여 기업) | networks(참여 전문가). 게스트가 볼 화면을 가르는 축. */
  persona        text,
  access_ends_at timestamptz
)
language sql
stable
security definer
set search_path = app, public
as $fn$
  with live as (
    select 'program'::text as entity_key, id, code, title
      from public.programs         where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'ma_program', id, code, title
      from public.ma_programs      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'project_program', id, code, title
      from public.project_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
  )
  select p.id,
         p.program_id,
         p.entity_key,
         app.entity_key_workspace(p.entity_key),
         g.code,
         g.title,
         p.master_table,
         p.access_ends_at
    from public.program_participants p
    join live g
      on g.id = p.program_id
     and g.entity_key = p.entity_key
   where p.user_id = app.current_app_user_id()
     and p.login_status in ('INVITED', 'ACTIVE')
     and (p.access_starts_at is null or p.access_starts_at <= now())
     and (p.access_ends_at   is null or p.access_ends_at   >  now())
   order by g.title;
$fn$;

revoke all on function public.guest_my_participations() from public;
grant execute on function public.guest_my_participations() to authenticated;

comment on function public.guest_my_participations() is
  '호출자 본인의 열린 참여 목록. 세션 고정 맥락을 보지 않는다 — 맥락을 고르기 전에 부르는 목록이기 때문이다. 파라미터를 두지 않아 남의 id를 넣을 자리가 없다. 근거: 3_9_1 §7';

-- (3-2) 문 열기 RPC — 감사 로그 payload에서 role 키가 빠진다.
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

    update public.program_participants pp
       set user_id         = coalesce(pp.user_id, v_account),
           login_status    = case when pp.login_status = 'ACTIVE' then 'ACTIVE'::public.participant_login_status
                                  else 'INVITED'::public.participant_login_status end,
           invited_at      = coalesce(pp.invited_at, now()),
           login_opened_by = v_uid,
           login_opened_at = now(),
           access_ends_at  = coalesce(pp.access_ends_at, app.default_access_end(r.program_id)),
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

-- (3-3) 게스트 계정 목록 — 참여 줄 요약 jsonb에서 role 키가 빠진다.
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
    select 'program'::text as entity_key, id, code, title from public.programs where deleted_at is null
    union all
    select 'ma_program', id, code, title from public.ma_programs where deleted_at is null
    union all
    select 'project_program', id, code, title from public.project_programs where deleted_at is null
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
                 'access_ends_at', pp.access_ends_at
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
-- (4) enum 자체를 걷는다
--     은퇴 원장(_retired_*)이 아직 이 타입을 물고 있다. 그 표는 통합 전 백업이라 값은
--     그대로 둬야 하므로 컬럼만 text로 바꾼다(라벨은 보존, 타입 의존만 끊긴다).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['_retired_ma_program_participants', '_retired_project_program_participants']
  loop
    if to_regclass('public.' || t) is not null
       and exists (
         select 1 from information_schema.columns
          where table_schema = 'public' and table_name = t and column_name = 'role'
       )
    then
      execute format('alter table public.%I alter column role type text using role::text', t);
    end if;
  end loop;
end $$;

drop type if exists public.program_participant_role;
