-- =====================================================================
-- [Phase 11] PROJECT 워크스페이스 스키마
-- projects → project_members / project_tasks(→task_checklist_items) / project_milestones
-- 마일스톤 일정은 system_events(HUB 전사 캘린더)와 연계(트리거 자동 반영).
-- 근거: docs_planning/3_8_workspace_project.md
-- =====================================================================

do $$ begin create type public.project_type as enum ('GLOBAL','NEW_BIZ','GENERAL');
exception when duplicate_object then null; end $$;

do $$ begin create type public.project_priority as enum ('HIGH','MEDIUM','LOW');
exception when duplicate_object then null; end $$;

do $$ begin create type public.task_status as enum ('TODO','IN_PROGRESS','REVIEW','DONE');
exception when duplicate_object then null; end $$;

create table if not exists public.projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  project_type  public.project_type not null default 'GENERAL',
  priority      public.project_priority not null default 'MEDIUM',
  department_id uuid references public.departments(id),
  pm_id         uuid references public.users(id),        -- 담당 PM
  start_date    date,
  end_date      date,
  progress_pct  integer not null default 0,              -- 마일스톤 진척도
  note          text,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_projects_type on public.projects (project_type);

create table if not exists public.project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.users(id),
  role       text,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index if not exists idx_project_members_project on public.project_members (project_id);

create table if not exists public.project_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  description text,
  status      public.task_status not null default 'TODO',
  assignee_id uuid references public.users(id),          -- MANAGEMENT 조직도 연동
  due_date    timestamptz,                                -- UTC 병기(글로벌 시차)
  sort_order  integer not null default 0,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_project_tasks_project on public.project_tasks (project_id, status);

create table if not exists public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.project_tasks(id) on delete cascade,
  label      text not null,
  is_done    boolean not null default false,
  link_url   text,                                        -- 산출물 링크 아카이브
  sort_order integer not null default 0
);
create index if not exists idx_checklist_task on public.task_checklist_items (task_id);

create table if not exists public.project_milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  name        text not null,
  start_date  date,
  end_date    date,
  depends_on  uuid references public.project_milestones(id),  -- 선후 의존 관계
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_milestones_project on public.project_milestones (project_id);

-- updated_at 트리거 --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['projects','project_tasks','project_milestones'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- RLS: PROJECT 워크스페이스 게이트 ----------------------------------------
do $$
declare
  t          text;
  sel_expr   text;
  wr_expr    text;
  proj_tables text[] := array[
    'projects','project_members','project_tasks','task_checklist_items','project_milestones'
  ];
begin
  sel_expr := 'app.can_read_workspace(''project'')';
  wr_expr  := 'app.can_write_workspace(''project'')';
  foreach t in array proj_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_project_select', t);
    execute format('create policy %I on public.%I for select using (%s)', t||'_project_select', t, sel_expr);
    execute format('drop policy if exists %I on public.%I', t||'_project_insert', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t||'_project_insert', t, wr_expr);
    execute format('drop policy if exists %I on public.%I', t||'_project_update', t);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t||'_project_update', t, wr_expr, wr_expr);
  end loop;
end $$;

-- 마일스톤 → 전사 캘린더(system_events) 자동 연계 트리거 ------------------
create or replace function app.sync_milestone_event()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    insert into public.system_events (event_type, workspace_key, title, starts_at, ends_at, ref_type, ref_id, created_by)
    values ('PROJECT', 'project', new.name,
            new.start_date::timestamptz, new.end_date::timestamptz,
            'PROJECT_MILESTONE', new.id, app.current_app_user_id())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_milestone_event on public.project_milestones;
create trigger trg_milestone_event after insert on public.project_milestones
  for each row execute function app.sync_milestone_event();
