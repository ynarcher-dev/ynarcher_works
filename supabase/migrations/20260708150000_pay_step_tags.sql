-- =====================================================================
-- [Phase 15] 호봉 태그 (기준정보 / ADMIN 관리)
-- - 임직원 호봉(1호봉/2호봉 등) 분류에 사용할 태그 원장
-- - rank_tags/position_tags와 동일 구조: ADMIN만 추가/수정/삭제(soft), 내부 사용자 전체 열람
-- 근거: 20260706150000_rank_tags.sql
-- =====================================================================

create table if not exists public.pay_step_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_pay_step_tags_name
  on public.pay_step_tags (name) where deleted_at is null;
create index if not exists idx_pay_step_tags_sort
  on public.pay_step_tags (sort_order, name);

drop trigger if exists trg_pay_step_tags_updated_at on public.pay_step_tags;
create trigger trg_pay_step_tags_updated_at before update on public.pay_step_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.pay_step_tags enable row level security;

drop policy if exists pay_step_tags_select on public.pay_step_tags;
create policy pay_step_tags_select on public.pay_step_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists pay_step_tags_insert on public.pay_step_tags;
create policy pay_step_tags_insert on public.pay_step_tags for insert
  with check (app.is_admin());

drop policy if exists pay_step_tags_update on public.pay_step_tags;
create policy pay_step_tags_update on public.pay_step_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 호봉 시드(1호봉~10호봉)
insert into public.pay_step_tags (name, sort_order) values
  ('1호봉', 1),
  ('2호봉', 2),
  ('3호봉', 3),
  ('4호봉', 4),
  ('5호봉', 5),
  ('6호봉', 6),
  ('7호봉', 7),
  ('8호봉', 8),
  ('9호봉', 9),
  ('10호봉', 10)
on conflict do nothing;
