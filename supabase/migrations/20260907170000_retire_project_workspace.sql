-- PROJECT 워크스페이스 폐지 — AC 한 곳으로 합친다(2026-09-07).
--
-- 합치는 이유는 화면이 아니라 **자리**다. AC·M&A·PROJECT는 이미 features/program 하나를
-- 공유했고 갈려 있던 것은 사업 본체 원장 3종뿐이었는데, 그중 PROJECT는 열린 이래 단 한 건도
-- 쓰이지 않았다(사업 0건, 모듈 0건, 명부 0건, 기여 로그 0건, 권한 부여 0건). 쓰이지 않는
-- 워크스페이스가 사이드바 한 줄과 원장 네 벌을 점유하면, 프로젝트 성격의 일이 들어올 때마다
-- 담당자가 AC와 PROJECT 중 어디에 넣을지를 매번 판단해야 한다 — 두 곳에 나뉘어 쌓인 뒤에는
-- 어느 쪽이 전체인지 답할 근거가 없다.
--
-- **AC를 남기고 PROJECT를 걷는다.** 반대 방향(PROJECT를 남기고 AC를 옮기기)이 성립하지 않는
-- 이유는 셋이다 — AC 원장 9건이 제안 단계(PROPOSED·NOT_SELECTED)와 주관을 실제로 쓰고 있어
-- PROJECT 설정으로는 저장 자체가 막히고, `program`·`programs`·`ac`라는 키가 마이그레이션
-- 42개와 RLS 정책·함수 본문·Edge Function에 박혀 있으며, 무엇보다 `access_logs`와
-- `entity_contributions`에 **그때의 사실로** 쌓여 있다. 감사 기록의 이름을 사후에 바꾸면
-- 거짓 기록이 된다(NETWORKS 통합에서 `access_logs.resource_type`을 고치지 않은 것과 같은 이유).
--
-- **끄지 않고 지운다.** 물리 삭제 금지 원칙과 충돌하지 않는다 — 그 원칙은 업무 기록 행을
-- 지키는 것이고, 여기서 없애는 것은 한 번도 담긴 적 없는 그릇이다. 빈 원장이 RLS와 FK를 단 채
-- 남으면 다음 설계가 매번 그것들을 피해 가야 한다(2026-09-03 정형 모듈 7종을 걷을 때와 같다).
--
-- **남기는 것 넷.** (1) `workspace_key` enum의 `project` 값 — `system_events` 6행이 그 값을
-- 쓰고 있어 지우려면 과거 기록을 고쳐야 하고, enum 값을 지우면 의존 객체를 전부 재작성해야
-- 한다(`module_type` enum을 지우지 않은 근거와 같다). (2) `permission_templates`의 project 행
-- 8건 — 부여된 권한이 0건이라 무해하고, 되돌릴 수 있는 설정값이다. (3) `system_events`의
-- PROJECT 행 6건 — 캘린더가 WORK·LEAVE만 표시하므로 화면에 나타나지 않는다. (4) 2026-07-05
-- 초기 스키마의 `projects`·`project_tasks`·`project_milestones`·`project_members` — 데이터가
-- 있고 어느 화면도 읽지 않는 별개 계통이라, 이번 작업의 대상이 아니다.
--
-- 보안 게이트: 새 테이블·새 RPC·새 정책·Storage 변경 없음. 판정 함수에서 분기 하나를 걷는
-- 변경이라 노출면은 줄어들기만 한다.

begin;

-- ── 1. 2026-09-03 통합 때 남긴 백업 원장 5종을 걷는다 ────────────────────────
-- 모듈 계열을 한 벌로 합치며 `_retired_` 접두어로 개명해 둔 것들이다. 전부 0행이고,
-- 이들의 FK가 project_programs를 가리키고 있어 함께 걷지 않으면 아래 DROP이 막힌다.
drop table if exists public._retired_project_program_module_assignees;
drop table if exists public._retired_project_program_links;
drop table if exists public._retired_project_program_posts;
drop table if exists public._retired_project_program_participants;
drop table if exists public._retired_project_program_modules;

-- 위 표에만 붙어 있던 트리거 함수. **표를 지워도 함수는 따라 걷히지 않는다** —
-- 실제로 이 함수는 이미 없는 `project_program_modules`를 조회하고 있었다(개명 때 놓친 자리).
drop function if exists public.enforce_project_module_assignee_in_pool();

-- ── 2. PROJECT 사업 원장 4종과 전용 RPC ──────────────────────────────────────
drop function if exists public.set_project_program_staffing(uuid, jsonb, jsonb);

drop table if exists public.project_program_timeline_items;
drop table if exists public.project_program_departments;
drop table if exists public.project_program_managers;
drop table if exists public.project_programs;

-- ── 3. 살아남은 함수에서 project 분기를 걷는다 ───────────────────────────────
-- 표를 지우는 마이그레이션은 그 표 이름으로 함수 본문을 전수 조사하는 것까지가 한 벌이다.
-- `drop table`은 뷰·제약·정책까지만 따라가고 함수 본문(문자열)은 의존성으로 추적하지 않아,
-- 남겨 두면 호출 순간에만 42P01로 죽고 PostgREST가 그것을 404로 내보낸다(2026-09-03 재현).

create or replace function app.assert_program_exists(p_entity_key text, p_program_id uuid)
returns boolean language plpgsql stable set search_path = app, public as $fn$
declare
  v_table text;
  v_found boolean;
begin
  v_table := case p_entity_key
    when 'program'    then 'programs'
    when 'ma_program' then 'ma_programs'
  end;
  if v_table is null then
    return false;
  end if;
  -- 화이트리스트로 고른 이름만 들어가므로 동적 SQL 주입면이 없다.
  execute format('select exists (select 1 from public.%I where id = $1)', v_table)
    into v_found using p_program_id;
  return v_found;
end;
$fn$;

create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean language sql stable security definer set search_path = app, public as $fn$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.networks x
                   where x.id = p_target_id and x.deleted_at is null and x.merged_into_id is null)
    when 'ma_buyer' then
      app.can_read_workspace('mna')
      and exists (select 1 from public.ma_buyers x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_seller' then
      app.can_read_workspace('mna')
      and exists (select 1 from public.ma_sellers x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$fn$;

create or replace function app.entity_key_workspace(p_entity_key text)
returns text language sql immutable set search_path = app, public as $fn$
  select case p_entity_key
           when 'program'    then 'ac'
           when 'ma_program' then 'mna'
           when 'fund'       then 'fund'
           when 'startups'   then 'startup'
           when 'startup'    then 'startup'
           when 'ma_buyers'  then 'mna'
           when 'ma_buyer'   then 'mna'
           when 'ma_sellers' then 'mna'
           when 'ma_seller'  then 'mna'
           else 'networks'
         end;
$fn$;

create or replace function app.guest_program_ids()
returns setof uuid language sql stable security definer set search_path = app, public as $fn$
  with live as (
    select id, guest_access_ends_at from public.programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.ma_programs
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

create or replace function app.guest_session_program_id()
returns uuid language plpgsql stable security definer set search_path = app, public, auth as $fn$
declare
  v_type  text := nullif(auth.jwt() ->> 'context_type', '');
  v_claim text;
begin
  if v_type is null then
    -- 구 토큰 폴백(배포 직후 8시간). 새 토큰은 반드시 context_type을 싣는다.
    v_claim := auth.jwt() ->> 'program_id';
  elsif v_type in ('program', 'ma_program') then
    v_claim := auth.jwt() ->> 'context_id';
  else
    return null;
  end if;

  if v_claim is null or v_claim = '' then
    return null;
  end if;
  return v_claim::uuid;
exception when others then
  return null;
end;
$fn$;

create or replace function app.is_program_manager(p_program_id uuid)
returns boolean language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_table text;
  v_ok    boolean;
begin
  if app.is_admin() then
    return true;
  end if;
  v_table := case app.program_ws(p_program_id)
    when 'ac'  then 'program_managers'
    when 'mna' then 'ma_program_managers'
  end;
  if v_table is null then
    return false;
  end if;
  execute format(
    'select exists (select 1 from public.%I m where m.program_id = $1 and m.user_id = $2)', v_table)
    into v_ok using p_program_id, app.current_app_user_id();
  return v_ok;
end;
$fn$;

create or replace function app.program_row(p_program_id uuid)
returns jsonb language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_table text;
  v_row   jsonb;
begin
  v_table := case app.program_ws(p_program_id)
    when 'ac'  then 'programs'
    when 'mna' then 'ma_programs'
  end;
  if v_table is null then
    return null;
  end if;
  execute format('select to_jsonb(p) from public.%I p where p.id = $1', v_table)
    into v_row using p_program_id;
  return v_row;
end;
$fn$;

create or replace function app.program_ws(p_program_id uuid)
returns text language sql stable security definer set search_path = app, public as $fn$
  select case
    when p_program_id is null then null
    when exists (select 1 from public.programs    where id = p_program_id) then 'ac'
    when exists (select 1 from public.ma_programs where id = p_program_id) then 'mna'
  end;
$fn$;

create or replace function app.ws_module_tables(p_entity_key text)
returns table(module_table text, managers_table text, timeline_table text)
language sql immutable set search_path = app, public as $fn$
  select t.c2, t.c3, t.c4
    from (values
      ('program',    'program_modules', 'program_managers',    'program_timeline_items'),
      ('ma_program', 'program_modules', 'ma_program_managers', 'ma_program_timeline_items')
    ) as t(c1, c2, c3, c4)
   where t.c1 = p_entity_key;
$fn$;

create or replace function public.enforce_module_assignee_in_pool()
returns trigger language plpgsql security definer set search_path = app, public as $fn$
declare
  v_key     text;
  v_program uuid;
  v_table   text;
  v_ok      boolean;
begin
  select entity_key, program_id into v_key, v_program
    from public.program_modules where id = new.program_module_id;
  if v_program is null then
    raise exception '모듈 인스턴스를 찾을 수 없습니다.';
  end if;

  v_table := case v_key
    when 'program'    then 'program_managers'
    when 'ma_program' then 'ma_program_managers'
  end;
  -- 알 수 없는 원장 키는 여기서 사유와 함께 멈춘다. 두지 않으면 format('%I', null)이
  -- 담당자에게 아무것도 말해 주지 않는 오류로 떨어진다.
  if v_table is null then
    raise exception '알 수 없는 사업 원장입니다: %', v_key using errcode = '22023';
  end if;

  execute format(
    'select exists (select 1 from public.%I where program_id = $1 and user_id = $2)', v_table)
    into v_ok using v_program, new.user_id;

  if not v_ok then
    raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create or replace function public.guest_my_participations()
returns table(participant_id uuid, program_id uuid, entity_key text, workspace text,
              code text, title text, persona text, access_ends_at timestamptz)
language sql stable security definer set search_path = app, public as $fn$
  with live as (
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at
      from public.programs    where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'ma_program', id, code, title, guest_access_ends_at
      from public.ma_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
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

create or replace function public.guest_accounts_list(
  p_search text default null, p_limit integer default 50, p_offset integer default 0)
returns table(user_id uuid, name text, email text, phone text, user_type text, is_active boolean,
              company_name text, identities jsonb, has_password boolean, created_at timestamptz,
              last_login_at timestamptz, program_count integer, open_count integer,
              programs jsonb, total_count bigint)
language plpgsql stable set search_path = app, public as $fn$
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
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at
      from public.programs    where deleted_at is null
    union all
    select 'ma_program', id, code, title, guest_access_ends_at
      from public.ma_programs where deleted_at is null
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

create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table(participant_id uuid, program_code text, target_name text,
              email text, phone text, account_is_new boolean)
language plpgsql as $fn$
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

    -- 이 사업에 아직 기간이 없으면 기본값(사업 종료일 + 14일)을 채운다. 원장이 둘이라
    -- 테이블 이름을 판정해 동적으로 쓴다. INVOKER라 여기서도 사업 원장의 RLS가 걸리며,
    -- 바로 위에서 담당자임을 확인했으므로 통과한다.
    v_table := case app.program_ws(r.program_id)
                 when 'ac'  then 'programs'
                 when 'mna' then 'ma_programs'
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

create or replace function public.set_program_guest_access_window(
  p_program_id uuid, p_ends timestamptz default null)
returns void language plpgsql set search_path = app, public as $fn$
declare
  v_ws    text;
  v_table text;
begin
  if p_program_id is null then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  v_ws := app.program_ws(p_program_id);
  v_table := case v_ws
               when 'ac'  then 'programs'
               when 'mna' then 'ma_programs'
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

-- `set_module_public_link`·`set_program_module`은 원장 키 화이트리스트만 좁힌다.
create or replace function public.set_module_public_link(
  p_entity_key text, p_module_id uuid, p_status text,
  p_open_at timestamptz default null, p_close_at timestamptz default null,
  p_contact text default null)
returns jsonb language plpgsql set search_path = app, public as $fn$
declare
  v_type   text;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'PRIVATE');
  v_row    public.program_module_public_links%rowtype;
begin
  if p_entity_key not in ('program', 'ma_program') then
    raise exception '원장 키가 올바르지 않습니다: %', p_entity_key;
  end if;
  if v_status not in ('PRIVATE', 'OPEN', 'CLOSED') then
    raise exception '공개 상태 값이 올바르지 않습니다: %', v_status;
  end if;
  if p_open_at is not null and p_close_at is not null and p_close_at <= p_open_at then
    raise exception '공개 마감은 공개 시작 이후여야 합니다.';
  end if;

  -- 모듈이 보이지 않으면(없거나 접근 불가) 여기서 끝난다 — RLS가 이미 답을 냈다.
  select r.module_type into v_type
    from app.ws_module_row(p_entity_key, p_module_id) r;
  if v_type is null then
    raise exception '모듈을 찾을 수 없거나 접근 권한이 없습니다.' using errcode = '42501';
  end if;
  if not app.module_public_linkable(v_type) then
    raise exception '이 템플릿은 링크 공유를 켤 수 없습니다: %', v_type;
  end if;

  insert into public.program_module_public_links
    (entity_key, program_module_id, token, status, open_at, close_at, contact, created_by)
  values
    (p_entity_key, p_module_id, app.new_public_link_token(), v_status,
     p_open_at, p_close_at, nullif(btrim(p_contact), ''), app.current_app_user_id())
  on conflict (entity_key, program_module_id) do update set
    -- 토큰은 건드리지 않는다. 껐다 켜도 같은 주소가 돌아와야 이미 배포한 공고문이 살아 있다.
    status     = excluded.status,
    open_at    = excluded.open_at,
    close_at   = excluded.close_at,
    contact    = excluded.contact,
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id, 'token', v_row.token, 'status', v_row.status,
    'open_at', v_row.open_at, 'close_at', v_row.close_at, 'contact', v_row.contact
  );
end;
$fn$;

create or replace function public.set_program_module(
  p_entity_key text, p_program_id uuid, p_module_id uuid, p_module_type text,
  p_title text, p_status text, p_visibility text, p_participation_mode text,
  p_settings jsonb, p_assignees jsonb)
returns uuid language plpgsql security definer set search_path = app, public as $fn$
declare
  v_ws         text := app.entity_key_workspace(p_entity_key);
  v_managers   text;
  v_prog_table text;
  v_id         uuid := p_module_id;
  v_title      text := nullif(btrim(p_title), '');
  v_mode       text;
  v_ps         date := (p_settings->>'start_date')::date;
  v_pe         date := (p_settings->>'end_date')::date;
  v_prog       jsonb;
  v_prop_start date;
  v_prop_end   date;
  v_op_start   date;
  v_op_end     date;
  v_row        jsonb;
  v_uid        uuid;
  v_ok         boolean;
begin
  if p_entity_key not in ('program', 'ma_program') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;

  if p_assignees is not null and jsonb_typeof(p_assignees) <> 'array' then
    raise exception '담당자 목록의 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;

  select managers_table into v_managers from app.ws_module_tables(p_entity_key);
  v_prog_table := case p_entity_key
    when 'program'    then 'programs'
    when 'ma_program' then 'ma_programs'
  end;

  -- 인가: 관리자 또는 (해당 워크스페이스 쓰기 + 그 사업 접근권)
  if not (
    app.is_admin()
    or (app.can_write_workspace(v_ws) and app.can_access_ws_program(v_ws, p_program_id))
  ) then
    raise exception '운영 모듈을 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 배치 가능한 템플릿인가(ADMIN 카탈로그가 답한다). 화면에서 감추는 것은 보안이 아니다.
  if v_id is null and not app.module_template_available(p_module_type, v_ws) then
    raise exception '이 워크스페이스에서 배치할 수 없는 모듈 종류입니다: %', p_module_type
      using errcode = '42501';
  end if;

  -- 수정 대상 인스턴스가 이 사업 소속인지 확인(원장까지 함께 본다).
  if v_id is not null and not exists (
    select 1 from public.program_modules
     where id = v_id and program_id = p_program_id and entity_key = p_entity_key
  ) then
    raise exception '수정할 모듈 인스턴스를 찾을 수 없습니다.';
  end if;

  -- 배정 방식: 미지정 시 템플릿 기본값으로 강제.
  v_mode := coalesce(p_participation_mode, case p_module_type
    when 'RECRUITMENT'       then 'OPEN_APPLICATION'
    when 'DOC_REVIEW'        then 'REVIEWER_ASSIGNMENT'
    when 'ONSITE_EVAL'       then 'REVIEWER_ASSIGNMENT'
    when 'DEMO_DAY'          then 'REVIEWER_ASSIGNMENT'
    when 'ORIENTATION'       then 'ADMIN_ONLY'
    when 'OUTCOMES'          then 'ADMIN_ONLY'
    when 'CUSTOM_ACTIVITY'   then 'ADMIN_ONLY'
    when 'MENTORING'         then 'MANUAL_ALLOCATION'
    when 'BUSINESS_MATCHING' then 'STARTUP_FCFS'
  end);

  -- 모듈명 중복 금지(사업 내, 정규화 비교; 수정 시 자기 자신 제외).
  if v_title is not null and exists (
    select 1 from public.program_modules pm
     where pm.program_id = p_program_id
       and lower(btrim(pm.title)) = lower(v_title)
       and (v_id is null or pm.id <> v_id)
  ) then
    raise exception '이미 같은 이름의 모듈이 있습니다: %', v_title;
  end if;

  -- OUTCOMES 단일성(신규 생성 시).
  if p_module_type = 'OUTCOMES' and v_id is null and exists (
    select 1 from public.program_modules
     where program_id = p_program_id and module_type = 'OUTCOMES'
  ) then
    raise exception '성과/KPI 모듈은 사업당 1개만 배치할 수 있습니다.';
  end if;

  -- 기간 검증: start<=end 및 제안/운영 기간 중 한 구간에 완전 포함.
  -- 두 사업 원장의 기간 컬럼명이 같으므로 jsonb로 한 번에 읽는다.
  if v_ps is not null and v_pe is not null then
    if v_ps > v_pe then
      raise exception '종료일은 시작일 이후여야 합니다.';
    end if;
    execute format('select to_jsonb(p) from public.%I p where p.id = $1', v_prog_table)
      into v_prog using p_program_id;
    v_prop_start := (v_prog->>'proposal_start_date')::date;
    v_prop_end   := (v_prog->>'proposal_end_date')::date;
    v_op_start   := (v_prog->>'start_date')::date;
    v_op_end     := (v_prog->>'end_date')::date;
    if (v_prop_start is not null and v_prop_end is not null)
       or (v_op_start is not null and v_op_end is not null) then
      if not (
        (v_prop_start is not null and v_prop_end is not null and v_ps >= v_prop_start and v_pe <= v_prop_end)
        or (v_op_start is not null and v_op_end is not null and v_ps >= v_op_start and v_pe <= v_op_end)
      ) then
        raise exception '모듈 기간은 제안 기간 또는 운영 기간 내에서만 설정할 수 있습니다.';
      end if;
    end if;
  end if;

  -- 담당자 검증(전체 사전 확인; 풀 소속은 트리거와 이중 방어).
  -- 업무롤 길이도 여기서 함께 본다 — CHECK가 최종 강제하지만, 그때 나오는 오류 문구는
  -- 담당자에게 무엇이 잘못됐는지 말해 주지 못한다.
  if p_assignees is not null then
    for v_row in select * from jsonb_array_elements(p_assignees) loop
      v_uid := (v_row->>'user_id')::uuid;
      if v_uid is null then
        raise exception '담당자 목록에 사용자 없이 들어온 항목이 있습니다.' using errcode = '22023';
      end if;
      execute format(
        'select exists (select 1 from public.%I where program_id = $1 and user_id = $2)', v_managers)
        into v_ok using p_program_id, v_uid;
      if not v_ok then
        raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '42501';
      end if;
      if char_length(coalesce(btrim(v_row->>'duty'), '')) > 200 then
        raise exception '업무롤은 200자를 넘을 수 없습니다.';
      end if;
    end loop;
  end if;

  -- 인스턴스 upsert(생성/수정).
  if v_id is null then
    insert into public.program_modules
      (entity_key, program_id, module_type, title, enabled, status, participation_mode, visibility, settings)
    values (
      p_entity_key, p_program_id, p_module_type::public.module_type, v_title, true,
      p_status::public.module_status, v_mode::public.participation_mode,
      p_visibility::public.module_visibility, coalesce(p_settings, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.program_modules set
      title              = v_title,
      status             = p_status::public.module_status,
      participation_mode = v_mode::public.participation_mode,
      visibility         = p_visibility::public.module_visibility,
      settings           = coalesce(p_settings, '{}'::jsonb),
      updated_at         = now()
    where id = v_id;
  end if;

  -- 담당자 전량 교체. 같은 사람이 두 번 들어오면 **앞엣것만** 남긴다 — 화면이 중복 선택을
  -- 막지만 서버가 그 가정 위에 서면 안 되고, 같은 명령 안의 중복은 on conflict가 걸러 주지
  -- 못하는 자리(DO UPDATE는 같은 행을 두 번 건드릴 수 없다)라 먼저 접어서 넣는다.
  delete from public.program_module_assignees where program_module_id = v_id;
  if p_assignees is not null then
    insert into public.program_module_assignees (program_module_id, user_id, duty, assigned_by)
    select distinct on (uid) v_id, uid, duty, app.current_app_user_id()
      from (
        select (a.value->>'user_id')::uuid                        as uid,
               nullif(btrim(coalesce(a.value->>'duty', '')), '')  as duty,
               a.ordinality                                       as pos
          from jsonb_array_elements(p_assignees) with ordinality as a(value, ordinality)
      ) src
     order by uid, pos
    on conflict (program_module_id, user_id) do nothing;
  end if;

  return v_id;
end;
$fn$;

-- ── 4. 원장 키 화이트리스트(CHECK)를 좁힌다 ──────────────────────────────────
-- 값을 남겨 두면 "고를 수 있는 값"으로 읽히지만 가리킬 원장이 없다. 좁히지 않으면
-- `app.enforce_program_ref()`가 삽입 순간에야 막고, 그때 나오는 오류는 이유를 말하지 못한다.
alter table public.program_modules            drop constraint if exists program_modules_entity_key_check;
alter table public.program_modules            add  constraint program_modules_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_participants       drop constraint if exists program_participants_entity_key_check;
alter table public.program_participants       add  constraint program_participants_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_posts              drop constraint if exists program_posts_entity_key_check;
alter table public.program_posts              add  constraint program_posts_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_links              drop constraint if exists program_links_entity_key_check;
alter table public.program_links              add  constraint program_links_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_overviews          drop constraint if exists program_overviews_entity_key_check;
alter table public.program_overviews          add  constraint program_overviews_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_announcements      drop constraint if exists program_announcements_entity_key_check;
alter table public.program_announcements      add  constraint program_announcements_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_questions          drop constraint if exists program_questions_entity_key_check;
alter table public.program_questions          add  constraint program_questions_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));
alter table public.program_module_public_links drop constraint if exists pmpl_entity_key_check;
alter table public.program_module_public_links add  constraint pmpl_entity_key_check
  check (entity_key = any (array['program'::text, 'ma_program'::text]));

-- 전자결재 연동·회의록 연동의 대상 종류. 두 표 모두 project_program 행이 0건이다.
alter table public.approval_program_links drop constraint if exists approval_program_links_target_type_check;
alter table public.approval_program_links add  constraint approval_program_links_target_type_check
  check (target_type = any (array['program'::text, 'ma_program'::text]));
alter table public.meeting_minute_links drop constraint if exists meeting_minute_links_target_type_check;
alter table public.meeting_minute_links add  constraint meeting_minute_links_target_type_check
  check (target_type = any (array['program'::text, 'ma_program'::text, 'startup'::text,
                                  'fund'::text, 'network'::text, 'ma_buyer'::text, 'ma_seller'::text]));

-- ── 5. 모듈 템플릿 카탈로그에서 project 노출을 걷는다 ────────────────────────
-- 카탈로그를 끄는 것(`is_active`)이 아니라 노출 워크스페이스 목록에서 빼는 것이다 —
-- 배치할 자리가 없어졌으므로 이 값은 이제 아무것도 가리키지 않는다.
update public.module_templates
   set workspaces = array_remove(workspaces, 'project'),
       updated_at = now()
 where 'project' = any (workspaces);

alter table public.module_templates drop constraint if exists module_templates_workspaces_check;
alter table public.module_templates add  constraint module_templates_workspaces_check
  check (workspaces <@ array['ac'::text, 'mna'::text]);

commit;
