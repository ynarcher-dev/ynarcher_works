-- =====================================================================
-- GUEST 계정 · 참가 명단 정합성
--
-- 정본은 세 층으로 고정한다.
--   1) users.email                 : 로그인 계정(활성 계정 전체에서 하나)
--   2) guest_identities            : 그 계정이 어느 원장의 누구인가
--   3) program_participant_entries : 실제 사업 참가 여부
--      program_participants        : 위 참가자에게 붙는 GUEST 로그인 문
--
-- 과거에는 3)의 두 표가 독립적으로 자라, 계정 목록에는 참가 사업이 보이는데 사업 상세의
-- 참가 명단은 비어 있는 상태가 가능했다. 기존 GUEST 연결은 참가 의도가 있었던 기록이므로
-- 버리지 않고 참가 명단으로 승격한 뒤, 앞으로는 명단 없는 GUEST 연결을 DB가 거절한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 로그인 이메일은 내부·게스트를 가리지 않고 활성 계정 전체에서 하나
-- ---------------------------------------------------------------------
update public.users
   set email = nullif(btrim(email), '')
 where email is distinct from nullif(btrim(email), '');

do $fn$
declare
  v_duplicate text;
begin
  select lower(btrim(email))
    into v_duplicate
    from public.users
   where deleted_at is null and nullif(btrim(email), '') is not null
   group by lower(btrim(email))
  having count(*) > 1
   limit 1;

  if v_duplicate is not null then
    raise exception '활성 계정에 중복 이메일이 남아 있어 정리할 수 없습니다: %', v_duplicate
      using errcode = '23505', hint = 'merge_or_correct_duplicate_user_email_first';
  end if;
end;
$fn$;

create or replace function app.normalize_user_email()
returns trigger
language plpgsql
set search_path = app, public
as $fn$
begin
  new.email := nullif(btrim(new.email), '');
  return new;
end;
$fn$;

revoke all on function app.normalize_user_email() from public, anon, authenticated;

drop trigger if exists trg_users_normalize_email on public.users;
create trigger trg_users_normalize_email
  before insert or update of email on public.users
  for each row execute function app.normalize_user_email();

create unique index if not exists uq_users_email_live
  on public.users (lower(btrim(email)))
  where deleted_at is null and nullif(btrim(email), '') is not null;

drop index if exists public.uq_users_guest_email;
drop index if exists public.uq_users_internal_email;

comment on index public.uq_users_email_live is
  '로그인 ID인 이메일은 활성 users 전체에서 하나다(내부·게스트 교차 중복 포함, 공백·대소문자 무시). 같은 사람의 여러 자격은 users 행을 늘리지 않고 guest_identities를 늘린다.';

-- ---------------------------------------------------------------------
-- (2) 기존 GUEST 연결을 실제 참가 명단에 보존
-- ---------------------------------------------------------------------
insert into public.program_participant_entries
  (entity_key, program_id, master_table, master_id, created_by, created_at)
select p.entity_key, p.program_id, p.master_table, p.master_id, p.created_by, p.created_at
  from public.program_participants p
 where p.entity_key in ('program', 'ma_program')
   and p.master_table is not null
   and p.master_id is not null
   and not exists (
     select 1
       from public.program_participant_entries e
      where e.entity_key = p.entity_key
        and e.program_id = p.program_id
        and e.master_table = p.master_table
        and e.master_id = p.master_id
        and e.deleted_at is null
   );

-- GUEST 연결은 반드시 실제 명단(사업·M&A) 또는 포트폴리오(FUND)에 이미 있어야 한다.
create or replace function app.validate_guest_participant_roster()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  -- 인격 없는 임시 게스트는 가리킬 원장이 없으므로 기존 GUEST 연결 자체를 정본으로 둔다.
  if new.master_table is null or new.master_id is null then
    return new;
  end if;

  -- 참가 줄의 계정은 반드시 바로 그 원장 인격에 연결된 계정이어야 한다. 이메일로 찾은 다른
  -- users 행을 잘못 끼워 넣어도 화면에서는 이름이 비슷해 보여 발견하기 어렵기 때문에 FK에
  -- 준하는 이 검사를 다형 매핑 트리거가 맡는다.
  if new.user_id is not null and not exists (
    select 1
      from public.guest_identities gi
     where gi.user_id = new.user_id
       and gi.master_table = new.master_table
       and gi.master_id = new.master_id
  ) then
    raise exception '선택한 계정은 이 참가자의 자격에 연결된 계정이 아닙니다.'
      using errcode = '23503', hint = 'participant_user_identity_mismatch';
  end if;

  if new.entity_key in ('program', 'ma_program') then
    if not exists (
      select 1
        from public.program_participant_entries e
       where e.entity_key = new.entity_key
         and e.program_id = new.program_id
         and e.master_table = new.master_table
         and e.master_id = new.master_id
         and e.deleted_at is null
    ) then
      raise exception '실제 참가 명단에 없는 대상에게 GUEST 계정을 연결할 수 없습니다. 참가 명단에 먼저 추가하세요.'
        using errcode = '23503', hint = 'guest_requires_roster_entry';
    end if;
  elsif new.entity_key = 'fund' then
    if new.master_table <> 'startups' or not exists (
      select 1
        from public.investments i
       where i.fund_id = new.program_id
         and i.startup_id = new.master_id
         and i.deleted_at is null
    ) then
      raise exception '포트폴리오에 없는 기업에게 조합 GUEST 계정을 연결할 수 없습니다.'
        using errcode = '23503', hint = 'guest_requires_portfolio_entry';
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function app.validate_guest_participant_roster()
  from public, anon, authenticated;

drop trigger if exists trg_program_participants_validate_roster
  on public.program_participants;
create trigger trg_program_participants_validate_roster
  before insert or update of entity_key, program_id, master_table, master_id, user_id
  on public.program_participants
  for each row execute function app.validate_guest_participant_roster();

-- 실제 참가 명단을 먼저 빼서 GUEST 연결만 고아로 남기는 순서도 막는다. 계정 자체를 지우라는
-- 뜻이 아니라, 해당 사업의 GUEST 설정에서 연결을 거둔 뒤 명단을 정리하라는 의미다.
create or replace function app.prevent_roster_removal_with_guest()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if old.deleted_at is null and new.deleted_at is not null and exists (
    select 1
      from public.program_participants p
     where p.entity_key = old.entity_key
       and p.program_id = old.program_id
       and p.master_table = old.master_table
       and p.master_id = old.master_id
  ) then
    raise exception 'GUEST 계정 연결이 남아 있어 참가 명단에서 뺄 수 없습니다. GUEST 설정에서 해당 연결을 먼저 제거하세요.'
      using errcode = '23503', hint = 'remove_guest_link_first';
  end if;
  return new;
end;
$fn$;

revoke all on function app.prevent_roster_removal_with_guest()
  from public, anon, authenticated;

drop trigger if exists trg_program_participant_entries_guard_removal
  on public.program_participant_entries;
create trigger trg_program_participant_entries_guard_removal
  before update of deleted_at on public.program_participant_entries
  for each row execute function app.prevent_roster_removal_with_guest();

-- ---------------------------------------------------------------------
-- (3) GUEST 계정 목록의 '참여 프로젝트'도 실제 참가 명단을 정본으로 읽는다
-- ---------------------------------------------------------------------
create or replace function public.guest_accounts_list(
  p_search        text    default null,
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_entity_key    text    default null,
  p_master_tables text[]  default null,
  p_only_orphans  boolean default false
)
returns table(user_id uuid, name text, email text, phone text, user_type text, is_active boolean,
              company_name text, identities jsonb, has_password boolean,
              created_at timestamptz, last_login_at timestamptz,
              program_count integer, open_count integer, programs jsonb, total_count bigint)
language plpgsql
stable
security invoker
set search_path = app, public
as $fn$
#variable_conflict use_column
declare
  v_raw boolean := app.is_admin();
begin
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception '내부 사용자만 게스트 계정 목록을 볼 수 있습니다.' using errcode = '42501';
  end if;
  if p_entity_key is not null and p_entity_key not in ('program', 'ma_program', 'fund') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;
  if p_master_tables is not null and exists (
    select 1 from unnest(p_master_tables) t
     where t not in ('startups', 'networks', 'ma_sellers', 'ma_buyers')
  ) then
    raise exception '알 수 없는 인격 원장이 섞여 있습니다.' using errcode = '22023';
  end if;

  return query
  with ledger as (
    select 'program'::text as entity_key, id, code, title, status::text as status,
           guest_access_ends_at
      from public.programs where deleted_at is null
    union all
    select 'ma_program', id, code, title, status::text, guest_access_ends_at
      from public.ma_programs where deleted_at is null
    union all
    select 'fund', id, code, name, status::text, guest_access_ends_at
      from public.funds where deleted_at is null
  ),
  accounts as (
    select u.id, u.name, u.email, u.phone, u.user_type::text as user_type, u.is_active,
           u.created_at, u.company_id
      from public.users u
     where app.is_guest_user_type(u.user_type)
       and u.deleted_at is null
       and (
         nullif(btrim(coalesce(p_search, '')), '') is null
         or u.name ilike '%' || btrim(p_search) || '%'
         or u.email ilike '%' || btrim(p_search) || '%'
       )
       and (
         p_master_tables is null
         or exists (
           select 1 from public.guest_identities gi
            where gi.user_id = u.id and gi.master_table = any (p_master_tables)
         )
       )
  ),
  -- 실제 참가의 정본. 사업·M&A는 참가 명단, FUND는 포트폴리오다.
  roster_links as (
    select distinct gi.user_id, e.entity_key, e.program_id, e.master_table, e.master_id
      from public.guest_identities gi
      join public.program_participant_entries e
        on e.master_table = gi.master_table and e.master_id = gi.master_id
       and e.deleted_at is null
     where p_entity_key is null or e.entity_key = p_entity_key
    union
    select distinct gi.user_id, 'fund', i.fund_id, 'startups', i.startup_id
      from public.guest_identities gi
      join public.investments i
        on gi.master_table = 'startups' and i.startup_id = gi.master_id
       and i.deleted_at is null
     where p_entity_key is null or p_entity_key = 'fund'
    union
    -- 인격 원장이 없는 임시 게스트만 기존 연결이 참가 사실의 유일한 근거다.
    select distinct p.user_id, p.entity_key, p.program_id, p.master_table, p.master_id
      from public.program_participants p
      join public.users u on u.id = p.user_id and u.deleted_at is null
     where p.user_id is not null
       and p.master_table is null
       and u.user_type = 'temporary_guest'
       and (p_entity_key is null or p.entity_key = p_entity_key)
  ),
  links as (
    select r.user_id,
           count(*)::int as program_count,
           count(*) filter (where gp.login_status in ('INVITED', 'ACTIVE'))::int as open_count,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'program_id', r.program_id,
                 'entity_key', r.entity_key,
                 'workspace', app.entity_key_workspace(r.entity_key),
                 'code', l.code,
                 'title', l.title,
                 'master_table', r.master_table,
                 'login_status', coalesce(gp.login_status, 'NOT_ALLOWED'),
                 'program_status', l.status,
                 'access_ends_at', l.guest_access_ends_at
               ) order by l.title
             ) filter (where l.id is not null),
             '[]'::jsonb
           ) as programs
      from roster_links r
      left join ledger l on l.id = r.program_id and l.entity_key = r.entity_key
      left join public.program_participants gp
        on gp.user_id = r.user_id
       and gp.entity_key = r.entity_key
       and gp.program_id = r.program_id
       and gp.master_table is not distinct from r.master_table
       and gp.master_id is not distinct from r.master_id
     group by r.user_id
  ),
  logins as (
    select gi.app_user_id as user_id, max(gi.used_at) as last_login_at
      from public.guest_invitations gi
     where gi.app_user_id is not null
     group by gi.app_user_id
  ),
  personas as (
    select gi.user_id,
           jsonb_agg(
             jsonb_build_object(
               'master_table', gi.master_table,
               'master_id', gi.master_id,
               'name', coalesce(s.name, n.name, ms.name, mb.name)
             ) order by gi.master_table
           ) as identities
      from public.guest_identities gi
      left join public.startups s
        on gi.master_table = 'startups' and s.id = gi.master_id
      left join public.networks n
        on gi.master_table = 'networks' and n.id = gi.master_id
      left join public.ma_sellers ms
        on gi.master_table = 'ma_sellers' and ms.id = gi.master_id
      left join public.ma_buyers mb
        on gi.master_table = 'ma_buyers' and mb.id = gi.master_id
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
         app.guest_has_password(a.id),
         a.created_at,
         g.last_login_at,
         coalesce(k.program_count, 0),
         coalesce(k.open_count, 0),
         coalesce(k.programs, '[]'::jsonb),
         count(*) over ()
    from accounts a
    left join links k on k.user_id = a.id
    left join logins g on g.user_id = a.id
    left join personas p on p.user_id = a.id
    left join public.startups s on s.id = a.company_id
   where not coalesce(p_only_orphans, false) or coalesce(k.program_count, 0) = 0
   order by a.is_active desc, a.name
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

revoke all on function public.guest_accounts_list(text, integer, integer, text, text[], boolean)
  from public, anon;
grant execute on function public.guest_accounts_list(text, integer, integer, text, text[], boolean)
  to authenticated;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean) is
  '게스트 계정 목록. 참여 프로젝트는 실제 참가 명단(program_participant_entries), 조합은 포트폴리오(investments)를 정본으로 삼고 GUEST 로그인 상태만 program_participants에서 읽는다.';
