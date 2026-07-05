-- =====================================================================
-- [Phase 7] AC 워크스페이스 열거형(Enum)
-- 근거: docs/docs_planning/3_4_* (Program First 14모듈)
-- 상태값 통일: 예비후보는 WAITLISTED로 통일.
-- =====================================================================

do $$ begin create type public.program_status as enum
  ('DRAFT','RECRUITING','SCREENING','OPERATING','DEMO_DAY','FINISHED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.module_type as enum
  ('RECRUITMENT','DOC_REVIEW','ONSITE_EVAL','ORIENTATION','MENTORING','BUSINESS_MATCHING','DEMO_DAY','OUTCOMES','CUSTOM_ACTIVITY');
exception when duplicate_object then null; end $$;

do $$ begin create type public.module_status as enum ('DRAFT','OPEN','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.participation_mode as enum
  ('OPEN_APPLICATION','REVIEWER_ASSIGNMENT','ADMIN_ONLY','STARTUP_FCFS','AI_ALLOCATION','MANUAL_ALLOCATION');
exception when duplicate_object then null; end $$;

do $$ begin create type public.program_participant_role as enum
  ('STARTUP','EXPERT','MENTOR','JUDGE','INVESTOR','STAFF','OBSERVER');
exception when duplicate_object then null; end $$;

do $$ begin create type public.application_status as enum
  ('DRAFT','SUBMITTED','UNDER_REVIEW','SELECTED','WAITLISTED','REJECTED','WITHDRAWN');
exception when duplicate_object then null; end $$;

do $$ begin create type public.eval_target_type as enum ('APPLICATION','STARTUP');
exception when duplicate_object then null; end $$;

do $$ begin create type public.evaluation_status as enum ('DRAFT','OPEN','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.eval_submission_status as enum ('DRAFT','SUBMITTED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.selection_decision as enum ('SELECTED','WAITLISTED','REJECTED','HOLD');
exception when duplicate_object then null; end $$;

do $$ begin create type public.attendance_status as enum ('INVITED','PRESENT','LATE','ABSENT','EXCUSED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.mentoring_status as enum ('ACTIVE','PAUSED','ENDED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.mentoring_session_status as enum
  ('SCHEDULED','DONE','NO_SHOW','CANCELLED','LOG_SUBMITTED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.slot_status as enum ('AVAILABLE','HELD','BOOKED','BLOCKED','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.booking_status as enum
  ('RESERVED','CHECKED_IN','IN_PROGRESS','DONE','NO_SHOW','REPLACED','CANCELLED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.demoday_status as enum ('DRAFT','READY','LIVE','CLOSED','PUBLISHED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.presentation_status as enum ('WAITING','PRESENTING','QNA','DONE','SKIPPED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.interest_level as enum ('WATCH','MEETING','INVEST');
exception when duplicate_object then null; end $$;

do $$ begin create type public.follow_up_status as enum ('NONE','REQUESTED','SCHEDULED','DONE','DECLINED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.conflict_severity as enum ('INFO','WARNING','BLOCKING');
exception when duplicate_object then null; end $$;

do $$ begin create type public.conflict_status as enum ('OPEN','IGNORED','RESOLVED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.export_status as enum ('REQUESTED','PROCESSING','READY','FAILED','EXPIRED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.outcome_status as enum ('LEAD','IN_PROGRESS','DONE','DROPPED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.activity_visibility as enum
  ('INTERNAL_ONLY','PARTICIPANTS','HUB_SUMMARY','PUBLIC_SUMMARY');
exception when duplicate_object then null; end $$;

do $$ begin create type public.action_item_status as enum ('TODO','IN_PROGRESS','DONE','DROPPED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.session_lifecycle as enum
  ('DRAFT','READY','LIVE','CLOSED','AGGREGATED','CONFIRMED','CANCELLED','PUBLISHED');
exception when duplicate_object then null; end $$;
