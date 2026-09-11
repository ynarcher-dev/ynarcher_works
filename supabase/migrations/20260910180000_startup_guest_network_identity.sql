-- =====================================================================
-- STARTUP GUEST identity = linked representative in the NETWORKS ledger
--
-- Ownership is intentionally one-way:
--   STARTUP owns representative/team membership and its trigger projects those
--   facts into NETWORKS. NETWORKS may read the projection but cannot insert,
--   edit, hide, or end source='startup_form' rows.
--
-- Security gate (docs/docs_dev/11_migration_security_gate.md)
--   owner workspaces: startup, networks, guest
--   data class: Personal (name/email/phone)
--   actors: authenticated internal users; guests remain rejected by the RPC
--   scope: one startup row and its linked representative network row
--   audit: existing app.log_guest_access call, with representative network id
--   RLS: derived affiliation writes are denied to clients and performed only by
--        a private trigger function with a pinned empty search_path
-- =====================================================================

-- A NETWORKS row is one person identity. It must not point at multiple guest
-- accounts, even when that person participates through several organizations.
create unique index if not exists uq_guest_identities_network_person
  on public.guest_identities (master_id)
  where master_table = 'networks';

-- Manual and bulk affiliation rows remain editable by internal users. Rows
-- projected from STARTUP are owned exclusively by the STARTUP form/trigger.
drop policy if exists network_affiliations_insert on public.network_affiliations;
create policy network_affiliations_insert on public.network_affiliations for insert
  with check (
    app.is_internal_user()
    and source <> 'startup_form'
  );

drop policy if exists network_affiliations_update on public.network_affiliations;
create policy network_affiliations_update on public.network_affiliations for update
  using (
    app.is_internal_user()
    and source <> 'startup_form'
  )
  with check (
    app.is_internal_user()
    and source <> 'startup_form'
  );

comment on policy network_affiliations_insert on public.network_affiliations is
  '내부 사용자는 수동·일괄 관계만 등록할 수 있다. startup_form 관계는 STARTUP 원장의 동기화 트리거만 만든다.';
comment on policy network_affiliations_update on public.network_affiliations is
  '내부 사용자는 수동·일괄 관계만 수정·내리기할 수 있다. startup_form 관계의 변경·종료는 STARTUP 원장에서만 한다.';

-- The trigger needs to write rows that ordinary clients are now forbidden to
-- mutate. It is private, has no caller-controlled arguments, and can run only
-- after the caller has already passed the STARTUP table's INSERT/UPDATE RLS.
create or replace function app.sync_startup_affiliations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE'
     and OLD.representative_network_id is not distinct from NEW.representative_network_id
     and OLD.team_profile is not distinct from NEW.team_profile
     and OLD.deleted_at is not distinct from NEW.deleted_at then
    return NEW;
  end if;

  with wanted as (
    select network_id, title from (
      select distinct on (network_id) network_id, title, prio
        from (
          select NEW.representative_network_id as network_id, '대표'::text as title, 0 as prio
           where NEW.deleted_at is null and NEW.representative_network_id is not null
          union all
          select member_id, member_title, 1
            from (
              select case
                       when lower(coalesce(m ->> 'networkId', '')) ~
                            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                         then (m ->> 'networkId')::uuid
                     end as member_id,
                     nullif(btrim(coalesce(m ->> 'role', '')), '') as member_title
                from pg_catalog.jsonb_array_elements(
                  coalesce(NEW.team_profile -> 'members', '[]'::jsonb)
                ) m
               where NEW.deleted_at is null
            ) mm
           where member_id is not null
        ) t
       order by network_id, prio
    ) d
  ),
  closed as (
    update public.network_affiliations a
       set ended_on = current_date
     where a.org_type = 'startup'
       and a.org_id = NEW.id
       and a.source = 'startup_form'
       and a.deleted_at is null
       and a.ended_on is null
       and not exists (select 1 from wanted w where w.network_id = a.network_id)
    returning a.id
  ),
  retitled as (
    update public.network_affiliations a
       set title = w.title
      from wanted w
     where a.org_type = 'startup'
       and a.org_id = NEW.id
       and a.network_id = w.network_id
       and a.source = 'startup_form'
       and a.deleted_at is null
       and a.ended_on is null
       and a.title is distinct from w.title
    returning a.id
  )
  insert into public.network_affiliations (
    network_id, org_type, org_id, title, started_on, source
  )
  select w.network_id, 'startup', NEW.id, w.title, current_date, 'startup_form'
    from wanted w
   where not exists (
     select 1
       from public.network_affiliations a
      where a.org_type = 'startup'
        and a.org_id = NEW.id
        and a.network_id = w.network_id
        and a.deleted_at is null
        and a.ended_on is null
   );

  return NEW;
end $$;

revoke all on function app.sync_startup_affiliations() from public, anon, authenticated, service_role;

comment on function app.sync_startup_affiliations() is
  'STARTUP 대표자·핵심인력을 NETWORKS 관계 원장으로 일방향 투영한다. startup_form 관계의 생성·변경·종료는 이 트리거만 수행한다.';

create or replace function public.issue_guest_account(
  p_master_table text,
  p_master_id    uuid,
  p_name         text default null,
  p_email        text default null,
  p_phone        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid                       uuid := app.current_app_user_id();
  v_existing                  uuid;
  v_name                      text;
  v_email                     text;
  v_phone                     text;
  v_user_type                 text;
  v_company                   uuid;
  v_new                       uuid;
  v_email_key                 text;
  v_source                    text;
  v_representative_network_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if app.is_guest() then
    raise exception '내부 사용자만 게스트 계정을 발급할 수 있습니다.' using errcode = '42501';
  end if;
  if p_master_table is null or p_master_id is null then
    raise exception '원장과 대상을 지정해야 합니다.' using errcode = '22023';
  end if;
  if p_master_table not in ('startups', 'networks', 'ma_sellers', 'ma_buyers') then
    raise exception '지원하지 않는 원장입니다: %', p_master_table using errcode = '22023';
  end if;

  if p_master_table = 'startups' then
    -- STARTUP is the participating organization; the linked NETWORKS row is the
    -- login person and is the only source for name/email/phone.
    select s.representative_network_id,
           nullif(btrim(n.name), ''),
           nullif(btrim(n.email), ''),
           nullif(btrim(n.phone), '')
      into v_representative_network_id, v_name, v_email, v_phone
      from public.startups s
      left join public.networks n
        on n.id = s.representative_network_id
       and n.deleted_at is null
       and n.merged_into_id is null
     where s.id = p_master_id
       and s.deleted_at is null
       and s.merged_into_id is null;

    if not found then
      raise exception 'STARTUP 원장에서 대상을 찾을 수 없습니다.' using errcode = '22023';
    end if;
    if v_representative_network_id is null then
      raise exception 'STARTUP에서 대표자를 NETWORKS 원장에 연결한 뒤 계정을 발급하십시오.'
        using errcode = '22023';
    end if;
    if v_name is null then
      raise exception '연결된 대표자 NETWORKS 원장을 사용할 수 없습니다. 비활성·병합 상태를 확인하십시오.'
        using errcode = '22023';
    end if;

    v_user_type := 'external_startup';
    v_company := p_master_id;
    v_source := 'representative_network';

    -- Serialize account issuance for one canonical person.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('guest-network:' || v_representative_network_id::text, 0)
    );
  elsif p_master_table = 'networks' then
    select nullif(btrim(n.name), ''), nullif(btrim(n.email), ''), nullif(btrim(n.phone), '')
      into v_name, v_email, v_phone
      from public.networks n
     where n.id = p_master_id and n.deleted_at is null and n.merged_into_id is null;
    v_user_type := 'external_expert';
    v_source := 'ledger';
    v_representative_network_id := p_master_id;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('guest-network:' || p_master_id::text, 0)
    );
  elsif p_master_table = 'ma_sellers' then
    select nullif(btrim(x.contact_name), ''), nullif(btrim(x.contact_email), ''), nullif(btrim(x.phone), '')
      into v_name, v_email, v_phone
      from public.ma_sellers x
     where x.id = p_master_id and x.deleted_at is null;
    v_user_type := 'external_startup';
  elsif p_master_table = 'ma_buyers' then
    select nullif(btrim(x.contact_name), ''), nullif(btrim(x.contact_email), ''), nullif(btrim(x.phone), '')
      into v_name, v_email, v_phone
      from public.ma_buyers x
     where x.id = p_master_id and x.deleted_at is null;
    v_user_type := 'external_startup';
  end if;

  if not found then
    raise exception '원장에서 대상을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  -- Caller overrides remain available for M&A and direct NETWORKS issuance.
  -- STARTUP deliberately ignores them: the linked representative ledger is SSOT.
  if p_master_table <> 'startups' then
    v_source := case
      when coalesce(nullif(btrim(p_email), ''), nullif(btrim(p_name), ''), nullif(btrim(p_phone), '')) is null
        then 'ledger' else 'specified'
    end;
    v_name  := coalesce(nullif(btrim(p_name), ''), v_name);
    v_email := coalesce(nullif(btrim(p_email), ''), v_email);
    v_phone := coalesce(nullif(btrim(p_phone), ''), v_phone);
  end if;

  if v_name is null then
    raise exception '이름이 없어 계정을 세울 수 없습니다. 원장에서 보완하십시오.' using errcode = '22023';
  end if;
  if v_email is null then
    raise exception '이메일이 없어 계정을 세울 수 없습니다(이메일이 로그인 ID입니다). 원장에서 보완하십시오.'
      using errcode = '22023';
  end if;
  v_email_key := lower(v_email);

  -- NETWORKS identity is stable even if its contact fields later change.
  if v_representative_network_id is not null then
    select gi.user_id
      into v_existing
      from public.guest_identities gi
      join public.users u on u.id = gi.user_id and u.deleted_at is null
     where gi.master_table = 'networks'
       and gi.master_id = v_representative_network_id;

    if v_existing is not null then
      insert into public.guest_identities (master_table, master_id, user_id, created_by)
      values (p_master_table, p_master_id, v_existing, v_uid)
      on conflict do nothing;

      perform app.log_guest_access(
        v_existing,
        'GUEST_IDENTITY_ADD',
        'guest:account',
        pg_catalog.jsonb_build_object(
          'master_table', p_master_table,
          'master_id', p_master_id,
          'representative_network_id', v_representative_network_id,
          'person_source', v_source
        ),
        null
      );
      return v_existing;
    end if;
  else
    select gi.user_id
      into v_existing
      from public.guest_identities gi
      join public.users u on u.id = gi.user_id and u.deleted_at is null
     where gi.master_table = p_master_table
       and gi.master_id = p_master_id
       and lower(u.email) = v_email_key;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  if exists (
    select 1
      from public.users u
     where u.deleted_at is null
       and lower(u.email) = v_email_key
       and not app.is_guest_user_type(u.user_type)
  ) then
    raise exception '이 이메일은 내부 임직원 계정입니다. 게스트 계정은 다른 주소로 세우십시오.'
      using errcode = '22023';
  end if;

  select u.id
    into v_existing
    from public.users u
   where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
     and u.deleted_at is null
     and lower(u.email) = v_email_key;

  if v_existing is null then
    if v_phone is null then
      raise exception '연락처가 없어 계정을 세울 수 없습니다(연락처가 초기 비밀번호입니다). 원장에서 보완하십시오.'
        using errcode = '22023';
    end if;

    insert into public.users (user_type, name, email, phone, company_id)
    values (v_user_type::public.user_type, v_name, v_email, v_phone, v_company)
    returning id into v_new;

    insert into public.workspace_permissions (
      user_id, workspace_key, permission_level, scope_type, scope_id
    )
    values (v_new, 'guest', 'write', 'self'::public.scope_type, null)
    on conflict (user_id, workspace_key) do nothing;

    insert into public.guest_credentials (user_id)
    values (v_new)
    on conflict (user_id) do nothing;
  else
    v_new := v_existing;
  end if;

  insert into public.guest_identities (master_table, master_id, user_id, created_by)
  values (p_master_table, p_master_id, v_new, v_uid)
  on conflict do nothing;

  if v_representative_network_id is not null then
    insert into public.guest_identities (master_table, master_id, user_id, created_by)
    values ('networks', v_representative_network_id, v_new, v_uid)
    on conflict do nothing;
  end if;

  perform app.log_guest_access(
    v_new,
    case when v_existing is null then 'GUEST_ACCOUNT_ISSUE' else 'GUEST_IDENTITY_ADD' end,
    'guest:account',
    pg_catalog.jsonb_build_object(
      'master_table', p_master_table,
      'master_id', p_master_id,
      'representative_network_id', v_representative_network_id,
      'person_source', v_source
    ),
    null
  );

  return v_new;
end;
$fn$;

revoke all on function public.issue_guest_account(text, uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.issue_guest_account(text, uuid, text, text, text)
  to authenticated;

comment on function public.issue_guest_account(text, uuid, text, text, text) is
  'GUEST 계정을 발급한다. STARTUP은 참여 조직이고 로그인 명의는 representative_network_id가 가리키는 NETWORKS 사람 원장만 사용한다. STARTUP 인격과 NETWORKS 인격을 같은 계정에 함께 연결한다.';
