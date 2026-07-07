-- =====================================================================
-- [Phase 15] NETWORKS 'EXP(exp)' 네트워크 마스터 신설
-- - VAN 아래에 위치하는 신규 네트워크 카테고리 'EXP(exp)'를 추가한다.
-- - 전문가(experts)와 완전히 동일한 통일 프로필 스키마
--   (email/phone/affiliation/expertise/profile)를 가지며, 프로필형(조직형 아님)으로
--   목록·폼·상세를 experts와 동일 컴포넌트로 사용한다(프론트 config에서 처리).
-- - RLS는 다른 네트워크 마스터와 동일하게 networks 워크스페이스 read/write 기준.
-- - 파괴적 작업 가드(비활성/병합 시 기여자·admin 제한)도 실카테고리 8종과 동일하게 배선한다.
-- 근거: 20260705120400_networks_master.sql(experts 템플릿),
--       20260707140000_networks_etc_master.sql(신규 마스터 생성 선례),
--       20260707160000_networks_destructive_guard.sql(파괴적 가드)
-- =====================================================================

-- EXP 마스터 -------------------------------------------------------------
create table if not exists public.exp (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  phone          text,
  affiliation    text,                                        -- 소속
  expertise      jsonb not null default '[]'::jsonb,           -- 전문 분야 목록
  profile        jsonb not null default '{}'::jsonb,           -- 사진/직책/부서/구분/매칭여부/약력/소개
  is_provisional boolean not null default false,
  merged_into_id uuid references public.exp(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists idx_exp_name        on public.exp (name);
create index if not exists idx_exp_merged_into on public.exp (merged_into_id);

comment on column public.exp.expertise is '전문 분야 목록. experts와 동일 구조';
comment on column public.exp.profile   is '사진/직책/부서/구분/매칭여부/약력/소개(jsonb). experts와 동일 구조';

-- updated_at 트리거 -----------------------------------------------------
drop trigger if exists trg_exp_updated_at on public.exp;
create trigger trg_exp_updated_at
  before update on public.exp
  for each row execute function app.set_updated_at();

-- RLS: networks 워크스페이스 read/write 권한자 기준(다른 마스터와 동일) --------
alter table public.exp enable row level security;

drop policy if exists exp_select on public.exp;
create policy exp_select on public.exp for select
  using (app.can_read_workspace('networks'));

drop policy if exists exp_insert on public.exp;
create policy exp_insert on public.exp for insert
  with check (app.can_write_workspace('networks'));

drop policy if exists exp_update on public.exp;
create policy exp_update on public.exp for update
  using (app.can_write_workspace('networks'))
  with check (app.can_write_workspace('networks'));

-- 파괴적 작업 가드(비활성/병합은 기여자 또는 admin만) — 실카테고리 8종과 동일 --------
drop trigger if exists trg_exp_destructive_guard on public.exp;
create trigger trg_exp_destructive_guard
  before update on public.exp
  for each row execute function app.guard_network_destructive();
