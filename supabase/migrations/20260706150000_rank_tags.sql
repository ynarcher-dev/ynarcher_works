-- =====================================================================
-- [Phase 15] 직급 태그 (기준정보 / ADMIN 관리)
-- - 임직원 직급(사원/대리/과장 등) 분류에 사용할 태그 원장
-- - industry_tags와 동일 구조: ADMIN만 추가/수정/삭제(soft), 내부 사용자 전체 열람
-- 근거: 20260706120000_industry_tags.sql
-- =====================================================================

create table if not exists public.rank_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_rank_tags_name
  on public.rank_tags (name) where deleted_at is null;
create index if not exists idx_rank_tags_sort
  on public.rank_tags (sort_order, name);

drop trigger if exists trg_rank_tags_updated_at on public.rank_tags;
create trigger trg_rank_tags_updated_at before update on public.rank_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.rank_tags enable row level security;

drop policy if exists rank_tags_select on public.rank_tags;
create policy rank_tags_select on public.rank_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists rank_tags_insert on public.rank_tags;
create policy rank_tags_insert on public.rank_tags for insert
  with check (app.is_admin());

drop policy if exists rank_tags_update on public.rank_tags;
create policy rank_tags_update on public.rank_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 직급 시드
insert into public.rank_tags (name, sort_order) values
  ('사원', 1),
  ('주임', 2),
  ('대리', 3),
  ('과장', 4),
  ('차장', 5),
  ('부장', 6),
  ('이사', 7)
on conflict do nothing;
