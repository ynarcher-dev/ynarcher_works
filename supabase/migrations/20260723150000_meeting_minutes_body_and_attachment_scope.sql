-- =====================================================================
-- [Phase 5] 회의록 본문 단일화 + 첨부 접근범위 회의록 종속
-- 선행: 20260723140000_office_meeting_minutes.sql
--
-- 변경 1) 본문을 게시판과 동일한 단일 리치텍스트(HTML)로 통일한다.
--   안건/논의/결정 3분할을 없애고 body 한 컬럼으로 대체한다(화면은 TipTap 에디터 재사용).
--
-- 변경 2) 회의록 첨부(attachments, target_type='office_minute')의 열람·업로드를
--   회의록 접근범위에 종속시킨다. 기본 attachments 정책은 '내부 사용자 전원' 열람이라
--   그대로 두면 참석자 한정 회의록의 첨부가 명단 밖으로 샌다. target_type 가드를 더해
--   office_minute만 app.can_read_minute/app.is_minute_author로 좁히고, 나머지 target_type은
--   기존 동작을 그대로 보존한다(회귀 없음).
-- =====================================================================

-- 1. 본문 단일화 --------------------------------------------------------
alter table public.meeting_minutes add column if not exists body text;
alter table public.meeting_minutes drop column if exists agenda;
alter table public.meeting_minutes drop column if exists discussion;
alter table public.meeting_minutes drop column if exists decisions;

comment on column public.meeting_minutes.body is
  '회의록 본문(리치텍스트 HTML). 게시판과 동일한 TipTap 에디터로 작성한다';

-- 2. 첨부 접근범위: office_minute만 회의록 RLS에 종속 -----------------------
-- SELECT: 내부 사용자 조건은 그대로 두되, office_minute이면 회의록 열람 권한을 추가로 요구.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select
  using (
    app.is_admin()
    or (
      app.current_app_user_id() is not null
      and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest')
      and (target_type <> 'office_minute' or app.can_read_minute(target_id))
    )
  );

-- INSERT: 업로더 본인 조건은 그대로 두되, office_minute이면 회의록 작성자만 첨부 가능.
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert
  with check (
    uploaded_by = app.current_app_user_id()
    and app.current_app_user_id() is not null
    and (target_type <> 'office_minute' or app.is_minute_author(target_id))
  );

-- UPDATE 정책(admin 또는 업로더 본인)은 변경하지 않는다. office_minute 첨부의 업로더는
-- 위 INSERT 가드상 회의록 작성자뿐이므로 소프트 삭제 권한이 자연히 작성자·admin으로 제한된다.
