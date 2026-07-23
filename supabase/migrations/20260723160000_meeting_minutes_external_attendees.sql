-- =====================================================================
-- [Phase 5] 회의록 외부참석자 명단
-- 선행: 20260723140000_office_meeting_minutes.sql, 20260723150000_meeting_minutes_body_and_attachment_scope.sql
--
-- 외부참석자는 시스템 계정(users)이 없는 사외 인원이라 접근 권한(RLS)과 무관하다.
-- 따라서 참석자·참조(meeting_minute_people, user_id 기반)와 달리 회의록 원장에
-- 단순 이름 배열로 보관한다. 열람 판정에는 전혀 관여하지 않는다.
-- =====================================================================

alter table public.meeting_minutes
  add column if not exists external_attendees text[] not null default '{}';

comment on column public.meeting_minutes.external_attendees is
  '외부참석자 이름 목록(사외 인원, 시스템 계정 없음). 표시용 메타이며 접근권한과 무관';
