-- =====================================================================
-- [Phase 15] 국가 태그 (기준정보 / ADMIN 관리)
-- - 글로벌 네트워크의 국가 분류에 사용할 태그 원장.
-- - region_tags(권역)를 부모로 참조하는 2뎁스 구조(권역 › 국가). 국가를 배정하면
--   해당 국가의 region_tag_id로 권역이 자동 파생된다.
-- - field_tags와 동일 CRUD/RLS 구조 + region_tag_id 부모 FK만 추가.
-- 근거: 20260707190000_region_tags.sql(부모 태그),
--       20260706130000_field_tags.sql(태그 템플릿)
-- =====================================================================

create table if not exists public.country_tags (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  region_tag_id uuid references public.region_tags(id),  -- 소속 권역(2뎁스 부모)
  sort_order    integer not null default 0,              -- 표시 순서
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create unique index if not exists uq_country_tags_name
  on public.country_tags (name) where deleted_at is null;
create index if not exists idx_country_tags_sort
  on public.country_tags (sort_order, name);
create index if not exists idx_country_tags_region
  on public.country_tags (region_tag_id);

comment on column public.country_tags.region_tag_id is '소속 권역(region_tags). 글로벌 네트워크 배정 시 국가→권역 파생의 기준';

drop trigger if exists trg_country_tags_updated_at on public.country_tags;
create trigger trg_country_tags_updated_at before update on public.country_tags
  for each row execute function app.set_updated_at();

-- RLS: 열람은 내부 사용자 전체, 쓰기는 관리자만 -------------------------------
alter table public.country_tags enable row level security;

drop policy if exists country_tags_select on public.country_tags;
create policy country_tags_select on public.country_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists country_tags_insert on public.country_tags;
create policy country_tags_insert on public.country_tags for insert
  with check (app.is_admin());

drop policy if exists country_tags_update on public.country_tags;
create policy country_tags_update on public.country_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 권역 대표국 시드(권역별 소수). region_tag_id는 권역명으로 조인해 결정한다.
insert into public.country_tags (name, sort_order, region_tag_id)
select v.name, v.sort_order, r.id
from (values
  ('미국', 1, '북미'),
  ('캐나다', 2, '북미'),
  ('일본', 3, '일본'),
  ('중국', 4, '중화권'),
  ('홍콩', 5, '중화권'),
  ('대만', 6, '중화권'),
  ('싱가포르', 7, '동남아'),
  ('베트남', 8, '동남아'),
  ('인도네시아', 9, '동남아'),
  ('태국', 10, '동남아'),
  ('말레이시아', 11, '동남아'),
  ('인도', 12, '인도·남아시아'),
  ('영국', 13, '유럽'),
  ('독일', 14, '유럽'),
  ('프랑스', 15, '유럽'),
  ('아랍에미리트', 16, '중동'),
  ('사우디아라비아', 17, '중동'),
  ('오스트레일리아', 18, '기타'),
  ('브라질', 19, '기타'),
  ('남아프리카공화국', 20, '기타')
) as v(name, sort_order, region)
join public.region_tags r on r.name = v.region and r.deleted_at is null
on conflict do nothing;
