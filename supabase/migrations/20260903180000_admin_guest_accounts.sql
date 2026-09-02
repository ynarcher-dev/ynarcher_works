-- =====================================================================
-- ADMIN 게스트 계정 관리 — 계정 축을 사업 축에서 떼어낸다
--
-- 배경 (2026-09-03 사용자 발견):
--   게스트 계정은 별도 원장이 아니라 public.users에 내부 임직원과 같은 모양으로 들어온다
--   (guest-auth-login이 초대 레코드를 보고 삽입). 그래서 MANAGEMENT 인사 관리 목록에
--   게스트가 섞여 나왔고, 그 목록을 읽는 결재선·딜메이커 후보·생성자 교체 후보·멘션
--   후보에도 함께 섞였다. 화면 필터는 프론트가 함께 고치지만, 원장 쪽에도 경계가 필요하다.
--
-- 확정한 경계 — 문(門)은 사업이, 계정은 ADMIN이 소유한다:
--   · 사업 담당자(PM·MEMBER)는 **자기 사업의 문**을 여닫는다(program_participants.login_status).
--     open/close_program_guest_access는 그대로다.
--   · ADMIN은 **계정 자체**를 세우고 재운다(users.is_active). 한 게스트가 세 사업에 걸려
--     있으면 어느 사업 담당자도 그 사람을 전부 멈출 수 없다 — 그 일을 할 자리가 없었다.
--   두 축은 독립이다. 계정을 정지해도 명부의 login_status는 그대로 두며(사업 운영 기록이지
--   계정 상태가 아니다), 계정을 되살리면 원래 열려 있던 사업이 그대로 열린다.
--
-- 왜 정지가 실제로 막는가:
--   app.current_app_user_id()가 이미 `is_active and deleted_at is null`을 확인하므로,
--   is_active=false인 순간 그 계정의 모든 요청이 Default Deny로 떨어진다. 여기에 정지 시
--   session_version을 올려 **발급된 토큰까지** 죽인다 — 올리지 않으면 정지를 풀었을 때
--   정지 전에 나간 토큰(TTL 8시간)이 되살아난다. 해제할 때는 올리지 않는다(죽일 세션이 없다).
--   로그인 자체를 막는 것은 Edge Function 몫이다(_shared/guestInvitation.ts 동반 수정) —
--   서명은 service_role이 하므로 RLS가 가로막지 않고, 그대로 두면 "로그인은 되는데 아무것도
--   안 보이는" 화면이 된다.
--
-- 삭제는 두지 않는다. 물리 삭제 금지 원칙 그대로이며, 게스트 계정은 명부 행·초대 레코드·
--   기여 기록이 가리키는 대상이라 지우면 그 기록들이 누구 것인지 답할 수 없게 된다.
--   되돌릴 수 있는 정지 하나로 충분하다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: admin(계정 원장) / 데이터 등급: Personal(성명·이메일)
--   · 신규 테이블·Storage·트리거 없음. 함수 4개(신규 3 + 재정의 1), 정책 2개 재정의.
--   · 신규 RPC 2종은 모두 SECURITY INVOKER다 — users 원장의 RLS가 그대로 판정하고,
--     함수는 그 위에 app.is_admin() 게이트를 하나 더 얹는다. DEFINER로 만들면 users
--     정책을 함수 안에 복제하게 되고 그 복제본이 곧 권한 구멍이 된다.
--   · 권한에 준하는 변경이므로 audit_logs 적재를 함수가 강제한다(정지 시 사유 필수).
--   · SELECT/INSERT/UPDATE 정책 분리 유지. DELETE 정책 없음.
--   · 외부 게스트는 이 RPC를 실행해도 is_admin() 게이트에서 막힌다(게스트는 super_admin이
--     될 수 없다). guest_invitations·audit_logs에 대한 게스트 SELECT 정책은 없다.
--   · 운영 영향: users_update/users_insert의 MANAGEMENT 분기가 게스트 행에서 좁아진다.
--     임직원 생성 Edge Function은 service_role이라 영향 없고, 게스트 계정 생성도 마찬가지다.
-- 근거: docs/docs_planning/3_2_workspace_admin.md §1.8
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 게스트 유형 판정 — SQL 쪽 단일 원천
--     지금까지 세 값이 정책·함수 곳곳에 문자열로 적혀 있었다. 새로 쓰는 것은 전부 이
--     헬퍼를 경유하고, app.is_guest()도 여기로 돌려 앞으로는 목록이 한 곳에서만 자란다.
--     기존 정책의 인라인 비교는 그대로 둔다 — 뜻이 같고, 12곳을 흔드는 편이 더 위험하다.
-- ---------------------------------------------------------------------
create or replace function app.is_guest_user_type(p_user_type public.user_type)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select p_user_type in ('external_startup', 'external_expert', 'temporary_guest');
$$;

grant execute on function app.is_guest_user_type(public.user_type) to authenticated;

comment on function app.is_guest_user_type(public.user_type) is
  '이 계정 유형이 외부 게스트인가. 유형 목록의 SQL 쪽 단일 원천(프론트는 lib/userTypes.ts).';

create or replace function app.is_guest()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    app.is_guest_user_type(nullif(app.current_app_role(), '')::public.user_type),
    false
  );
$$;

comment on function app.is_guest() is
  '현재 요청자가 외부 게스트인가. 유형 판정은 app.is_guest_user_type()에 위임한다.';

-- ---------------------------------------------------------------------
-- (2) 인사 담당자는 게스트 계정을 만지지 않는다
--     users 쓰기는 admin 또는 management 쓰기 권한이었다. 게스트 계정이 인사 원장에서
--     빠지는 이상 그 화면의 권한으로 게스트 행을 고칠 수 있어야 할 이유도 없다 —
--     보이지 않는 행을 고칠 수 있는 권한은 사고 경로일 뿐이다. 게스트 축은 ADMIN이 갖는다.
--     SELECT는 건드리지 않는다: 내부 사용자가 게스트 행을 읽을 수 있어야 참가자 명부가
--     그 게스트의 이름을 붙일 수 있다(읽기를 막으면 명부가 빈 칸이 된다).
-- ---------------------------------------------------------------------
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert
  with check (
    app.is_admin()
    or (app.can_write_workspace('management') and not app.is_guest_user_type(user_type))
  );

drop policy if exists users_update on public.users;
create policy users_update on public.users for update
  using (
    app.is_admin()
    or (app.can_write_workspace('management') and not app.is_guest_user_type(user_type))
  )
  with check (
    app.is_admin()
    or (app.can_write_workspace('management') and not app.is_guest_user_type(user_type))
  );

-- ---------------------------------------------------------------------
-- (3) 감사 액션 확장 — 계정 정지·해제
-- ---------------------------------------------------------------------
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
set search_path = app, public
as $$
begin
  if p_action not in (
    'GUEST_ACCESS_OPEN', 'GUEST_ACCESS_CLOSE', 'GUEST_PASSWORD_RESET',
    'GUEST_ACCOUNT_SUSPEND', 'GUEST_ACCOUNT_RESTORE'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, action, changed_workspace, after_permission, after_data, reason)
  values
    (app.current_app_user_id(), p_target_user_id, p_action, 'guest', p_after, p_data, p_reason);
end;
$$;

-- ---------------------------------------------------------------------
-- (4) 전사 게스트 계정 목록
--
--     한 계정이 여러 사업에 걸릴 수 있으므로(초대 레코드는 명부 행당 1건) 사업은 접어
--     jsonb 배열로 돌려주고, 화면은 건수를 세워 두고 펼쳐 본다.
--
--     사업 원장이 셋이라 union으로 합친다. entity_key를 조건에 함께 거는 것이 중요하다 —
--     통합 명부에서 program_id만으로 사업을 찾으면 세 워크스페이스의 행을 한꺼번에 집는다.
--
--     SECURITY INVOKER + is_admin() 게이트. 게이트를 두는 이유는 INVOKER만으로는 일반
--     내부 사용자가 절반쯤 채워진 목록(자기 스코프의 명부만 붙은)을 받게 되어, 없는 것과
--     못 보는 것이 같은 화면이 되기 때문이다.
-- ---------------------------------------------------------------------
create or replace function public.admin_guest_accounts(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  user_id       uuid,
  name          text,
  email         text,
  user_type     text,
  is_active     boolean,
  company_name  text,
  created_at    timestamptz,
  last_login_at timestamptz,
  program_count integer,
  open_count    integer,
  programs      jsonb,
  total_count   bigint
)
language plpgsql
stable
security invoker
set search_path = app, public
as $$
#variable_conflict use_column
-- 위 한 줄: OUT 파라미터 이름(name·email·is_active…)이 조회 안의 같은 이름 컬럼과 겹친다.
-- plpgsql은 기본적으로 변수를 먼저 잡으므로, 겹칠 때는 컬럼으로 읽도록 못박는다. 아래 조회는
-- 전부 별칭으로 한정해 두었지만, 한정을 빠뜨린 한 줄이 조용히 상수로 바뀌는 편이 더 나쁘다.
begin
  -- 없는 것과 못 보는 것이 같은 화면이 되지 않도록, 빈 목록이 아니라 사유로 답한다.
  if not app.is_admin() then
    raise exception '게스트 계정 목록은 시스템 관리자만 조회할 수 있습니다.' using errcode = '42501';
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
    select u.id, u.name, u.email, u.user_type::text as user_type, u.is_active, u.created_at, u.company_id
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
    select gi.app_user_id                                   as user_id,
           max(gi.used_at)                                  as last_login_at,
           count(*) filter (where pp.id is not null)::int    as program_count,
           count(*) filter (where pp.login_status in ('INVITED', 'ACTIVE'))::int as open_count,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'program_id',   pp.program_id,
                 'entity_key',   pp.entity_key,
                 'workspace',    app.entity_key_workspace(pp.entity_key),
                 'code',         l.code,
                 'title',        l.title,
                 'role',         pp.role,
                 'login_status', pp.login_status
               )
               order by l.title
             ) filter (where pp.id is not null),
             '[]'::jsonb
           ) as programs
      from public.guest_invitations gi
      left join public.program_participants pp on pp.id = gi.participant_id
      left join ledger l on l.id = pp.program_id and l.entity_key = pp.entity_key
     where gi.app_user_id is not null
     group by gi.app_user_id
  )
  select a.id,
         a.name,
         a.email,
         a.user_type,
         a.is_active,
         s.name,
         a.created_at,
         k.last_login_at,
         coalesce(k.program_count, 0),
         coalesce(k.open_count, 0),
         coalesce(k.programs, '[]'::jsonb),
         count(*) over ()
    from accounts a
    left join links k on k.user_id = a.id
    left join public.startups s on s.id = a.company_id
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_guest_accounts(text, integer, integer) from public;
grant execute on function public.admin_guest_accounts(text, integer, integer) to authenticated;

comment on function public.admin_guest_accounts(text, integer, integer) is
  '전사 게스트 계정 목록(참여 사업 접힌 jsonb 포함). ADMIN 전용, SECURITY INVOKER. 근거: 20260903180000';

-- ---------------------------------------------------------------------
-- (5) 계정 정지·해제
--
--     정지는 즉시 전면적이다 — 그 계정이 걸린 모든 사업에서 동시에 멈춘다. 사업 하나만
--     닫고 싶다면 그것은 사업 담당자의 close_program_guest_access이지 이 함수가 아니다.
--     명부의 login_status는 건드리지 않는다: 그것은 사업 운영 기록이고, 정지를 풀었을 때
--     원래 열려 있던 사업이 그대로 열려야 한다.
-- ---------------------------------------------------------------------
create or replace function public.set_guest_account_active(
  p_user_id uuid,
  p_active  boolean,
  p_reason  text default null
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_type   public.user_type;
  v_active boolean;
  v_name   text;
begin
  if not app.is_admin() then
    raise exception '게스트 계정 상태는 시스템 관리자만 바꿀 수 있습니다.' using errcode = '42501';
  end if;

  select u.user_type, u.is_active, u.name
    into v_type, v_active, v_name
    from public.users u
   where u.id = p_user_id and u.deleted_at is null;
  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  -- 임직원 계정을 이 경로로 재우지 않는다. 임직원 비활성화는 인사 원장의 일이고,
  -- 여기서 함께 처리하면 '게스트 계정 관리'라는 이름이 사실과 달라진다.
  if not app.is_guest_user_type(v_type) then
    raise exception '게스트 계정이 아닙니다.' using errcode = '22023';
  end if;

  -- 정지는 되돌릴 수 있지만 그 사람의 오늘 업무를 끊는다. 왜 끊었는지가 남지 않으면
  -- 다음 담당자는 풀어도 되는지 판단할 근거가 없다.
  if not p_active and nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception '정지 사유를 입력해야 합니다.' using errcode = '22023';
  end if;

  if v_active = p_active then
    return; -- 같은 상태면 아무 일도 하지 않는다(감사 로그에 빈 줄을 남기지 않는다).
  end if;

  update public.users
     set is_active = p_active,
         -- 정지할 때만 올린다. 이미 발급된 토큰을 죽여, 나중에 풀어도 그 토큰이
         -- 되살아나지 않게 한다. 해제 시에는 죽일 세션이 없다.
         session_version = case when p_active then session_version else session_version + 1 end,
         updated_at = now()
   where id = p_user_id;

  perform app.log_guest_access(
    p_user_id,
    case when p_active then 'GUEST_ACCOUNT_RESTORE' else 'GUEST_ACCOUNT_SUSPEND' end,
    case when p_active then 'guest:active' else 'guest:suspended' end,
    jsonb_build_object('user_id', p_user_id, 'name', v_name, 'user_type', v_type),
    p_reason
  );
end;
$$;

revoke all on function public.set_guest_account_active(uuid, boolean, text) from public;
grant execute on function public.set_guest_account_active(uuid, boolean, text) to authenticated;

comment on function public.set_guest_account_active(uuid, boolean, text) is
  '게스트 계정 정지·해제(전 사업 동시). 정지 시 session_version을 올려 발급된 토큰까지 무효화한다. ADMIN 전용, 감사 로그 강제. 근거: 20260903180000';
