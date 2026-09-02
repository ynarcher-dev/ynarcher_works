-- =====================================================================
-- [사업 공용] 게스트 포털을 AC 전용에서 사업 3종 전체로 넓힌다
-- 선행: 20260903100000_program_module_ledger_unify.sql (명부·모듈 원장 통합)
--
-- 배경:
--   게스트가 보는 것(사업개요·공지·QNA·메뉴별 알림)의 원장이 전부 public.programs를 FK로
--   물고 있어 M&A·PROJECT 사업에는 존재할 수 없었다. 명부(program_participants)는 이미
--   통합되었으므로, 남은 것은 사업 단위 게스트 원장 4종과 판정 헬퍼다.
--
-- 축을 가르는 기준:
--   · 모듈에 매달린 것(program_notices — program_module_id가 not null) → 모듈이 답한다.
--     entity_key를 새로 달지 않는다. 같은 사실을 두 곳에 적는 순간 어긋날 자리가 생긴다.
--   · 사업에 매달린 것(사업개요·공지·QNA) → 사업 원장이 셋으로 갈려 있어 program_id만으로는
--     소속을 알 수 없다. entity_key를 단다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project
--   - 데이터 등급: Internal + 게스트 공개(사업개요·공지는 게스트에게 열리는 콘텐츠,
--     QNA는 작성자 본인과 담당자만)
--   - 접근 주체: 내부 사용자 + 게스트(SELECT, QNA는 본인 INSERT)
--   - Scope 기준: 내부는 app.can_read/write_workspace(ws) + app.can_access_ws_program(ws, program_id),
--     게스트는 app.guest_program_ids() / app.guest_module_ids() 단일 기준(종전과 동일)
--   - SECURITY DEFINER 변경: app.is_program_manager는 담당자 원장 3종을 보게 되어 DEFINER를
--     유지한다(종전과 동일). app.guest_program_ids도 종전대로 DEFINER — 게스트는 사업 원장
--     읽기 권한이 없으므로 INVOKER면 자기 사업조차 판정하지 못한다.
--   - 감사 로그: 로그인 개방·차단은 종전대로 app.log_guest_access()를 탄다.
--   - 운영 영향: 기존 AC 행은 entity_key 기본값 'program'으로 채워져 결과가 동일하다.
-- 근거: 20260827130000_program_guest_access.sql, 20260901120000_program_module_notices.sql,
--       20260901140000_program_overview.sql, 20260901170000_program_announcements_questions.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 담당자 판정 — 사업이 어느 원장에 있든 그 원장의 담당자 표를 본다
-- ---------------------------------------------------------------------
create or replace function app.is_program_manager(p_program_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = app, public
as $fn$
declare
  v_table text;
  v_ok    boolean;
begin
  if app.is_admin() then
    return true;
  end if;
  v_table := case app.program_ws(p_program_id)
    when 'ac'      then 'program_managers'
    when 'mna'     then 'ma_program_managers'
    when 'project' then 'project_program_managers'
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

comment on function app.is_program_manager(uuid) is
  '현재 요청자가 해당 사업의 담당자인지. 사업이 속한 원장(ac/ma/project)의 담당자 표를 본다. 게스트 로그인 개방·차단의 인가 기준.';

-- ---------------------------------------------------------------------
-- (2) 게스트가 볼 수 있는 사업 — 세 원장 전부
--     상태·삭제 조건은 세 원장의 컬럼명이 같아 그대로 UNION한다.
-- ---------------------------------------------------------------------
create or replace function app.guest_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $fn$
  with live as (
    select id from public.programs         where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id from public.ma_programs      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id from public.project_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
  )
  select p.program_id
    from public.program_participants p
    join live g on g.id = p.program_id
   where p.user_id = app.current_app_user_id()
     and p.login_status = 'ACTIVE'
     and p.program_id = app.guest_session_program_id();
$fn$;

comment on function app.guest_program_ids() is
  '게스트가 볼 수 있는 사업 집합(로그인 개방 + 사업 생존 + 세션 고정 사업 일치). AC·M&A·PROJECT 세 원장을 모두 본다.';

-- ---------------------------------------------------------------------
-- (3) 사업 단위 게스트 원장에 entity_key를 달고 FK를 뗀다
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['program_overviews', 'program_announcements', 'program_questions'] loop
    execute format(
      'alter table public.%I add column if not exists entity_key text not null default ''program''', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_entity_key_check');
    execute format(
      'alter table public.%I add constraint %I check (entity_key in (''program'', ''ma_program'', ''project_program''))',
      t, t || '_entity_key_check');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_program_id_fkey');
    execute format(
      'create index if not exists %I on public.%I (entity_key, program_id)', 'idx_' || t || '_entity', t);

    execute format('drop trigger if exists trg_%s_program_ref on public.%I', t, t);
    execute format(
      'create trigger trg_%s_program_ref before insert or update of entity_key, program_id
         on public.%I for each row execute function app.enforce_program_ref()', t, t);
  end loop;
end $$;

comment on column public.program_overviews.entity_key is
  '소유 원장: program(AC) | ma_program(M&A) | project_program(PROJECT).';

-- 사업 물리 삭제 시 함께 지울 대상에 게스트 원장 3종을 더한다.
create or replace function app.cascade_program_children()
returns trigger
language plpgsql
set search_path = app, public
as $fn$
declare
  v_key text := tg_argv[0];
begin
  -- 자식(assignees·내용물)은 program_modules FK의 on delete cascade가 이어서 지운다.
  delete from public.program_modules       where entity_key = v_key and program_id = old.id;
  delete from public.program_posts         where entity_key = v_key and program_id = old.id;
  delete from public.program_links         where entity_key = v_key and program_id = old.id;
  delete from public.program_participants  where entity_key = v_key and program_id = old.id;
  delete from public.program_overviews     where entity_key = v_key and program_id = old.id;
  delete from public.program_announcements where entity_key = v_key and program_id = old.id;
  delete from public.program_questions     where entity_key = v_key and program_id = old.id;
  return old;
end;
$fn$;

-- ---------------------------------------------------------------------
-- (4) 내부 정책 교체 — 'ac' 리터럴 → entity_key 경유
--     게스트 정책(*_guest_select / *_guest_insert)은 이름이 달라 그대로 살아 있고,
--     그 판정 기준인 guest_program_ids()가 (2)에서 이미 세 원장으로 넓어졌다.
-- ---------------------------------------------------------------------
do $$
declare
  t       text;
  ws_expr text := 'app.entity_key_workspace(entity_key)';
  sel     text;
  wr      text;
begin
  sel := format('app.can_read_workspace(%s) and app.can_access_ws_program(%s, program_id)', ws_expr, ws_expr);
  wr  := format('app.can_write_workspace(%s) and app.can_access_ws_program(%s, program_id)', ws_expr, ws_expr);

  foreach t in array array['program_overviews', 'program_announcements', 'program_questions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_ac_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_ac_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_ac_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_update', t);

    execute format('create policy %I on public.%I for select using (%s)', t || '_ws_select', t, sel);
    -- QNA는 게스트가 묻고 담당자가 답하는 1:1 문의함이라 내부 INSERT 정책을 두지 않는다
    -- (종전에도 program_questions에는 _ac_insert가 없었다 — 담당자의 쓰기는 답변 UPDATE뿐이다).
    if t <> 'program_questions' then
      execute format('create policy %I on public.%I for insert with check (%s)', t || '_ws_insert', t, wr);
    end if;
    execute format('create policy %I on public.%I for update using (%s) with check (%s)',
      t || '_ws_update', t, wr, wr);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (5) 메뉴별 알림(program_notices) — 모듈이 소속을 답한다
--     program_module_id가 not null이므로 entity_key를 더할 이유가 없다.
--     programs FK만 떼고 판정을 모듈 경유로 바꾼다.
-- ---------------------------------------------------------------------
alter table public.program_notices drop constraint if exists program_notices_program_id_fkey;

drop policy if exists program_notices_ac_select on public.program_notices;
drop policy if exists program_notices_ac_insert on public.program_notices;
drop policy if exists program_notices_ac_update on public.program_notices;

create policy program_notices_ws_select on public.program_notices for select
  using (
    app.can_read_workspace(app.module_ws(program_module_id))
    and app.can_access_ws_program(app.module_ws(program_module_id), program_id)
  );

create policy program_notices_ws_insert on public.program_notices for insert
  with check (
    app.can_write_workspace(app.module_ws(program_module_id))
    and app.can_access_ws_program(app.module_ws(program_module_id), program_id)
  );

create policy program_notices_ws_update on public.program_notices for update
  using (
    app.can_write_workspace(app.module_ws(program_module_id))
    and app.can_access_ws_program(app.module_ws(program_module_id), program_id)
  )
  with check (
    app.can_write_workspace(app.module_ws(program_module_id))
    and app.can_access_ws_program(app.module_ws(program_module_id), program_id)
  );

-- ---------------------------------------------------------------------
-- (6) 로그인 개방 RPC — 사업코드·상태를 세 원장 중 맞는 곳에서 읽는다
--     달라지는 것은 사업 한 줄을 어디서 읽느냐뿐이라, 나머지 흐름은 종전 그대로 둔다.
-- ---------------------------------------------------------------------
create or replace function app.program_row(p_program_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public
as $fn$
declare
  v_table text;
  v_row   jsonb;
begin
  v_table := case app.program_ws(p_program_id)
    when 'ac'      then 'programs'
    when 'mna'     then 'ma_programs'
    when 'project' then 'project_programs'
  end;
  if v_table is null then
    return null;
  end if;
  execute format('select to_jsonb(p) from public.%I p where p.id = $1', v_table)
    into v_row using p_program_id;
  return v_row;
end;
$fn$;

comment on function app.program_row(uuid) is
  '사업 id → 그 사업이 실제로 있는 원장의 행 1건(jsonb). 세 원장의 컬럼명이 같아 호출부가 원장을 몰라도 된다.';

create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table (
  participant_id uuid,
  program_code   text,
  target_name    text,
  email          text,
  phone          text
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
    select pp.id, pp.program_id, pp.role, pp.master_table, pp.master_id, pp.login_status
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
    if v_code is null then
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

    update public.guest_invitations
       set business_code     = v_code,
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
        (v_code, v_name, v_email, v_phone, v_user_type::public.user_type, v_company,
         'PROGRAM', r.program_id, r.id, v_uid, now() + interval '1 year');
    end if;

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
    program_code   := v_code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.open_program_guest_access(uuid[]) from public;
grant execute on function public.open_program_guest_access(uuid[]) to authenticated;

comment on function public.open_program_guest_access(uuid[]) is
  '명부 행의 게스트 로그인을 연다(사업 담당자 전용, SECURITY INVOKER). AC·M&A·PROJECT 공용이며 사업 한 줄은 app.program_row()가 원장을 찾아 읽는다.';

-- ---------------------------------------------------------------------
-- (7) 템플릿 카탈로그 개방 — 정형 운영 모듈을 세 워크스페이스에서 배치할 수 있게 한다
--     시드(20260902140000)는 on conflict do nothing이라 이미 심긴 행을 고치지 않는다.
--     여기서 한 번 넓히고, 이후 조정은 ADMIN 화면이 맡는다(코드가 정답을 갖지 않는다).
-- ---------------------------------------------------------------------
update public.module_templates
   set workspaces = array['ac', 'mna', 'project'],
       updated_at = now()
 where workspaces = array['ac'];
