-- =====================================================================
-- GUEST 계정 중앙 생성 + 관리자 생명주기
--
-- 생성·조회는 모든 내부 사용자에게 열고, 정지·해제·하드 삭제만 최고관리자가 수행한다.
-- 워크스페이스 화면과 통합 GUEST 원장은 create_guest_account 하나를 호출한다.
-- 하드 삭제는 계정·인증자료를 지우되 업무 기록은 지우지 않고 nullable 사용자 참조만
-- 익명화한다. 필수 업무 참조가 있으면 레코드를 임의 삭제하지 않고 전체 작업을 거부한다.
--
-- 보안 게이트:
--   · 두 공개 함수는 SECURITY DEFINER지만 search_path를 비우고 함수 안에서 주체를 재검증한다.
--   · 익명/PUBLIC 실행권한은 회수하고 authenticated에만 명시적으로 연다.
--   · 동적 SQL의 식별자는 사용자 입력이 아니라 pg_catalog의 FK 메타데이터에서만 읽고 %I로
--     인용한다. 값은 USING 바인딩한다.
-- =====================================================================

begin;

-- 누적 감사 액션 목록에 영구 삭제를 추가한다.
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
set search_path = ''
as $fn$
begin
  if p_action not in (
    'GUEST_ACCESS_OPEN',
    'GUEST_ACCESS_CLOSE',
    'GUEST_ACCESS_REOPEN',
    'GUEST_ACCESS_REMOVE',
    'GUEST_ACCESS_WINDOW',
    'GUEST_ACCOUNT_ISSUE',
    'GUEST_ACCOUNT_RESTORE',
    'GUEST_ACCOUNT_SUSPEND',
    'GUEST_ACCOUNT_HARD_DELETE',
    'GUEST_IDENTITY_ADD',
    'GUEST_PASSWORD_RESET',
    'GUEST_PASSWORD_RESET_SEND'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, changed_workspace,
    after_permission, after_data, reason
  ) values (
    app.current_app_user_id(), p_target_user_id, p_action, 'guest',
    p_after, p_data, p_reason
  );
end;
$fn$;

revoke all on function app.log_guest_access(uuid, text, text, jsonb, text)
  from public, anon, service_role;
grant execute on function app.log_guest_access(uuid, text, text, jsonb, text)
  to authenticated;

-- 계정부터 만드는 중앙 경로. 원장은 선택이며, 선택하면 기존 발급 함수가 인격까지 붙인다.
create or replace function public.create_guest_account(
  p_name         text,
  p_email        text,
  p_phone        text,
  p_master_table text default null,
  p_master_id    uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor         uuid := app.current_app_user_id();
  v_name          text := nullif(btrim(p_name), '');
  v_email         text := nullif(btrim(p_email), '');
  v_phone         text := nullif(btrim(p_phone), '');
  v_existing      uuid;
  v_existing_name text;
  v_new           uuid;
begin
  if v_actor is null or app.is_guest() then
    raise exception '내부 사용자만 GUEST 계정을 생성할 수 있습니다.' using errcode = '42501';
  end if;

  if (p_master_table is null) <> (p_master_id is null) then
    raise exception '원장을 연결하려면 원장 종류와 대상을 함께 지정해야 합니다.' using errcode = '22023';
  end if;

  if p_master_table is not null then
    return public.issue_guest_account(
      p_master_table,
      p_master_id,
      v_name,
      v_email,
      v_phone
    );
  end if;

  if v_name is null or v_email is null or v_phone is null then
    raise exception '이름, 이메일, 연락처를 모두 입력해야 합니다.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.users u
     where u.deleted_at is null
       and lower(u.email) = lower(v_email)
       and not app.is_guest_user_type(u.user_type)
  ) then
    raise exception '이 이메일은 내부 임직원 계정입니다. GUEST 계정은 다른 주소로 생성하십시오.'
      using errcode = '22023';
  end if;

  select u.id, u.name
    into v_existing, v_existing_name
    from public.users u
   where u.deleted_at is null
     and app.is_guest_user_type(u.user_type)
     and lower(u.email) = lower(v_email);

  if v_existing is not null then
    if app.norm_entity_name(v_existing_name) is distinct from app.norm_entity_name(v_name) then
      raise exception '이 이메일(%)은 다른 사람(%)의 GUEST 계정에 쓰이고 있습니다.',
        v_email, v_existing_name
        using errcode = '23505', hint = 'guest_email_name_mismatch:' || v_existing;
    end if;
    return v_existing;
  end if;

  insert into public.users (user_type, name, email, phone)
  values ('temporary_guest', v_name, v_email, v_phone)
  returning id into v_new;

  insert into public.workspace_permissions
    (user_id, workspace_key, permission_level, scope_type, scope_id)
  values (v_new, 'guest', 'write', 'self', null)
  on conflict (user_id, workspace_key) do nothing;

  insert into public.guest_credentials (user_id)
  values (v_new)
  on conflict (user_id) do nothing;

  perform app.log_guest_access(
    v_new,
    'GUEST_ACCOUNT_ISSUE',
    'guest:account',
    jsonb_build_object('person_source', 'manual', 'master_table', null, 'master_id', null),
    null
  );

  return v_new;
end;
$fn$;

revoke all on function public.create_guest_account(text, text, text, text, uuid)
  from public, anon, service_role;
grant execute on function public.create_guest_account(text, text, text, text, uuid)
  to authenticated;

comment on function public.create_guest_account(text, text, text, text, uuid) is
  '모든 내부 화면이 공유하는 GUEST 계정 생성 경로. 원장은 선택이며, 없으면 temporary_guest를 만들고 있으면 issue_guest_account로 인격을 연결한다.';

create or replace function public.hard_delete_guest_account(
  p_user_id uuid,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account          public.users%rowtype;
  v_ref              record;
  v_count            bigint;
  v_blockers         text[] := array[]::text[];
  v_identity_count   integer := 0;
  v_participant_count integer := 0;
  v_invitation_count integer := 0;
  v_notification_count integer := 0;
  v_memo_count       integer := 0;
  v_anonymized_count integer := 0;
begin
  if not app.is_admin() then
    raise exception 'GUEST 계정은 시스템 관리자만 영구 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '삭제 사유를 입력해야 합니다.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id and u.deleted_at is null
   for update;
  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not app.is_guest_user_type(v_account.user_type) then
    raise exception 'GUEST 계정이 아닙니다.' using errcode = '22023';
  end if;

  select count(*)::integer into v_identity_count
    from public.guest_identities where user_id = p_user_id;
  select count(*)::integer into v_participant_count
    from public.program_participants where user_id = p_user_id;
  select count(*)::integer into v_invitation_count
    from public.guest_invitations where app_user_id = p_user_id;
  select count(*)::integer into v_notification_count
    from public.notifications where recipient_id = p_user_id;
  select count(*)::integer into v_memo_count
    from public.quick_memos where user_id = p_user_id;

  -- 개인에게만 속하는 전달·인증 자료는 업무 기록이 아니므로 계정과 함께 제거한다.
  delete from public.guest_invitations where app_user_id = p_user_id;
  delete from public.notifications where recipient_id = p_user_id;
  delete from public.quick_memos where user_id = p_user_id;

  -- 필수 참조는 임의로 지울 수도, null로 만들 수도 없다. 무엇이 막는지 모두 모아 한 번에 답한다.
  for v_ref in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class cls on cls.oid = con.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
      join pg_catalog.pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.users'::regclass
       and pg_catalog.array_length(con.conkey, 1) = 1
       and att.attnotnull
       and con.confdeltype in ('a', 'r')
       and ns.nspname = 'public'
  loop
    execute pg_catalog.format(
      'select count(*) from %I.%I where %I = $1',
      v_ref.schema_name, v_ref.table_name, v_ref.column_name
    ) into v_count using p_user_id;
    if v_count > 0 then
      v_blockers := pg_catalog.array_append(
        v_blockers,
        pg_catalog.format('%I.%I(%s건)', v_ref.table_name, v_ref.column_name, v_count)
      );
    end if;
  end loop;

  if pg_catalog.array_length(v_blockers, 1) is not null then
    raise exception '필수 업무 참조가 남아 있어 삭제할 수 없습니다: %',
      pg_catalog.array_to_string(v_blockers, ', ')
      using errcode = '23503';
  end if;

  -- 업무 행은 보존한다. 사용자 FK가 nullable인 모든 곳에서 대상 계정 참조만 익명화한다.
  for v_ref in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class cls on cls.oid = con.conrelid
      join pg_catalog.pg_namespace ns on ns.oid = cls.relnamespace
      join pg_catalog.pg_attribute att
        on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
     where con.contype = 'f'
       and con.confrelid = 'public.users'::regclass
       and pg_catalog.array_length(con.conkey, 1) = 1
       and not att.attnotnull
       and con.confdeltype in ('a', 'r')
       and ns.nspname = 'public'
  loop
    execute pg_catalog.format(
      'update %I.%I set %I = null where %I = $1',
      v_ref.schema_name, v_ref.table_name, v_ref.column_name, v_ref.column_name
    ) using p_user_id;
    get diagnostics v_count = row_count;
    v_anonymized_count := v_anonymized_count + v_count::integer;
  end loop;

  perform app.log_guest_access(
    p_user_id,
    'GUEST_ACCOUNT_HARD_DELETE',
    'guest:deleted',
    jsonb_build_object(
      'user_id', p_user_id,
      'name', v_account.name,
      'email', v_account.email,
      'user_type', v_account.user_type,
      'identity_count', v_identity_count,
      'participant_unlinked_count', v_participant_count,
      'invitation_count', v_invitation_count,
      'notification_count', v_notification_count,
      'memo_count', v_memo_count,
      'anonymized_reference_count', v_anonymized_count
    ),
    btrim(p_reason)
  );

  -- credentials·identities·workspace_permissions 등 계정 종속 행은 FK CASCADE로 함께 사라진다.
  delete from public.users where id = p_user_id;

  return jsonb_build_object(
    'identities', v_identity_count,
    'participants_unlinked', v_participant_count,
    'invitations_deleted', v_invitation_count,
    'notifications_deleted', v_notification_count,
    'memos_deleted', v_memo_count,
    'references_anonymized', v_anonymized_count
  );
end;
$fn$;

revoke all on function public.hard_delete_guest_account(uuid, text)
  from public, anon, service_role;
grant execute on function public.hard_delete_guest_account(uuid, text)
  to authenticated;

comment on function public.hard_delete_guest_account(uuid, text) is
  'ADMIN 전용 GUEST 계정 물리 삭제. 인증·개인 자료를 제거하고 업무 기록의 nullable 사용자 참조는 익명화한다. 필수 참조가 남으면 전부 롤백한다.';

-- 목록 체크 작업은 한 요청·한 트랜잭션으로 끝낸다. 클라이언트가 계정마다 RPC를 반복하면 중간
-- 실패 때 일부만 바뀐 채 남으므로, 중복 id를 접고 서버 안에서 단건 규칙을 그대로 반복한다.
create or replace function public.set_guest_accounts_active(
  p_user_ids uuid[],
  p_active   boolean,
  p_reason   text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid;
  v_count   integer := 0;
begin
  if not app.is_admin() then
    raise exception 'GUEST 계정 상태는 시스템 관리자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;
  if coalesce(pg_catalog.array_length(p_user_ids, 1), 0) = 0 then
    raise exception '변경할 계정을 하나 이상 선택해야 합니다.' using errcode = '22023';
  end if;
  if not p_active and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '정지 사유를 입력해야 합니다.' using errcode = '22023';
  end if;

  for v_user_id in
    select distinct picked.id from pg_catalog.unnest(p_user_ids) as picked(id)
     where picked.id is not null
     order by picked.id
  loop
    perform public.set_guest_account_active(v_user_id, p_active, p_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

revoke all on function public.set_guest_accounts_active(uuid[], boolean, text)
  from public, anon, service_role;
grant execute on function public.set_guest_accounts_active(uuid[], boolean, text)
  to authenticated;

comment on function public.set_guest_accounts_active(uuid[], boolean, text) is
  'ADMIN 전용 GUEST 계정 일괄 정지·해제. 선택 전체를 한 트랜잭션에서 처리하며 단건 감사 규칙을 그대로 적용한다.';

create or replace function public.hard_delete_guest_accounts(
  p_user_ids uuid[],
  p_reason   text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user_id uuid;
  v_count   integer := 0;
begin
  if not app.is_admin() then
    raise exception 'GUEST 계정은 시스템 관리자만 영구 삭제할 수 있습니다.' using errcode = '42501';
  end if;
  if coalesce(pg_catalog.array_length(p_user_ids, 1), 0) = 0 then
    raise exception '삭제할 계정을 하나 이상 선택해야 합니다.' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '삭제 사유를 입력해야 합니다.' using errcode = '22023';
  end if;

  for v_user_id in
    select distinct picked.id from pg_catalog.unnest(p_user_ids) as picked(id)
     where picked.id is not null
     order by picked.id
  loop
    perform public.hard_delete_guest_account(v_user_id, p_reason);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

revoke all on function public.hard_delete_guest_accounts(uuid[], text)
  from public, anon, service_role;
grant execute on function public.hard_delete_guest_accounts(uuid[], text)
  to authenticated;

comment on function public.hard_delete_guest_accounts(uuid[], text) is
  'ADMIN 전용 GUEST 계정 일괄 물리 삭제. 선택 전체를 한 트랜잭션에서 처리해 부분 삭제를 남기지 않는다.';

-- SECURITY INVOKER 목록에서도 "참여가 아예 없는가"만 정확히 판정한다. 참여 내용은 반환하지 않는다.
create or replace function app.guest_account_has_any_participation(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1 from public.program_participants p where p.user_id = p_user_id
  );
$fn$;

revoke all on function app.guest_account_has_any_participation(uuid)
  from public, anon, service_role;
grant execute on function app.guest_account_has_any_participation(uuid)
  to authenticated;

-- 수동 생성한 미연결 임시 계정은 일반 사용자도 즉시 조회할 수 있어야 한다. 다만 어떤 사업에
-- 연결된 뒤에는 기존 규칙대로 그 참여 행을 실제로 읽을 수 있는 사용자에게만 보인다.
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
           and (
             not app.guest_account_has_any_participation(u.id)
             or exists (
               select 1 from public.program_participants visible_pp
                where visible_pp.user_id = u.id
             )
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
  '전사 GUEST 계정 목록. 미연결 임시 계정은 내부 사용자가 함께 보고, 연결 계정은 호출자가 읽을 수 있는 인격·참여만 반환한다. M&A 전용 계정의 존재는 권한 밖에 노출하지 않는다.';

commit;
