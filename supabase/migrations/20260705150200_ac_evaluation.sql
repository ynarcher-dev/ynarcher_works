-- =====================================================================
-- [Phase 7] AC 공통 평가 엔진 + 서면평가 + 대면평가 + 최종 선발
-- 점수(scores)는 evaluation_answers.score_value에 저장. 가중총점=SUM(score*weight).
-- evaluation_targets는 다형 참조(APPLICATION→application_submissions, STARTUP→startups).
-- =====================================================================

create table if not exists public.evaluation_forms (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  form_type         text not null,  -- 'DOC_REVIEW' | 'ONSITE_EVAL' | 'DEMO_DAY'
  title             text not null,
  status            public.evaluation_status not null default 'DRAFT',
  deadline_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_eval_forms_module on public.evaluation_forms (program_module_id);

create table if not exists public.evaluation_criteria (
  id             uuid primary key default gen_random_uuid(),
  form_id        uuid not null references public.evaluation_forms(id) on delete cascade,
  label          text not null,
  criterion_type text not null default 'SCORE',
  max_score      numeric(5,2) not null default 100,
  weight         numeric(3,2) not null default 1.00,
  is_required    boolean not null default true,
  options        jsonb not null default '[]'::jsonb,
  sort_order     integer not null default 0
);
create index if not exists idx_eval_criteria_form on public.evaluation_criteria (form_id);

create table if not exists public.evaluation_targets (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.evaluation_forms(id) on delete cascade,
  target_type public.eval_target_type not null,
  target_id   uuid not null,  -- 다형: APPLICATION→application_submissions | STARTUP→startups (FK 미선언)
  created_at  timestamptz not null default now(),
  unique (form_id, target_type, target_id)
);

create table if not exists public.evaluation_assignments (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.evaluation_forms(id) on delete cascade,
  evaluator_id uuid not null references public.program_participants(id),
  target_id    uuid not null references public.evaluation_targets(id) on delete cascade,
  status       text not null default 'ASSIGNED',
  created_at   timestamptz not null default now(),
  unique (form_id, evaluator_id, target_id)
);
create index if not exists idx_eval_assign_form on public.evaluation_assignments (form_id);

create table if not exists public.evaluation_submissions (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.evaluation_forms(id) on delete cascade,
  evaluator_id uuid not null references public.program_participants(id),
  target_id    uuid references public.evaluation_targets(id),
  status       public.eval_submission_status not null default 'DRAFT',
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (form_id, evaluator_id, target_id)
);

create table if not exists public.evaluation_answers (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.evaluation_submissions(id) on delete cascade,
  criterion_id  uuid not null references public.evaluation_criteria(id),
  score_value   numeric(6,2),
  text_value    text,
  json_value    jsonb,
  unique (submission_id, criterion_id)
);

-- 서면평가 모듈 --------------------------------------------------------
create table if not exists public.document_review_rounds (
  id                 uuid primary key default gen_random_uuid(),
  program_module_id  uuid not null references public.program_modules(id) on delete cascade,
  evaluation_form_id uuid references public.evaluation_forms(id),
  opens_at           timestamptz,
  closes_at          timestamptz,
  status             public.session_lifecycle not null default 'DRAFT',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.document_review_snapshots (
  id                     uuid primary key default gen_random_uuid(),
  round_id               uuid not null references public.document_review_rounds(id) on delete cascade,
  application_submission_id uuid references public.application_submissions(id),
  snapshot_json          jsonb not null default '{}'::jsonb,
  file_manifest_json     jsonb not null default '[]'::jsonb,
  created_at             timestamptz not null default now()
);

-- 대면평가 모듈 --------------------------------------------------------
create table if not exists public.onsite_eval_sessions (
  id                 uuid primary key default gen_random_uuid(),
  program_module_id  uuid not null references public.program_modules(id) on delete cascade,
  evaluation_form_id uuid references public.evaluation_forms(id),
  venue              text,
  starts_at          timestamptz,
  ends_at            timestamptz,
  status             public.session_lifecycle not null default 'DRAFT',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.onsite_eval_presentations (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.onsite_eval_sessions(id) on delete cascade,
  startup_id       uuid references public.startups(id),
  order_no         integer not null default 0,
  present_minutes  integer,
  qna_minutes      integer,
  actual_started_at timestamptz,
  actual_ended_at  timestamptz,
  status           public.presentation_status not null default 'WAITING'
);
create index if not exists idx_onsite_pres_session on public.onsite_eval_presentations (session_id);

create table if not exists public.selection_results (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  startup_id        uuid references public.startups(id),
  decision          public.selection_decision not null default 'HOLD',
  rank_no           integer,
  reason            text,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'evaluation_forms','evaluation_submissions','document_review_rounds',
    'onsite_eval_sessions','selection_results'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;
