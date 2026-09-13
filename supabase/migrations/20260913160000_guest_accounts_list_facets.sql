-- =====================================================================
-- GUEST 계정 관리 탭 — 인격·FUND 참여·분류 미연결을 서버 페이징 전에 분류
--
-- 화면에서 받은 한 페이지를 다시 거르면 전체 건수와 페이지가 틀어진다. 목록 RPC가
-- 계정을 고르는 CTE에서 탭을 적용하고, 여러 인격을 가진 계정은 각 탭 질의에 각각 답한다.
-- `unlinked`는 다른 다섯 탭 어디에도 속하지 않는 계정이다. 즉 원장 인격이 없고 FUND
-- 참여도 없다. PROJECT·M&A 사업에 계정만 추가한 경우도 원장 인격이 없으므로 여기서
-- 다시 찾을 수 있다. 숨은 연결을 오인하지 않도록 DEFINER 판정을 쓴다.
-- =====================================================================

create or replace function app.guest_account_is_unlinked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select not exists (
           select 1 from public.guest_identities gi where gi.user_id = p_user_id
         )
     and not exists (
           select 1
             from public.program_participants pp
            where pp.user_id = p_user_id and pp.entity_key = 'fund'
         );
$fn$;

revoke all on function app.guest_account_is_unlinked(uuid)
  from public, anon, service_role;
grant execute on function app.guest_account_is_unlinked(uuid)
  to authenticated;

comment on function app.guest_account_is_unlinked(uuid) is
  'GUEST 계정에 원장 인격과 FUND 참여가 모두 없는지만 답한다. PROJECT·M&A에 계정만 추가한 경우도 미연결 탭에 남는다. 숨은 연결도 세되 내용은 반환하지 않는 SECURITY DEFINER 판정이다.';

-- 기본 인자가 있는 옛 6인자 함수와 새 7인자 함수가 함께 있으면 짧은 호출이 모호해진다.
drop function if exists public.guest_accounts_list(text, integer, integer, text, text[], boolean);

create function public.guest_accounts_list(
  p_search        text    default null,
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_entity_key    text    default null,
  p_master_tables text[]  default null,
  p_only_orphans  boolean default false,
  p_facet         text    default null
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
  v_raw   boolean := app.is_admin();
  v_term  text    := nullif(btrim(coalesce(p_search, '')), '');
  v_digit text    := app.norm_phone(p_search);
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
  if p_facet is not null
     and p_facet not in ('startups', 'networks', 'ma_sellers', 'ma_buyers', 'fund', 'unlinked') then
    raise exception '알 수 없는 GUEST 계정 탭입니다: %', p_facet using errcode = '22023';
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
         v_term is null
         or u.name  ilike '%' || v_term || '%'
         or u.email ilike '%' || v_term || '%'
         or (v_digit is not null and app.norm_phone(u.phone) like '%' || v_digit || '%')
       )
       and app.guest_account_visible(u.id)
       and (
         p_master_tables is null
         or exists (
           select 1 from public.guest_identities gi
            where gi.user_id = u.id and gi.master_table = any (p_master_tables)
         )
       )
       and (
         p_facet is null
         or (
           p_facet in ('startups', 'networks', 'ma_sellers', 'ma_buyers')
           and exists (
             select 1 from public.guest_identities gi
              where gi.user_id = u.id and gi.master_table = p_facet
           )
         )
         or (
           p_facet = 'fund'
           and exists (
             select 1
               from public.program_participants pp
               join public.funds f on f.id = pp.program_id and f.deleted_at is null
              where pp.user_id = u.id and pp.entity_key = 'fund'
           )
         )
         or (p_facet = 'unlinked' and app.guest_account_is_unlinked(u.id))
       )
  ),
  participations as (
    select distinct on (p.user_id, p.entity_key, p.program_id)
           p.user_id, p.entity_key, p.program_id, p.master_table, p.login_status
      from public.program_participants p
     where p.user_id is not null
       and (p_entity_key is null or p.entity_key = p_entity_key)
     order by p.user_id, p.entity_key, p.program_id,
              case p.login_status
                when 'ACTIVE'      then 1
                when 'INVITED'     then 2
                when 'BLOCKED'     then 3
                when 'NOT_ALLOWED' then 4
                else 5
              end,
              p.master_table nulls last,
              p.id
  ),
  links as (
    select t.user_id,
           count(*) filter (where l.id is not null)::int as program_count,
           count(*) filter (
             where l.id is not null and t.login_status in ('INVITED', 'ACTIVE')
           )::int as open_count,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'program_id', t.program_id,
                 'entity_key', t.entity_key,
                 'workspace', app.entity_key_workspace(t.entity_key),
                 'code', l.code,
                 'title', l.title,
                 'master_table', t.master_table,
                 'login_status', t.login_status,
                 'program_status', l.status,
                 'access_ends_at', l.guest_access_ends_at
               ) order by l.title
             ) filter (where l.id is not null),
             '[]'::jsonb
           ) as programs
      from participations t
      left join ledger l on l.id = t.program_id and l.entity_key = t.entity_key
     group by t.user_id
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
     where case gi.master_table
             when 'ma_sellers' then app.can_read_ma_party('ma_seller', gi.master_id)
             when 'ma_buyers'  then app.can_read_ma_party('ma_buyer',  gi.master_id)
             else true
           end
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

revoke all on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text)
  from public, anon;
grant execute on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text)
  to authenticated;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text) is
  '전사 GUEST 계정 목록. p_facet은 스타트업·전문가·BUYER·SELLER 인격, FUND 참여, 분류 미연결을 서버 페이징 전에 분류한다. 한 계정의 복수 인격은 각 탭에 각각 나타나며, 원장 인격 없이 PROJECT·M&A에 계정만 추가한 경우는 미연결에 남는다. 참여 사업과 M&A 인격은 호출자가 읽을 수 있는 범위만 반환한다.';
