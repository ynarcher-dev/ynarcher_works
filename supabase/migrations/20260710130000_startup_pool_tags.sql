-- =====================================================================
-- 스타트업 풀 기준정보 태그 (ADMIN 관리): 투자단계 / 기업구분 / 기업현황
-- - 스타트업 풀 목록의 단계(startups.stage)·구분(management_status)·현황(pool_status)
--   컬럼에 넣을 값을 ADMIN에서 태그로 관리하기 위한 원장 3종.
-- - 기존 category_tags(20260706160000)와 완전히 동일한 구조/정책:
--   · ADMIN만 추가/수정/삭제(soft delete), 내부 사용자 전체 열람.
--   · id/name/sort_order/created_by/created_at/updated_at/deleted_at + 미삭제 이름 유니크 + 정렬 인덱스.
-- - 신규 RPC/SECURITY DEFINER/Storage 정책 없음. 개인정보·다운로드·Export 영향 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260706160000_category_tags.sql(동일 구조 원본), app.set_updated_at()/app.is_admin()/
--       app.current_app_user_id() 헬퍼.
-- =====================================================================

-- 공통 구조를 3개 테이블에 동일 적용한다. -------------------------------------
create table if not exists public.investment_stage_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists uq_investment_stage_tags_name
  on public.investment_stage_tags (name) where deleted_at is null;
create index if not exists idx_investment_stage_tags_sort
  on public.investment_stage_tags (sort_order, name);
drop trigger if exists trg_investment_stage_tags_updated_at on public.investment_stage_tags;
create trigger trg_investment_stage_tags_updated_at before update on public.investment_stage_tags
  for each row execute function app.set_updated_at();

create table if not exists public.company_category_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists uq_company_category_tags_name
  on public.company_category_tags (name) where deleted_at is null;
create index if not exists idx_company_category_tags_sort
  on public.company_category_tags (sort_order, name);
drop trigger if exists trg_company_category_tags_updated_at on public.company_category_tags;
create trigger trg_company_category_tags_updated_at before update on public.company_category_tags
  for each row execute function app.set_updated_at();

create table if not exists public.company_status_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create unique index if not exists uq_company_status_tags_name
  on public.company_status_tags (name) where deleted_at is null;
create index if not exists idx_company_status_tags_sort
  on public.company_status_tags (sort_order, name);
drop trigger if exists trg_company_status_tags_updated_at on public.company_status_tags;
create trigger trg_company_status_tags_updated_at before update on public.company_status_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람=내부 사용자 전체, 쓰기=관리자만 (category_tags와 동일) --------------
alter table public.investment_stage_tags enable row level security;
drop policy if exists investment_stage_tags_select on public.investment_stage_tags;
create policy investment_stage_tags_select on public.investment_stage_tags for select
  using (app.current_app_user_id() is not null);
drop policy if exists investment_stage_tags_insert on public.investment_stage_tags;
create policy investment_stage_tags_insert on public.investment_stage_tags for insert
  with check (app.is_admin());
drop policy if exists investment_stage_tags_update on public.investment_stage_tags;
create policy investment_stage_tags_update on public.investment_stage_tags for update
  using (app.is_admin()) with check (app.is_admin());

alter table public.company_category_tags enable row level security;
drop policy if exists company_category_tags_select on public.company_category_tags;
create policy company_category_tags_select on public.company_category_tags for select
  using (app.current_app_user_id() is not null);
drop policy if exists company_category_tags_insert on public.company_category_tags;
create policy company_category_tags_insert on public.company_category_tags for insert
  with check (app.is_admin());
drop policy if exists company_category_tags_update on public.company_category_tags;
create policy company_category_tags_update on public.company_category_tags for update
  using (app.is_admin()) with check (app.is_admin());

alter table public.company_status_tags enable row level security;
drop policy if exists company_status_tags_select on public.company_status_tags;
create policy company_status_tags_select on public.company_status_tags for select
  using (app.current_app_user_id() is not null);
drop policy if exists company_status_tags_insert on public.company_status_tags;
create policy company_status_tags_insert on public.company_status_tags for insert
  with check (app.is_admin());
drop policy if exists company_status_tags_update on public.company_status_tags;
create policy company_status_tags_update on public.company_status_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 시드(관리자가 자유롭게 수정/삭제/추가 가능한 초기값) ---------------------
insert into public.investment_stage_tags (name, sort_order) values
  ('시드', 1), ('Pre-A', 2), ('Series A', 3), ('Series B', 4),
  ('Series C', 5), ('Series D 이상', 6), ('IPO', 7)
on conflict do nothing;

insert into public.company_category_tags (name, sort_order) values
  ('발굴', 1), ('보육', 2), ('투자', 3), ('기타', 4)
on conflict do nothing;

insert into public.company_status_tags (name, sort_order) values
  ('진행중', 1), ('보류', 2), ('종료', 3), ('제외', 4)
on conflict do nothing;
