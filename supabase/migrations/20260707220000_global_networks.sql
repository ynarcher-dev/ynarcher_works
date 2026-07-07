-- =====================================================================
-- [Phase 15] 글로벌 네트워크 마스터 신설 (global_networks)
-- - 국내 8종 마스터와 물리적으로 분리된 '독립 단일 마스터'. 사람(담당자) 1명에
--   권역·국가·구분(기업/기관/투자자)이 속성으로 붙는 구조로, 국내처럼 구분별 테이블을
--   나누지 않는다(글로벌/국내 SSOT 혼선 방지).
-- - 권역/국가는 기준정보 태그(region_tags/country_tags)를 FK로 참조(2뎁스: 권역 › 국가).
--   구분은 3개 고정값(기업/기관/투자자)을 category 스칼라로 둔다.
-- - 이름/소속/이메일/연락처/링크드인은 스칼라, 부서/직책·직급은 profile(jsonb)에 저장한다
--   (국내 인물 마스터와 동일한 profile 구조 재활용).
-- - RLS는 다른 네트워크 마스터와 동일하게 networks 워크스페이스 read/write 기준.
-- - 파괴적 작업 가드(비활성/병합 시 기여자·admin 제한)도 국내 8종과 동일하게 배선한다.
-- 근거: 20260707180000_networks_exp_master.sql(신규 마스터 선례),
--       20260707190000_region_tags.sql / 20260707200000_country_tags.sql(권역·국가 태그),
--       20260707160000_networks_destructive_guard.sql(파괴적 가드)
-- =====================================================================

create table if not exists public.global_networks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text,
  phone          text,
  affiliation    text,                                        -- 소속(기관·기업명)
  linkedin_url   text,                                        -- 링크드인 프로필 URL(목록은 아이콘)
  category       text,                                        -- 구분: 기업|기관|투자자 (미분류 허용 = null)
  region_tag_id  uuid references public.region_tags(id),      -- 권역(2뎁스 부모)
  country_tag_id uuid references public.country_tags(id),     -- 국가(2뎁스 자식)
  expertise      jsonb not null default '[]'::jsonb,          -- 전문 분야 목록(국내 인물 마스터와 동일 구조)
  profile        jsonb not null default '{}'::jsonb,          -- 사진/부서/직책·직급 등(국내 인물 마스터와 동일 구조)
  is_provisional boolean not null default false,
  merged_into_id uuid references public.global_networks(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  constraint global_networks_category_chk
    check (category is null or category in ('기업', '기관', '투자자'))
);

create index if not exists idx_global_networks_name        on public.global_networks (name);
create index if not exists idx_global_networks_region      on public.global_networks (region_tag_id);
create index if not exists idx_global_networks_country     on public.global_networks (country_tag_id);
create index if not exists idx_global_networks_merged_into on public.global_networks (merged_into_id);

comment on column public.global_networks.category     is '구분(기업/기관/투자자). 국내와 달리 테이블이 아닌 스칼라 속성';
comment on column public.global_networks.linkedin_url is '링크드인 프로필 URL. 목록에서는 유무에 따라 아이콘 색으로 표시';
comment on column public.global_networks.expertise    is '전문 분야 목록(jsonb 배열). 국내 인물 마스터와 동일 구조';
comment on column public.global_networks.profile      is '사진/부서/직책·직급 등(jsonb). 국내 인물 마스터와 동일 구조';

-- updated_at 트리거 -----------------------------------------------------
drop trigger if exists trg_global_networks_updated_at on public.global_networks;
create trigger trg_global_networks_updated_at
  before update on public.global_networks
  for each row execute function app.set_updated_at();

-- RLS: networks 워크스페이스 read/write 권한자 기준(다른 마스터와 동일) --------
alter table public.global_networks enable row level security;

drop policy if exists global_networks_select on public.global_networks;
create policy global_networks_select on public.global_networks for select
  using (app.can_read_workspace('networks'));

drop policy if exists global_networks_insert on public.global_networks;
create policy global_networks_insert on public.global_networks for insert
  with check (app.can_write_workspace('networks'));

drop policy if exists global_networks_update on public.global_networks;
create policy global_networks_update on public.global_networks for update
  using (app.can_write_workspace('networks'))
  with check (app.can_write_workspace('networks'));

-- 파괴적 작업 가드(비활성/병합은 기여자 또는 admin만) — 국내 8종과 동일 ----------
drop trigger if exists trg_global_networks_destructive_guard on public.global_networks;
create trigger trg_global_networks_destructive_guard
  before update on public.global_networks
  for each row execute function app.guard_network_destructive();
