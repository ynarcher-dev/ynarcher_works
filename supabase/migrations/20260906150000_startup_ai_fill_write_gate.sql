-- =====================================================================
-- STARTUP 'AI 작성하기' 쓰기 게이트 — 정책이 답하던 물음에 이름을 준다 (2026-09-06)
--
-- 왜 필요한가:
--   'AI 작성하기'(3_3_5)는 그 기업의 첨부 자료를 외부 AI(Gemini)로 보낸다. 결과는 초안일
--   뿐 DB를 건드리지 않지만, **자료가 밖으로 나가는 행위**이고 화면의 '수정'과 같은 무게의
--   쓰기 의도라 서버가 호출자의 쓰기 자격을 다시 물어야 한다(UI 숨김은 보안이 아니다).
--
--   그런데 Edge Function이 그 물음에 답하려면 `startups_update` 정책의 판정식을 TypeScript로
--   옮겨 적어야 했다. 그 복제본이 곧 권한 구멍이다 — 정책이 바뀌는 날 함수는 옛 규칙으로
--   계속 답하고, 어긋난 것을 알려 주는 것은 아무것도 없다. 그래서 **복제하지 않고 물어보는
--   길**을 낸다: 정책이 쓰던 판정식에 이름을 붙여 함수로 꺼내고, 정책과 함수가 그 하나를
--   함께 쓴다.
--
-- 왜 USING만 바꾸는가 — 두 절은 서로 다른 물음이다:
--   * USING     = "이 사람이 **지금 있는 이 행**을 건드려도 되는가"
--   * WITH CHECK = "그 결과가 **이런 모습**이어도 되는가"
--   판정식은 같아 보이지만 `management_status`를 읽는 시점이 다르다. USING은 커밋된 값을,
--   WITH CHECK는 바뀔 값을 본다. 그래서 담당자가 아닌 사람이 비투자 기업을 골라
--   `management_status='invested'`로 올리는 시도는 **WITH CHECK만이** 막는다(USING은 옛 값이
--   'invested'가 아니라 통과시킨다). 새 함수는 원장을 되읽으므로 USING과 같은 답을 내고,
--   WITH CHECK 자리에 넣으면 그 잠금이 조용히 풀린다. 두 절이 갈라져 있는 것은 중복이
--   아니라 서로 다른 사실을 묻고 있다는 뜻이라, 그대로 둔다.
--
--   AI 작성하기가 묻는 것은 USING 쪽이다 — 이 기업의 값을 고칠 자격이 있는가. 구분을 바꾸는
--   기능이 아니므로 WITH CHECK의 답은 필요하지 않다.
--
-- 함께 두는 것 — 화면·서버가 같은 답을 얻는 창구:
--   `public.can_write_startup(uuid)`는 그 판정을 호출자 기준으로 되돌려 주는 읽기 전용 RPC다.
--   Edge Function이 **호출자 토큰으로** 이것을 불러 403을 가른다. 새 권한을 주지 않는다 —
--   이미 알 수 있는 사실(수정 버튼이 뜨는가)을 한 번에 답할 뿐이고, 거짓으로 답해 봐야
--   실제 저장은 여전히 RLS가 막는다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: startup (권한 판정 키는 스키마 위치와 무관하게 'startup')
--   - 데이터 등급: Internal (판정 결과 boolean 하나 — 원장 값을 돌려주지 않는다)
--   - 접근 주체: 내부 사용자 전용(authenticated). 게스트 토큰은 이 RPC에 닿지 않는다
--   - Scope 기준: app.can_write_workspace('startup') + 투자기업은 지정 담당자·관리자
--   - 감사 로그: 이 RPC 자체는 판정만 하므로 대상 아님. 실제 자료 반출은 Edge Function이
--     파일마다 access_logs에 남기며, 적재 실패 시 모델을 부르지 않는다(3_3_5 §8.2)
--   - 운영 영향: startups_update 의 USING 판정 결과는 종전과 동일하다(같은 식을 함수로 옮김).
--     WITH CHECK 는 손대지 않았으므로 투자기업 승격 잠금도 그대로다
--   - 신규 테이블 없음 / DELETE 정책 없음 / SECURITY DEFINER 는 search_path 고정
-- =====================================================================

-- ── (1) 판정식에 이름을 준다 ─────────────────────────────────────────
-- 기존 startups_update USING 절과 **문자 그대로 같은 식**이다. 행을 인자로 받을 수 없으므로
-- 원장에서 되읽되, 없는 id는 false로 답한다(있지도 않은 기업에 쓰기 자격이 설 수는 없다).
--
-- SECURITY DEFINER인 이유는 다른 RLS 헬퍼(app.is_startup_manager 등)와 같다 — 판정에 필요한
-- 원장·권한 테이블을 호출자 권한으로 읽으면 그 조회 자체가 RLS에 걸려 답이 흔들린다.
-- 돌려주는 것은 boolean 하나뿐이라 이 우회로 새어 나가는 값이 없다.
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
       and app.can_write_workspace('startup')
       and (
         s.management_status is distinct from 'invested'
         or app.is_admin()
         or app.is_startup_manager(s.id, app.current_app_user_id())
       )
  );
$$;

comment on function app.can_write_startup(uuid) is
  '이 기업의 기존 행을 고칠 자격이 있는가(startups_update USING 의 판정식). 투자기업은 관리자 또는 지정 담당자만. 이 함수는 커밋된 값을 읽으므로 WITH CHECK 자리에 쓰지 말 것 — 그 절은 바뀔 값을 물어 투자기업 승격을 막는 다른 잠금이다. 근거: 3_3_5 §8.2';

revoke all on function app.can_write_startup(uuid) from public;
grant execute on function app.can_write_startup(uuid) to authenticated;

-- ── (2) 정책의 USING 을 그 함수로 갈아 끼운다 ────────────────────────
-- 판정 결과는 종전과 같다. 달라지는 것은 **이 규칙이 사는 곳이 한 곳**이 된다는 것뿐이다.
-- WITH CHECK 는 20260731140000 그대로 둔다(위 헤더의 '왜 USING만' 참조).
drop policy if exists startups_update on public.startups;
create policy startups_update on public.startups for update
  using (app.can_write_startup(id))
  with check (
    app.can_write_workspace('startup')
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.is_startup_manager(id, app.current_app_user_id())
    )
  );

comment on policy startups_update on public.startups is
  'USING 은 app.can_write_startup(id) 한 곳이 답한다(Edge Function·화면이 같은 식을 되묻기 위해). WITH CHECK 는 바뀔 값을 보는 별개의 물음이라 인라인으로 남는다 — 비담당자가 구분을 invested 로 올리는 것을 막는 잠금은 이쪽이다.';

-- ── (3) 호출자 기준으로 그 답을 돌려주는 읽기 전용 창구 ───────────────
-- INVOKER 다. 안에서 부르는 app.can_write_startup 이 이미 DEFINER 라 판정에 필요한 조회는
-- 되지만, 이 함수 자신은 아무 권한도 얹지 않는다.
create or replace function public.can_write_startup(p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $$
  select app.can_write_startup(p_id);
$$;

comment on function public.can_write_startup(uuid) is
  '호출자가 이 기업의 값을 고칠 수 있는지(boolean). AI 작성하기 Edge Function 이 호출자 토큰으로 불러 403 을 가르고, 화면도 같은 답을 쓴다. 판정식은 startups_update USING 과 한 벌이다. 근거: 3_3_5 §8.2';

revoke all on function public.can_write_startup(uuid) from public;
grant execute on function public.can_write_startup(uuid) to authenticated;
