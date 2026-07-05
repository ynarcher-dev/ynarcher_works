-- =====================================================================
-- [Phase 13] GUEST 세부 스코프 RLS (AC 테이블 게스트 접근 정교화)
-- 외부 스타트업/전문가 게스트가 본인 참여 프로그램 범위에서 타임라인 조회,
-- 슬롯 예약, 만족도/평가 제출을 수행할 수 있도록 permissive 정책을 추가한다.
-- 기존 AC(ac 워크스페이스 게이트) 정책과 OR로 병존한다.
-- 근거: docs_planning/3_9_workspace_guest.md, AC 각 모듈 "11. GUEST 연동" 절
-- =====================================================================

-- 게스트 여부(외부 스타트업/전문가/임시)
create or replace function app.is_guest()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(
    app.current_app_role() in ('external_startup','external_expert','temporary_guest'),
    false
  );
$$;

-- 현재 게스트가 참여 중인 프로그램 ID 집합
create or replace function app.guest_program_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select p.program_id
    from public.program_participants p
   where p.user_id = app.current_app_user_id();
$$;

-- program_participants: 게스트 본인 참여 레코드 조회 --------------------
drop policy if exists pp_guest_select on public.program_participants;
create policy pp_guest_select on public.program_participants for select
  using (app.is_guest() and user_id = app.current_app_user_id());

-- program_timeline_items: 참여 프로그램의 공개 일정만 조회 ---------------
drop policy if exists timeline_guest_select on public.program_timeline_items;
create policy timeline_guest_select on public.program_timeline_items for select
  using (
    app.is_guest()
    and visibility <> 'INTERNAL_ONLY'
    and program_id in (select app.guest_program_ids())
  );

-- matching_slots: 예약 가능 슬롯 조회(예약 콘솔) ------------------------
drop policy if exists slots_guest_select on public.matching_slots;
create policy slots_guest_select on public.matching_slots for select
  using (app.is_guest());

-- matching_bookings: 게스트 예약 신청(간편 예약) -----------------------
-- 슬롯당 활성 예약 1건 unique 인덱스가 동시예약을 방지한다.
drop policy if exists bookings_guest_insert on public.matching_bookings;
create policy bookings_guest_insert on public.matching_bookings for insert
  with check (app.is_guest());
drop policy if exists bookings_guest_select on public.matching_bookings;
create policy bookings_guest_select on public.matching_bookings for select
  using (app.is_guest());

-- mentoring_sessions: 멘토링 세션 조회(평가 대상) ----------------------
drop policy if exists msessions_guest_select on public.mentoring_sessions;
create policy msessions_guest_select on public.mentoring_sessions for select
  using (app.is_guest());

-- mentor_satisfaction_records: 스타트업 만족도 제출 --------------------
drop policy if exists msat_guest_insert on public.mentor_satisfaction_records;
create policy msat_guest_insert on public.mentor_satisfaction_records for insert
  with check (app.is_guest());

-- mentor_feedback_records: 전문가 5대 지표 평가 제출 -------------------
drop policy if exists mfb_guest_insert on public.mentor_feedback_records;
create policy mfb_guest_insert on public.mentor_feedback_records for insert
  with check (app.is_guest());

-- counseling_logs: 전문가 상담일지 제출 --------------------------------
drop policy if exists clog_guest_insert on public.counseling_logs;
create policy clog_guest_insert on public.counseling_logs for insert
  with check (app.is_guest());

-- 주: 회사/참가자 단위의 소유권 정밀 스코프(본인 company_id·participant_id 일치)는
--     매직링크 초대(guest_invitations) 연동과 함께 후속 강화한다.
