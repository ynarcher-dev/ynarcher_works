-- =====================================================================
-- 삭제된 회의록은 관리자에게도 안 보인다 — can_read_minute의 admin 우회 교정
--
-- 증상
--   OFFICE에서 지운 회의록이 스타트업·사업·펀드·NETWORKS 상세의 '관련 회의록' 패널에
--   그대로 남았다. 회의록 목록·상세·전역 검색에서는 사라졌는데 그 패널에서만 남는다.
--
-- 원인
--   회의록 삭제는 소프트 삭제(`meeting_minutes.deleted_at`)이고, 삭제된 행을 거르는 자리는
--   두 곳으로 갈려 있었다 — 회의록을 직접 조회하는 화면은 쿼리가 `deleted_at is null`을
--   손으로 걸고, 역방향 패널(meeting_minute_links 임베드)은 링크 SELECT 정책
--   `app.can_read_minute(minute_id)` 하나에 기댔다. 그런데 그 함수가
--   `select app.is_admin() or exists (... deleted_at is null ...)` 모양이라
--   **관리자는 exists 절에 닿기도 전에 참으로 단락**됐다. 그래서 관리자에게만,
--   그리고 그 함수에만 기대는 자리에서만 삭제된 회의록이 계속 보였다.
--
-- 결정: 삭제 여부는 권한 축이 아니라 존재 축이므로 admin 분기를 exists 안으로 넣는다
--   `deleted_at`이 답하는 것은 "누가 볼 수 있는가"가 아니라 "이 기록이 아직 있는가"다.
--   존재하지 않는 기록에 대해 열람 권한을 물을 일이 없으므로, 삭제 검사는 모든 주체보다
--   앞에 서야 한다. 관리자가 우회하는 대상은 공개 범위(visibility)와 참석자 명단이지
--   삭제가 아니다.
--
--   게시판(`app.can_read_board` 등, 20260720200000)의 같은 모양은 그대로 둔다 — 거기서는
--   ADMIN 게시판 관리 콘솔이 비활성·삭제 게시판을 다시 켜는 화면을 갖고 있어 admin 우회가
--   그 화면의 근거다. 회의록에는 그런 복구 화면이 없어 우회가 아무 기능도 받치지 않고
--   지운 것이 남아 보이는 결과만 만든다.
--
-- 파급
--   이 함수는 회의록 원장·명단·링크의 SELECT, 첨부 스코프, 코멘트(entity_feedback),
--   조회수 RPC, 문서함 스코프가 함께 쓴다. 어느 자리도 삭제된 회의록을 필요로 하지 않으며,
--   소프트 삭제 UPDATE 자체는 `meeting_minutes_update`(작성자·admin)가 판정하고 이 함수를
--   경유하지 않으므로 삭제 동작에는 영향이 없다(삭제 mutation도 반환값을 읽지 않는다).
--
-- 근거: 20260723140000_office_meeting_minutes.sql(원형 정의),
--       20260723220000_meeting_minute_links.sql(링크 SELECT = can_read_minute)
--
-- 보안 게이트(11_migration_security_gate.md)
--   · 소유 워크스페이스: office / 데이터 등급: Internal / 접근 주체: 내부 사용자
--   · 신규 테이블·정책·RPC 없음. 기존 SECURITY DEFINER 함수 1개를 **좁히는** 재정의이며
--     search_path 고정과 grant(authenticated 한정)를 그대로 유지한다.
--   · 열람 범위가 넓어지는 방향의 변경이 아니라 좁아지는 방향이라 새 노출면이 없다.
-- =====================================================================

create or replace function app.can_read_minute(p_minute_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.meeting_minutes m
     where m.id = p_minute_id
       and m.deleted_at is null
       and (
         app.is_admin()
         or m.author_id = app.current_app_user_id()
         or (m.visibility = 'OFFICE' and app.can_read_workspace('office'))
         or exists (
           select 1
             from public.meeting_minute_people p
            where p.minute_id = m.id
              and p.user_id = app.current_app_user_id()
         )
       )
  );
$$;

comment on function app.can_read_minute(uuid) is
  '회의록 1건 열람 판정(원장·명단·링크·첨부·코멘트 공용). 삭제(deleted_at)는 권한보다 앞서 판정하므로 관리자도 삭제된 회의록은 읽지 못한다.';
