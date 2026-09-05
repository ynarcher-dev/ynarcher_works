-- =====================================================================
-- STARTUP 'AI 작성하기' 등록 모드 게이트 (2026-09-06)
--
-- 왜 필요한가:
--   AI 작성하기가 조회 화면에서 **편집 폼**으로 옮겨 갔고(조회는 순수 조회여야 한다),
--   편집 폼은 등록과 수정을 함께 쓴다. 등록 모드에는 아직 원장 행이 없으므로
--   `can_write_startup(id)`가 답할 수 있는 물음이 아니다 — 그때 물어야 하는 것은
--   "이 사람이 스타트업을 **만들 수 있는가**"이고, 그 판정식은 `startups_insert`에 있다.
--
--   앞선 20260906150000과 같은 이유로 그 식을 TypeScript로 옮겨 적지 않는다. 복제본은
--   정책이 바뀌는 날 옛 규칙으로 답하고, 어긋난 것을 알려 주는 것이 아무것도 없다.
--
-- 왜 invested 분기를 함께 담지 않는가:
--   `startups_insert`는 `can_write_workspace('startup')` **그리고** (invested가 아니거나
--   관리자)로 되어 있다. 뒷 절은 **만들려는 행의 값**에 대한 물음이라, 아직 아무 값도 없는
--   시점에는 답할 대상이 없다. 등록 폼은 언제나 비투자로 만들고(투자기업 전환은 FUND 투자
--   집행의 몫이다) 이 RPC는 초안을 만들 자격만 가른다 — 실제 INSERT는 여전히 정책 전체가
--   막는다. 여기서 답하는 것은 "자료를 외부 AI로 보내도 되는 사람인가"까지다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: startup
--   - 데이터 등급: Internal (돌려주는 것은 boolean 하나 — 원장 값을 노출하지 않는다)
--   - 접근 주체: 내부 사용자 전용(authenticated)
--   - Scope 기준: app.can_write_workspace('startup') — 호출자 자신의 권한만 본다
--   - 감사 로그: 판정만 하므로 대상 아님. 등록 모드의 자료 반출은 Edge Function이
--     access_logs에 남긴다(대상 행이 아직 없어 resource_id는 비고 파일명을 사유에 적는다)
--   - 운영 영향: 신규 함수 하나. 기존 정책·테이블 불변
--   - 신규 테이블 없음 / DELETE 정책 없음 / SECURITY DEFINER 없음(INVOKER)
-- =====================================================================

-- INVOKER다. 안에서 부르는 app.can_write_workspace가 이미 DEFINER라 판정에 필요한 조회는
-- 되지만, 이 함수 자신은 아무 권한도 얹지 않는다. 자기 권한을 자기가 묻는 것이므로
-- 다른 사람의 권한을 알아낼 방법이 없다.
create or replace function public.can_create_startup()
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $$
  select app.can_write_workspace('startup');
$$;

comment on function public.can_create_startup() is
  '호출자가 스타트업을 새로 등록할 수 있는지(boolean). AI 작성하기의 등록 모드가 호출자 토큰으로 불러 403을 가른다. startups_insert 의 앞 절과 한 벌이며, 뒷 절(invested 직접 등록 제한)은 만들려는 값에 대한 물음이라 여기서 답하지 않는다 — 실제 INSERT는 정책 전체가 막는다. 근거: 3_3_5 §8.2';

revoke all on function public.can_create_startup() from public;
grant execute on function public.can_create_startup() to authenticated;
