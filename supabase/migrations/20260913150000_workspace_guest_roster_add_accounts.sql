-- =====================================================================
-- 워크스페이스 GUEST 메뉴 — 이미 있는 계정을 그 사업 명부에 담는다
--
-- 정책(2026-09-13 사용자 확정):
--   · 계정을 **만드는 창구는 통합 GUEST 메뉴 하나**다. 워크스페이스(PROJECT·M&A·FUND)의
--     GUEST 메뉴는 이미 있는 계정을 명부에 **넣고 빼는 일만** 한다.
--   · 원장 연결(guest_identities)은 선택이다. 사업 참가는 계정 하나로 성립하며,
--     인격이 없는 계정도 명부에 담긴다.
--
-- 이 파일이 하는 일 여섯:
--   (1) 감사 액션 GUEST_ROSTER_ADD를 연다.
--   (2) app.guest_account_visible — "이 GUEST 계정이 나에게 보이는가"를 한 곳에서 답한다.
--       M&A 인격은 워크스페이스 읽기만으로 열리지 않고 딜 당사자 열람 권한을 요구한다.
--   (3) 명부의 계정 배정 경계에 가드 트리거를 세운다 — **줄이 생기기 전에** 판정한다.
--   (4) public.add_program_guest_accounts — 담당자가 기존 계정을 명부에 담는 신규 RPC.
--   (5) public.open_program_guest_access — 개방이 계정을 만들지 않는다. 원장 참조가 없는
--       줄도 계정만 살아 있으면 연다. FUND·M&A 담당자도 이 경로를 끝까지 쓴다.
--   (6) public.guest_accounts_list — 참여를 추정하지 않고 실제 명부에서 읽는다.
--
-- ── 가드 트리거를 두는 이유(중요) ──────────────────────────────────────
--   RPC 안에서만 가시성을 보면 **RPC를 비켜 가면 그만이다.** authenticated는
--   program_participants에 INSERT·UPDATE 표 권한을 갖고, 정책은 "내 사업인가"만 묻는다.
--   그래서 숨은 M&A 딜의 게스트 user_id를 내 사업 줄에 직접 박아 넣으면, 그 줄이 생기는
--   순간 나에게 읽히고 app.guest_account_visible이 **방금 만든 그 줄을 근거로** 참이 된다.
--   목록이 곧 그 계정의 이름·연락처를 내준다. 판정을 표의 배정 경계로 내리고 BEFORE에서
--   보는 이유가 이것이다 — 새 줄이 자기 자신을 정당화하기 전에 묻는다.
--
--   가드는 GUEST 계정을 새로 배정할 때만 본다. 내부 임직원 참가자, 계정이 없는 줄,
--   값이 그대로인 갱신은 지나간다. 소유자·service_role 같은 신뢰 경로는 RLS를 우회하므로
--   판정이 자연히 참이 되어 기존 서버 경로가 막히지 않는다.
--
-- ── 초대 원장 쓰기(AUTHZ 후속) ─────────────────────────────────────────
--   guest_inv_insert/update는 project·guest 워크스페이스만 봤다. 개방 RPC는 FUND·M&A도
--   다루므로 조합 운용역·딜 담당자는 문을 열다가 초대 레코드에서 막혔다(관측된 불일치,
--   docs/docs_dev/15_authorization_inventory.md §7). **워크스페이스 축을 넓히지 않고**
--   "그 초대가 달린 사업의 담당자"라는 단건 조건 하나를 더해 닫는다 —
--   FUND·M&A 쓰기 권한자 전원이 아니라 그 사업 담당자만이다.
--
-- 하지 않는 것:
--   · users·guest_identities·program_participant_entries·investments에 쓰지 않는다.
--   · 기존 원장 연결 줄(master_table/master_id가 있는 줄)은 건드리지 않는다.
--   · app.validate_guest_participant_roster는 한 글자도 바꾸지 않는다 — 원장 참조가
--     null이면 통과시키고, null이 아니면 인격·참가 명부를 모두 요구한다.
--   · remove_program_participants(20260909160000)를 다시 쓰지 않는다.
--   · guest_inv_select는 건드리지 않는다(이미 게스트 세 역할을 빼고 있다).
--   · 새 테이블·새 DELETE 정책 없음.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md §2) 답변:
--   · 소유 워크스페이스: project / mna / fund(명부)와 guest(계정·초대).
--   · 데이터 등급: Personal(이름·이메일·연락처) + 참여 사실은 Restricted(M&A는 기밀).
--   · 접근 주체: 내부 사용자 중 **그 사업·조합의 담당자**만. 게스트·미인증은 42501.
--   · Scope: program / fund 단건. 판정은 app.is_program_manager 하나가 답한다.
--   · 감사 로그: 명부 추가 1건마다 GUEST_ROSTER_ADD. 허용목록은 app.log_guest_change 한 곳.
--   · SECURITY DEFINER 신설 없음. 신규 RPC·헬퍼·가드 트리거는 모두 **SECURITY INVOKER**다 —
--     가시성 판정을 DEFINER로 감싸면 그 순간 M&A 기밀 판정이 함수 안으로 옮겨 오고,
--     정책과 두 곳이 어긋나는 날이 온다.
--   · 정책 변경: guest_invitations 쓰기 둘을 **좁은 조건 하나 추가**로 다시 만든다.
--     is_internal_user 조건과 기존 세 갈래는 그대로 두며, 사후 확인이 이를 단언한다.
--   · 동시성: 같은 (사업, 계정) 짝의 중복은 유일 인덱스가 막지 못한다
--     (uq_program_participants_master는 master_id가 있는 줄만 덮는다). 그래서 RPC가
--     **맥락 하나에 잠금 하나**를 미리 잡는다 — 계정마다 잡으면 [A,B]와 [B,A] 두 요청이
--     서로의 잠금을 기다려 교착한다. 잠금이 하나뿐이라 그 교착이 성립하지 않고,
--     응답은 입력 순서 그대로 나간다.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- (1) 감사 액션 하나를 연다
--
--     `create or replace`다(drop 아님) — 드롭·재생성하면 ACL과 주석이 조용히 초기값으로
--     돌아간다. 본문은 20260913130000 그대로이며 허용목록에 값 하나만 더한다.
-- ---------------------------------------------------------------------
create or replace function app.log_guest_change(
  p_target_user_id uuid,
  p_action         text,
  p_after          text,
  p_before_data    jsonb,
  p_after_data     jsonb,
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
    'GUEST_CONTACT_UPDATE',
    'GUEST_IDENTITY_ADD',
    'GUEST_PASSWORD_RESET',
    'GUEST_PASSWORD_RESET_SEND',
    'GUEST_ROSTER_ADD'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_user_id, target_user_id, action, changed_workspace,
    after_permission, before_data, after_data, reason
  ) values (
    app.current_app_user_id(), p_target_user_id, p_action, 'guest',
    p_after, p_before_data, p_after_data, p_reason
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- (2) "이 GUEST 계정이 나에게 보이는가" — 한 곳에서 답한다
--
--     목록(guest_accounts_list)·추가(add_program_guest_accounts)·배정 가드가 같은 답을
--     써야 한다. 목록에 안 보이는 계정을 id만 알면 담을 수 있다면, 그 목록은 가림막일 뿐
--     경계가 아니다.
--
--     **SECURITY INVOKER다.** 참여와 인격의 가시성은 호출자 RLS에 그대로 맡긴다.
--     guest_identities 정책도 아래에서 M&A 딜 당사자 단위로 좁히며, 함수 안의
--     app.can_read_ma_party 조건은 그 경계를 명시적으로 한 번 더 고정한다. 워크스페이스
--     읽기만으로 "이 매각 기업에 계정이 있다"가 새면 이메일 하나로 매각 검토를 알 수 있다.
--
--     세 갈래 중 하나면 보인다.
--       · 읽을 수 있는 인격(guest_identities + M&A 당사자 권한)이 있다.
--       · 읽을 수 있는 참여 줄(program_participants)이 있다 — **게스트 유형을 가리지
--         않는다.** 인격이 가려진 계정도 내 사업 명부에 있으면 보여야 한다.
--       · 어디에도 담기지 않은 임시 계정이다 — 내부 사용자 모두가 함께 본다
--         (app.guest_account_has_any_participation, 20260912150002).
-- ---------------------------------------------------------------------
create or replace function app.guest_account_visible(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = app, public
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
             from public.guest_identities gi
            where gi.user_id = u.id
              and case gi.master_table
                    when 'ma_sellers' then app.can_read_ma_party('ma_seller', gi.master_id)
                    when 'ma_buyers'  then app.can_read_ma_party('ma_buyer',  gi.master_id)
                    else true
                  end
         )
         or exists (
           select 1 from public.program_participants pp where pp.user_id = u.id
         )
         or (
           u.user_type = 'temporary_guest'
           and not app.guest_account_has_any_participation(u.id)
         )
       )
  );
$fn$;

-- service_role은 BYPASSRLS라 판정이 늘 참이 되지만, 서버 경로가 이 표에 쓰다가 가드
-- 트리거 안에서 권한 오류로 멈추지 않도록 실행 권한은 남긴다.
revoke all on function app.guest_account_visible(uuid) from public, anon;
grant execute on function app.guest_account_visible(uuid) to authenticated, service_role;

comment on function app.guest_account_visible(uuid) is
  '이 GUEST 계정이 호출자에게 보이는가(SECURITY INVOKER — 참여·인격의 가시성은 호출자 RLS가 답한다). M&A 인격은 정책과 함수 모두 딜 당사자 권한(app.can_read_ma_party)을 요구한다. 목록·명부 추가가 같은 판정을 쓴다.';

-- 인격 표 자체의 SELECT도 같은 경계를 가져야 한다. 목록 함수만 거르면 직접 Data API로
-- guest_identities를 읽거나 p_master_tables를 바꿔 호출하는 경로에서 숨은 M&A 당사자의
-- 유형과 id가 드러난다. 기존 내부 사용자·원장 읽기 조건은 유지하고 M&A 두 원장만 딜별
-- 생성자·열람자 조건을 추가한다.
drop policy if exists guest_identities_select on public.guest_identities;
create policy guest_identities_select on public.guest_identities for select
  using (
    app.current_app_user_id() is not null
    and not app.is_guest()
    and app.can_read_master_table(master_table)
    and case master_table
          when 'ma_sellers' then app.can_read_ma_party('ma_seller', master_id)
          when 'ma_buyers'  then app.can_read_ma_party('ma_buyer', master_id)
          else true
        end
  );

comment on policy guest_identities_select on public.guest_identities is
  '내부 사용자가 읽을 수 있는 원장의 인격만 보며, M&A SELLER·BUYER는 워크스페이스 권한에 더해 해당 당사자의 생성자 또는 지정 열람자여야 한다.';

-- ---------------------------------------------------------------------
-- (3) 배정 경계의 가드 — 줄이 자기 자신을 정당화하기 전에 묻는다
--
--     BEFORE INSERT / BEFORE UPDATE OF user_id다. 이 시점에는 새 줄이 아직 표에 없으므로
--     app.guest_account_visible이 그 줄을 근거로 삼을 수 없다. AFTER로 옮기거나 RPC 안으로
--     되돌리면 이 파일이 막으려는 것이 그대로 열린다.
--
--     지나가는 것 넷(모두 새 노출을 만들지 않는다):
--       · 계정이 없는 줄(user_id is null) — 명부 등록만 하고 사람은 아직 정하지 않은 줄.
--       · 내부 임직원 계정 — 게스트가 아니므로 이 경계의 대상이 아니다.
--       · 값이 그대로인 갱신(open_program_guest_access의 coalesce 재기입이 그렇다).
--       · 소유자·service_role — RLS를 우회하므로 판정이 참이 된다(신뢰 경로 보존).
--
--     원장 참조가 있는 줄(legacy)도 같은 판정을 받는다. 그 줄은
--     app.validate_guest_participant_roster가 인격 일치와 참가 명부를 이미 요구하고,
--     인격을 읽을 수 있는 사람에게는 이 판정도 인격 갈래에서 참이 되므로 정상 경로가
--     좁아지지 않는다. 읽을 수 없는 인격을 남의 사업에 끼워 넣는 경로만 닫힌다.
--
--     PostgreSQL은 BEFORE 행 트리거 안의 재조회에서도 현재 명령이 쓰는 행을 볼 수 있다.
--     따라서 일반 목록 판정을 그대로 부르면 새 줄이 자신의 참여 갈래를 참으로 만든다.
--     아래 배정 전용 판정은 현재 participant id를 모든 참여 판정에서 제외한다.
--
--     전체 참여 존재 여부만 답하는 app.guest_account_has_other_participation은 RLS를 우회한다.
--     숨은 참여를 '없음'으로 오인해 임시 계정을 전사 미참여 계정으로 여는 일을 막기 위해서며,
--     행 내용은 내보내지 않고 boolean 하나만 돌려준다. 나머지 인격·가시 참여 갈래는 계속
--     SECURITY INVOKER여서 호출자 RLS를 받는다.
-- ---------------------------------------------------------------------
create or replace function app.guest_account_has_other_participation(
  p_user_id uuid,
  p_excluded_participant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.program_participants pp
     where pp.user_id = p_user_id
       and pp.id is distinct from p_excluded_participant_id
  );
$fn$;

revoke all on function app.guest_account_has_other_participation(uuid, uuid)
  from public, anon, service_role;
grant execute on function app.guest_account_has_other_participation(uuid, uuid)
  to authenticated, service_role;

comment on function app.guest_account_has_other_participation(uuid, uuid) is
  '배정 중인 현재 명부 행을 빼고 GUEST 계정에 다른 참여가 있는지만 답한다. 숨은 참여도 세야 하므로 SECURITY DEFINER이며 행 내용은 반환하지 않는다.';

create or replace function app.guest_account_visible_for_assignment(
  p_user_id uuid,
  p_excluded_participant_id uuid
)
returns boolean
language plpgsql
stable
security invoker
set search_path = app, public
as $fn$
declare
  v_user_type public.user_type;
begin
  select u.user_type
    into v_user_type
    from public.users u
   where u.id = p_user_id
     and u.deleted_at is null
     and app.is_guest_user_type(u.user_type);

  if not found then
    return false;
  end if;
  if app.is_admin() then
    return true;
  end if;
  if exists (
    select 1
      from public.guest_identities gi
     where gi.user_id = p_user_id
       and case gi.master_table
             when 'ma_sellers' then app.can_read_ma_party('ma_seller', gi.master_id)
             when 'ma_buyers'  then app.can_read_ma_party('ma_buyer',  gi.master_id)
             else true
           end
  ) then
    return true;
  end if;
  if exists (
    select 1
      from public.program_participants pp
     where pp.user_id = p_user_id
       and pp.id is distinct from p_excluded_participant_id
  ) then
    return true;
  end if;
  if v_user_type = 'temporary_guest'::public.user_type
     and not app.guest_account_has_other_participation(
       p_user_id, p_excluded_participant_id) then
    return true;
  end if;

  return false;
end;
$fn$;

revoke all on function app.guest_account_visible_for_assignment(uuid, uuid)
  from public, anon;
grant execute on function app.guest_account_visible_for_assignment(uuid, uuid)
  to authenticated, service_role;

comment on function app.guest_account_visible_for_assignment(uuid, uuid) is
  '명부 배정 직전의 GUEST 계정 가시성. 현재 쓰기 대상 participant 행을 제외해 새 줄이 자신을 근거로 권한을 만들지 못하게 한다(SECURITY INVOKER).';

create or replace function app.guard_guest_participant_assignment()
returns trigger
language plpgsql
set search_path = app, public
as $fn$
declare
  v_user_type public.user_type;
begin
  if new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return new;
  end if;
  -- SELECT RLS로 대상 사용자가 보이지 않는 경우를 "내부 사용자"로 오인해 통과시키면
  -- 숨은 M&A GUEST를 직접 INSERT/UPDATE로 배정할 수 있다. 먼저 보이는 사용자 행을
  -- 확정하고, 보이지 않는 대상은 거절한다. 내부 사용자는 그 다음에만 예외 통과한다.
  select u.user_type
    into v_user_type
    from public.users u
   where u.id = new.user_id
     and u.deleted_at is null;

  if not found then
    raise exception '배정할 사용자 계정을 확인할 권한이 없습니다.'
      using errcode = '42501', hint = 'guest_account_not_visible';
  end if;

  if not app.is_guest_user_type(v_user_type) then
    return new;
  end if;

  if not app.guest_account_visible_for_assignment(new.user_id, new.id) then
    raise exception '이 GUEST 계정을 명부에 배정할 권한이 없습니다.'
      using errcode = '42501', hint = 'guest_account_not_visible';
  end if;

  return new;
end;
$fn$;

revoke all on function app.guard_guest_participant_assignment()
  from public, anon, authenticated;

drop trigger if exists trg_program_participants_guard_guest_assignment
  on public.program_participants;
create trigger trg_program_participants_guard_guest_assignment
  before insert or update of user_id on public.program_participants
  for each row execute function app.guard_guest_participant_assignment();

comment on function app.guard_guest_participant_assignment() is
  '명부 줄에 GUEST 계정을 새로 배정할 때, 배정하는 사람이 그 계정을 이미 볼 수 있어야 한다. 대상 사용자 행 자체가 RLS로 보이지 않아도 거절하며, 현재 participant id를 판정에서 제외해 새 줄이 스스로를 근거로 보이게 만들 수 없다. 계정 없는 줄·보이는 내부 임직원·값 그대로의 갱신은 지나간다.';

-- ---------------------------------------------------------------------
-- (4) 초대 원장 쓰기 — 사업 담당자 한 갈래만 더한다
--
--     기존 세 갈래(ADMIN · project 쓰기 · guest 쓰기)와 is_internal_user는 그대로 두고,
--     "그 초대가 달린 사업의 담당자인가"를 더한다. 워크스페이스 축은 넓히지 않는다 —
--     FUND·M&A 쓰기 권한자 전원이 아니라 **그 사업·조합의 담당자만** 통과한다.
--
--     참가 줄 갈래가 따로 있는 이유: 개방 RPC의 UPDATE는 기존 행을 먼저 읽는데, 옛 행은
--     target_id가 비어 있을 수 있다. 그때도 participant_id가 어느 사업의 줄인지 답한다.
-- ---------------------------------------------------------------------
create or replace function app.can_write_guest_invitation(
  p_target_type    text,
  p_target_id      uuid,
  p_participant_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $fn$
  select app.is_internal_user()
     and (
       app.is_admin()
       or app.can_write_workspace('project')
       or app.can_write_workspace('guest')
       or (p_target_type = 'PROGRAM' and p_target_id is not null
           and app.is_program_manager(p_target_id))
       or (p_participant_id is not null and exists (
             select 1
               from public.program_participants pp
              where pp.id = p_participant_id
                and app.is_program_manager(pp.program_id)
           ))
     );
$fn$;

revoke all on function app.can_write_guest_invitation(text, uuid, uuid) from public, anon;
grant execute on function app.can_write_guest_invitation(text, uuid, uuid)
  to authenticated, service_role;

comment on function app.can_write_guest_invitation(text, uuid, uuid) is
  '초대 원장에 쓸 수 있는가. 내부 사용자 조건(20260912161500)을 유지한 채 ADMIN·project 쓰기·guest 쓰기에 "그 사업·조합의 담당자" 한 갈래를 더한다 — FUND·M&A 담당자가 문을 열다가 초대 레코드에서 막히던 불일치를 워크스페이스 축을 넓히지 않고 닫는다.';

drop policy if exists guest_inv_insert on public.guest_invitations;
create policy guest_inv_insert on public.guest_invitations
  for insert with check (
    app.can_write_guest_invitation(target_type, target_id, participant_id));

drop policy if exists guest_inv_update on public.guest_invitations;
create policy guest_inv_update on public.guest_invitations
  for update using (
    app.can_write_guest_invitation(target_type, target_id, participant_id))
  with check (
    app.can_write_guest_invitation(target_type, target_id, participant_id));

comment on policy guest_inv_insert on public.guest_invitations is
  '초대 행 생성: 내부 사용자이면서 ADMIN 또는 project·guest 워크스페이스 쓰기, 또는 그 초대가 달린 사업·조합의 담당자일 때. 게스트 계정도 guest 워크스페이스 쓰기를 들고 있으므로 내부 사용자 조건이 빠지면 외부 사용자가 이 원장에 쓸 수 있다(2026-09-12).';
comment on policy guest_inv_update on public.guest_invitations is
  '초대 행 갱신: 조건은 생성과 같다. 갱신은 읽는 자리가 있어 guest_inv_select도 함께 걸리지만, 정책 하나에 기대지 않고 여기서도 같은 판정을 요구한다.';

-- ---------------------------------------------------------------------
-- (5) 명부에 기존 계정을 담는다 — public.add_program_guest_accounts
--
--     계약(반환 행, 입력 배열 순서대로 계정당 한 줄):
--       user_id uuid   : 요청한 계정
--       status  text   : 'ADDED' | 'ALREADY_PRESENT' | 'FAILED'
--       reason  text   : 'ALREADY_PRESENT'·'FAILED'의 사유 코드(그 밖에는 null)
--                        DUPLICATE_IN_REQUEST   — 같은 요청에 같은 계정이 두 번 왔다
--                        ACCOUNT_NOT_AVAILABLE  — 없거나·재웠거나·정지됐거나·GUEST가
--                                                 아니거나·호출자에게 보이지 않는다
--                                                 (다섯을 갈라 답하지 않는다 — 갈라
--                                                  답하면 id 하나로 숨은 계정의 상태를
--                                                  되짚을 수 있다)
--
--     행 단위 결과이지만 **부분 성공은 아니다**: FAILED는 아무것도 쓰지 않고 넘어갈 뿐,
--     예외가 난 경우에는 호출 전체가 롤백된다. 담당자가 아니거나 원장이 짝이 맞지 않는
--     것은 행의 사유가 아니라 호출 자체의 실패다.
--
--     SECURITY INVOKER다. 삽입은 program_participants_ws_insert 정책과 (3)의 배정 가드를
--     그대로 통과해야 하고, 그 위에 담당자 조건(app.is_program_manager)을 더 얹는다.
-- ---------------------------------------------------------------------
create or replace function public.add_program_guest_accounts(
  p_entity_key text,
  p_program_id uuid,
  p_user_ids   uuid[]
)
returns table(user_id uuid, status text, reason text)
language plpgsql
security invoker
set search_path = app, public
as $fn$
declare
  v_uid  uuid := app.current_app_user_id();
  v_ws   text;
  v_id   uuid;
  v_seen uuid[] := '{}'::uuid[];
begin
  if v_uid is null or app.is_guest() then
    raise exception '내부 사용자만 게스트 명부를 고칠 수 있습니다.' using errcode = '42501';
  end if;
  if p_entity_key is null or p_entity_key not in ('program', 'ma_program', 'fund') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;

  -- **담당자 판정이 실재 확인보다 먼저다.** 순서를 뒤집으면 "없는 사업"과 "볼 수 없는
  -- 사업"이 다른 오류로 갈려, id를 넣어 보는 것만으로 M&A 딜의 실재를 알 수 있다.
  if p_program_id is null or not app.is_program_manager(p_program_id) then
    raise exception '담당자(PM·MEMBER·운용역)만 게스트 명부에 계정을 담을 수 있습니다.'
      using errcode = '42501';
  end if;

  -- 원장 키와 실제 id의 짝. 트리거(app.enforce_program_ref)도 같은 사실을 막지만,
  -- 여기서 먼저 답해야 담당자인 사업의 id에 남의 원장 키를 붙이는 요청이 명확히 걸린다.
  v_ws := app.program_ws(p_program_id);
  if v_ws is null or v_ws is distinct from app.entity_key_workspace(p_entity_key) then
    raise exception '사업 원장과 대상이 짝이 맞지 않습니다.' using errcode = '22023';
  end if;

  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return;
  end if;
  if array_length(p_user_ids, 1) > 200 then
    raise exception '한 번에 담을 수 있는 계정은 최대 200건입니다.' using errcode = '22023';
  end if;

  -- **맥락 하나에 잠금 하나**를 루프 밖에서 미리 잡는다. 원장 연결이 없는 줄은 유일
  -- 인덱스(uq_program_participants_master)가 덮지 않으므로 — 부분 인덱스의 조건이
  -- master_id is not null이다 — 확인과 삽입을 한 잠금 안에 둔다. 계정마다 잠그면
  -- [A,B]와 [B,A] 두 요청이 서로의 잠금을 기다려 교착한다. 잠금이 하나뿐이면 그 교착이
  -- 성립할 수 없고, 결과 순서는 입력 순서 그대로 유지된다(정렬은 잠금에도 응답에도
  -- 들어가지 않는다). 잠금은 트랜잭션이 끝날 때 함께 풀린다.
  perform pg_advisory_xact_lock(
    hashtextextended(p_entity_key || ':' || p_program_id::text, 0));

  foreach v_id in array p_user_ids loop
    continue when v_id is null;

    user_id := v_id;
    status  := null;
    reason  := null;

    if v_id = any (v_seen) then
      status := 'ALREADY_PRESENT';
      reason := 'DUPLICATE_IN_REQUEST';
      return next;
      continue;
    end if;
    v_seen := v_seen || v_id;

    -- 살아 있는 GUEST 계정이면서 호출자에게 보이는가. 둘을 한 사유로 묶어 답한다.
    if not exists (
      select 1
        from public.users u
       where u.id = v_id
         and u.deleted_at is null
         and u.is_active
         and app.is_guest_user_type(u.user_type)
    ) or not app.guest_account_visible(v_id) then
      status := 'FAILED';
      reason := 'ACCOUNT_NOT_AVAILABLE';
      return next;
      continue;
    end if;

    -- 이미 이 사업에 있는 계정은 **손대지 않는다.** 원장 연결이 있는 줄이든 없는 줄이든
    -- 마찬가지다 — 담기를 다시 눌렀다는 이유로 기존 줄의 인격·문 상태를 지울 수 없다.
    if exists (
      select 1
        from public.program_participants pp
       where pp.entity_key = p_entity_key
         and pp.program_id = p_program_id
         and pp.user_id    = v_id
    ) then
      status := 'ALREADY_PRESENT';
      return next;
      continue;
    end if;

    -- 쓰는 것은 이 한 줄뿐이다. 원장 참조는 null이고(연결은 선택이다) 문은 닫힌 채로
    -- 시작한다 — 명부에 담기와 로그인 열기는 다른 축이고, 여는 것은 담당자의 별도
    -- 행위다(open_program_guest_access). created_by는 트리거가 찍는다.
    insert into public.program_participants
      (entity_key, program_id, user_id, master_table, master_id, login_status)
    values
      (p_entity_key, p_program_id, v_id, null, null, 'NOT_ALLOWED');

    perform app.log_guest_access(
      v_id,
      'GUEST_ROSTER_ADD',
      'guest:roster',
      jsonb_build_object(
        'entity_key', p_entity_key,
        'program_id', p_program_id,
        'workspace',  v_ws,
        'source',     'workspace_guest_menu'
      ),
      null
    );

    status := 'ADDED';
    return next;
  end loop;
end;
$fn$;

revoke all on function public.add_program_guest_accounts(text, uuid, uuid[])
  from public, anon, service_role;
grant execute on function public.add_program_guest_accounts(text, uuid, uuid[])
  to authenticated;

comment on function public.add_program_guest_accounts(text, uuid, uuid[]) is
  '이미 있는 GUEST 계정을 그 사업·조합 명부에 담는다(담당자 전용, SECURITY INVOKER). 계정·인격·참가 원장을 만들지 않고 program_participants 한 줄만 쓰며 원장 참조는 null, 문은 NOT_ALLOWED로 닫힌 채다. 계정당 ADDED/ALREADY_PRESENT/FAILED 한 줄을 입력 순서대로 돌려주고, 보이지 않는 계정은 존재를 답하지 않는다.';

-- ---------------------------------------------------------------------
-- (6) 로그인 개방 — 여는 일이 계정을 만들지 않는다
--
--     바뀌는 것 둘.
--       · 원장 참조가 없는 줄도 연다. 계정만 살아 있으면 되고, 그 계정이 그 줄에 이미
--         붙어 있어야 한다(명부에 담는 순간 붙는다).
--       · issue_guest_account 폴백을 걷는다. 계정을 만드는 창구는 통합 GUEST 메뉴
--         하나이며, 문을 여는 행위가 조용히 계정을 만들면 그 계정은 어느 창구의
--         책임인지 답할 수 없다. 계정이 없는 줄은 여기서 **거절**한다.
--
--     그대로 두는 것: 담당자 게이트, 종료·해산 원장 거절, 기간 기본값, 초대 레코드,
--     감사 적재, 그리고 중단된 M&A 딜을 막는 트리거(app.guard_suspended_ma_guest_access,
--     20260911223100 — 명부 트리거라 이 파일이 건드리지 않아도 그대로 걸린다).
--
--     반환 계약은 그대로다. account_is_new는 **항상 false**가 된다 — 이 경로가 더 이상
--     계정을 만들지 않으므로 사실이 하나로 굳었고, 열 표를 지우면 호출부가 깨진다.
-- ---------------------------------------------------------------------
create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table(participant_id uuid, program_code text, target_name text, email text, phone text,
              account_is_new boolean)
language plpgsql
set search_path = app, public
as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  r           record;
  v_prog      jsonb;
  v_ws        text;
  v_code      text;
  v_status    text;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_company   uuid;
  v_account   uuid;
  v_table     text;
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
    v_ws     := app.program_ws(r.program_id);
    v_code   := v_prog ->> 'code';
    v_status := v_prog ->> 'status';

    if not app.is_program_manager(r.program_id) then
      raise exception '담당자(PM·MEMBER·운용역)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    -- 죽은 상태의 값은 원장마다 다르다(사업 = 종료·취소, 조합 = 해산). 한 목록으로 뭉치면
    -- 청산 중(LIQUIDATING) 조합의 문이 열리지 않거나 반대로 멀쩡한 사업이 막힌다.
    if (v_ws = 'fund' and v_status = 'CLOSED')
       or (v_ws is distinct from 'fund' and v_status in ('FINISHED', 'CANCELLED')) then
      raise exception '종료된 사업·해산된 조합은 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;

    -- 원장 참조는 더 이상 요구하지 않는다(연결은 선택이다). 요구하는 것은 계정이다.
    if r.user_id is null then
      raise exception '계정이 연결되지 않은 참가자입니다. 통합 GUEST 메뉴에서 계정을 만든 뒤 명부에 담으십시오.'
        using errcode = '22023';
    end if;

    v_account := r.user_id;

    select u.name, u.email, u.phone, u.company_id
      into v_name, v_email, v_phone, v_company
      from public.users u
     where u.id = v_account
       and u.deleted_at is null
       and u.is_active
       and app.is_guest_user_type(u.user_type);

    if not found then
      raise exception '살아 있는 GUEST 계정이 아닙니다. 계정 상태를 먼저 확인하십시오.'
        using errcode = '22023';
    end if;

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

    -- 이 맥락에 아직 기간이 없으면 기본값을 채운다. 원장이 셋이라 표 이름을 판정해 동적으로
    -- 쓴다. INVOKER라 여기서도 원장의 RLS가 걸리며, 바로 위에서 담당자임을 확인했으므로 통과한다.
    v_table := case v_ws
                 when 'project' then 'programs'
                 when 'mna'     then 'ma_programs'
                 when 'fund'    then 'funds'
               end;
    if v_table is not null and (v_prog ->> 'guest_access_ends_at') is null then
      execute format(
        'update public.%I set guest_access_ends_at = $2, updated_at = now()'
        || ' where id = $1 and guest_access_ends_at is null', v_table)
        using r.program_id, app.default_access_end(r.program_id);
    end if;

    -- user_id는 값이 그대로다(위에서 not null을 확인했다) — 배정 가드는 지나간다.
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
                         'workspace', v_ws,
                         'master_table', r.master_table, 'master_id', r.master_id,
                         'account_is_new', false),
      null
    );

    participant_id := r.id;
    program_code   := v_code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    account_is_new := false;
    return next;
  end loop;
end;
$fn$;

revoke all on function public.open_program_guest_access(uuid[]) from public, anon;
grant execute on function public.open_program_guest_access(uuid[]) to authenticated;

comment on function public.open_program_guest_access(uuid[]) is
  '명부 행의 게스트 로그인을 연다(그 사업·조합 담당자 전용, SECURITY INVOKER). PROJECT·M&A·FUND 담당자가 각자의 워크스페이스 권한만으로 끝까지 연다. 원장 연결이 없는 줄도 열 수 있으나 **계정을 만들지는 않는다** — 계정이 없는 줄은 거절하며 발급은 통합 GUEST 메뉴가 맡는다(2026-09-13). account_is_new는 항상 false다.';

-- ---------------------------------------------------------------------
-- (7) GUEST 계정 목록 — 참여를 추정하지 않고 명부에서 읽는다
--
--     종전에는 참여를 `guest_identities × program_participant_entries`와 `investments`로
--     **되짚어 추정**했다. 그래서 두 가지가 틀렸다.
--       · 명부에서 뺀 뒤에도(remove_program_participants) 참가 명부·포트폴리오 행이
--         남아 있으면 목록은 계속 "참여 중"이라고 말했다.
--       · 계정만으로 담긴 줄(원장 참조 없음)은 어느 갈래에도 걸리지 않아 세지 못했다.
--     정본은 실제 program_participants다. 그 표의 RLS가 M&A 기밀도 함께 답한다.
--
--     세는 단위는 **읽을 수 있는 살아 있는 맥락(호스트)**이다.
--       · 한 계정이 한 사업에 원장 연결 줄과 미연결 줄을 함께 가질 수 있으므로 맥락마다
--         한 줄로 접는다. 대표 줄은 문이 더 열린 쪽을 고른다.
--       · 재운 사업·읽을 수 없는 사업은 **세지 않는다.** programs 배열에 못 담는 맥락을
--         건수에만 더하면, 화면은 "3건 참여"라면서 둘만 그리게 된다. 건수와 배열은 같은
--         한 벌에서 나와야 한다.
--
--     인격(identities)은 종전 그대로 따로 읽되, M&A 당사자는 딜 열람 권한까지 본다 —
--     계정이 다른 갈래로 보인다고 해서 그 계정이 어느 매각 기업인지까지 열리지 않는다.
--     검색에 연락처를 더한다 — 연락처가 개시 전 초기 비밀번호이자 사실상의 식별자다.
-- ---------------------------------------------------------------------
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
         -- 연락처는 적는 모양이 제각각이라(010-1234-5678 / 01012345678) 양쪽을 숫자만
         -- 남겨 맞춘다. 숫자가 하나도 없는 검색어는 이 갈래를 타지 않는다.
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
    -- 건수와 배열이 같은 조건(l.id is not null)을 쓴다. 재운 사업·읽을 수 없는 사업은
    -- 둘 다에서 빠진다.
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
     -- 정책은 M&A를 워크스페이스 한 단위로만 본다. 딜 당사자의 기밀은 그보다 좁으므로
     -- app.guest_account_visible의 인격 갈래와 같은 조건을 여기서도 건다.
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

revoke all on function public.guest_accounts_list(text, integer, integer, text, text[], boolean)
  from public, anon;
grant execute on function public.guest_accounts_list(text, integer, integer, text, text[], boolean)
  to authenticated;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean) is
  '전사 GUEST 계정 목록. 참여 사업은 추정하지 않고 실제 program_participants에서 **읽을 수 있는 살아 있는 맥락** 단위로 세며(2026-09-13), 건수와 programs 배열이 같은 조건을 쓴다. 미연결 임시 계정은 내부 사용자가 함께 보고, M&A 딜 당사자 인격은 그 딜을 읽을 수 있는 사람에게만 나온다. 검색은 이름·이메일·연락처(숫자만)를 본다.';

-- ---------------------------------------------------------------------
-- (8) 사후 확인 — 이 파일이 기댄 것들이 실제로 그 자리에 있는가
-- ---------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  -- 명부 무결성 트리거는 이 파일이 건드리지 않는다. 사라지면 원장 참조가 있는 줄의
  -- 인격·참가 명부 요구가 함께 사라지므로, 없으면 여기서 멈춘다.
  -- 중단 M&A 가드(20260911223100)와 이 파일이 세운 배정 가드도 함께 본다.
  select string_agg(t.name, ', ' order by t.name)
    into v_missing
    from (values
      ('trg_program_participants_validate_roster'),
      ('trg_guard_suspended_ma_guest_access'),
      ('trg_program_participants_guard_guest_assignment')
    ) as t(name)
   where not exists (
     select 1 from pg_trigger g
      where g.tgrelid = 'public.program_participants'::regclass
        and g.tgname = t.name
        and not g.tgisinternal
   );

  if v_missing is not null then
    raise exception '명부 트리거가 없습니다: %', v_missing using errcode = '42501';
  end if;

  -- 초대 원장 쓰기 정책은 **좁히기만** 했다. 내부 사용자 조건이 빠지면 게스트가 쓸 수
  -- 있게 되므로(20260912161500), 조건이 실제로 식에 남아 있는지 표현식을 직접 읽는다.
  select string_agg(p.polname, ', ' order by p.polname)
    into v_missing
    from pg_policy p
   where p.polrelid = 'public.guest_invitations'::regclass
     and p.polname in ('guest_inv_insert', 'guest_inv_update')
     and position('can_write_guest_invitation' in
           coalesce(pg_get_expr(p.polqual, p.polrelid), '')
           || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) = 0;

  if v_missing is not null then
    raise exception '초대 원장 쓰기 정책이 공용 판정을 거치지 않습니다: %', v_missing
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from pg_policy p
     where p.polrelid = 'public.guest_invitations'::regclass
       and p.polname = 'guest_inv_select'
  ) then
    raise exception 'guest_inv_select가 사라졌습니다 — 이 파일은 SELECT 정책을 건드리지 않습니다'
      using errcode = '42501';
  end if;

  -- 행을 읽는 함수는 SECURITY INVOKER여야 한다. DEFINER로 바뀌면 가시성 판정이
  -- 호출자 RLS를 떠난다. 예외는 행을 내보내지 않고 '다른 참여가 있는가'만 답하는
  -- guest_account_has_other_participation 하나다.
  select string_agg(p.proname, ', ' order by p.proname)
    into v_missing
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and (
       (n.nspname = 'public' and p.proname in ('add_program_guest_accounts',
                                               'guest_accounts_list',
                                               'open_program_guest_access'))
       or (n.nspname = 'app' and p.proname in ('guest_account_visible',
                                               'guest_account_visible_for_assignment',
                                               'can_write_guest_invitation',
                                               'guard_guest_participant_assignment'))
     );

  if v_missing is not null then
    raise exception 'SECURITY INVOKER여야 하는 함수가 DEFINER입니다: %', v_missing
      using errcode = '42501';
  end if;

  if not exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app'
       and p.proname = 'guest_account_has_other_participation'
       and p.prosecdef
       and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=""%'
  ) then
    raise exception '다른 참여 존재 판정은 고정된 빈 search_path의 SECURITY DEFINER여야 합니다'
      using errcode = '42501';
  end if;
end $$;

commit;
