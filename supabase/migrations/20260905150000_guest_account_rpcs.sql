-- =====================================================================
-- [게스트 통합 계정 4/4] RPC — 발급 · 매핑 · 접근 기간 · 재설정 인가 · 목록
-- 선행: 20260905140000_guest_session_context_claim.sql
-- 정본: docs/docs_planning/3_9_1_guest_unified_account.md §9, §11
--
-- 권한이 걸릴 자리는 발급이 아니라 매핑이다:
--   계정을 만들어도 사업에 매핑되기 전까지는 아무것도 보이지 않는다(로그인하면 빈 목록).
--   대상도 임의가 아니라 원장에 이미 있는 행으로 제한된다. 그래서 발급은 내부 사용자 전원,
--   매핑·기간·차단은 그 사업 담당자, 계정 정지·해제는 ADMIN이다.
--
-- 열쇠는 아무도 대신 쥐지 않는다:
--   종전의 담당자 '비밀번호 초기화'를 폐기하고 **재설정 안내 발송 인가**만 남긴다.
--   계정을 합치면 값을 쥔 사람이 그 게스트의 다른 팀 사업까지 열 수 있기 때문이다.
--   이 파일은 인가만 담당하고, 토큰 생성·발송은 service_role Edge Function이 한다.
--
-- 보안 게이트 답변:
--   - 소유 워크스페이스: guest(계정) / ac·mna·project(매핑·기간) / admin(목록)
--   - 데이터 등급: Personal(연락처) + Internal(참여 현황)
--   - 접근 주체: 내부 사용자만. 모든 함수가 첫 줄에서 app.is_guest()를 막는다
--   - Scope 기준: 발급=내부 전원 / 매핑·기간=app.is_program_manager / 목록=내부 전원(마스킹)
--   - SECURITY DEFINER 신설: public.issue_guest_account 하나.
--     users·workspace_permissions에 게스트 행을 넣어야 하는데 users_insert 정책의
--     MANAGEMENT 분기가 게스트 행을 배제하므로 INVOKER로는 성립하지 않는다.
--     함수 내부에서 호출자 권한을 먼저 확인하고 search_path를 고정한다.
--   - 감사 로그: 발급·매핑·재설정 인가 전부 app.log_guest_access()를 탄다
--   - 운영 영향: admin_guest_accounts를 guest_accounts_list로 대체한다(프론트 훅 동시 수정).
--     reset_program_guest_password는 애초에 만들어진 적이 없어 드롭 대상이 없다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 마스킹 헬퍼 — 목록에서 원본을 내보내지 않는다
--     ADMIN만 원본을 보고 나머지는 가려진 값을 본다. 화면이 아니라 서버에서 가리는 이유는
--     UI에서 숨기는 것은 보안이 아니기 때문이다(개발 수칙).
-- ---------------------------------------------------------------------
create or replace function app.mask_email(p text)
returns text
language sql
immutable
as $fn$
  select case
    when p is null or position('@' in p) = 0 then null
    else left(split_part(p, '@', 1), 2) || '***@' || split_part(p, '@', 2)
  end;
$fn$;

create or replace function app.mask_phone(p text)
returns text
language sql
immutable
as $fn$
  select case
    when p is null or length(regexp_replace(p, '\D', '', 'g')) < 7 then null
    else regexp_replace(regexp_replace(p, '\D', '', 'g'), '^(\d{3})(\d+)(\d{4})$', '\1-****-\3')
  end;
$fn$;

comment on function app.mask_email(text) is '목록용 이메일 마스킹. 원본은 ADMIN 경로에서만 나간다.';

-- ---------------------------------------------------------------------
-- (2) 계정 발급 — 원장 행 하나에 계정 하나 (멱등)
--
--     같은 원장 행에 계정이 이미 있으면 그것을 그대로 돌려준다. 담당자가 명부에서
--     `연결`을 눌렀을 때 신규인지 기존인지 구분할 필요가 없는 것이 이 멱등성 덕이다.
--
--     SECURITY DEFINER인 이유는 위 보안 게이트 답변에 적었다. 호출자 확인이 본문 첫머리에 있다.
-- ---------------------------------------------------------------------
create or replace function public.issue_guest_account(
  p_master_table text,
  p_master_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  v_existing  uuid;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_user_type text;
  v_company   uuid;
  v_new       uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  -- 게스트가 게스트를 만들 수 있으면 계정 원장이 밖에서 자란다.
  if app.is_guest() then
    raise exception '내부 사용자만 게스트 계정을 발급할 수 있습니다.' using errcode = '42501';
  end if;
  if p_master_table is null or p_master_id is null then
    raise exception '원장과 대상을 지정해야 합니다.' using errcode = '22023';
  end if;
  if p_master_table not in ('startups', 'networks') then
    raise exception '지원하지 않는 원장입니다: %', p_master_table using errcode = '22023';
  end if;

  -- 이미 있으면 그대로 돌려준다. 재운 계정(deleted_at)은 세지 않는다 — 병합으로 흡수된
  -- 계정이 새 발급을 영원히 막으면 안 되고, 부분 유니크 인덱스도 같은 기준이다.
  select u.id into v_existing
    from public.users u
   where u.guest_master_table = p_master_table
     and u.guest_master_id    = p_master_id
     and u.deleted_at is null
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_master_table = 'startups' then
    select s.representative, nullif(s.contact ->> 'email', ''), nullif(s.contact ->> 'phone', '')
      into v_name, v_email, v_phone
      from public.startups s
     where s.id = p_master_id and s.deleted_at is null;
    v_user_type := 'external_startup';
    v_company   := p_master_id;
  else
    select n.name, nullif(n.email, ''), nullif(n.phone, '')
      into v_name, v_email, v_phone
      from public.networks n
     where n.id = p_master_id and n.deleted_at is null and n.merged_into_id is null;
    v_user_type := 'external_expert';
  end if;

  if v_name is null then
    raise exception '원장에서 대상을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  -- 이메일은 로그인 ID이고 연락처는 초기 비밀번호다. 계정을 **처음 세울 때만** 둘 다 필요하며,
  -- 이미 계정이 있는 대상은 위에서 돌아갔으므로 이 검사가 매핑을 막지 않는다.
  if v_email is null or v_phone is null then
    raise exception '원장에 이메일과 연락처가 모두 있어야 계정을 세울 수 있습니다. NETWORKS에서 먼저 보완하십시오.'
      using errcode = '22023';
  end if;

  insert into public.users (user_type, name, email, phone, company_id,
                            guest_master_table, guest_master_id)
  values (v_user_type::public.user_type, v_name, v_email, v_phone, v_company,
          p_master_table, p_master_id)
  returning id into v_new;

  -- 유형별 권한 템플릿. 기업은 자사(company), 전문가는 본인(self) 범위다.
  insert into public.workspace_permissions (user_id, workspace_key, permission_level, scope_type, scope_id)
  values (
    v_new, 'guest', 'write',
    case when v_user_type = 'external_startup' then 'company' else 'self' end::public.scope_type,
    case when v_user_type = 'external_startup' then v_company else null end
  )
  on conflict (user_id, workspace_key) do nothing;

  -- 자격증명 자리를 비워 둔 채로 함께 만든다. 행이 없으면 로그인 경로가 "초기 상태"와
  -- "계정 없음"을 구분하지 못한다.
  insert into public.guest_credentials (user_id) values (v_new)
  on conflict (user_id) do nothing;

  perform app.log_guest_access(
    v_new,
    'GUEST_ACCOUNT_ISSUE',
    'guest:account',
    jsonb_build_object('master_table', p_master_table, 'master_id', p_master_id),
    null
  );

  return v_new;
end;
$fn$;

revoke all on function public.issue_guest_account(text, uuid) from public;
grant execute on function public.issue_guest_account(text, uuid) to authenticated;

comment on function public.issue_guest_account(text, uuid) is
  '원장 행 하나에 게스트 계정을 세운다(멱등). 내부 사용자 전원. 발급만으로는 아무것도 보이지 않으므로 권한이 걸릴 자리는 여기가 아니라 매핑이다. 근거: 3_9_1 §9';

-- ---------------------------------------------------------------------
-- (3) 접근 기간 기본값
--     사업 종료일 + 유예 14일. 종료일이 없으면 개방일 + 1년.
--     담당자가 아무것도 채우지 않아도 기간이 생기게 하는 것이 요점이다.
-- ---------------------------------------------------------------------
create or replace function app.default_access_end(p_program_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = app, public
as $fn$
declare
  v_end date;
begin
  v_end := (app.program_row(p_program_id) ->> 'end_date')::date;
  if v_end is null then
    return now() + interval '1 year';
  end if;
  return (v_end + interval '14 days')::timestamptz;
exception when others then
  return now() + interval '1 year';
end;
$fn$;

grant execute on function app.default_access_end(uuid) to authenticated;

comment on function app.default_access_end(uuid) is
  '참여 줄의 접근 종료 기본값(사업 종료일 + 14일, 없으면 1년). 근거: 3_9_1 §8';

-- ---------------------------------------------------------------------
-- (4) 로그인 개방 = 계정 연결
--
--     달라진 것 셋:
--       · 계정을 **이 시점에 만든다.** 종전에는 첫 로그인 때 만들어져서, 담당자 화면이
--         "이 사람에게 계정이 있는가"에 답할 수 없었다.
--       · 명부 행에 user_id를 바로 붙인다. 문이 열리는 기준은 여전히 login_status='ACTIVE'
--         (실제 로그인)이므로 조회 범위가 넓어지지 않는다.
--       · 접근 기간 기본값을 채운다(이미 값이 있으면 건드리지 않는다 — 담당자가 정한 값을
--         재개방이 덮으면 안 된다).
--     반환에 account_is_new를 더해 안내 문안을 가른다("전화번호로 비밀번호를 정하세요" vs
--     "기존 비밀번호로 들어오면 이 사업이 추가돼 있습니다").
-- ---------------------------------------------------------------------
drop function if exists public.open_program_guest_access(uuid[]);

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

    -- 계정이 이미 있었는지를 발급 전에 본다(발급은 멱등이라 사후에는 구분되지 않는다).
    select exists (
      select 1 from public.users u
       where u.guest_master_table = r.master_table
         and u.guest_master_id    = r.master_id
         and u.deleted_at is null
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
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id, 'role', r.role,
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

comment on function public.open_program_guest_access(uuid[]) is
  '명부 행에 게스트 계정을 연결하고 문을 연다(사업 담당자 전용, SECURITY INVOKER). 계정이 없으면 만들어 붙이므로 담당자는 신규·기존을 구분하지 않는다. 접근 기간 기본값도 여기서 채운다. 근거: 3_9_1 §11.3';

-- ---------------------------------------------------------------------
-- (5) 접근 기간 수정 — 그 사업 담당자만
-- ---------------------------------------------------------------------
create or replace function public.set_participant_access_window(
  p_participant_id uuid,
  p_starts         timestamptz default null,
  p_ends           timestamptz default null
)
returns void
language plpgsql
as $fn$
declare
  v_program uuid;
begin
  select pp.program_id into v_program
    from public.program_participants pp
   where pp.id = p_participant_id;
  if v_program is null then
    raise exception '명부 행을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  if not app.is_program_manager(v_program) then
    raise exception '사업 담당자(PM·MEMBER)만 접근 기간을 정할 수 있습니다.' using errcode = '42501';
  end if;
  if p_starts is not null and p_ends is not null and p_starts >= p_ends then
    raise exception '시작이 종료보다 뒤일 수 없습니다.' using errcode = '22023';
  end if;

  update public.program_participants
     set access_starts_at = p_starts,
         access_ends_at   = p_ends,
         updated_at       = now()
   where id = p_participant_id;

  perform app.log_guest_access(
    null,
    'GUEST_ACCESS_WINDOW',
    'guest:login',
    jsonb_build_object('participant_id', p_participant_id, 'starts', p_starts, 'ends', p_ends),
    null
  );
end;
$fn$;

revoke all on function public.set_participant_access_window(uuid, timestamptz, timestamptz) from public;
grant execute on function public.set_participant_access_window(uuid, timestamptz, timestamptz) to authenticated;

comment on function public.set_participant_access_window(uuid, timestamptz, timestamptz) is
  '참여 줄의 접근 기간을 정한다(사업 담당자 전용). 계정이 아니라 줄이 기간을 갖는 이유는 3_9_1 §8.';

-- ---------------------------------------------------------------------
-- (6) 비밀번호 재설정 안내 — 인가만 한다
--
--     이 함수는 "보내도 되는가"에만 답한다. 토큰 생성과 발송은 service_role Edge Function이
--     하며, **호출자에게는 어떤 값도 돌려주지 않는다.** 담당자가 값을 쥘 수 있으면 계정을
--     합친 순간 그 게스트의 다른 팀 사업까지 열리기 때문이다.
--     내부 사용자 전원이 부를 수 있는 이유도 같다 — 아무 값도 얻지 못하므로 권한을 좁힐
--     실익이 없고, 좁히면 담당자가 아닌 사람이 문의를 받았을 때 할 수 있는 일이 없어진다.
-- ---------------------------------------------------------------------
create or replace function public.authorize_guest_password_reset(p_user_id uuid)
returns void
language plpgsql
as $fn$
declare
  v_uid uuid := app.current_app_user_id();
  v_ok  boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if app.is_guest() then
    raise exception '내부 사용자만 재설정 안내를 보낼 수 있습니다.' using errcode = '42501';
  end if;

  select app.is_guest_user_type(u.user_type) and u.deleted_at is null and u.is_active
    into v_ok
    from public.users u
   where u.id = p_user_id;

  if v_ok is not true then
    raise exception '재설정 대상이 아닙니다(게스트가 아니거나 정지된 계정).' using errcode = '22023';
  end if;

  perform app.log_guest_access(
    p_user_id,
    'GUEST_PASSWORD_RESET_SEND',
    'guest:account',
    jsonb_build_object('requested_by', v_uid),
    null
  );
end;
$fn$;

revoke all on function public.authorize_guest_password_reset(uuid) from public;
grant execute on function public.authorize_guest_password_reset(uuid) to authenticated;

comment on function public.authorize_guest_password_reset(uuid) is
  '재설정 안내 발송 인가와 감사 로그만 수행한다. 토큰 생성·발송은 service_role Edge Function이 하며 호출자에게는 아무 값도 돌려주지 않는다. 근거: 3_9_1 §3';

-- ---------------------------------------------------------------------
-- (7) 계정 목록 — 내부 사용자 전원, 연락처는 ADMIN만 원본
--
--     admin_guest_accounts를 대체한다. 두 화면(OFFICE 창구·ADMIN 콘솔)이 같은 목록을
--     보되 보이는 깊이만 다르므로, 함수를 둘로 나누지 않고 마스킹 여부만 서버가 정한다.
--     나누면 한쪽만 고쳐 어긋난다.
-- ---------------------------------------------------------------------
drop function if exists public.admin_guest_accounts(text, integer, integer);

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
  master_table   text,
  master_id      uuid,
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
           u.created_at, u.company_id, u.guest_master_table, u.guest_master_id
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
                 'role',           pp.role,
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
  )
  select a.id,
         a.name,
         case when v_raw then a.email else app.mask_email(a.email) end,
         case when v_raw then a.phone else app.mask_phone(a.phone) end,
         a.user_type,
         a.is_active,
         s.name,
         a.guest_master_table,
         a.guest_master_id,
         (c.password_hash is not null),
         a.created_at,
         g.last_login_at,
         coalesce(k.program_count, 0),
         coalesce(k.open_count, 0),
         coalesce(k.programs, '[]'::jsonb),
         count(*) over ()
    from accounts a
    left join links  k on k.user_id = a.id
    left join logins g on g.user_id = a.id
    left join public.guest_credentials c on c.user_id = a.id
    left join public.startups s on s.id = a.company_id
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

revoke all on function public.guest_accounts_list(text, integer, integer) from public;
grant execute on function public.guest_accounts_list(text, integer, integer) to authenticated;

comment on function public.guest_accounts_list(text, integer, integer) is
  '전사 게스트 계정 목록. 내부 사용자 전원이 조회하되 연락처 원본은 ADMIN에게만 나간다(서버 마스킹). OFFICE 창구와 ADMIN 콘솔이 같은 함수를 쓴다 — 나누면 한쪽만 고쳐 어긋난다. 근거: 3_9_1 §11.1~§11.2';
