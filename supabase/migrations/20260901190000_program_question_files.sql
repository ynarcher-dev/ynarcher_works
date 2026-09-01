-- =====================================================================
-- [사업] QNA 첨부 파일 — WORKS 담당자 업로드, GUEST 본인 질문 상세에서 읽기 전용
--
-- 배경: 공지사항 첨부(20260901180000)와 같은 요구가 QNA에도 있다. 담당자가 답변에
--   곁들이는 파일(서식·안내문 등)을 질문한 게스트가 상세 모달에서 내려받는다.
--
-- 원장은 새로 만들지 않는다 — attachments 행에 귀속만 표시한다
--   (target_type = 'program_question' / target_id = 질문 id).
--
-- **게스트에게 업로드는 열지 않는다.** 첨부를 올리는 쪽은 담당자뿐이다 — 게스트 업로드는
--   attachments INSERT와 Storage 정책(app.can_use_attachment_storage)을 함께 열어야
--   성립하며, 파일 크기·형식 제한과 격리 저장 경로가 함께 정해져야 하는 별도 결정이다.
--   지금 열려 있는 게스트 쓰기는 질문 본문(텍스트)뿐이다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: 공용(attachments) / 진입 주체는 guest. 데이터 등급: Internal.
--   · 접근 주체: 외부 게스트(읽기 전용). INSERT/UPDATE/DELETE 신설 없음.
--   · Scope: program → question → **본인 질문**. 조건을 복제하지 않고
--     program_questions의 생존·소속·작성자를 exists로 되짚는다 — 그 표의 게스트 정책이
--     이미 '본인 질문 + 세션 고정 사업'으로 좁혀 두었으므로, 남의 질문에 붙은 파일은
--     서브쿼리에서 애초에 걸리지 않는다(조건이 한 곳에만 있다).
--   · **신규 SECURITY DEFINER를 만들지 않는다** — 공지 첨부 정책(20260901180000)과 같은
--     이유로, 되짚는 표를 게스트가 이미 (자기 몫만) 볼 수 있어 INVOKER exists로 충분하고
--     그 표의 정책은 attachments를 참조하지 않아 재귀가 없다.
--   · 정책은 permissive SELECT로 내부 정책과 OR 병존 — 내부 화면 쿼리 영향 없음.
--   · 감사 로그: 다운로드는 기존 material-download Edge Function(호출자 토큰 RLS 재검증 +
--     access_logs 적재)을 그대로 탄다. 새 다운로드 경로를 만들지 않는다.
--   · 신규 테이블·GRANT·Storage 정책 변경 없음.
-- 근거: 20260901180000_program_announcement_files.sql(같은 형태),
--       20260901170000_program_announcements_questions.sql(질문 원장·게스트 정책)
-- =====================================================================

drop policy if exists attachments_question_guest_select on public.attachments;
create policy attachments_question_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and target_type = 'program_question'
    and exists (
      select 1
        from public.program_questions q
       where q.id = attachments.target_id
         and q.deleted_at is null
         and q.created_by = app.current_app_user_id()
         and q.program_id in (select app.guest_program_ids())
    )
  );
