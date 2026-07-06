-- =====================================================================
-- [Phase 15] NETWORKS 조직 마스터 확장 (3종 → 8종 DB)
-- - 기존 startups/experts는 유지, partners(협력사)를 세분화하여 신규 6종 도입
--   · van          : VAN(밸류애드 네트워크) 협력 기관
--   · investors    : 투자사
--   · corporates   : 기업
--   · institutions : 기관
--   · universities : 대학
--   · others       : 기타
-- - 각 테이블은 마스터 SSOT 규약(is_provisional 임시마스터 + merged_into_id 병합) 준수
-- - RLS는 networks 워크스페이스 read/write 권한자 기준(기존 마스터와 동일)
-- - partners 데이터는 van으로 이관(비파괴 복사 후 partners는 soft 유지)
-- 근거: 20260705120400_networks_master.sql, 20260705120500_rls_enable_policies.sql
-- =====================================================================

-- VAN 마스터 -------------------------------------------------------------
create table if not exists public.van (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text,                  -- 구분
  representative text,                   -- 담당자
  memo           text,
  contact        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.van(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 투자사 마스터 ----------------------------------------------------------
create table if not exists public.investors (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  investor_type  text,                  -- 유형(VC/AC/CVC/PE 등)
  representative text,                   -- 대표자
  focus          text,                   -- 투자 분야
  contact        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.investors(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 기업 마스터 ------------------------------------------------------------
create table if not exists public.corporates (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  biz_reg_no     text,                  -- 사업자등록번호
  representative text,                   -- 대표자
  industry       text,                   -- 산업
  contact        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.corporates(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 기관 마스터 ------------------------------------------------------------
create table if not exists public.institutions (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  institution_type  text,               -- 유형(정부/공공/지원기관 등)
  representative    text,                -- 대표
  region            text,                -- 지역
  contact           jsonb not null default '{}'::jsonb,
  is_provisional    boolean not null default false,
  merged_into_id    uuid references public.institutions(id),
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- 대학 마스터 ------------------------------------------------------------
create table if not exists public.universities (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  university_type  text,                -- 구분(대학/연구소 등)
  department       text,                -- 학과/부서
  region           text,                 -- 지역
  contact          jsonb not null default '{}'::jsonb,
  is_provisional   boolean not null default false,
  merged_into_id   uuid references public.universities(id),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

-- 기타 마스터 ------------------------------------------------------------
create table if not exists public.others (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text,                  -- 구분
  representative text,                   -- 담당자
  memo           text,
  contact        jsonb not null default '{}'::jsonb,
  is_provisional boolean not null default false,
  merged_into_id uuid references public.others(id),
  created_by     uuid references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 인덱스(이름 조회 + 병합 조회) -----------------------------------------
create index if not exists idx_van_name          on public.van (name);
create index if not exists idx_van_merged_into    on public.van (merged_into_id);
create index if not exists idx_investors_name      on public.investors (name);
create index if not exists idx_investors_merged_into on public.investors (merged_into_id);
create index if not exists idx_corporates_name     on public.corporates (name);
create index if not exists idx_corporates_merged_into on public.corporates (merged_into_id);
create index if not exists idx_institutions_name   on public.institutions (name);
create index if not exists idx_institutions_merged_into on public.institutions (merged_into_id);
create index if not exists idx_universities_name   on public.universities (name);
create index if not exists idx_universities_merged_into on public.universities (merged_into_id);
create index if not exists idx_others_name         on public.others (name);
create index if not exists idx_others_merged_into   on public.others (merged_into_id);

-- updated_at 트리거 -----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['van','investors','corporates','institutions','universities','others']
  loop
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s;', t);
    execute format(
      'create trigger trg_%1$s_updated_at before update on public.%1$s '
      || 'for each row execute function app.set_updated_at();', t);
  end loop;
end $$;

-- RLS: networks 워크스페이스 read/write 권한자 기준(기존 마스터와 동일) -------
do $$
declare t text;
begin
  foreach t in array array['van','investors','corporates','institutions','universities','others']
  loop
    execute format('alter table public.%1$s enable row level security;', t);

    execute format('drop policy if exists %1$s_select on public.%1$s;', t);
    execute format(
      'create policy %1$s_select on public.%1$s for select '
      || 'using (app.can_read_workspace(''networks''));', t);

    execute format('drop policy if exists %1$s_insert on public.%1$s;', t);
    execute format(
      'create policy %1$s_insert on public.%1$s for insert '
      || 'with check (app.can_write_workspace(''networks''));', t);

    execute format('drop policy if exists %1$s_update on public.%1$s;', t);
    execute format(
      'create policy %1$s_update on public.%1$s for update '
      || 'using (app.can_write_workspace(''networks'')) '
      || 'with check (app.can_write_workspace(''networks''));', t);
  end loop;
end $$;

-- partners(협력사) → van 데이터 이관(비파괴 복사, 중복 이관 방지) -----------
insert into public.van (name, category, memo, contact, is_provisional, created_by, created_at)
select p.name, p.partner_type, p.memo, p.contact, p.is_provisional, p.created_by, p.created_at
from public.partners p
where p.deleted_at is null
  and not exists (select 1 from public.van v where v.name = p.name);
