-- =====================================================================
-- [사업] 공지사항 첨부 파일 — WORKS 담당자 업로드, GUEST 공지 본문 아래 읽기 전용
--
-- 배경: 사업개요에 딸린 파일(20260901160000)과 같은 요구가 공지사항에도 있다. 공지는
--   여러 건이 쌓이므로 파일함을 화면에 하나 두면 어느 공지의 파일인지 알 수 없다 —
--   그래서 귀속은 화면이 아니라 **공지 1건**이다(게시판 첨부의 일반 관례).
--
-- 원장은 새로 만들지 않는다 — 사업개요 파일과 같은 이유로 attachments 행을 그대로 쓰되,
--   귀속을 target_type = 'program_announcement' / target_id = 공지 id로 표시한다.
--   앞선 둘과 축이 갈리는 지점이 여기다: 사업개요 파일의 target_id는 사업이고
--   (사업당 개요가 하나라 사업이 곧 그 개요다), 공지 파일의 target_id는 공지 자신이다.
--
-- 내부(WORKS) 쪽은 변경이 없다 — attachments의 내부 정책은 target_type을 제한하지 않아
--   (office_minute 계열 가드 제외) 업로드·조회·소프트 삭제가 기존 정책으로 이미 성립한다.
--   이 마이그레이션은 게스트 읽기 정책 하나만 더한다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: 공용(attachments) / 진입 주체는 guest. 데이터 등급: Internal.
--   · 접근 주체: 외부 게스트(읽기 전용). INSERT/UPDATE/DELETE 신설 없음.
--   · Scope: program → announcement. 게스트가 그 공지를 볼 수 있을 때만 첨부도 보인다 —
--     조건을 복제하지 않고 program_announcements의 생존·소속을 exists로 되짚는다.
--     target_type='program_announcement' 행만 대상이라 다른 첨부는 조건이 성립하지 않는다.
--   · **신규 SECURITY DEFINER를 만들지 않는다.** guest_module_ids() 계열과 달리 여기서
--     되짚는 표(program_announcements)는 게스트가 이미 볼 수 있으므로 INVOKER 평가로 충분하다.
--     서브쿼리에도 그 표의 RLS가 함께 걸리며(더 좁아질 뿐 넓어지지 않는다), 그 표의 정책은
--     attachments를 참조하지 않아 재귀가 없다.
--   · 정책은 permissive SELECT로 내부 정책과 OR 병존 — 내부 화면 쿼리 영향 없음.
--   · 감사 로그: 다운로드는 기존 material-download Edge Function(호출자 토큰 RLS 재검증 +
--     access_logs 적재)을 그대로 탄다. 새 다운로드 경로를 만들지 않는다.
--   · 신규 테이블·GRANT·Storage 정책 변경 없음(게스트는 Storage에 직접 닿지 않는다).
-- 근거: 20260901160000_program_overview_files.sql(같은 형태의 게스트 첨부 정책),
--       20260901170000_program_announcements_questions.sql(공지 원장·게스트 정책)
-- =====================================================================

drop policy if exists attachments_announcement_guest_select on public.attachments;
create policy attachments_announcement_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and target_type = 'program_announcement'
    and exists (
      select 1
        from public.program_announcements a
       where a.id = attachments.target_id
         and a.deleted_at is null
         and a.program_id in (select app.guest_program_ids())
    )
  );

-- 공지별 첨부 조회가 잦으므로 다형 인덱스 위에 부분 인덱스를 얹지 않는다 —
-- idx_attachments_target (target_type, target_id)가 이미 이 조회의 선두 키를 덮는다.
