-- AC 워크스페이스를 PROJECT로 개명한다 — 부르는 이름·경로·권한 키를 한 벌로(2026-09-09).
--
-- 2026-09-07에 PROJECT를 폐지해 AC로 합쳤고, 그 결과 이 워크스페이스가 담는 것은 액셀러레이팅
-- 사업만이 아니라 신사업·글로벌까지다. 이름이 담는 것보다 좁으면 그 자리에 무엇을 넣을지를
-- 매번 판단해야 하므로, 폐지된 쪽의 이름이 남은 쪽으로 온다. **DB가 이미 그 이름으로 말하고
-- 있었다** — 원장은 `programs`이고 다형 키는 `program`이라, 개명은 어긋나 있던 권한 키 하나를
-- 나머지에 맞추는 일이다.
--
-- **개명은 enum RENAME VALUE로 한다**(2026-07-16 `hub`→`office`와 같은 방식). 값의 OID가
-- 그대로라 저장된 행이 자동으로 따라오고 의존 객체를 재작성하지 않는다. 감사 기록을 고치는
-- 것이 아니다 — 같은 워크스페이스의 이름이 바뀐 것이라, `hub` 시절 기록이 `office`가 된 것과
-- 같다.
--
-- **순서가 필수다.** enum에는 `ac`와 `project`가 **둘 다** 있다(2026-09-07 폐지 때 의존 객체
-- 재작성을 피하려고 `project` 값을 남겼다). 곧바로 `ac`→`project`를 하면 개명이 이름 충돌로
-- 막히고, 설령 통과해도 폐지된 PROJECT의 행 15건(`permission_templates` 8 · `system_events` 6
-- · `audit_logs` 1)이 **AC의 기록으로 읽힌다** — 그것이야말로 거짓 기록이다. 그래서 죽은 값을
-- 먼저 `project_retired`로 비켜 세운다(NETWORKS 통합에서 구 원장을 `_retired_*`로 개명한 것과
-- 같은 표시). 그 15건은 지우지 않는다: `system_events` 6행은 업무 기록이고, 물리 삭제 금지
-- 원칙의 대상이다.
--
-- **정책과 함수를 같은 트랜잭션에서 함께 고치는 것이 이 마이그레이션의 핵심이다.** 권한 헬퍼는
-- `workspace_key`가 아니라 **text를 받아** `p.workspace_key::text = ws_key`로 비교한다. 그래서
-- 없는 키를 물으면 **오류가 아니라 false**가 돌아온다 — 빠뜨리면 PROJECT 화면이 에러 한 줄
-- 없이 통째로 빈 화면이 되고(Default Deny), 무엇이 잘못됐는지 아무 데서도 드러나지 않는다.
-- 정책 표현식의 `'ac'::text`도 enum 상수가 아니라 텍스트 상수라 개명을 따라오지 않는다.
-- "표를 지우는 마이그레이션은 함수 본문 전수 조사까지가 한 벌"이라는 규칙이, 키를 바꿀 때는
-- **정책 표현식까지** 번진 것이다.
--
-- 대상은 카탈로그 전수 조사로 뽑았다 — 함수 10종(`pg_proc.prosrc`), 정책 7종(`pg_policies`),
-- enum 컬럼 4표(자동 이관), CHECK 제약 1종, 그리고 **enum이 아니라 텍스트로 키를 저장해
-- 자동으로 따라오지 않는 두 곳**(`module_templates.workspaces` · `audit_logs.changed_workspace`).
--
-- 함께 바꾸지 않는 것 셋:
--  · `audit_logs.changed_workspace`의 `ac` 11행 — 그때 그 워크스페이스의 이름은 `ac`였다.
--    감사 기록은 그때의 사실이므로 고치지 않는다(`access_logs.resource_type` 선례). 다만 그
--    표의 `project` 1행은 **폐지된 PROJECT를 가리키므로** `project_retired`로 옮긴다 — 고치는
--    것이 아니라 이름 충돌을 걷어 그 행이 계속 참을 말하게 하는 일이다.
--  · `user_type`의 `ac_business` — 사용자 유형(AC사업부)이라 워크스페이스 키와 다른 축이다.
--  · `scope_type`의 `program`·`project` — 데이터 범위 축이고 이 개명과 무관하다.
--
-- 보안 게이트: 새 테이블·새 RPC·새 Storage 정책 없음. 함수 10종은 기존 정의를 그대로 두고
-- 키 문자열만 바꿔 재생성하며(SECURITY DEFINER·search_path 포함 동일), 정책 7종도 판정식이
-- 같고 키만 바뀐다. 노출면은 변하지 않는다.

begin;

-- ── 1. enum 개명 — 죽은 값을 먼저 비켜 세우고, 그 이름을 AC가 받는다 ─────────
alter type public.workspace_key rename value 'project' to 'project_retired';
alter type public.workspace_key rename value 'ac'      to 'project';

-- ── 2. 정책 7종 — `'ac'::text`는 텍스트 상수라 개명을 따라오지 않는다 ────────
-- 정책 이름도 함께 바꾼다(`programs_ac_*` → `programs_project_*`). 이름은 판정에 끼지 않지만,
-- 없어진 키를 단 이름이 남으면 다음 사람이 그 키가 아직 있는 줄로 읽는다.
drop policy if exists guest_inv_insert on public.guest_invitations;
create policy guest_inv_insert on public.guest_invitations
  for insert with check (
    app.is_admin() or app.can_write_workspace('project') or app.can_write_workspace('guest'));

drop policy if exists guest_inv_update on public.guest_invitations;
create policy guest_inv_update on public.guest_invitations
  for update using (
    app.is_admin() or app.can_write_workspace('project') or app.can_write_workspace('guest'))
  with check (
    app.is_admin() or app.can_write_workspace('project') or app.can_write_workspace('guest'));

drop policy if exists program_departments_select on public.program_departments;
create policy program_departments_select on public.program_departments
  for select using (app.can_read_workspace('project') and app.can_access_program(program_id));

drop policy if exists program_managers_select on public.program_managers;
create policy program_managers_select on public.program_managers
  for select using (app.can_read_workspace('project') and app.can_access_program(program_id));

drop policy if exists programs_ac_select on public.programs;
create policy programs_project_select on public.programs
  for select using (app.can_read_workspace('project') and app.can_access_program(id));

drop policy if exists programs_ac_insert on public.programs;
create policy programs_project_insert on public.programs
  for insert with check (app.can_write_workspace('project') and app.can_access_program(id));

drop policy if exists programs_ac_update on public.programs;
create policy programs_project_update on public.programs
  for update using (app.can_write_workspace('project') and app.can_access_program(id))
  with check (app.can_write_workspace('project') and app.can_access_program(id));

-- ── 3. 함수 10종 — 본문은 문자열이라 개명이 닿지 않는다 ──────────────────────
-- 카탈로그(`pg_proc.prosrc ~ '''ac'''`)로 전수 조사한 결과이며, 정의는 현행 그대로 두고
-- 키 문자열만 바꿨다.
CREATE OR REPLACE FUNCTION app.can_access_program(target_program_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select app.is_admin()
      or app.get_scope_type('project') = 'global'
      or (app.get_scope_type('project') = 'program' and app.get_scope_id('project') = target_program_id);
$function$;

CREATE OR REPLACE FUNCTION app.can_link_entity_target(p_target_type text, p_target_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
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
$function$;

CREATE OR REPLACE FUNCTION app.entity_key_workspace(p_entity_key text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'app', 'public'
AS $function$
  select case p_entity_key
           when 'program'    then 'project'
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
$function$;

CREATE OR REPLACE FUNCTION app.is_program_manager(p_program_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_table text;
  v_ok    boolean;
begin
  if app.is_admin() then
    return true;
  end if;
  v_table := case app.program_ws(p_program_id)
    when 'project'  then 'program_managers'
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
$function$;

CREATE OR REPLACE FUNCTION app.program_row(p_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_table text;
  v_row   jsonb;
begin
  v_table := case app.program_ws(p_program_id)
    when 'project'  then 'programs'
    when 'mna' then 'ma_programs'
  end;
  if v_table is null then
    return null;
  end if;
  execute format('select to_jsonb(p) from public.%I p where p.id = $1', v_table)
    into v_row using p_program_id;
  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION app.program_ws(p_program_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
  select case
    when p_program_id is null then null
    when exists (select 1 from public.programs    where id = p_program_id) then 'project'
    when exists (select 1 from public.ma_programs where id = p_program_id) then 'mna'
  end;
$function$;

CREATE OR REPLACE FUNCTION public.open_program_guest_access(p_participant_ids uuid[])
 RETURNS TABLE(participant_id uuid, program_code text, target_name text, email text, phone text, account_is_new boolean)
 LANGUAGE plpgsql
AS $function$
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
    select pp.id, pp.program_id, pp.master_table, pp.master_id, pp.login_status, pp.user_id
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

    -- 계정을 확보하고, 그 계정이 **이미 있었는지**(v_had)를 함께 정한다. 그 값이 담당자에게
    -- 나가는 안내를 가른다 — 있었으면 "기존 비밀번호로 들어오세요", 없었으면 초기
    -- 비밀번호(연락처)를 안내한다. 발급은 멱등이라 사후에는 구분되지 않으므로 여기서 본다.
    --
    -- 길이 둘로 갈린다: 명부 행이 사람을 들고 있으면 그 계정, 아니면 원장 연락처.
    if r.user_id is not null then
      -- 명부 행이 이미 사람을 들고 있다. 그 계정을 연다 — 원장을 다시 보지 않는다.
      --
      -- 한 원장 행에 계정이 여럿일 수 있게 된 뒤로(20260908170000), "이 회사"만으로는
      -- 어느 계정을 여는지 정해지지 않는다. 정하는 자리는 명부이며 여기서는 그 값을 쓴다.
      -- 원장을 다시 보면 담당자가 고른 사람과 다른 계정이 열릴 수 있다.
      v_account := r.user_id;
      v_had     := true;
    else
      -- 옛 행(사람이 정해지기 전에 담긴 줄)과 원장 연락처로 여는 경로.
      --
      -- M&A 원장에는 이 길이 없다 — ma_buyers에는 연락 칸이 아예 없고 ma_sellers도
      -- 연락처가 없다. 그래서 M&A 명부는 사람을 정한 줄만 열 수 있다(그 판정은
      -- issue_guest_account가 사유와 함께 답한다).
      select exists (
        select 1
          from public.users u
         where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
           and u.deleted_at is null
           and lower(u.email) = lower(
                 case when r.master_table = 'startups'
                      then (select nullif(s.contact ->> 'email', '') from public.startups s where s.id = r.master_id)
                      when r.master_table = 'networks'
                      then (select nullif(n.email, '') from public.networks n where n.id = r.master_id)
                 end)
      ) into v_had;

      -- 계정 확보. 원장에 값이 모자라면 여기서 사유와 함께 멈춘다.
      v_account := public.issue_guest_account(r.master_table, r.master_id);
    end if;

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
                 when 'project'  then 'programs'
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
$function$;

CREATE OR REPLACE FUNCTION public.set_application_form(p_program_id uuid, p_program_module_id uuid, p_form_id uuid, p_title text, p_public_status text, p_landing jsonb, p_fields jsonb, p_open_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_close_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_id       uuid := p_form_id;
  v_token    text;
  v_title    text := nullif(btrim(p_title), '');
  v_status   text := coalesce(nullif(btrim(p_public_status), ''), 'PRIVATE');
  v_module   uuid := p_program_module_id;
  v_keep_ids uuid[];
  v_field    jsonb;
  v_fid      uuid;
begin
  -- 인가: 관리자 또는 (ac 쓰기 + 해당 프로그램 접근권). 종전 그대로 — 모집을 열고 닫는 것은
  -- 사업 담당자의 일이다(ADMIN이 정하는 것은 그 종류가 나갈 수 있는지의 상한뿐이다).
  if not (
    app.is_admin()
    or (app.can_write_workspace('project') and app.can_access_program(p_program_id))
  ) then
    raise exception '신청서를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_status not in ('PRIVATE', 'OPEN', 'CLOSED') then
    raise exception '공개 상태 값이 올바르지 않습니다: %', v_status;
  end if;
  if p_open_at is not null and p_close_at is not null and p_close_at <= p_open_at then
    raise exception '모집 마감 일시는 시작 일시보다 뒤여야 합니다.';
  end if;

  if p_program_module_id is not null and not exists (
    select 1 from public.program_modules pm
    where pm.id = p_program_module_id
      and pm.program_id = p_program_id
      and pm.module_type = 'RECRUITMENT'
  ) then
    raise exception '모집 신청서는 해당 프로그램의 모집 모듈 인스턴스에만 연결할 수 있습니다.';
  end if;

  if v_id is not null and not exists (
    select 1 from public.application_forms where id = v_id and program_id = p_program_id
  ) then
    raise exception '수정할 신청서를 찾을 수 없습니다.';
  end if;

  -- 폼 본문(제목·랜딩)만 저장한다. 공개 메타(토큰·상태·기간)는 더 이상 여기 담기지 않는다.
  if v_id is null then
    insert into public.application_forms
      (program_id, program_module_id, title, status, landing)
    values (p_program_id, p_program_module_id, coalesce(v_title, '모집 신청서'),
            'DRAFT', coalesce(p_landing, '{}'::jsonb))
    returning id into v_id;
  else
    update public.application_forms set
      program_module_id = coalesce(p_program_module_id, program_module_id),
      title             = coalesce(v_title, title),
      landing           = coalesce(p_landing, landing),
      updated_at        = now()
    where id = v_id
    returning program_module_id into v_module;
  end if;

  -- 공개 메타 → 링크 원장. 이 함수는 DEFINER라 RLS가 걸리지 않으므로 템플릿 상한을 여기서
  -- 직접 확인한다. 닫는 방향(PRIVATE)은 상한과 무관하게 허용한다 — 상한이 내려간 뒤에도
  -- 담당자가 자기 손으로 정리할 수 있어야 한다.
  if v_module is not null then
    if v_status <> 'PRIVATE' and not app.module_public_linkable('RECRUITMENT') then
      raise exception '모집 템플릿의 링크 공유가 꺼져 있습니다. ADMIN 모듈 관리에서 켜 주세요.'
        using errcode = '42501';
    end if;
    insert into public.program_module_public_links
      (entity_key, program_module_id, token, status, open_at, close_at, created_by)
    values ('program', v_module, app.new_public_link_token(), v_status,
            p_open_at, p_close_at, app.current_app_user_id())
    on conflict (entity_key, program_module_id) do update set
      -- 토큰은 건드리지 않는다: 이미 배포된 주소가 죽으면 수습할 방법이 없다.
      status     = excluded.status,
      open_at    = excluded.open_at,
      close_at   = excluded.close_at,
      updated_at = now()
    returning token into v_token;
  end if;

  -- 필드 reconcile: p_fields가 배열일 때만 수행(NULL이면 필드 미변경).
  if p_fields is not null and jsonb_typeof(p_fields) = 'array' then
    v_keep_ids := '{}'::uuid[];
    for v_field in select * from jsonb_array_elements(p_fields) loop
      v_fid := nullif(v_field->>'id', '')::uuid;
      if v_fid is null then
        insert into public.application_form_fields
          (form_id, field_type, label, is_required, options, file_constraints, sort_order)
        values (
          v_id,
          coalesce(v_field->>'field_type', 'text'),
          coalesce(v_field->>'label', ''),
          coalesce((v_field->>'is_required')::boolean, false),
          coalesce(v_field->'options', '[]'::jsonb),
          coalesce(v_field->'file_constraints', '{}'::jsonb),
          coalesce((v_field->>'sort_order')::integer, 0)
        )
        returning id into v_fid;
      else
        update public.application_form_fields set
          field_type       = coalesce(v_field->>'field_type', field_type),
          label            = coalesce(v_field->>'label', label),
          is_required      = coalesce((v_field->>'is_required')::boolean, is_required),
          options          = coalesce(v_field->'options', options),
          file_constraints = coalesce(v_field->'file_constraints', file_constraints),
          sort_order       = coalesce((v_field->>'sort_order')::integer, sort_order)
        where id = v_fid and form_id = v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_fid);
    end loop;

    if exists (
      select 1 from public.application_form_fields f
      where f.form_id = v_id
        and not (f.id = any(v_keep_ids))
        and exists (select 1 from public.application_answers a where a.field_id = f.id)
    ) then
      raise exception '이미 접수된 응답이 있는 필드는 삭제할 수 없습니다. (해당 필드를 유지하세요)';
    end if;

    delete from public.application_form_fields f
    where f.form_id = v_id and not (f.id = any(v_keep_ids));
  end if;

  return jsonb_build_object('id', v_id, 'public_token', v_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_program_guest_access_window(p_program_id uuid, p_ends timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_ws    text;
  v_table text;
begin
  if p_program_id is null then
    raise exception '사업을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  v_ws := app.program_ws(p_program_id);
  v_table := case v_ws
               when 'project'  then 'programs'
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
$function$;

CREATE OR REPLACE FUNCTION public.set_program_staffing(p_program_id uuid, p_departments jsonb, p_managers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'app', 'public'
AS $function$
declare
  v_dep_count  int;
  v_mgr_count  int;
  v_pm         int;
  v_prog_start date;
  v_prog_end   date;
  v_env_start  date;
  v_env_end    date;
  v_bad        int;
begin
  -- 인가
  if not (
    app.is_admin()
    or (app.can_write_workspace('project') and app.can_access_program(p_program_id))
  ) then
    raise exception '프로그램 담당자를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  select count(*) into v_dep_count
  from jsonb_to_recordset(coalesce(p_departments, '[]'::jsonb))
    as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int);
  select count(*), count(*) filter (where role = 'PM') into v_mgr_count, v_pm
  from jsonb_to_recordset(coalesce(p_managers, '[]'::jsonb))
    as m(user_id uuid, org_version_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);

  -- 둘 다 비면(미배정) 전량 삭제 후 종료.
  if v_dep_count = 0 and v_mgr_count = 0 then
    delete from public.program_managers    where program_id = p_program_id;
    delete from public.program_departments where program_id = p_program_id;
    return;
  end if;
  if v_dep_count = 0 then
    raise exception '부서 구성을 먼저 설정해야 합니다.';
  end if;

  -- 부서 값 유효성(종류/비율/버전 소속)
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, kind text, collaboration_ratio int)
    where d.org_version_id is null or d.kind not in ('MAIN', 'COLLAB')
       or d.collaboration_ratio is null or d.collaboration_ratio < 1 or d.collaboration_ratio > 100
  ) then
    raise exception '부서 종류(MAIN/COLLAB)·협업비율(1~100)·org 버전을 올바르게 입력하세요.';
  end if;
  -- 부서는 해당 org 버전 소속이어야 함(departments.version_id = org_version_id).
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid)
    left join public.departments dd on dd.id = d.department_id
    where dd.id is null or dd.version_id <> d.org_version_id
  ) then
    raise exception '부서가 지정한 조직 버전에 속하지 않습니다.';
  end if;
  -- 단계(버전) 그룹별: 메인 정확히 1개 + 협업비율 합 100 + 부서 중복 없음.
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    group by d.org_version_id
    having count(*) filter (where d.kind = 'MAIN') <> 1
        or sum(d.collaboration_ratio) <> 100
        or count(*) <> count(distinct d.department_id)
  ) then
    raise exception '각 조직 버전(단계)에서 메인 1개 + 협업비율 합 100%%를 지켜야 합니다.';
  end if;

  -- 담당자 값 유효성
  if v_mgr_count = 0 then raise exception '담당자를 1명 이상 배정해야 합니다.'; end if;
  if v_pm < 1 then raise exception 'PM을 최소 1명(구간) 지정해야 합니다.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(role text, allocation_rate int, start_date date, end_date date, org_version_id uuid, department_id uuid)
    where m.role is null or m.role not in ('PM', 'MEMBER')
       or m.allocation_rate is null or m.allocation_rate < 1 or m.allocation_rate > 100
       or m.start_date is null or m.end_date is null or m.start_date > m.end_date
       or m.org_version_id is null or m.department_id is null
  ) then
    raise exception '담당자 구간의 부서·역할·투입률(1~100)·수행 기간을 올바르게 입력하세요.';
  end if;
  -- 담당자 (버전, 부서)는 그 버전에 지정된 부서 중 하나여야 함.
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(org_version_id uuid, department_id uuid)
    where not exists (
      select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid)
      where d.org_version_id = m.org_version_id and d.department_id = m.department_id)
  ) then
    raise exception '담당자의 부서는 해당 단계에 지정된 부서 중 하나여야 합니다.';
  end if;
  -- 담당자 구간은 그 org 버전 유효기간[from, to) 안이어야 함.
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(org_version_id uuid, start_date date, end_date date)
    join public.org_versions ov on ov.id = m.org_version_id
    where m.start_date < ov.effective_from or (ov.effective_to is not null and m.end_date >= ov.effective_to)
  ) then
    raise exception '담당자 구간이 소속 조직 버전의 유효기간을 벗어났습니다.';
  end if;

  -- 프로그램 기간 내
  select start_date, end_date into v_prog_start, v_prog_end from public.programs where id = p_program_id;
  if v_prog_start is not null and v_prog_end is not null then
    if exists (
      select 1 from jsonb_to_recordset(p_managers) as m(start_date date, end_date date)
      where m.start_date < v_prog_start or m.end_date > v_prog_end
    ) then
      raise exception '담당자 수행 기간은 프로그램 기간(% ~ %) 내여야 합니다.', v_prog_start, v_prog_end;
    end if;
  end if;

  select coalesce(v_prog_start, min(start_date)), coalesce(v_prog_end, max(end_date))
    into v_env_start, v_env_end
  from jsonb_to_recordset(p_managers) as m(start_date date, end_date date);

  -- 핵심 불변식: 매일 × '그날 유효한 설정된 단계'의 부서마다 활성 담당자 합 = 협업비율.
  with days as (select g.d::date d from generate_series(v_env_start, v_env_end, interval '1 day') g(d)),
  cfg_ver as (
    select distinct d.org_version_id, ov.effective_from, ov.effective_to
    from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    join public.org_versions ov on ov.id = d.org_version_id
  ),
  day_ver as (
    select days.d, cv.org_version_id
    from days join cfg_ver cv
      on days.d >= cv.effective_from and (cv.effective_to is null or days.d < cv.effective_to)
  )
  select count(*) into v_bad
  from day_ver dv
  join jsonb_to_recordset(p_departments) as dep(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    on dep.org_version_id = dv.org_version_id
  where dep.collaboration_ratio <> (
    select coalesce(sum(m.allocation_rate), 0)
    from jsonb_to_recordset(p_managers)
      as m(org_version_id uuid, department_id uuid, allocation_rate int, start_date date, end_date date)
    where m.org_version_id = dep.org_version_id and m.department_id = dep.department_id
      and m.start_date <= dv.d and m.end_date >= dv.d
  );
  if v_bad > 0 then
    raise exception '단계별로 각 부서를 전 구간에서 협업비율만큼 채워야 합니다. (미충족 %건)', v_bad;
  end if;

  -- 원자 교체
  delete from public.program_managers    where program_id = p_program_id;
  delete from public.program_departments where program_id = p_program_id;
  insert into public.program_departments (program_id, org_version_id, department_id, kind, collaboration_ratio)
  select p_program_id, d.org_version_id, d.department_id, d.kind::public.program_department_kind, d.collaboration_ratio
  from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int);
  insert into public.program_managers
    (program_id, org_version_id, user_id, department_id, role, allocation_rate, start_date, end_date, assigned_by)
  select
    p_program_id, m.org_version_id, m.user_id, m.department_id, m.role::public.program_manager_role,
    m.allocation_rate, m.start_date, m.end_date, app.current_app_user_id()
  from jsonb_to_recordset(p_managers)
    as m(user_id uuid, org_version_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);
end;
$function$;
-- ── 4. 텍스트로 키를 저장해 개명이 닿지 않는 두 곳 ───────────────────────────
-- (1) 모듈 템플릿 카탈로그. 빠뜨리면 남은 모듈 4종을 이 워크스페이스에 배치하지 못한다 —
--     노출 워크스페이스 목록이 없어진 이름을 가리키게 되기 때문이다.
alter table public.module_templates drop constraint if exists module_templates_workspaces_check;
update public.module_templates
   set workspaces = array_replace(workspaces, 'ac', 'project')
 where 'ac' = any (workspaces);
--     `updated_at`은 밀지 않는다 — 개명은 사람이 한 운영 판단이 아니라 스키마 이동이고,
--     밀면 ADMIN 모듈 관리가 '오늘 누군가 카탈로그를 고쳤다'고 거짓을 말한다.
alter table public.module_templates add constraint module_templates_workspaces_check
  check (workspaces <@ array['project'::text, 'mna'::text]);

-- (2) 감사 로그. `ac` 행은 그때의 사실이라 그대로 두고, 폐지 PROJECT를 가리키는 행만
--     이름 충돌을 피해 옮긴다. 트리거가 붙어 있지 않은 표라 기여 로그 오염은 없다.
update public.audit_logs
   set changed_workspace = 'project_retired'
 where changed_workspace = 'project'
   and created_at < '2026-09-09'::timestamptz;

commit;
