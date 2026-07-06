-- =====================================================================
-- [Phase 15] NETWORKS 외주/거래 마스터(vendors) 추가
-- - 대학(universities)과 미분류(others) 사이에 노출되는 외주/거래처 마스터.
-- - 마스터 SSOT 규약(is_provisional 임시마스터 + merged_into_id 병합) 준수.
-- - RLS는 networks 워크스페이스 read/write 권한자 기준(기존 org 마스터와 동일).
-- 근거: 20260706170000_networks_org_masters.sql
-- =====================================================================

-- 외주/거래 마스터 ------------------------------------------------------
create table if not exists public.vendors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text,                  -- 구분(외주/거래 등)
  representative text,                   -- 담당자
  memo           text,
  contact        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.vendors(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 인덱스(이름 조회 + 병합 조회) -----------------------------------------
create index if not exists idx_vendors_name        on public.vendors (name);
create index if not exists idx_vendors_merged_into  on public.vendors (merged_into_id);

-- updated_at 트리거 -----------------------------------------------------
drop trigger if exists trg_vendors_updated_at on public.vendors;
create trigger trg_vendors_updated_at before update on public.vendors
  for each row execute function app.set_updated_at();

-- RLS: networks 워크스페이스 read/write 권한자 기준 -----------------------
alter table public.vendors enable row level security;

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select
  using (app.can_read_workspace('networks'));

drop policy if exists vendors_insert on public.vendors;
create policy vendors_insert on public.vendors for insert
  with check (app.can_write_workspace('networks'));

drop policy if exists vendors_update on public.vendors;
create policy vendors_update on public.vendors for update
  using (app.can_write_workspace('networks'))
  with check (app.can_write_workspace('networks'));
