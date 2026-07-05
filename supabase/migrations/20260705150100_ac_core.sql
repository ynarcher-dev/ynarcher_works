-- =====================================================================
-- [Phase 7] AC 코어 계층: programs → program_modules / program_participants / 신청서
-- 계층: Program → ProgramModule → Session → Assignment → Result
-- =====================================================================

create table if not exists public.programs (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  internal_title       text,
  slug                 text unique,
  status               public.program_status not null default 'DRAFT',
  start_date           date,
  end_date             date,
  host_organization    text,
  partner_organization text,
  description          text,
  created_by           uuid references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz
);
create index if not exists idx_programs_status on public.programs (status);

create table if not exists public.program_modules (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.programs(id) on delete cascade,
  module_type        public.module_type not null,
  enabled            boolean not null default false,
  status             public.module_status not null default 'DRAFT',
  participation_mode public.participation_mode,
  manager_id         uuid references public.users(id),
  settings           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (program_id, module_type)
);
create index if not exists idx_program_modules_program on public.program_modules (program_id);

create table if not exists public.program_participants (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references public.programs(id) on delete cascade,
  user_id      uuid references public.users(id),
  master_id    uuid,  -- NETWORKS 마스터(startups/experts) soft ref
  role         public.program_participant_role not null,
  role_tags    text[] not null default '{}',
  status       text not null default 'ACTIVE',
  invited_at   timestamptz,
  joined_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (program_id, user_id, role)
);
create index if not exists idx_program_participants_program on public.program_participants (program_id);

-- 모집: 동적 신청서 폼 + 지원자 DB ----------------------------------------
create table if not exists public.application_forms (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  title       text not null,
  status      public.module_status not null default 'DRAFT',
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.application_form_fields (
  id               uuid primary key default gen_random_uuid(),
  form_id          uuid not null references public.application_forms(id) on delete cascade,
  field_type       text not null,
  label            text not null,
  is_required      boolean not null default false,
  options          jsonb not null default '[]'::jsonb,
  file_constraints jsonb not null default '{}'::jsonb,
  sort_order       integer not null default 0
);
create index if not exists idx_app_form_fields_form on public.application_form_fields (form_id);

create table if not exists public.application_submissions (
  id               uuid primary key default gen_random_uuid(),
  program_id       uuid not null references public.programs(id) on delete cascade,
  form_id          uuid references public.application_forms(id),
  startup_id       uuid references public.startups(id),  -- 임시 마스터 포함
  applicant_user_id uuid references public.users(id),
  status           public.application_status not null default 'DRAFT',
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_app_submissions_program on public.application_submissions (program_id);
create index if not exists idx_app_submissions_status on public.application_submissions (status);

create table if not exists public.application_answers (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.application_submissions(id) on delete cascade,
  field_id      uuid not null references public.application_form_fields(id),
  text_value    text,
  json_value    jsonb,
  unique (submission_id, field_id)
);

-- updated_at 트리거
do $$
declare t text;
begin
  foreach t in array array[
    'programs','program_modules','program_participants',
    'application_forms','application_submissions'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;
