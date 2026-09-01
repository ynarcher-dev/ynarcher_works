-- =====================================================================
-- [사업] 사업개요 첨부 파일 — WORKS 담당자 업로드, GUEST 사업개요 우측 칸 읽기 전용
--
-- 배경: 사업개요(20260901140000)는 소개문 하나였다. 소개문에 딸린 파일(안내문·서식 등)을
--   담당자가 WORKS 사업개요 탭 우측에서 올리고, 게스트가 사업개요 첫 화면의 같은 자리에서
--   내려받는다(글쓰기 모듈 우측 파일 칸과 같은 구성).
--
-- 원장은 새로 만들지 않는다 — 파일첨부 모듈과 같은 이유로 attachments 행을 그대로 쓰되,
--   귀속은 target_type = 'program_overview' / target_id = 사업 id로 표시한다. 사업개요는
--   모듈이 아니라서 program_module_id 마커를 쓸 수 없고, 소개문 파일은 사업 자료 관리
--   (target_type='program')와 목록이 다른 축이라 target_type으로 가른다.
--
-- 내부(WORKS) 쪽은 변경이 없다 — attachments의 내부 정책은 target_type을 제한하지 않아
--   (office_minute 계열 가드 제외) 업로드·조회·소프트 삭제가 기존 정책으로 이미 성립한다.
--   이 마이그레이션은 게스트 읽기 정책 하나만 더한다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: 공용(attachments) / 진입 주체는 guest. 데이터 등급: Internal.
--   · 접근 주체: 외부 게스트(읽기 전용). INSERT/UPDATE/DELETE 신설 없음.
--   · Scope: program — 사업개요(20260901140000)와 같은 app.guest_program_ids() 단일 기준.
--     target_type='program_overview' 행만 대상이라 다른 첨부(원장·회의록·결재)는 조건
--     자체가 성립하지 않는다.
--   · 정책은 permissive SELECT로 내부 정책과 OR 병존 — 내부 화면 쿼리 영향 없음.
--   · 감사 로그: 다운로드는 기존 material-download Edge Function(access_logs 적재 +
--     호출자 토큰 RLS 재검증)을 그대로 탄다. 새 다운로드 경로를 만들지 않는다.
--   · 신규 테이블·SECURITY DEFINER·GRANT·Storage 정책 변경 없음(게스트는 Storage에 직접
--     닿지 않는다 — Signed URL은 Edge Function만 내준다).
-- 근거: 20260827170000_guest_module_menu.sql(attachments_guest_select 형태),
--       20260901140000_program_overview.sql(guest_program_ids 기준)
-- =====================================================================

-- 사업개요에 딸린 파일. 모듈 파일 정책(attachments_guest_select)과 병존하는 별도 정책으로
-- 세운다 — 한 정책에 합치면 모듈 축과 사업 축이 한 조건식에 섞여 읽기 어렵다.
drop policy if exists attachments_overview_guest_select on public.attachments;
create policy attachments_overview_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and target_type = 'program_overview'
    and target_id in (select app.guest_program_ids())
  );
