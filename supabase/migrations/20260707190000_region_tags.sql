-- =====================================================================
-- [Phase 15] 권역 태그 (기준정보 / ADMIN 관리)
-- - 글로벌 네트워크의 권역(대륙권) 분류에 사용할 상위 태그 원장.
-- - country_tags(국가)가 이 테이블을 부모로 참조(2뎁스: 권역 › 국가)한다.
-- - field_tags와 동일 구조: ADMIN만 추가/수정/삭제(soft), 내부 사용자 전체 열람.
-- 근거: 20260706130000_field_tags.sql(태그 템플릿),
--       docs/docs_dev/3_database_rls_policy_matrix.md(참조 데이터)
-- =====================================================================

create table if not exists public.region_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create unique index if not exists uq_region_tags_name
  on public.region_tags (name) where deleted_at is null;
create index if not exists idx_region_tags_sort
  on public.region_tags (sort_order, name);

drop trigger if exists trg_region_tags_updated_at on public.region_tags;
create trigger trg_region_tags_updated_at before update on public.region_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.region_tags enable row level security;

drop policy if exists region_tags_select on public.region_tags;
create policy region_tags_select on public.region_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists region_tags_insert on public.region_tags;
create policy region_tags_insert on public.region_tags for insert
  with check (app.is_admin());

drop policy if exists region_tags_update on public.region_tags;
create policy region_tags_update on public.region_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 권역 시드
insert into public.region_tags (name, sort_order) values
  ('북미', 1),
  ('일본', 2),
  ('중화권', 3),
  ('동남아', 4),
  ('인도·남아시아', 5),
  ('유럽', 6),
  ('중동', 7),
  ('기타', 8)
on conflict do nothing;
