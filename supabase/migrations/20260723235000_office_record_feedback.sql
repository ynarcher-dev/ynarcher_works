-- =====================================================================
-- OFFICE 레코드 단위 코멘트를 공용 코멘트(entity_feedback)로 통합
--   대상: 게시글(board_post) · 회의록(office_minute)
--
-- 배경
--   게시판 상세의 댓글은 별도 원장(board_comments)·별도 컴포넌트(CommentPanel)로,
--   다른 상세페이지(네트워크·사업·스타트업·임직원)의 코멘트(entity_feedback/FeedbackPanel)와
--   구조가 달랐다 — @멘션 알림·소프트 삭제·페이지네이션이 없었다. 회의록에는 코멘트가 아예 없었다.
--   원장·컴포넌트를 하나로 모아 게시글·회의록도 공용 코멘트를 그대로 쓰게 한다.
--
-- 결정
--   entity_feedback를 게시글·회의록의 코멘트 원장으로 승계한다
--   (target_type='board_post' / 'office_minute').
--   다만 이 둘의 접근 경계는 워크스페이스가 아니라 '소속 게시판 열람 권한'·'회의록 열람 권한'이라
--   entity_key_workspace(networks/ac/…) 판정으로는 표현되지 않는다. 그래서 RLS에
--   board_post·office_minute를 최우선 분기로 두고 각각 app.can_read_board_post(target_id)·
--   app.can_read_minute(target_id)로 위임한다(기존 원장의 열람/작성 경계와 동일).
--
-- 적용 범위
--   - entity_feedback SELECT/INSERT 정책에 board_post·office_minute 분기 추가
--     (기존 networks/사업 분기는 그대로 보존). UPDATE(작성자·admin 소프트 삭제)는
--     target_type 무관이라 재정의하지 않는다.
--   - 기존 board_comments를 entity_feedback로 백필(작성자·일시·삭제상태 보존).
--     회의록 코멘트는 신규 기능이라 백필 대상이 없다.
--   - board_comments는 물리 삭제하지 않고(이력·롤백 보전) 쓰기 경로만 은퇴시킨다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(게시글·회의록 코멘트). entity_feedback 자체는 다형 소유.
--   · 데이터 등급: Internal(코멘트 본문). 개인정보 원본·파일 없음.
--   · 접근 주체: 내부 사용자 중 해당 게시글/회의록 열람 권한자
--     (app.can_read_board_post / app.can_read_minute).
--   · Scope: 게시글·회의록 단건 → 소속 게시판/회의록 read scope.
--   · 감사 로그: 별도 없음(일반 코멘트, 다운로드/Export/권한변경 아님).
--   · RLS: entity_feedback 이미 활성. SELECT/INSERT/UPDATE 분리 유지, DELETE 정책 없음(soft).
--   · SECURITY DEFINER: 신규 없음 — 기존 app.can_read_board_post/app.can_read_minute
--     (정의됨, search_path 고정, authenticated 실행)를 재사용.
--   · 시드/더미: 없음. 백필은 운영 데이터 이관.
-- 근거: 20260707240000_entity_feedback.sql(코멘트 원장·스탬프),
--       20260721130000_program_entity_key_split.sql(다형 키 RLS),
--       20260722120000_notifications_and_mentions.sql(@멘션 팬아웃),
--       20260723190000_board_posts_views_comments.sql(board_comments·can_read_board_post),
--       20260723140000_office_meeting_minutes.sql(can_read_minute)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 백필 — board_comments → entity_feedback(target_type='board_post')
--     정책 교체 전에 수행한다. 마이그레이션은 소유자 권한으로 실행되어 RLS를 우회한다.
--     · content → body, 작성자/작성일시/삭제상태를 그대로 옮긴다(삭제 코멘트는 삭제 상태 유지).
--     · mentioned_user_ids는 기본 빈 배열 → 팬아웃 트리거가 알림을 만들지 않는다(과거 댓글 재알림 방지).
--     · 재실행 안전: 같은 (게시글·작성일시·본문) 코멘트가 이미 옮겨졌으면 건너뛴다.
-- ---------------------------------------------------------------------
insert into public.entity_feedback
  (target_type, target_id, author_id, author_name, body, created_at, deleted_at)
select 'board_post', c.post_id, c.author_id, c.author_name, c.content, c.created_at, c.deleted_at
  from public.board_comments c
 where not exists (
   select 1
     from public.entity_feedback f
    where f.target_type = 'board_post'
      and f.target_id   = c.post_id
      and f.created_at  = c.created_at
      and f.body        = c.content
 );

-- ---------------------------------------------------------------------
-- (2) entity_feedback 정책 재정의 — board_post·office_minute 최우선 분기 추가
--     이 둘은 워크스페이스가 아니라 소속 게시판/회의록 열람 권한으로 갈린다.
--     그 외 분기(networks / 사업 3종)는 20260721130000과 동일하게 보존한다.
-- ---------------------------------------------------------------------
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) = 'networks'
        then app.can_read_workspace('networks')
      else
        app.can_read_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert
  with check (
    case
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) = 'networks'
        then app.can_write_workspace('networks')
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

-- ---------------------------------------------------------------------
-- (3) board_comments 쓰기 경로 은퇴 — 코멘트의 단일 원천을 entity_feedback로 고정
--     이력·롤백을 위해 테이블과 SELECT는 남기고, 신규 INSERT/UPDATE 권한만 회수한다.
--     (정책은 남아 있으나 grant가 없으면 authenticated는 쓰기를 수행할 수 없다.)
-- ---------------------------------------------------------------------
revoke insert, update on public.board_comments from authenticated;

comment on table public.board_comments is
  '[은퇴] 게시글 댓글 구(舊) 원장. 20260723235000에서 entity_feedback(target_type=''board_post'')로 통합. '
  '이력 보전용으로 남기며 신규 쓰기는 하지 않는다(insert/update 권한 회수).';
