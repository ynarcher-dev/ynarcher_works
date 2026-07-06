-- =====================================================================
-- [Phase 15] 산업 분야 태그 (기준정보 / ADMIN 관리)
-- - 스타트업 등 마스터의 산업(industry) 분류에 사용할 태그 원장
-- - ADMIN(super_admin)만 추가/수정/삭제(soft), 내부 사용자 전체 열람
-- - 물리 삭제 금지: DELETE 정책 미선언 → deleted_at UPDATE(soft delete)
-- 근거: docs/docs_dev/3_database_rls_policy_matrix.md(참조 데이터), 7_database_design_guidelines.md
-- =====================================================================

create table if not exists public.industry_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 미삭제 태그명 중복 방지
create unique index if not exists uq_industry_tags_name
  on public.industry_tags (name) where deleted_at is null;
create index if not exists idx_industry_tags_sort
  on public.industry_tags (sort_order, name);

-- updated_at 자동 갱신
drop trigger if exists trg_industry_tags_updated_at on public.industry_tags;
create trigger trg_industry_tags_updated_at before update on public.industry_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.industry_tags enable row level security;

drop policy if exists industry_tags_select on public.industry_tags;
create policy industry_tags_select on public.industry_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists industry_tags_insert on public.industry_tags;
create policy industry_tags_insert on public.industry_tags for insert
  with check (app.is_admin());

drop policy if exists industry_tags_update on public.industry_tags;
create policy industry_tags_update on public.industry_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 기본 산업 분야 시드(기존 스타트업 시드 값 기준)
insert into public.industry_tags (name, sort_order) values
  ('핀테크', 1),
  ('헬스케어', 2),
  ('AI/딥테크', 3),
  ('클린테크', 4),
  ('커머스', 5),
  ('콘텐츠/미디어', 6),
  ('모빌리티', 7),
  ('SaaS', 8)
on conflict do nothing;
