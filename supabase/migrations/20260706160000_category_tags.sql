-- =====================================================================
-- [Phase 15] 구분 태그 (기준정보 / ADMIN 관리)
-- - 참여 대상 구분(게스트/스타트업/전문가/협력사/기관/기업/대학/Y&A 등) 분류 태그 원장
-- - 외부 행사·내부 업무에서 대상을 한 축으로 구분하는 카테고리
-- - industry_tags와 동일 구조: ADMIN만 추가/수정/삭제(soft), 내부 사용자 전체 열람
-- 근거: 20260706120000_industry_tags.sql
-- =====================================================================

create table if not exists public.category_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_category_tags_name
  on public.category_tags (name) where deleted_at is null;
create index if not exists idx_category_tags_sort
  on public.category_tags (sort_order, name);

drop trigger if exists trg_category_tags_updated_at on public.category_tags;
create trigger trg_category_tags_updated_at before update on public.category_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.category_tags enable row level security;

drop policy if exists category_tags_select on public.category_tags;
create policy category_tags_select on public.category_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists category_tags_insert on public.category_tags;
create policy category_tags_insert on public.category_tags for insert
  with check (app.is_admin());

drop policy if exists category_tags_update on public.category_tags;
create policy category_tags_update on public.category_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 구분 시드
insert into public.category_tags (name, sort_order) values
  ('게스트', 1),
  ('스타트업', 2),
  ('전문가', 3),
  ('협력사', 4),
  ('기관', 5),
  ('기업', 6),
  ('대학', 7),
  ('Y&A', 8)
on conflict do nothing;
