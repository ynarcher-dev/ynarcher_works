-- =====================================================================
-- [Phase 7] AC 운영 계층: 통합 타임라인/충돌 · KPI/성과/Export · 커스텀 활동
-- program_timeline_items는 모든 모듈 세션/마감의 정규화 인덱스(다형 source).
-- =====================================================================

create table if not exists public.program_timeline_items (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs(id) on delete cascade,
  program_module_id uuid references public.program_modules(id),
  source_table      text,   -- 다형 소스 (FK 미선언)
  source_id         uuid,
  item_type         text,   -- 표준 카테고리 10종
  title             text not null,
  starts_at         timestamptz,
  ends_at           timestamptz,
  visibility        text not null default 'INTERNAL_ONLY',
  created_at        timestamptz not null default now()
);
create index if not exists idx_timeline_items_program on public.program_timeline_items (program_id);

create table if not exists public.timeline_conflicts (
  id                  uuid primary key default gen_random_uuid(),
  program_id          uuid not null references public.programs(id) on delete cascade,
  timeline_item_id    uuid not null references public.program_timeline_items(id) on delete cascade,
  conflicting_item_id uuid references public.program_timeline_items(id),
  conflict_type       text,
  severity            public.conflict_severity not null default 'WARNING',
  status              public.conflict_status not null default 'OPEN',
  resolved_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- 성과 / KPI / Export --------------------------------------------------
create table if not exists public.module_kpi_snapshots (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references public.programs(id) on delete cascade,
  module_type   public.module_type,
  metric_key    text not null,
  metric_value  numeric,
  calculated_at timestamptz not null default now()
);
create index if not exists idx_kpi_snapshots_program on public.module_kpi_snapshots (program_id);

create table if not exists public.outcome_records (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references public.programs(id) on delete cascade,
  startup_id   uuid references public.startups(id),
  outcome_type text,
  status       public.outcome_status not null default 'LEAD',
  amount       numeric,
  note         text,
  visibility   text not null default 'INTERNAL_ONLY',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.export_jobs (
  id             uuid primary key default gen_random_uuid(),
  program_id     uuid not null references public.programs(id) on delete cascade,
  requested_by   uuid references public.users(id),
  column_groups  jsonb not null default '[]'::jsonb,
  masking_policy text,
  status         public.export_status not null default 'REQUESTED',
  file_id        uuid references public.attachments(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 커스텀 활동 / 회의록 -------------------------------------------------
create table if not exists public.custom_activities (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs(id) on delete cascade,
  program_module_id uuid references public.program_modules(id),
  session_source_id uuid,
  activity_type     text,
  title             text not null,
  activity_date     date,
  visibility        public.activity_visibility not null default 'INTERNAL_ONLY',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_custom_activities_program on public.custom_activities (program_id);

create table if not exists public.activity_minutes (
  id                uuid primary key default gen_random_uuid(),
  custom_activity_id uuid not null references public.custom_activities(id) on delete cascade,
  agenda            text,
  discussion        text,
  decisions         text,
  internal_note     text
);

create table if not exists public.action_items (
  id                uuid primary key default gen_random_uuid(),
  custom_activity_id uuid not null references public.custom_activities(id) on delete cascade,
  title             text not null,
  owner_participant_id uuid references public.program_participants(id),
  due_date          date,
  status            public.action_item_status not null default 'TODO',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.activity_attachments (
  id                uuid primary key default gen_random_uuid(),
  custom_activity_id uuid not null references public.custom_activities(id) on delete cascade,
  file_id           uuid references public.attachments(id),
  visibility        text not null default 'INTERNAL_ONLY'
);

create table if not exists public.activity_attendees (
  id                uuid primary key default gen_random_uuid(),
  custom_activity_id uuid not null references public.custom_activities(id) on delete cascade,
  participant_id    uuid references public.program_participants(id),
  unique (custom_activity_id, participant_id)
);

do $$
declare t text;
begin
  foreach t in array array['outcome_records','export_jobs','custom_activities','action_items'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;
