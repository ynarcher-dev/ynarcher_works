-- =====================================================================
-- [Phase 15] 분야 태그 (기준정보 / ADMIN 관리)
-- - 전문가 등 마스터의 분야(전문 분야) 분류에 사용할 태그 원장
-- - industry_tags와 동일 구조: ADMIN만 추가/수정/삭제(soft), 내부 사용자 전체 열람
-- 근거: docs/docs_dev/3_database_rls_policy_matrix.md(참조 데이터), 20260706120000_industry_tags.sql
-- =====================================================================

create table if not exists public.field_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_field_tags_name
  on public.field_tags (name) where deleted_at is null;
create index if not exists idx_field_tags_sort
  on public.field_tags (sort_order, name);

drop trigger if exists trg_field_tags_updated_at on public.field_tags;
create trigger trg_field_tags_updated_at before update on public.field_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.field_tags enable row level security;

drop policy if exists field_tags_select on public.field_tags;
create policy field_tags_select on public.field_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists field_tags_insert on public.field_tags;
create policy field_tags_insert on public.field_tags for insert
  with check (app.is_admin());

drop policy if exists field_tags_update on public.field_tags;
create policy field_tags_update on public.field_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 분야 시드
insert into public.field_tags (name, sort_order) values
  ('마케팅', 1),
  ('재무/회계', 2),
  ('법률/특허', 3),
  ('기술/개발', 4),
  ('인사/조직', 5),
  ('전략/기획', 6),
  ('영업/세일즈', 7),
  ('디자인/UX', 8)
on conflict do nothing;
