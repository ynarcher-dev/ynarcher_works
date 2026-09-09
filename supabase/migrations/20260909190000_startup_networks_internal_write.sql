-- =====================================================================
-- STARTUP·NETWORKS 원장의 쓰기를 **내부 사용자 전원**에게 연다
--
-- 왜
--   두 원장은 전사 공용이다 — 명함 한 장, 회의 직후의 이름 하나, 사업 참가자 명단에서
--   "원장에 없는 기업"을 만났을 때 그 자리에서 등록하는 일이 모든 부서에서 일어난다.
--   실제 운영에서도 `workspace_permissions`의 write가 내부 전원에게 부여되어 있어, 정책이
--   묻는 `can_write_workspace('startup'|'networks')`는 이미 늘 참이었다.
--
--   그래서 이 마이그레이션이 바꾸는 것은 **누가 쓸 수 있는가**가 아니라 **그 사실이 어디에
--   적혀 있는가**다. 종전에는 부여 데이터가 답했고 이제 정책이 답한다. 대가는 분명하다 —
--   ADMIN이 특정 사용자의 원장 쓰기를 회수할 수단이 사라진다(2026-09-09 사용자 확정:
--   "스타트업과 네트워크는 작성은 누구나 가능한걸로"). 되돌리려면 다시 마이그레이션이 든다.
--
-- 무엇을 열지 않는가
--   · **읽기(SELECT)는 그대로다.** 여는 축은 쓰기 하나이고, 읽기는 노출 범위의 물음이라
--     같은 커밋에서 함께 흔들지 않는다.
--   · **투자기업 잠금 둘은 그대로다.** `invested` 직접 등록 금지(20260731180000)와 투자기업
--     행 수정의 담당자·관리자 한정(20260731140000)은 워크스페이스 권한과 다른 축이다 —
--     저쪽은 '이 사람이 원장을 다루는가'이고 이쪽은 '이 행을 다룰 자격이 누구에게 있는가'다.
--     함께 풀면 자사 투자 집행 없이 투자기업이 생기고, 담당자 없는 invested 행을 아무나
--     고치게 된다.
--   · **게스트는 여전히 막힌다.** 이 마이그레이션의 핵심 위험이 여기다 — 게스트 계정도
--     `public.users` 행이라 `app.current_app_user_id()`가 값을 돌려준다. 그래서 '로그인했으면
--     쓴다'로 적으면 외부 게스트가 전사 마스터에 행을 넣는다. 판정은 반드시 내부 사용자
--     여부를 함께 물어야 하고, 그 물음은 `app.is_internal_user()`가 답한다.
--
-- 겸해서 — `app.is_internal_user()`가 게스트 유형 셋을 문자열로 다시 적고 있었다.
--   그 목록의 SQL 쪽 단일 원천은 `app.is_guest_user_type()`이다(20260903180000). 여기서
--   경유로 바꾸는 이유는 이 헬퍼가 오늘부터 **두 전사 원장의 쓰기 게이트**가 되기 때문이다 —
--   유형이 하나 늘 때 목록을 고치는 곳이 둘이면, 잊힌 쪽이 곧 뚫리는 쪽이다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: startup(스타트업 원장) · networks(네트워크 원장)
--   · 데이터 등급: Personal(대표자·담당자 성명, 이메일, 연락처를 담는다)
--   · 접근 주체: 내부 사용자만. 외부 스타트업·외부 전문가·임시 게스트는 종전과 같이 전면 차단
--   · Scope 기준: global(원장 단위 판정). 행 단위 잠금은 투자기업 축이 계속 소유한다
--   · 감사 로그: 신설 없음. 변동 이력은 원장 트리거(app.log_entity_contribution)가 종전대로
--     남기고, 이 변경은 조회·다운로드·Export 경로를 만들지 않는다
--   · 운영 영향: 권한 경계 **확대**다. 종전에 `workspace_permissions`로 막히던 사용자가
--     생긴다면 그 사람도 두 원장에 쓸 수 있게 된다(현재 부여 상태에서는 실질 변화 없음).
--     프론트 쿼리 변경 없음 — 판정식이 정책 안에서만 바뀐다
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블 없음 / DELETE 정책 신설 없음(soft delete 유지)
--   · SELECT·INSERT·UPDATE 정책 분리 유지, SELECT는 손대지 않음
--   · 판정은 app.* 헬퍼 경유(auth.jwt() 직접 파싱 없음)
--   · INSERT·UPDATE 정책의 WITH CHECK 누락 없음
--   · 외부 게스트의 내부 마스터 쓰기 차단을 `app.is_internal_user()`가 강제
--   · SECURITY DEFINER 함수는 `set search_path = app, public` 고정, GRANT는 authenticated
--   · 신규 RPC 없음. `public.can_create_startup()`은 기존 함수의 판정식만 정책과 맞춘다
--
-- 근거: 20260728120000(is_internal_user), 20260903180000(is_guest_user_type),
--       20260731140000·20260731180000(투자기업 두 잠금), 20260906160000(can_create_startup),
--       20260904120000(networks 통합 원장 정책)
-- =====================================================================

-- ── (1) 내부 사용자 판정을 게스트 유형 단일 원천으로 돌린다 ────────────
create or replace function app.is_internal_user()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or (
        app.current_app_user_id() is not null
        and not coalesce(
              app.is_guest_user_type(nullif(app.current_app_role(), '')::public.user_type),
              -- 유형을 읽지 못하면 게스트로 본다 — 모르는 것을 내부로 세면
              -- 판정이 실패하는 날 문이 열리는 쪽으로 기운다.
              true
            )
      );
$$;

comment on function app.is_internal_user() is
  '외부 게스트가 아닌 로그인 사용자인가. 게스트 유형 목록은 app.is_guest_user_type()이 단일 원천이며 여기서 다시 적지 않는다. 유형을 읽지 못하면 게스트로 판정한다(Default Deny). STARTUP·NETWORKS 원장의 쓰기 게이트이기도 하다.';

-- ── (2) STARTUP 원장 ─────────────────────────────────────────────────
-- 등록: 내부 사용자면 누구나. 투자기업 직접 등록 금지는 그대로 남는다.
drop policy if exists startups_insert on public.startups;
create policy startups_insert on public.startups for insert
  with check (
    app.is_internal_user()
    -- 투자기업은 등록으로 만들지 않는다 — 자사 투자 집행을 근거로 promote_to_invested가
    -- 승격시킨다. 관리자는 오등록 수습·이관을 위해 남긴다(브레이크글라스).
    and (management_status is distinct from 'invested' or app.is_admin())
  );

comment on policy startups_insert on public.startups is
  '내부 사용자 전원이 스타트업을 등록한다(2026-09-09). 투자기업(invested) 직접 등록은 관리자만 — 그 잠금은 워크스페이스 권한과 다른 축이라 함께 풀지 않는다.';

-- 수정: USING은 `app.can_write_startup(id)` 한 곳이 계속 답한다(정책과 Edge Function·화면이
-- 같은 식을 되묻기 위해). 그 함수 안의 워크스페이스 물음만 내부 사용자 물음으로 바꾼다.
create or replace function app.can_write_startup(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.startups s
     where s.id = p_id
       and app.is_internal_user()
       and (
         s.management_status is distinct from 'invested'
         or app.is_admin()
         or app.is_startup_manager(s.id, app.current_app_user_id())
       )
  );
$$;

comment on function app.can_write_startup(uuid) is
  '이 기업의 기존 행을 고칠 자격이 있는가(startups_update USING의 판정식). 내부 사용자 전원이되 투자기업은 관리자 또는 지정 담당자만. 이 함수는 커밋된 값을 읽으므로 WITH CHECK 자리에 쓰지 말 것 — 그 절은 바뀔 값을 물어 투자기업 승격을 막는 다른 잠금이다. 근거: 3_3_5 §8.2';

-- WITH CHECK는 **바뀔 값**을 보는 별개의 물음이라 인라인으로 남는다. 비담당자가 구분을
-- invested로 올리는 것을 막는 잠금이 이쪽이므로, 원장을 되읽는 함수를 여기 넣으면 그 잠금이
-- 조용히 풀린다(20260906160000이 USING만 함수로 뺀 이유 그대로).
drop policy if exists startups_update on public.startups;
create policy startups_update on public.startups for update
  using (app.can_write_startup(id))
  with check (
    app.is_internal_user()
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.is_startup_manager(id, app.current_app_user_id())
    )
  );

comment on policy startups_update on public.startups is
  'USING은 app.can_write_startup(id) 한 곳이 답한다(Edge Function·화면이 같은 식을 되묻기 위해). WITH CHECK는 바뀔 값을 보는 별개의 물음이라 인라인으로 남는다 — 비담당자가 구분을 invested로 올리는 것을 막는 잠금은 이쪽이다.';

-- 화면이 "등록 버튼을 세울 수 있는가"를 묻는 창구. 정책의 앞 절과 **한 벌**이라 함께 바꾼다 —
-- 어긋나면 버튼은 서는데 저장이 거절되거나, 그 반대가 된다.
create or replace function public.can_create_startup()
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $$
  select app.is_internal_user();
$$;

comment on function public.can_create_startup() is
  '호출자가 스타트업을 새로 등록할 수 있는지(boolean). startups_insert의 앞 절과 한 벌이며, 뒷 절(invested 직접 등록 제한)은 만들려는 값에 대한 물음이라 여기서 답하지 않는다 — 실제 INSERT는 정책 전체가 막는다. 근거: 3_3_5 §8.2';

-- ── (3) NETWORKS 통합 원장 ────────────────────────────────────────────
-- 투자기업 같은 행 단위 잠금이 없는 원장이라 판정이 한 줄이다.
drop policy if exists networks_insert on public.networks;
create policy networks_insert on public.networks for insert
  with check (app.is_internal_user());

drop policy if exists networks_update on public.networks;
create policy networks_update on public.networks for update
  using (app.is_internal_user())
  with check (app.is_internal_user());

comment on policy networks_insert on public.networks is
  '내부 사용자 전원이 네트워크 원장에 등록한다(2026-09-09). 명함 정리·회의 직후 등록이 부서를 가리지 않고 일어나는 전사 공용 원장이다.';
comment on policy networks_update on public.networks is
  '내부 사용자 전원이 네트워크 원장을 고친다(2026-09-09). 이 원장은 담당자 축이 없는 영구 공동관리다.';

-- DELETE 정책은 두 원장 모두 만들지 않는다 = 전면 거부(물리 삭제 금지, 비활성화는 deleted_at).
