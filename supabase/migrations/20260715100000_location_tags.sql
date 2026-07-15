-- =====================================================================
-- 소재지 태그 (기준정보 / ADMIN 관리)
-- - 스타트업 풀 소재지(시·도 등) 분류에 사용할 태그 원장.
-- - region_tags/field_tags와 동일 구조(평면 태그): ADMIN만 추가/수정/삭제(soft),
--   내부 사용자 전체 열람. startups.location 컬럼이 태그명(text)을 저장한다(FK 아님).
-- 근거: 20260707190000_region_tags.sql(태그 템플릿),
--       docs/docs_dev/11_migration_security_gate.md,
--       docs/docs_dev/3_database_rls_policy_matrix.md(참조 데이터)
-- =====================================================================

create table if not exists public.location_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_location_tags_name
  on public.location_tags (name) where deleted_at is null;
create index if not exists idx_location_tags_sort
  on public.location_tags (sort_order, name);

drop trigger if exists trg_location_tags_updated_at on public.location_tags;
create trigger trg_location_tags_updated_at before update on public.location_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.location_tags enable row level security;

drop policy if exists location_tags_select on public.location_tags;
create policy location_tags_select on public.location_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists location_tags_insert on public.location_tags;
create policy location_tags_insert on public.location_tags for insert
  with check (app.is_admin());

drop policy if exists location_tags_update on public.location_tags;
create policy location_tags_update on public.location_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 소재지(시·도) 시드. 운영자가 ADMIN에서 자유롭게 추가/수정할 수 있다.
insert into public.location_tags (name, sort_order) values
  ('서울', 1),
  ('부산', 2),
  ('대구', 3),
  ('인천', 4),
  ('광주', 5),
  ('대전', 6),
  ('울산', 7),
  ('세종', 8),
  ('경기', 9),
  ('강원', 10),
  ('충북', 11),
  ('충남', 12),
  ('전북', 13),
  ('전남', 14),
  ('경북', 15),
  ('경남', 16),
  ('제주', 17),
  ('해외', 18)
on conflict do nothing;
