-- =====================================================================
-- [Phase 7] AC 참여 모듈: OT/공통세션 · 멘토링 · 비즈니스 매칭 · 데모데이
-- mentor_satisfaction_records(HUB 랭킹) / mentor_feedback_records(성장 5대 지표) 포함
-- =====================================================================

-- OT/공통 세션 ---------------------------------------------------------
create table if not exists public.orientation_sessions (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  session_type      text not null default 'ORIENTATION',
  venue             text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  status            public.session_lifecycle not null default 'DRAFT',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.session_attendees (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references public.orientation_sessions(id) on delete cascade,
  participant_id    uuid references public.program_participants(id),
  attendee_role     text,
  attendance_status public.attendance_status not null default 'INVITED',
  unique (session_id, participant_id)
);

create table if not exists public.session_materials (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.orientation_sessions(id) on delete cascade,
  file_id    uuid references public.attachments(id),
  link_url   text,
  visibility text not null default 'PARTICIPANTS'
);

create table if not exists public.attendance_logs (
  id                 uuid primary key default gen_random_uuid(),
  session_attendee_id uuid not null references public.session_attendees(id) on delete cascade,
  method             text,  -- 'QR' | 'MANUAL'
  checked_at         timestamptz not null default now(),
  checked_by         uuid references public.users(id)
);

-- 멘토링 ---------------------------------------------------------------
create table if not exists public.mentoring_relationships (
  id                   uuid primary key default gen_random_uuid(),
  program_module_id    uuid not null references public.program_modules(id) on delete cascade,
  startup_id           uuid references public.startups(id),
  mentor_participant_id uuid references public.program_participants(id),
  specialty_tags       text[] not null default '{}',
  status               public.mentoring_status not null default 'ACTIVE',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_mentoring_rel_module on public.mentoring_relationships (program_module_id);

create table if not exists public.mentoring_sessions (
  id              uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.mentoring_relationships(id) on delete cascade,
  round_no        integer not null default 1,
  scheduled_at    timestamptz,
  session_type    text,
  status          public.mentoring_session_status not null default 'SCHEDULED',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_mentoring_sessions_rel on public.mentoring_sessions (relationship_id);

create table if not exists public.mentoring_logs (
  id                 uuid primary key default gen_random_uuid(),
  mentoring_session_id uuid not null references public.mentoring_sessions(id) on delete cascade,
  summary            text,
  issues             text,
  advice             text,
  action_items       text,
  next_steps         text,
  visibility         text not null default 'INTERNAL_ONLY', -- INTERNAL_ONLY | SHARED_WITH_STARTUP
  submitted_at       timestamptz
);

-- 스타트업 → 멘토 만족도 (HUB 자문단 랭킹 원천)
create table if not exists public.mentor_satisfaction_records (
  id                   uuid primary key default gen_random_uuid(),
  mentoring_session_id uuid not null references public.mentoring_sessions(id) on delete cascade,
  startup_id           uuid references public.startups(id),
  mentor_participant_id uuid references public.program_participants(id),
  score                smallint not null check (score between 1 and 5),
  feedback_text        text,
  submitted_at         timestamptz not null default now()
);
create index if not exists idx_mentor_sat_mentor on public.mentor_satisfaction_records (mentor_participant_id);

-- 멘토 → 스타트업 5대 정량지표 (NETWORKS 성장 레이더 원천)
create table if not exists public.mentor_feedback_records (
  id                        uuid primary key default gen_random_uuid(),
  mentoring_session_id      uuid not null references public.mentoring_sessions(id) on delete cascade,
  startup_id                uuid references public.startups(id),
  score_technology          smallint check (score_technology between 1 and 5),
  score_business_model      smallint check (score_business_model between 1 and 5),
  score_credibility         smallint check (score_credibility between 1 and 5),
  score_collaboration       smallint check (score_collaboration between 1 and 5),
  score_matching_feasibility smallint check (score_matching_feasibility between 1 and 5),
  advisory_comment          text,
  submitted_at              timestamptz not null default now()
);
create index if not exists idx_mentor_fb_startup on public.mentor_feedback_records (startup_id);

-- 비즈니스 매칭 --------------------------------------------------------
create table if not exists public.matching_events (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  starts_at         timestamptz,
  ends_at           timestamptz,
  slot_minutes      integer not null default 20,
  status            text not null default 'DRAFT',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.matching_tables (
  id               uuid primary key default gen_random_uuid(),
  matching_event_id uuid not null references public.matching_events(id) on delete cascade,
  table_no         integer not null,
  venue            text
);

create table if not exists public.matching_slots (
  id               uuid primary key default gen_random_uuid(),
  matching_event_id uuid not null references public.matching_events(id) on delete cascade,
  table_id         uuid references public.matching_tables(id),
  starts_at        timestamptz,
  ends_at          timestamptz,
  status           public.slot_status not null default 'AVAILABLE'
);
create index if not exists idx_matching_slots_event on public.matching_slots (matching_event_id);

create table if not exists public.matching_bookings (
  id                   uuid primary key default gen_random_uuid(),
  slot_id              uuid not null references public.matching_slots(id) on delete cascade,
  startup_id           uuid references public.startups(id),
  expert_participant_id uuid references public.program_participants(id),
  allocation_type      text,  -- FCFS | MANUAL | AI
  status               public.booking_status not null default 'RESERVED',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- 슬롯당 동시 활성 예약 1건만 허용(동시예약 방지)
create unique index if not exists uq_matching_active_booking
  on public.matching_bookings (slot_id)
  where status in ('RESERVED','CHECKED_IN','IN_PROGRESS','DONE');

create table if not exists public.counseling_logs (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.matching_bookings(id) on delete cascade,
  summary           text,
  next_steps        text,
  follow_up_requested boolean not null default false,
  submitted_at      timestamptz
);

-- 데모데이 -------------------------------------------------------------
create table if not exists public.demoday_sessions (
  id                 uuid primary key default gen_random_uuid(),
  program_module_id  uuid not null references public.program_modules(id) on delete cascade,
  evaluation_form_id uuid references public.evaluation_forms(id),
  starts_at          timestamptz,
  ends_at            timestamptz,
  status             public.demoday_status not null default 'DRAFT',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.demoday_presentations (
  id                uuid primary key default gen_random_uuid(),
  demoday_session_id uuid not null references public.demoday_sessions(id) on delete cascade,
  startup_id        uuid references public.startups(id),
  order_no          integer not null default 0,
  present_minutes   integer,
  qna_minutes       integer,
  status            public.presentation_status not null default 'WAITING'
);

create table if not exists public.demoday_interests (
  id                    uuid primary key default gen_random_uuid(),
  demoday_session_id    uuid not null references public.demoday_sessions(id) on delete cascade,
  startup_id            uuid references public.startups(id),
  investor_participant_id uuid references public.program_participants(id),
  interest_level        public.interest_level not null default 'WATCH',
  note                  text,
  created_at            timestamptz not null default now()
);

create table if not exists public.follow_up_meetings (
  id                 uuid primary key default gen_random_uuid(),
  demoday_interest_id uuid not null references public.demoday_interests(id) on delete cascade,
  meeting_status     public.follow_up_status not null default 'NONE',
  scheduled_at       timestamptz,
  outcome_note       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'orientation_sessions','mentoring_relationships','mentoring_sessions',
    'matching_events','matching_bookings','demoday_sessions','follow_up_meetings'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;
