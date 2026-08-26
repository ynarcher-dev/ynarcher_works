-- =====================================================================
-- 결재선 구분(결재 / 합의 / 재무합의) 추가
-- 선행: 20260826130000_approval_forms_docboxes.sql
--
-- 배경
--   결재선은 한 줄이 아니다. 기존 결재 시스템의 결재선 표는 **결재**(순차로 올라가는 결재자),
--   **합의**(같은 문서를 함께 검토해야 하는 관련 부서), **재무합의**(금액이 걸린 문서의 재무
--   검토), **참조**(결재하지 않고 열람만)로 나뉘어 있다. 지금 원장은 결재자만 담고 있어
--   합의를 표현할 자리가 없었다.
--
-- 결정
--   참조는 이미 별도 원장(approval_recipients)이 있으므로 그대로 두고, 결재선 원장에
--   구분(kind)을 더한다. 세 구분은 진행 방식이 다르다.
--     · 결재(APPROVAL): **순차**. step_order 순으로 앞 사람이 처리해야 다음 차례가 온다.
--     · 합의(AGREEMENT)·재무합의(FINANCE_AGREEMENT): **병렬**. 상신 즉시 모두 대기 상태가
--       되고 서로의 순서를 기다리지 않는다.
--   문서의 최종 승인은 **모든 결재선(구분 무관)이 승인됐을 때** 이루어지고, 어느 하나라도
--   반려되면 문서가 반려된다. 합의를 결재 앞뒤 어디에 강제로 끼우지 않는 이유는, 순서를
--   고정하면 합의자가 자리를 비운 동안 결재 전체가 멈추기 때문이다 — 병렬로 두면 각자
--   할 수 있을 때 처리하고 마지막 하나가 끝나는 시점에 문서가 완료된다.
--
--   기존 행은 모두 결재(APPROVAL)다 — 합의 개념이 없던 시절에 만들어진 결재선이므로
--   기본값이 곧 정확한 값이다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(사용) / 원장 게이트는 management 유지.
--   · 데이터 등급: Internal. 개인정보 원본 없음.
--   · 접근 주체: 기존과 동일(본인 결재선·기안자·문서 열람 가능자).
--   · Scope: 문서 단건.
--   · 감사 로그: 해당 없음.
--   · RLS: 정책 변경 없음(컬럼 추가). 결재 처리는 여전히 approval_lines_update의
--     `approver_id = current_app_user_id()`로 본인 행만 갱신 가능하다 — 구분이 늘어도
--     "남의 칸을 대신 찍을 수 없다"는 경계는 그대로다.
--   · SECURITY DEFINER: 신규 없음. 기존 app.is_approval_approver()는 구분과 무관하게
--     "이 문서의 결재선에 있는가"를 판정하므로 합의자도 자연히 열람 권한을 얻는다(의도된 동작).
--   · 시드/더미: 없음.
-- =====================================================================

do $$ begin create type public.approval_line_kind as enum
  ('APPROVAL', 'AGREEMENT', 'FINANCE_AGREEMENT');
exception when duplicate_object then null; end $$;

alter table public.approval_lines
  add column if not exists kind public.approval_line_kind not null default 'APPROVAL';

comment on column public.approval_lines.kind is
  '결재선 구분. APPROVAL=결재(step_order 순차), AGREEMENT=합의·FINANCE_AGREEMENT=재무합의(병렬). '
  '문서 최종 승인은 구분과 무관하게 모든 행이 승인됐을 때이며, 하나라도 반려되면 문서가 반려된다. '
  '참조(열람 전용)는 이 원장이 아니라 approval_recipients가 담는다.';

create index if not exists idx_approval_lines_doc_kind
  on public.approval_lines (document_id, kind, step_order);
