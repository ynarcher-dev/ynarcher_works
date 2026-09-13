-- =====================================================================
-- guest_invitations 쓰기에 '내부 사용자' 조건을 더한다 (AUTHZ-1/2 후속)
--
-- 왜 지금인가:
--   20260912160000이 open_program_guest_access(SECURITY INVOKER) 경로를 세우려고
--   authenticated에 이 표의 INSERT·UPDATE를 열었습니다. 그 순간 기존 정책의 빈틈이
--   **실제로 닿는 경로**가 되었습니다.
--     · guest_inv_insert의 with_check는 app.can_write_workspace('guest')를 허용합니다.
--     · issue_guest_account는 게스트 계정마다 정확히 ('guest','write','self')를 심습니다
--       (20260911221000_ledger_identity_rules.sql). 즉 **모든 게스트가 그 조건을 만족합니다.**
--   표 권한이 닫혀 있던 동안에는 42501이 먼저 났기에 드러나지 않았고, 권한을 연 회차의
--   회귀(C21)에서 게스트 INSERT가 실제로 통과하는 것을 확인했습니다. 읽기는 여전히
--   guest_inv_select가 막으므로 '눈먼 쓰기'이지만, 초대 원장에 외부 사용자가 행을 남길 수
--   있다는 사실 자체가 결함입니다. 문서로 남길 빚이 아니라 닫아야 할 회귀입니다.
--
-- 무엇을 하는가:
--   guest_inv_insert / guest_inv_update 두 정책에 app.is_internal_user()를 **AND로** 더합니다.
--   기존 조건(is_admin 또는 project·guest 워크스페이스 쓰기)은 그대로 두고 좁히기만 합니다.
--   app.is_internal_user()는 게스트 유형 판정의 단일 원천(app.is_guest_user_type)을 쓰고
--   유형을 읽지 못하면 게스트로 보는 Default Deny 함수입니다(20260909190000).
--
-- 하지 않는 것:
--   · guest_inv_select는 건드리지 않습니다 — 이미 게스트 세 역할을 빼고 있습니다.
--   · 게스트 로그인 정책(이메일 아이디 + 개인 비밀번호, 설정 전 초기 연락처, 세션 불발급,
--     자격증명의 오프라인 취급)은 **한 글자도 바꾸지 않습니다.** 이 파일은 초대 원장의
--     쓰기 경계만 좁히며 로그인 경로에는 닿지 않습니다.
--   · 워크스페이스 축을 넓히지 않습니다. open_program_guest_access는 FUND·M&A 맥락도
--     다루지만 이 두 정책은 project·guest만 봅니다. 그 불일치는 **관측된 사실로 문서에
--     남기고(docs/docs_dev/15_authorization_inventory.md §7) 여기서 고치지 않습니다** —
--     정책 축을 넓히는 것은 별도 도메인 판단입니다.
--   · service_role은 BYPASSRLS라 정책을 거치지 않습니다. Edge의 서버 경로(초대 소진)는
--     이 변경의 영향을 받지 않습니다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: project / guest (판정 축 변경 없음 — 조건을 더하기만 합니다)
--   - 데이터 등급: Internal (개인정보 포함 — 이름·이메일·전화. 노출 범위 변경 없음)
--   - 접근 주체: 내부 실무자. **외부 게스트는 이 변경으로 쓰기에서 빠집니다.**
--   - 신규 테이블/함수/SECURITY DEFINER 없음. 새로 만드는 것은 없고 정책 둘을 좁힙니다.
--   - 회수/축소만 있고 확대가 없으므로 기존 허용 경로의 회귀는 아래 사후 확인과
--     supabase/tests/authorization_inventory_test.sql C17~C22가 함께 봅니다.
--   - 운영 영향: 내부 담당자 경로는 그대로입니다. 게스트가 이 표에 쓰던 정상 경로는
--     **없습니다**(화면도 Edge도 그런 호출을 하지 않습니다).
-- =====================================================================

-- ── 좁히기 ──────────────────────────────────────────────────────────────
drop policy if exists guest_inv_insert on public.guest_invitations;
create policy guest_inv_insert on public.guest_invitations
  for insert with check (
    app.is_internal_user()
    and (app.is_admin() or app.can_write_workspace('project') or app.can_write_workspace('guest')));

drop policy if exists guest_inv_update on public.guest_invitations;
create policy guest_inv_update on public.guest_invitations
  for update using (
    app.is_internal_user()
    and (app.is_admin() or app.can_write_workspace('project') or app.can_write_workspace('guest')))
  with check (
    app.is_internal_user()
    and (app.is_admin() or app.can_write_workspace('project') or app.can_write_workspace('guest')));

comment on policy guest_inv_insert on public.guest_invitations is
  '초대 행 생성: 내부 사용자이면서 ADMIN 또는 project·guest 워크스페이스 쓰기 권한이 있을 때. 게스트 계정도 guest 워크스페이스 쓰기를 들고 있으므로 내부 사용자 조건이 없으면 외부 사용자가 이 원장에 쓸 수 있다(2026-09-12).';
comment on policy guest_inv_update on public.guest_invitations is
  '초대 행 갱신: 조건은 생성과 같다. 갱신은 읽는 자리가 있어 guest_inv_select도 함께 걸리지만, 정책 하나에 기대지 않고 여기서도 내부 사용자를 요구한다.';

-- ── 사후 확인: 두 정책이 실제로 내부 사용자 조건을 갖는가 ───────────────
--
-- 이름만 같고 조건이 빠진 채 재생되는 일을 막습니다. pg_policy의 표현식을 직접 읽습니다.
do $$
declare
  v_missing text;
begin
  select string_agg(p.polname, ', ' order by p.polname)
    into v_missing
    from pg_policy p
   where p.polrelid = 'public.guest_invitations'::regclass
     and p.polname in ('guest_inv_insert', 'guest_inv_update')
     and position('is_internal_user' in
           coalesce(pg_get_expr(p.polqual, p.polrelid), '')
           || ' ' ||
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) = 0;

  if v_missing is not null then
    raise exception
      'guest_invitations 쓰기 정책에 내부 사용자 조건이 없습니다: %', v_missing
      using errcode = '42501';
  end if;
end $$;

-- ── 사후 확인: SELECT 정책은 건드리지 않았는가 ──────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_policy p
     where p.polrelid = 'public.guest_invitations'::regclass
       and p.polname = 'guest_inv_select'
  ) then
    raise exception 'guest_inv_select가 사라졌습니다 — 이 파일은 SELECT 정책을 건드리지 않습니다'
      using errcode = '42501';
  end if;
end $$;
