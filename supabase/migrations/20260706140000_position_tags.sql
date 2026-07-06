-- =====================================================================
-- [Phase 15] 직책 태그 (기준정보 / ADMIN 관리)
-- - 임직원 직책(팀장/실장 등) 분류에 사용할 태그 원장
-- - industry_tags와 동일 구조: ADMIN만 추가/수정/삭제(soft), 내부 사용자 전체 열람
-- 근거: 20260706120000_industry_tags.sql
-- =====================================================================

create table if not exists public.position_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_position_tags_name
  on public.position_tags (name) where deleted_at is null;
create index if not exists idx_position_tags_sort
  on public.position_tags (sort_order, name);

drop trigger if exists trg_position_tags_updated_at on public.position_tags;
create trigger trg_position_tags_updated_at before update on public.position_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.position_tags enable row level security;

drop policy if exists position_tags_select on public.position_tags;
create policy position_tags_select on public.position_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists position_tags_insert on public.position_tags;
create policy position_tags_insert on public.position_tags for insert
  with check (app.is_admin());

drop policy if exists position_tags_update on public.position_tags;
create policy position_tags_update on public.position_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 직책 시드
insert into public.position_tags (name, sort_order) values
  ('대표', 1),
  ('부문장', 2),
  ('실장', 3),
  ('팀장', 4),
  ('파트장', 5),
  ('매니저', 6),
  ('팀원', 7)
on conflict do nothing;
