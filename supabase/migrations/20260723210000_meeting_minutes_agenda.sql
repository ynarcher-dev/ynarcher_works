-- =====================================================================
-- [Phase 5] 회의록 '주요 안건' 단문 필드 추가
-- 선행: 20260723150000_meeting_minutes_body_and_attachment_scope.sql
--
-- 배경:
-- - 앞선 본문 단일화(20260723150000)에서 안건/논의/결정 3분할을 body 하나로 통합했다.
-- - 운영 요구로 본문과 별개인 '주요 안건' 단문 필드를 다시 둔다(3분할 부활이 아니라
--   agenda 한 컬럼만). 회의 내용(body, 리치텍스트)과 역할이 다르다 — 안건은 무엇을
--   다뤘는지 한눈에 보는 요약 라인, body는 상세 논의·결정 서술.
--
-- 보안:
-- - RLS는 행 단위이며 meeting_minutes의 SELECT/INSERT/UPDATE 정책이 새 컬럼을 그대로
--   커버한다(컬럼 권한 미사용). 신규 정책·헬퍼·DEFINER 함수 없음. Soft delete 유지.
-- =====================================================================

alter table public.meeting_minutes add column if not exists agenda text;

comment on column public.meeting_minutes.agenda is
  '회의 주요 안건(단문 요약, 자유입력). 본문(body, 리치텍스트)과 별개의 필드';
