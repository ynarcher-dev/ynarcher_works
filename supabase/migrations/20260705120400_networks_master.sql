-- =====================================================================
-- [Phase 2] NETWORKS 마스터 테이블 (마스터 데이터 SSOT)
-- - startups / experts / partners: 스타트업·전문가·협력사 원장
-- - 임시 마스터(is_provisional) + 병합 플래그(merged_into_id)로 중복 정리 지원
-- - 1:1 부속 정보(주소/연락처/SNS)는 JSONB로 통합 (테이블 단편화 방지)
-- 근거: docs/docs_dev/7_database_design_guidelines.md §2.2, 마스터 SSOT=NETWORKS
-- =====================================================================

-- 스타트업 마스터 --------------------------------------------------------
create table if not exists public.startups (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  biz_reg_no     text,                 -- 사업자등록번호
  representative text,                  -- 대표자
  industry       text,
  stage          text,                  -- 성장 단계
  address        jsonb not null default '{}'::jsonb,
  contact        jsonb not null default '{}'::jsonb,
  sns_links      jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,           -- 임시 마스터 여부
  merged_into_id uuid references public.startups(id),      -- 병합 대상(정본) ID
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_startups_name on public.startups (name);
create index if not exists idx_startups_merged_into on public.startups (merged_into_id);

-- 전문가 마스터 ----------------------------------------------------------
create table if not exists public.experts (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  phone          text,
  affiliation    text,                  -- 소속
  expertise      jsonb not null default '[]'::jsonb,       -- 전문 분야 목록
  profile        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.experts(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_experts_name on public.experts (name);
create index if not exists idx_experts_merged_into on public.experts (merged_into_id);

-- 협력사 마스터 ----------------------------------------------------------
create table if not exists public.partners (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  partner_type   text,                  -- 협력사 유형
  contact        jsonb not null default '{}'::jsonb,
  memo           text,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.partners(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_partners_name on public.partners (name);
create index if not exists idx_partners_merged_into on public.partners (merged_into_id);

-- users.company_id → startups(id) FK (외부 스타트업 계정 소속 기업)
do $$ begin
  alter table public.users
    add constraint fk_users_company
    foreign key (company_id) references public.startups(id);
exception when duplicate_object then null; end $$;

-- updated_at 트리거
drop trigger if exists trg_startups_updated_at on public.startups;
create trigger trg_startups_updated_at before update on public.startups
  for each row execute function app.set_updated_at();

drop trigger if exists trg_experts_updated_at on public.experts;
create trigger trg_experts_updated_at before update on public.experts
  for each row execute function app.set_updated_at();

drop trigger if exists trg_partners_updated_at on public.partners;
create trigger trg_partners_updated_at before update on public.partners
  for each row execute function app.set_updated_at();
