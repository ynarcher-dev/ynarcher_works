-- =====================================================================
-- GUEST 통합 관리와 원장별 식별 규칙
--
-- · GUEST 목록은 내부 사용자에게 한 자리로 제공하되, 호출자가 읽지 못하는 M&A 인격만 가진
--   계정은 계정 자체도 보이지 않게 한다. 일반 사업과 M&A에 함께 참여하는 계정은 보이는
--   인격·사업만 반환한다.
-- · STARTUP·SELLER·BUYER는 살아 있는 행의 사업자번호·이메일·전화 중 하나라도 같으면 막는다.
-- · NETWORKS의 이메일·전화는 이직과 번호 변경이 잦은 현재 연락처이므로 단일 유일키로 삼지
--   않는다. 변경 전 연락처는 profile.contact_history에 보존한다.
--
-- 새 테이블·새 공개 API는 없다. guest_accounts_list는 기존 SECURITY INVOKER를 유지하며,
-- guest_identities와 각 사업 원장의 RLS가 호출자의 시야를 정한다.
-- =====================================================================

-- 빈 값은 null로 떨어지는 기존 immutable 정규화 함수를 그대로 사용한다. 비활성·병합 행은
-- 복구 시 원장 게이트가 다시 확인하므로 활성 정본만 유일성 범위에 든다.
create unique index if not exists uq_startups_email_live
  on public.startups (app.norm_email(email))
  where deleted_at is null and merged_into_id is null and app.norm_email(email) is not null;

create unique index if not exists uq_startups_phone_live
  on public.startups (app.norm_phone(phone))
  where deleted_at is null and merged_into_id is null and app.norm_phone(phone) is not null;

create unique index if not exists uq_ma_sellers_email_live
  on public.ma_sellers (app.norm_email(contact_email))
  where deleted_at is null and merged_into_id is null and app.norm_email(contact_email) is not null;

create unique index if not exists uq_ma_sellers_phone_live
  on public.ma_sellers (app.norm_phone(phone))
  where deleted_at is null and merged_into_id is null and app.norm_phone(phone) is not null;

create unique index if not exists uq_ma_buyers_email_live
  on public.ma_buyers (app.norm_email(contact_email))
  where deleted_at is null and merged_into_id is null and app.norm_email(contact_email) is not null;

create unique index if not exists uq_ma_buyers_phone_live
  on public.ma_buyers (app.norm_phone(phone))
  where deleted_at is null and merged_into_id is null and app.norm_phone(phone) is not null;

create unique index if not exists uq_users_guest_phone
  on public.users (app.norm_phone(phone))
  where user_type in ('external_startup', 'external_expert', 'temporary_guest')
    and deleted_at is null and app.norm_phone(phone) is not null;

comment on index public.uq_startups_email_live is
  '살아 있는 스타트업 원장 안에서 정규화 이메일은 하나다.';
comment on index public.uq_startups_phone_live is
  '살아 있는 스타트업 원장 안에서 숫자만 남긴 전화번호는 하나다.';
comment on index public.uq_ma_sellers_email_live is
  '살아 있는 SELLER 원장 안에서 정규화 이메일은 하나다.';
comment on index public.uq_ma_sellers_phone_live is
  '살아 있는 SELLER 원장 안에서 숫자만 남긴 전화번호는 하나다.';
comment on index public.uq_ma_buyers_email_live is
  '살아 있는 BUYER 원장 안에서 정규화 이메일은 하나다.';
comment on index public.uq_ma_buyers_phone_live is
  '살아 있는 BUYER 원장 안에서 숫자만 남긴 전화번호는 하나다.';
comment on index public.uq_users_guest_phone is
  '활성 GUEST 계정의 초기 비밀번호 원천인 전화번호는 계정 하나에만 속한다.';

-- NETWORKS는 사람 원장이라 연락처가 바뀌어도 같은 id를 유지한다. 처음 채우는 일은 과거값이
-- 없으므로 이력으로 만들지 않고, 기존 이메일 또는 전화가 있던 행에서 값이 달라질 때만 남긴다.
create or replace function app.track_network_contact_history()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $fn$
declare
  v_history jsonb;
begin
  if new.email is not distinct from old.email and new.phone is not distinct from old.phone then
    return new;
  end if;
  if nullif(btrim(coalesce(old.email, '')), '') is null
     and app.norm_phone(old.phone) is null then
    return new;
  end if;

  v_history := coalesce(new.profile -> 'contact_history', '[]'::jsonb);
  new.profile := jsonb_set(
    coalesce(new.profile, '{}'::jsonb),
    '{contact_history}',
    v_history || jsonb_build_array(jsonb_build_object(
      'email', old.email,
      'phone', old.phone,
      'changed_at', clock_timestamp(),
      'changed_by', app.current_app_user_id()
    )),
    true
  );
  return new;
end;
$fn$;

drop trigger if exists trg_networks_contact_history on public.networks;
create trigger trg_networks_contact_history
  before update of email, phone on public.networks
  for each row execute function app.track_network_contact_history();

comment on function app.track_network_contact_history() is
  'NETWORKS 이메일·전화 변경 전 값을 profile.contact_history에 보존한다. 현재 연락처는 유일키가 아니다.';

-- 통합 GUEST 목록. accounts CTE의 마지막 조건이 핵심이다. ADMIN은 전체 계정을 보고, 일반
-- 내부 사용자는 RLS를 통과한 인격이나 임시 게스트 참여가 하나라도 있는 계정만 본다. 따라서
-- M&A 인격만 가진 계정은 mna 권한이 없는 사람에게 고아 계정처럼 새지 않는다.
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
         v_raw
         or exists (
           select 1 from public.guest_identities visible_gi
            where visible_gi.user_id = u.id
         )
         or (
           u.user_type = 'temporary_guest'
           and exists (
             select 1 from public.program_participants visible_pp
              where visible_pp.user_id = u.id
           )
         )
       )
       and (
         p_master_tables is null
         or exists (
           select 1 from public.guest_identities gi
            where gi.user_id = u.id and gi.master_table = any (p_master_tables)
         )
       )
  ),
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
  '전사 GUEST 계정 목록. 호출자가 읽을 수 있는 인격·참여만 반환하며 M&A 전용 계정의 존재도 M&A 권한 밖에 노출하지 않는다.';
