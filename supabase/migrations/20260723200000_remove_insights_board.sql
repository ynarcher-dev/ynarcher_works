-- =====================================================================
-- OFFICE 게시판 '인사이트'(slug=insights) 소프트 삭제
-- 설계 정본: docs/docs_planning/3_1_1_board_archive_notice.md
--
-- 배경:
-- - 인사이트 게시판은 20260720200000_office_boards.sql에서 기본(is_system) 게시판으로
--   시드되었으나 운영상 불필요해 제거한다.
-- - 게시판 관리 화면(BoardAdminPanel)은 소프트 비활성화만 지원하고 물리 삭제 훅이 없어
--   is_system 기본 게시판을 화면에서 완전히 없앨 수 없으므로 마이그레이션으로 처리한다.
--
-- 처리(물리 삭제 금지 원칙 → 소프트 삭제, 2단계):
-- - 1단계: is_system=false 로 기본 게시판 지위를 해제한다.
--   app.guard_system_board() 트리거가 OLD.is_system 이 참인 행의 deleted_at 세팅을
--   차단하므로(같은 UPDATE 안에서 is_system 을 바꿔도 OLD 기준이라 소용없다) 먼저 분리한다.
-- - 2단계: deleted_at + is_active=false 로 소프트 삭제한다.
--   deleted_at → useBoards()가 사이드바·게시판 관리 목록에서 모두 제외한다.
--   is_active=false → useNotices()가 인사이트 소속 전체 공지를 공지사항 메뉴에서 제외한다.
-- - 소속 게시글(board_posts)은 게시판이 사라져 접근 경로가 없어지므로 그대로 둔다.
--   복원하려면 is_system=true, deleted_at=null, is_active=true로 되돌린다.
-- =====================================================================

-- 1단계: 기본 게시판 지위 해제(가드 트리거 우회를 위해 선행).
update public.boards
   set is_system  = false,
       updated_at = now()
 where slug = 'insights'
   and is_system;

-- 2단계: 소프트 삭제.
update public.boards
   set deleted_at = now(),
       is_active  = false,
       updated_at = now()
 where slug = 'insights'
   and deleted_at is null;
