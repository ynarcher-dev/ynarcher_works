-- GUEST independent-account cleanup
--
-- GUEST profile SSOT is public.users(name, email, affiliation). Ledger rows may
-- provide those three scalar values to a client picker, but no ledger key or
-- phone is retained on an account, invitation, or GUEST participation.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- ---------------------------------------------------------------------------
-- 1. Clean existing copies first, then make recurrence impossible.
-- ---------------------------------------------------------------------------

update public.users u
   set phone = null,
       company_id = null,
       updated_at = now()
 where app.is_guest_user_type(u.user_type)
   and (u.phone is not null or u.company_id is not null);

alter table public.users
  drop constraint if exists users_guest_independent_profile;
alter table public.users
  add constraint users_guest_independent_profile
  check (
    user_type not in (
      'external_startup'::public.user_type,
      'external_expert'::public.user_type,
      'temporary_guest'::public.user_type
    )
    or (phone is null and company_id is null)
  ) not valid;
alter table public.users validate constraint users_guest_independent_profile;

comment on constraint users_guest_independent_profile on public.users is
  'GUEST profile is name/email/affiliation only. phone and startup company_id remain available to non-GUEST users.';

-- Only a row whose user_id is a GUEST account loses the legacy polymorphic
-- ledger reference. Business roster rows in program_participant_entries and
-- non-GUEST participant rows are deliberately untouched.
update public.program_participants pp
   set master_table = null,
       master_id = null,
       updated_at = now()
 where pp.user_id is not null
   and (pp.master_table is not null or pp.master_id is not null)
   and exists (
     select 1
       from public.users u
      where u.id = pp.user_id
        and app.is_guest_user_type(u.user_type)
   );

create or replace function app.validate_guest_participant_roster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.user_id is not null
     and (new.master_table is not null or new.master_id is not null)
     and exists (
       select 1
         from public.users u
        where u.id = new.user_id
          and app.is_guest_user_type(u.user_type)
     ) then
    raise exception 'GUEST participation cannot retain a ledger reference.'
      using errcode = '23514', hint = 'guest_participant_must_be_independent';
  end if;

  if new.master_table is null or new.master_id is null then
    return new;
  end if;

  -- Preserve the pre-existing business roster/portfolio integrity checks for
  -- non-GUEST and legacy unassigned rows. Only the retired identity-equality
  -- check was removed above.
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
      raise exception 'Participant target must exist in the business roster.'
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
      raise exception 'Fund participant target must exist in the portfolio.'
        using errcode = '23503', hint = 'guest_requires_portfolio_entry';
    end if;
  end if;
  return new;
end;
$fn$;

revoke all on function app.validate_guest_participant_roster()
  from public, anon, authenticated, service_role;

comment on function app.validate_guest_participant_roster() is
  'Trigger-only guard: GUEST program/FUND participation is keyed by user_id and may not retain master_table/master_id. Non-GUEST and business roster rows are not changed.';

-- Keep legacy invitation columns for the ordered Edge rollout, but retire them
-- as storage. The trigger lets an older writer complete while coercing legacy
-- payload fields to their only valid value (empty).
alter table public.guest_invitations alter column name drop not null;

update public.guest_invitations
   set name = null,
       email = null,
       phone = null,
       company_id = null,
       otp_hash = null,
       otp_expires_at = null,
       otp_attempts = 0,
       password_hash = null,
       password_set_at = null,
       login_attempts = 0,
       locked_until = null,
       target_type = case
         when lower(coalesce(target_type, '')) in
              ('startup', 'startups', 'network', 'networks',
               'ma_seller', 'ma_sellers', 'ma_buyer', 'ma_buyers')
           then null
         else target_type
       end,
       target_id = case
         when lower(coalesce(target_type, '')) in
              ('startup', 'startups', 'network', 'networks',
               'ma_seller', 'ma_sellers', 'ma_buyer', 'ma_buyers')
           then null
         else target_id
       end,
       updated_at = now()
 where name is not null
    or email is not null
    or phone is not null
    or company_id is not null
    or otp_hash is not null
    or otp_expires_at is not null
    or otp_attempts <> 0
    or password_hash is not null
    or password_set_at is not null
    or login_attempts <> 0
    or locked_until is not null
    or lower(coalesce(target_type, '')) in
       ('startup', 'startups', 'network', 'networks',
        'ma_seller', 'ma_sellers', 'ma_buyer', 'ma_buyers');

drop index if exists public.idx_guest_inv_phone;
drop index if exists public.idx_guest_inv_email;

create or replace function app.clear_guest_invitation_legacy_fields()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.name := null;
  new.email := null;
  new.phone := null;
  new.company_id := null;
  new.otp_hash := null;
  new.otp_expires_at := null;
  new.otp_attempts := 0;
  new.password_hash := null;
  new.password_set_at := null;
  new.login_attempts := 0;
  new.locked_until := null;

  if lower(coalesce(new.target_type, '')) in
     ('startup', 'startups', 'network', 'networks',
      'ma_seller', 'ma_sellers', 'ma_buyer', 'ma_buyers') then
    new.target_type := null;
    new.target_id := null;
  end if;
  return new;
end;
$fn$;

revoke all on function app.clear_guest_invitation_legacy_fields()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guest_inv_clear_legacy_fields
  on public.guest_invitations;
create trigger trg_guest_inv_clear_legacy_fields
  before insert or update on public.guest_invitations
  for each row execute function app.clear_guest_invitation_legacy_fields();

alter table public.guest_invitations
  drop constraint if exists guest_invitations_legacy_fields_empty;
alter table public.guest_invitations
  add constraint guest_invitations_legacy_fields_empty
  check (
    name is null
    and email is null
    and phone is null
    and company_id is null
    and otp_hash is null
    and otp_expires_at is null
    and otp_attempts = 0
    and password_hash is null
    and password_set_at is null
    and login_attempts = 0
    and locked_until is null
    and lower(coalesce(target_type, '')) not in
        ('startup', 'startups', 'network', 'networks',
         'ma_seller', 'ma_sellers', 'ma_buyer', 'ma_buyers')
  ) not valid;
alter table public.guest_invitations
  validate constraint guest_invitations_legacy_fields_empty;

comment on constraint guest_invitations_legacy_fields_empty
  on public.guest_invitations is
  'Invitation rows retain participation/access bookkeeping only. Profile, phone, ledger and legacy credential copies must remain empty.';

-- ---------------------------------------------------------------------------
-- 2. Visibility/assignment now follows actual participation, never a ledger.
-- ---------------------------------------------------------------------------

create or replace function app.guest_account_is_unlinked(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select not exists (
    select 1 from public.program_participants pp where pp.user_id = p_user_id
  );
$fn$;

revoke all on function app.guest_account_is_unlinked(uuid)
  from public, anon, service_role;
grant execute on function app.guest_account_is_unlinked(uuid)
  to authenticated;

create or replace function app.guest_account_visible(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and u.deleted_at is null
       and app.is_guest_user_type(u.user_type)
       and (
         app.is_admin()
         or exists (
           select 1
             from public.program_participants pp
            where pp.user_id = u.id
         )
         or not app.guest_account_has_any_participation(u.id)
       )
  );
$fn$;

revoke all on function app.guest_account_visible(uuid)
  from public, anon, service_role;
grant execute on function app.guest_account_visible(uuid)
  to authenticated;

create or replace function app.guest_account_visible_for_assignment(
  p_user_id uuid,
  p_excluded_participant_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.users u
     where u.id = p_user_id
       and u.deleted_at is null
       and app.is_guest_user_type(u.user_type)
       and (
         app.is_admin()
         or exists (
           select 1
             from public.program_participants pp
            where pp.user_id = u.id
              and pp.id is distinct from p_excluded_participant_id
         )
         or not app.guest_account_has_other_participation(
           u.id, p_excluded_participant_id
         )
       )
  );
$fn$;

revoke all on function app.guest_account_visible_for_assignment(uuid, uuid)
  from public, anon, service_role;
grant execute on function app.guest_account_visible_for_assignment(uuid, uuid)
  to authenticated;

-- Ledger merges continue to repoint the business roster and business content,
-- but neither GUEST account identity nor GUEST access participation.
create or replace function app.merge_ref_tables(p_ledger text)
returns table(
  rel_name text,
  type_col text,
  id_col text,
  type_value text,
  conflict_cols text[],
  on_conflict text
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select v.rel_name, v.type_col, v.id_col, v.type_value,
         v.conflict_cols, v.on_conflict
    from (values
      ('attachments', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        null::text[], 'move'),
      ('entity_feedback', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        null::text[], 'move'),
      ('meeting_minute_links', 'target_type', 'target_id',
        case p_ledger when 'startups' then 'startup'
                      when 'networks' then 'network'
                      when 'ma_sellers' then 'ma_seller'
                      when 'ma_buyers' then 'ma_buyer' end,
        array['minute_id'], 'delete'),
      ('program_participant_entries', 'master_table', 'master_id', p_ledger,
        array['entity_key', 'program_id'], 'soft')
    ) as v(rel_name, type_col, id_col, type_value, conflict_cols, on_conflict)
   where v.type_value is not null
     and to_regclass('public.' || v.rel_name) is not null;
$fn$;

revoke all on function app.merge_ref_tables(text)
  from public, anon;
grant execute on function app.merge_ref_tables(text)
  to authenticated, service_role;

-- Remove guest-ledger rows from the shared ledger hard-delete blocker without
-- copying the large unrelated blocker matrix into this migration.
do $do$
declare
  v_sql text;
  v_before text;
begin
  select pg_get_functiondef(
           'public.admin_entity_delete_blockers(text,uuid)'::regprocedure
         )
    into v_sql;
  v_before := v_sql;

  v_sql := replace(v_sql, $snippet$
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          (select count(*) from public.guest_invitations
            where company_id = p_id or (target_type = 'startup' and target_id = p_id))),$snippet$, '');
  v_sql := replace(v_sql, $snippet$
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          ((select count(*) from public.guest_identities
             where master_table = 'ma_buyers' and master_id = p_id)
           + (select count(*) from public.guest_invitations
               where target_type = 'ma_buyer' and target_id = p_id))),$snippet$, '');
  v_sql := replace(v_sql, $snippet$
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          ((select count(*) from public.guest_identities
             where master_table = 'ma_sellers' and master_id = p_id)
           + (select count(*) from public.guest_invitations
               where target_type = 'ma_seller' and target_id = p_id))),$snippet$, '');

  if v_sql = v_before or v_sql ilike '%guest_identities%' then
    raise exception 'admin_entity_delete_blockers dependency rewrite did not match';
  end if;
  execute v_sql;
end;
$do$;

revoke all on function public.admin_entity_delete_blockers(text, uuid)
  from public, anon, service_role;
grant execute on function public.admin_entity_delete_blockers(text, uuid)
  to authenticated;

-- Keep the established hard-delete contract but remove its now-retired
-- identity count/read. The return key stays at zero for rollout compatibility.
do $do$
declare
  v_sql text;
  v_before text;
begin
  select pg_get_functiondef(
           'public.hard_delete_guest_account(uuid,text)'::regprocedure
         )
    into v_sql;
  v_before := v_sql;
  v_sql := replace(v_sql, $snippet$  select count(*)::integer into v_identity_count
    from public.guest_identities where user_id = p_user_id;$snippet$,
    '  v_identity_count := 0;');

  if v_sql = v_before or v_sql ilike '%public.guest_identities%' then
    raise exception 'hard_delete_guest_account dependency rewrite did not match';
  end if;
  execute v_sql;
end;
$do$;

revoke all on function public.hard_delete_guest_account(uuid, text)
  from public, anon, service_role;
grant execute on function public.hard_delete_guest_account(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Account creation: only name/email/affiliation are accepted and stored.
-- ---------------------------------------------------------------------------

drop function if exists public.issue_guest_account(text, uuid, text, text, text, text);
drop function if exists public.create_guest_account(text, text, text, text, uuid, text);

create function public.create_guest_account(
  p_name text,
  p_email text,
  p_affiliation text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor uuid := app.current_app_user_id();
  v_name text := nullif(btrim(p_name), '');
  v_email text := nullif(btrim(p_email), '');
  v_affiliation text := nullif(btrim(p_affiliation), '');
  v_existing uuid;
  v_existing_name text;
  v_new uuid;
begin
  if v_actor is null or app.is_guest() then
    raise exception 'Only internal users may create GUEST accounts.'
      using errcode = '42501';
  end if;
  if v_name is null or v_email is null or v_affiliation is null then
    raise exception 'name, email and affiliation are required.'
      using errcode = '22023';
  end if;
  if length(v_name) > 100 then
    raise exception 'name may not exceed 100 characters.' using errcode = '22023';
  end if;
  if length(v_email) > 254
     or app.norm_email(v_email) !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception 'email format is invalid.' using errcode = '22023';
  end if;
  if length(v_affiliation) > 200 then
    raise exception 'affiliation may not exceed 200 characters.' using errcode = '22023';
  end if;

  select u.id, u.name
    into v_existing, v_existing_name
    from public.users u
   where u.deleted_at is null
     and lower(btrim(u.email)) = app.norm_email(v_email);

  if v_existing is not null then
    if not exists (
      select 1 from public.users u
       where u.id = v_existing and app.is_guest_user_type(u.user_type)
    ) then
      raise exception 'email is already used by an internal account.'
        using errcode = '22023';
    end if;
    if app.norm_entity_name(v_existing_name)
       is distinct from app.norm_entity_name(v_name) then
      raise exception 'email is already used by a different GUEST name.'
        using errcode = '23505', hint = 'guest_email_name_mismatch:' || v_existing;
    end if;
    return v_existing;
  end if;

  insert into public.users(user_type, name, email, affiliation, phone, company_id)
  values ('temporary_guest', v_name, v_email, v_affiliation, null, null)
  returning id into v_new;

  insert into public.workspace_permissions
    (user_id, workspace_key, permission_level, scope_type, scope_id)
  values (v_new, 'guest', 'write', 'self', null)
  on conflict (user_id, workspace_key) do nothing;

  insert into public.guest_credentials(user_id)
  values (v_new)
  on conflict (user_id) do nothing;

  perform app.log_guest_access(
    v_new,
    'GUEST_ACCOUNT_ISSUE',
    'guest:account',
    jsonb_build_object('person_source', 'manual'),
    null
  );
  return v_new;
end;
$fn$;

revoke all on function public.create_guest_account(text, text, text)
  from public, anon, service_role;
grant execute on function public.create_guest_account(text, text, text)
  to authenticated;

comment on function public.create_guest_account(text, text, text) is
  'Canonical internal GUEST account creation API. Persists only name/email/affiliation and creates credential/workspace bookkeeping; no phone or ledger identifier.';

-- Compatibility for the immediately preceding frontend. Legacy phone and
-- ledger arguments are accepted but intentionally ignored.
create function public.create_guest_account(
  p_name text,
  p_email text,
  p_phone text,
  p_master_table text,
  p_master_id uuid,
  p_affiliation text
)
returns uuid
language sql
security invoker
set search_path = ''
as $fn$
  select public.create_guest_account(p_name, p_email, p_affiliation);
$fn$;

revoke all on function public.create_guest_account(text, text, text, text, uuid, text)
  from public, anon, service_role;
grant execute on function public.create_guest_account(text, text, text, text, uuid, text)
  to authenticated;

comment on function public.create_guest_account(text, text, text, text, uuid, text) is
  'Temporary rollout wrapper. p_phone/p_master_table/p_master_id are ignored; remove after all old frontend versions are retired.';

create or replace function public.create_guest_accounts(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_max constant integer := 200;
  v_actor uuid := app.current_app_user_id();
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_failed integer := 0;
  v_row jsonb;
  v_errors jsonb;
  v_index integer;
  v_key text;
  v_name text;
  v_email text;
  v_email_key text;
  v_affiliation text;
  v_user_id uuid;
begin
  if v_actor is null or app.is_guest() then
    raise exception 'Only internal users may create GUEST accounts.'
      using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Input must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > v_max then
    raise exception 'Batch size must be between 1 and %.', v_max using errcode = '22023';
  end if;

  for v_row, v_index in
    select e.value, (e.ordinality - 1)::integer
      from jsonb_array_elements(p_rows) with ordinality as e(value, ordinality)
     order by e.ordinality
  loop
    v_errors := '[]'::jsonb;
    v_user_id := null;
    v_key := nullif(btrim(coalesce(v_row ->> 'key', '')), '');
    v_name := nullif(btrim(coalesce(v_row ->> 'name', '')), '');
    v_email := nullif(btrim(coalesce(v_row ->> 'email', '')), '');
    v_email_key := app.norm_email(v_email);
    v_affiliation := nullif(btrim(coalesce(v_row ->> 'affiliation', '')), '');

    if jsonb_typeof(v_row) <> 'object' then
      v_errors := v_errors || app.guest_batch_error(
        'row', 'ROW_NOT_OBJECT', 'Each row must be an object.');
    else
      if v_name is null then
        v_errors := v_errors || app.guest_batch_error(
          'name', 'NAME_REQUIRED', 'Name is required.');
      elsif length(v_name) > 100 then
        v_errors := v_errors || app.guest_batch_error(
          'name', 'NAME_TOO_LONG', 'Name may not exceed 100 characters.');
      end if;

      if v_email is null then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_REQUIRED', 'Email is required.');
      elsif length(v_email) > 254
         or v_email_key !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_INVALID', 'Email format is invalid.');
      elsif (
        select count(*) > 1
          from jsonb_array_elements(p_rows) d(value)
         where app.norm_email(nullif(btrim(coalesce(d.value ->> 'email', '')), '')) = v_email_key
      ) then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_DUPLICATE_IN_BATCH', 'Email is duplicated in this batch.');
      end if;

      if v_affiliation is null then
        v_errors := v_errors || app.guest_batch_error(
          'affiliation', 'AFFILIATION_REQUIRED', 'Affiliation is required.');
      elsif length(v_affiliation) > 200 then
        v_errors := v_errors || app.guest_batch_error(
          'affiliation', 'AFFILIATION_TOO_LONG', 'Affiliation may not exceed 200 characters.');
      end if;

      if v_key is not null and (
        select count(*) > 1
          from jsonb_array_elements(p_rows) d(value)
         where nullif(btrim(coalesce(d.value ->> 'key', '')), '') = v_key
      ) then
        v_errors := v_errors || app.guest_batch_error(
          'key', 'KEY_DUPLICATE_IN_BATCH', 'Key is duplicated in this batch.');
      end if;
    end if;

    if v_errors = '[]'::jsonb then
      begin
        if exists (
          select 1 from public.users u
           where u.deleted_at is null
             and lower(btrim(u.email)) = v_email_key
        ) then
          if exists (
            select 1 from public.users u
             where u.deleted_at is null
               and lower(btrim(u.email)) = v_email_key
               and app.is_guest_user_type(u.user_type)
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_GUEST', 'A GUEST account already uses this email.');
          else
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_INTERNAL', 'An internal account already uses this email.');
          end if;
        else
          insert into public.users(user_type, name, email, affiliation, phone, company_id)
          values ('temporary_guest', v_name, v_email, v_affiliation, null, null)
          returning id into v_user_id;

          insert into public.workspace_permissions
            (user_id, workspace_key, permission_level, scope_type, scope_id)
          values (v_user_id, 'guest', 'write', 'self', null);
          insert into public.guest_credentials(user_id) values (v_user_id);

          perform app.log_guest_access(
            v_user_id,
            'GUEST_ACCOUNT_ISSUE',
            'guest:account',
            jsonb_build_object(
              'person_source', 'manual',
              'source', 'batch',
              'batch_index', v_index,
              'batch_key', v_key
            ),
            null
          );
        end if;
      exception
        when insufficient_privilege then raise;
        when unique_violation then
          v_user_id := null;
          v_errors := v_errors || app.guest_batch_error(
            'email', 'EMAIL_TAKEN_GUEST', 'Another request just used this email.');
        when others then
          v_user_id := null;
          v_errors := v_errors || app.guest_batch_error(
            'row', 'DB_ERROR', 'This row could not be created.');
      end;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'index', v_index,
      'key', v_key,
      'status', case when v_user_id is null then 'FAILED' else 'CREATED' end,
      'user_id', v_user_id,
      'user_type', case when v_user_id is null then null else 'temporary_guest' end,
      'errors', v_errors
    ));

    if v_user_id is null then v_failed := v_failed + 1;
    else v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total', jsonb_array_length(p_rows),
    'created', v_created,
    'failed', v_failed,
    'rows', v_results
  );
end;
$fn$;

revoke all on function public.create_guest_accounts(jsonb)
  from public, anon, service_role;
grant execute on function public.create_guest_accounts(jsonb)
  to authenticated;

comment on function public.create_guest_accounts(jsonb) is
  'Strict independent GUEST batch creation. Reads only key/name/email/affiliation, never persists legacy phone/master values, and returns no ledger identifiers.';

-- ---------------------------------------------------------------------------
-- 4. ADMIN profile update: name/email/affiliation only.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_update_guest_contact(uuid, text, text, text, text);

create function public.admin_update_guest_contact(
  p_user_id uuid,
  p_name text,
  p_email text,
  p_affiliation text,
  p_reason text,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account public.users%rowtype;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_affiliation text := nullif(btrim(coalesce(p_affiliation, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name_changed boolean;
  v_email_changed boolean;
  v_affiliation_changed boolean;
  v_reset_cleared boolean := false;
  v_session_version integer;
begin
  if not app.is_admin() then
    raise exception 'Only system administrators may update GUEST profiles.'
      using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A change reason is required.' using errcode = '22023';
  end if;
  if v_name is null then
    raise exception 'Name is required.' using errcode = '22023';
  end if;
  if v_email is null then
    raise exception 'Email is required.' using errcode = '22023';
  end if;
  if length(v_email) > 254
     or app.norm_email(v_email) !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception 'Email format is invalid.' using errcode = '22023';
  end if;
  if v_affiliation is null then
    raise exception 'Affiliation is required.' using errcode = '22023';
  end if;
  if length(v_affiliation) > 200 then
    raise exception 'Affiliation may not exceed 200 characters.' using errcode = '22023';
  end if;
  if length(v_name) > 100 then
    raise exception 'Name may not exceed 100 characters.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id and u.deleted_at is null
   for update;
  if not found then
    raise exception 'GUEST account was not found.' using errcode = 'P0002';
  end if;
  if not app.is_guest_user_type(v_account.user_type) then
    raise exception 'Target is not a GUEST account.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.users u
     where u.id <> p_user_id
       and u.deleted_at is null
       and lower(btrim(u.email)) = app.norm_email(v_email)
  ) then
    raise exception 'Email is already used by another account.' using errcode = '23505';
  end if;

  v_name_changed := app.norm_entity_name(v_account.name)
                    is distinct from app.norm_entity_name(v_name);
  v_email_changed := app.norm_email(v_account.email)
                     is distinct from app.norm_email(v_email);
  v_affiliation_changed := nullif(btrim(coalesce(v_account.affiliation, '')), '')
                           is distinct from v_affiliation;

  if not v_name_changed and not v_email_changed and not v_affiliation_changed
     and v_account.phone is null and v_account.company_id is null then
    return jsonb_build_object(
      'user_id', p_user_id,
      'changed', false,
      'name_changed', false,
      'email_changed', false,
      'affiliation_changed', false,
      'session_version', v_account.session_version,
      'applied', null
    );
  end if;

  update public.users
     set name = v_name,
         email = v_email,
         affiliation = v_affiliation,
         phone = null,
         company_id = null,
         session_version = session_version + case when v_email_changed then 1 else 0 end,
         updated_at = now()
   where id = p_user_id
  returning session_version into v_session_version;

  if v_email_changed then
    update public.guest_credentials
       set reset_token_hash = null,
           reset_expires_at = null,
           reset_session_version = null
     where user_id = p_user_id
       and (reset_token_hash is not null
            or reset_expires_at is not null
            or reset_session_version is not null);
    v_reset_cleared := found;
  end if;

  perform app.log_guest_change(
    p_user_id,
    'GUEST_CONTACT_UPDATE',
    'guest:profile',
    jsonb_build_object(
      'name', v_account.name,
      'email', v_account.email,
      'affiliation', v_account.affiliation
    ),
    jsonb_build_object(
      'name', v_name,
      'email', v_email,
      'affiliation', v_affiliation,
      'reset_link_cleared', v_reset_cleared
    ),
    v_reason
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'changed', true,
    'name_changed', v_name_changed,
    'email_changed', v_email_changed,
    'affiliation_changed', v_affiliation_changed,
    'reset_link_cleared', v_reset_cleared,
    'session_version', v_session_version,
    'applied', jsonb_build_object(
      'name', v_name,
      'email', v_email,
      'affiliation', v_affiliation
    )
  );
end;
$fn$;

revoke all on function public.admin_update_guest_contact(uuid, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.admin_update_guest_contact(uuid, text, text, text, text, text)
  to authenticated;

comment on function public.admin_update_guest_contact(uuid, text, text, text, text, text) is
  'ADMIN GUEST profile update. p_name/p_email/p_affiliation/p_reason are required and non-empty. Optional p_phone is ignored for one rollout; name/affiliation changes do not bump session_version, while email changes do.';

-- Exact compatibility endpoint for the deployed five-key UI. Keeping this as
-- a separate overload avoids named-argument ambiguity: old callers provide
-- p_email/p_phone/p_affiliation/p_reason, while the canonical endpoint provides
-- p_name/p_email/p_affiliation/p_reason and omits only its trailing p_phone.
create function public.admin_update_guest_contact(
  p_user_id uuid,
  p_email text,
  p_phone text,
  p_affiliation text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_name text;
begin
  if not app.is_admin() then
    raise exception 'Only system administrators may update GUEST profiles.'
      using errcode = '42501';
  end if;

  select u.name into v_name
    from public.users u
   where u.id = p_user_id
     and u.deleted_at is null;
  if not found then
    raise exception 'GUEST account was not found.' using errcode = 'P0002';
  end if;

  return public.admin_update_guest_contact(
    p_user_id => p_user_id,
    p_name => v_name,
    p_email => p_email,
    p_affiliation => p_affiliation,
    p_reason => p_reason,
    p_phone => p_phone
  );
end;
$fn$;

revoke all on function public.admin_update_guest_contact(uuid, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.admin_update_guest_contact(uuid, text, text, text, text)
  to authenticated;

comment on function public.admin_update_guest_contact(uuid, text, text, text, text) is
  'Temporary exact overload for the deployed p_user_id/p_email/p_phone/p_affiliation/p_reason call. Preserves the current name and ignores phone; remove after old UI retirement.';

-- ---------------------------------------------------------------------------
-- 5. List API: profile plus actual program/FUND participation only.
-- ---------------------------------------------------------------------------

drop function if exists public.guest_accounts_list(text, integer, integer, text, text[], boolean, text);

create function public.guest_accounts_list(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_entity_key text default null,
  p_only_orphans boolean default false
)
returns table(
  user_id uuid,
  name text,
  email text,
  affiliation text,
  user_type text,
  is_active boolean,
  has_password boolean,
  created_at timestamptz,
  last_login_at timestamptz,
  program_count integer,
  open_count integer,
  programs jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_raw boolean := app.is_admin();
  v_term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception 'Only internal users may list GUEST accounts.' using errcode = '42501';
  end if;
  if p_entity_key is not null and p_entity_key not in ('program', 'ma_program', 'fund') then
    raise exception 'Unsupported entity_key: %', p_entity_key using errcode = '22023';
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
    select u.id, u.name, u.email, u.affiliation, u.user_type::text as user_type,
           u.is_active, u.created_at
      from public.users u
     where app.is_guest_user_type(u.user_type)
       and u.deleted_at is null
       and (v_term is null
            or u.name ilike '%' || v_term || '%'
            or u.email ilike '%' || v_term || '%'
            or u.affiliation ilike '%' || v_term || '%')
       and app.guest_account_visible(u.id)
  ),
  participations as (
    select distinct on (p.user_id, p.entity_key, p.program_id)
           p.user_id, p.entity_key, p.program_id, p.login_status
      from public.program_participants p
     where p.user_id is not null
       and (p_entity_key is null or p.entity_key = p_entity_key)
     order by p.user_id, p.entity_key, p.program_id,
              case p.login_status
                when 'ACTIVE' then 1
                when 'INVITED' then 2
                when 'BLOCKED' then 3
                when 'NOT_ALLOWED' then 4
                else 5
              end,
              p.id
  ),
  links as (
    select p.user_id,
           count(*) filter (where l.id is not null)::integer as program_count,
           count(*) filter (
             where l.id is not null and p.login_status in ('INVITED', 'ACTIVE')
           )::integer as open_count,
           coalesce(jsonb_agg(jsonb_build_object(
             'program_id', p.program_id,
             'entity_key', p.entity_key,
             'workspace', app.entity_key_workspace(p.entity_key),
             'code', l.code,
             'title', l.title,
             'login_status', p.login_status,
             'program_status', l.status,
             'access_ends_at', l.guest_access_ends_at
           ) order by l.title, p.program_id) filter (where l.id is not null), '[]'::jsonb) as programs
      from participations p
      left join ledger l on l.id = p.program_id and l.entity_key = p.entity_key
     group by p.user_id
  ),
  logins as (
    select gi.app_user_id as user_id, max(gi.used_at) as last_login_at
      from public.guest_invitations gi
     where gi.app_user_id is not null
     group by gi.app_user_id
  )
  select a.id,
         a.name,
         case when v_raw then a.email else app.mask_email(a.email) end,
         a.affiliation,
         a.user_type,
         a.is_active,
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
   where not coalesce(p_only_orphans, false) or coalesce(k.program_count, 0) = 0
   order by a.is_active desc, a.name, a.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

revoke all on function public.guest_accounts_list(text, integer, integer, text, boolean)
  from public, anon, service_role;
grant execute on function public.guest_accounts_list(text, integer, integer, text, boolean)
  to authenticated;

comment on function public.guest_accounts_list(text, integer, integer, text, boolean) is
  'Independent GUEST account list. Returns profile and real participation only; no phone, company, identity, ledger key, or ledger facet. Deterministic order: active, name, id.';

-- Seven-argument compatibility endpoint for the immediately preceding UI.
-- p_master_tables and p_facet are ignored because ledger classification no
-- longer exists; its response schema is already the new relation-free schema.
create function public.guest_accounts_list(
  p_search text,
  p_limit integer,
  p_offset integer,
  p_entity_key text,
  p_master_tables text[],
  p_only_orphans boolean,
  p_facet text
)
returns table(
  user_id uuid,
  name text,
  email text,
  affiliation text,
  user_type text,
  is_active boolean,
  has_password boolean,
  created_at timestamptz,
  last_login_at timestamptz,
  program_count integer,
  open_count integer,
  programs jsonb,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select * from public.guest_accounts_list(
    p_search, p_limit, p_offset, p_entity_key, p_only_orphans
  );
$fn$;

revoke all on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text)
  from public, anon, service_role;
grant execute on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text)
  to authenticated;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text) is
  'Temporary rollout wrapper. Legacy ledger filters are ignored and the returned rows use the independent-account schema.';

-- Narrow read model for the NETWORKS picker. source_id exists only so the
-- client can maintain selection state; no account-creation API accepts it.
create function public.guest_account_ledger_candidates(
  p_search text default null,
  p_limit integer default 10,
  p_offset integer default 0,
  p_category text default null
)
returns table(
  source_id uuid,
  name text,
  email text,
  affiliation text,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  v_term text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception 'Only internal users may browse GUEST account candidates.'
      using errcode = '42501';
  end if;
  if p_category is not null
     and p_category not in (
       'experts', 'van', 'exp', 'investors', 'startup', 'corporates',
       'institutions', 'universities', 'etc', 'vendors', 'UNSET'
     ) then
    raise exception 'Unsupported NETWORKS category: %', p_category
      using errcode = '22023';
  end if;

  return query
  select n.id,
         n.name,
         n.email,
         n.affiliation,
         count(*) over ()
    from public.networks n
   where n.deleted_at is null
     and n.merged_into_id is null
     and (p_category is null
          or (p_category = 'UNSET' and n.category is null)
          or (p_category <> 'UNSET' and n.category = p_category))
     and (v_term is null
          or n.name ilike '%' || v_term || '%'
          or n.email ilike '%' || v_term || '%'
          or n.affiliation ilike '%' || v_term || '%')
   order by n.name, n.id
   limit least(greatest(coalesce(p_limit, 10), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

revoke all on function public.guest_account_ledger_candidates(text, integer, integer, text)
  from public, anon, service_role;
grant execute on function public.guest_account_ledger_candidates(text, integer, integer, text)
  to authenticated;

comment on function public.guest_account_ledger_candidates(text, integer, integer, text) is
  'Narrow SECURITY INVOKER NETWORKS picker for GUEST profile input. Returns only transient source_id plus name/email/affiliation and count; respects networks RLS and excludes deleted/merged rows.';

-- ---------------------------------------------------------------------------
-- 6. Invitation opening reads the profile at call time and stores bookkeeping.
-- ---------------------------------------------------------------------------

drop function if exists public.open_program_guest_access(uuid[]);

create function public.open_program_guest_access(p_participant_ids uuid[])
returns table(
  participant_id uuid,
  program_code text,
  target_name text,
  email text,
  account_is_new boolean
)
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_uid uuid := app.current_app_user_id();
  r record;
  v_program jsonb;
  v_workspace text;
  v_code text;
  v_status text;
  v_name text;
  v_email text;
  v_account uuid;
  v_table text;
begin
  if v_uid is null then
    raise exception 'Login is required.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return;
  end if;

  for r in
    select pp.id, pp.program_id, pp.login_status, pp.user_id
      from public.program_participants pp
     where pp.id = any(p_participant_ids)
     order by pp.id
  loop
    v_program := app.program_row(r.program_id);
    v_workspace := app.program_ws(r.program_id);
    v_code := v_program ->> 'code';
    v_status := v_program ->> 'status';

    if not app.is_program_manager(r.program_id) then
      raise exception '담당자(PM·MEMBER·운용역)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    if (v_workspace = 'fund' and v_status = 'CLOSED')
       or (v_workspace is distinct from 'fund' and v_status in ('FINISHED', 'CANCELLED')) then
      raise exception 'Access cannot be opened for a closed program.' using errcode = '22023';
    end if;
    if r.user_id is null then
      raise exception 'Participant has no GUEST account.' using errcode = '22023';
    end if;

    v_account := r.user_id;
    select u.name, u.email into v_name, v_email
      from public.users u
     where u.id = v_account
       and u.deleted_at is null
       and u.is_active
       and app.is_guest_user_type(u.user_type);
    if not found then
      raise exception 'Participant does not reference an active GUEST account.' using errcode = '22023';
    end if;

    update public.guest_invitations gi
       set business_code = v_code,
           app_user_id = v_account,
           target_type = 'PROGRAM',
           target_id = r.program_id,
           invite_expires_at = now() + interval '1 year',
           updated_at = now()
     where gi.participant_id = r.id;

    if not found then
      insert into public.guest_invitations(
        business_code, invited_user_type, app_user_id, target_type,
        target_id, participant_id, created_by, invite_expires_at
      )
      select v_code, u.user_type, v_account, 'PROGRAM',
             r.program_id, r.id, v_uid, now() + interval '1 year'
        from public.users u where u.id = v_account;
    end if;

    v_table := case v_workspace
      when 'project' then 'programs'
      when 'mna' then 'ma_programs'
      when 'fund' then 'funds'
    end;
    if v_table is not null and (v_program ->> 'guest_access_ends_at') is null then
      execute format(
        'update public.%I set guest_access_ends_at = $2, updated_at = now()'
        || ' where id = $1 and guest_access_ends_at is null', v_table
      ) using r.program_id, app.default_access_end(r.program_id);
    end if;

    update public.program_participants pp
       set login_status = case when pp.login_status = 'ACTIVE' then 'ACTIVE'::public.participant_login_status
                               else 'INVITED'::public.participant_login_status end,
           invited_at = coalesce(pp.invited_at, now()),
           login_opened_by = v_uid,
           login_opened_at = now(),
           updated_at = now()
     where pp.id = r.id;

    perform app.log_guest_access(
      v_account,
      'GUEST_ACCESS_OPEN',
      'guest:login',
      jsonb_build_object(
        'participant_id', r.id,
        'program_id', r.program_id,
        'workspace', v_workspace,
        'account_is_new', false
      ),
      null
    );

    participant_id := r.id;
    program_code := v_code;
    target_name := v_name;
    email := v_email;
    account_is_new := false;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.open_program_guest_access(uuid[])
  from public, anon, service_role;
grant execute on function public.open_program_guest_access(uuid[])
  to authenticated;

comment on function public.open_program_guest_access(uuid[]) is
  'Opens existing GUEST participation. Reads name/email from users for the notification response and stores only invitation bookkeeping; no phone/profile/ledger copy.';

drop function if exists public.reset_program_guest_password(uuid[]);

-- Every function body must be detached before the table is removed. This guard
-- makes a future dependency addition fail the migration instead of leaving a
-- runtime-only broken function.
do $do$
declare
  v_dependencies text;
begin
  select string_agg(n.nspname || '.' || p.proname ||
                    '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' order by 1)
    into v_dependencies
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'public')
     and p.prokind = 'f'
     and p.prosrc ilike '%guest_identities%';

  if v_dependencies is not null then
    raise exception 'Functions still depend on guest_identities: %', v_dependencies;
  end if;
end;
$do$;

drop table public.guest_identities;

comment on function app.guest_account_is_unlinked(uuid) is
  'True when an independent GUEST account has no program/FUND participation.';
comment on function app.guest_account_visible(uuid) is
  'Internal visibility based on actual visible participation or an unassigned account; never a ledger identity.';
comment on function app.guest_account_visible_for_assignment(uuid, uuid) is
  'Assignment visibility based on actual other participation or an unassigned account; never a ledger identity.';

commit;
