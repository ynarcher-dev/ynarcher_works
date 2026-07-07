-- =====================================================================
-- [Fix] 전자결재 RLS 상호재귀(42P17) 해소
-- - 증상: approval_documents 조회 시
--   "infinite recursion detected in policy for relation approval_documents" (500).
-- - 원인: approval_docs_select 정책이 approval_lines 를 EXISTS 서브쿼리로 참조하고,
--   approval_lines_select 정책이 다시 approval_documents 를 EXISTS 로 참조하여
--   두 테이블 RLS 정책이 서로를 무한히 호출한다(상호재귀).
--   approval_lines_insert 의 with check 서브쿼리도 동일 경로로 재귀한다.
-- - 해결: 교차 테이블 조회를 SECURITY DEFINER 헬퍼로 이관한다. 테이블 소유자
--   권한으로 실행되어 호출자 RLS를 우회하므로 재귀 고리가 끊긴다
--   (기존 rls_helpers 2계층 규약과 동일 패턴).
-- 근거: 20260705210000_management_schema.sql(원 정책), 20260705120200_rls_helpers.sql(헬퍼 규약)
-- =====================================================================

-- [업무] 현재 요청자가 해당 문서의 결재자(approval_lines.approver)인지 여부 -----
create or replace function app.is_approval_approver(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.approval_lines l
     where l.document_id = target_document_id
       and l.approver_id = app.current_app_user_id()
  );
$$;

-- [업무] 현재 요청자가 해당 문서의 기안자(approval_documents.drafter)인지 여부 --
create or replace function app.is_approval_drafter(target_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.approval_documents d
     where d.id = target_document_id
       and d.drafter_id = app.current_app_user_id()
  );
$$;

-- 정책 재작성: 교차 테이블 EXISTS → SECURITY DEFINER 헬퍼 호출 -----------------
-- 문서 조회: 워크스페이스 게이트 / 본인 기안 / 본인 결재선(헬퍼)
drop policy if exists approval_docs_select on public.approval_documents;
create policy approval_docs_select on public.approval_documents for select
  using (
    app.can_read_workspace('management')
    or drafter_id = app.current_app_user_id()
    or app.is_approval_approver(id)
  );

-- 결재선 조회: 워크스페이스 게이트 / 본인 결재선 / 본인 기안 문서(헬퍼)
drop policy if exists approval_lines_select on public.approval_lines;
create policy approval_lines_select on public.approval_lines for select
  using (
    app.can_read_workspace('management')
    or approver_id = app.current_app_user_id()
    or app.is_approval_drafter(document_id)
  );

-- 결재선 생성: 워크스페이스 게이트 / 본인 기안 문서(헬퍼)
drop policy if exists approval_lines_insert on public.approval_lines;
create policy approval_lines_insert on public.approval_lines for insert
  with check (
    app.can_write_workspace('management')
    or app.is_approval_drafter(document_id)
  );
