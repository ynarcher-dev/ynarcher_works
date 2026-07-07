-- =====================================================================
-- [Phase 15] NETWORKS '기타(etc)' 네트워크 마스터 신설
-- - 기존 '미분류(others)'는 분류 전 임시 저장소('미분류 데이터베이스')로 유지하고,
--   외주/거래 아래에 위치하는 일반 네트워크 카테고리로 '기타(etc)'를 새로 추가한다.
-- - experts와 동일한 통일 프로필 스키마(email/phone/affiliation/expertise/profile)를 갖는다.
--   → 조직형(compact) 표시(분야/활동/만족도/매칭 제외, 부서 노출)는 프론트 config에서 처리.
-- - RLS는 다른 네트워크 마스터와 동일하게 networks 워크스페이스 read/write 기준.
-- 근거: 20260705120400_networks_master.sql(experts 템플릿),
--       20260706170000_networks_org_masters.sql(org 마스터·RLS 선례),
--       20260707120000_networks_unify_profile_schema.sql(통일 스키마)
-- =====================================================================

-- 기타 마스터 ------------------------------------------------------------
create table if not exists public.etc (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  phone          text,
  affiliation    text,                                        -- 소속
  expertise      jsonb not null default '[]'::jsonb,           -- 전문 분야 목록(조직형은 미사용)
  profile        jsonb not null default '{}'::jsonb,           -- 사진/직책/부서/구분/매칭여부/약력/소개
  is_provisional boolean not null default false,
  merged_into_id uuid references public.etc(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists idx_etc_name        on public.etc (name);
create index if not exists idx_etc_merged_into on public.etc (merged_into_id);

comment on column public.etc.expertise is '전문 분야 목록(조직형은 미사용). experts와 동일 구조';
comment on column public.etc.profile   is '사진/직책/부서/구분/매칭여부/약력/소개(jsonb). experts와 동일 구조';

-- updated_at 트리거 -----------------------------------------------------
drop trigger if exists trg_etc_updated_at on public.etc;
create trigger trg_etc_updated_at
  before update on public.etc
  for each row execute function app.set_updated_at();

-- RLS: networks 워크스페이스 read/write 권한자 기준(다른 마스터와 동일) --------
alter table public.etc enable row level security;

drop policy if exists etc_select on public.etc;
create policy etc_select on public.etc for select
  using (app.can_read_workspace('networks'));

drop policy if exists etc_insert on public.etc;
create policy etc_insert on public.etc for insert
  with check (app.can_write_workspace('networks'));

drop policy if exists etc_update on public.etc;
create policy etc_update on public.etc for update
  using (app.can_write_workspace('networks'))
  with check (app.can_write_workspace('networks'));
