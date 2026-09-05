-- 20260905220000 — 소재지 권역 태그(2뎁스: 권역 › 소재지)
--
-- 왜: STARTUP 목록 요약 카드의 지역 축을 세우기 위해서다. 소재지(location_tags)는 시·도
-- 17개 + '해외'로 18값이라 타일 한 줄로 서지 못하고, 실제 분포도 서울·경기에 몰려 나머지
-- 칸이 상시 0으로 남는다. NETWORKS 권역 카드가 성립한 것은 '지역이라서'가 아니라 국가
-- 수백 개를 권역 8칸으로 접었기 때문이다 — 같은 접는 단계를 소재지에도 둔다.
--
-- 구조도 그 선례를 그대로 따른다(region_tags › country_tags, 20260707190000·20260707200000):
-- 권역 원장을 따로 두고 소재지가 부모로 참조한다. 평면 text 컬럼으로 두지 않는 이유는
-- **타일 순서가 건수가 아니라 노출순위(sort_order)여야 하기 때문**이다 — 상시로 서는 카드에서
-- 건수순은 필터를 만질 때마다 칸이 자리를 바꿔 같은 곳을 두 번 누르지 못하게 한다. 순위를
-- 가지려면 권역은 값이 아니라 행이어야 한다.
--
-- NETWORKS의 region_tags에 섞지 않는다. 그 원장은 대륙권(북미·동남아·중동…)이고 여기는
-- 국내 시·도를 접은 축이라, 한 원장에 담으면 NETWORKS 권역 카드에 '수도권'이 0건으로 서고
-- STARTUP 권역 카드에 '중동'이 0건으로 선다. 같은 이름의 축이라도 세는 대상이 다르면
-- 원장을 나눈다.
--
-- 권역 구성은 통계청 7권역 + 해외 1(2026-09-05 확정). '해외'는 소재지 태그로 이미 있으므로
-- 권역에서도 자기 칸 하나로 서고, 국내를 묶는 중간 칸은 두지 않는다 — 한 축에 '묶음'과
-- '낱개'가 섞여 서면 칸마다 세는 것의 크기가 달라진다(NETWORKS 3f4b04b에서 밟은 길).
--
-- 보안 게이트(11_migration_security_gate.md):
--   · 소유 워크스페이스 admin(기준정보 태그 원장), 데이터 등급 Internal, 접근 주체 내부 사용자.
--   · RLS 즉시 활성 + SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft delete).
--   · 판정은 app.current_app_user_id()/app.is_admin() 헬퍼 경유. SECURITY DEFINER·RPC·
--     Storage 정책·개인정보·Export·권한 변경 영향 없음. 시드는 행정구역명뿐이다.
-- =====================================================================

-- 1) 권역 원장 -------------------------------------------------------------
create table if not exists public.location_region_tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  integer not null default 0,     -- 표시 순서(= 타일 순서)
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.location_region_tags is
  '소재지 권역(수도권·충청·해외 등). location_tags(시·도)의 2뎁스 부모이며 STARTUP 목록의 권역 타일 순서를 sort_order로 소유한다.';

create unique index if not exists uq_location_region_tags_name
  on public.location_region_tags (name) where deleted_at is null;
create index if not exists idx_location_region_tags_sort
  on public.location_region_tags (sort_order, name);

drop trigger if exists trg_location_region_tags_updated_at on public.location_region_tags;
create trigger trg_location_region_tags_updated_at before update on public.location_region_tags
  for each row execute function app.set_updated_at();

alter table public.location_region_tags enable row level security;

drop policy if exists location_region_tags_select on public.location_region_tags;
create policy location_region_tags_select on public.location_region_tags for select
  using (app.current_app_user_id() is not null);

drop policy if exists location_region_tags_insert on public.location_region_tags;
create policy location_region_tags_insert on public.location_region_tags for insert
  with check (app.is_admin());

drop policy if exists location_region_tags_update on public.location_region_tags;
create policy location_region_tags_update on public.location_region_tags for update
  using (app.is_admin()) with check (app.is_admin());

-- 2) 시드(통계청 7권역 + 해외) ---------------------------------------------
-- 시드는 초기값이지 정답이 아니다 — 운영자가 ADMIN에서 이름·순서를 고칠 수 있다.
insert into public.location_region_tags (name, sort_order) values
  ('수도권', 1),
  ('강원',   2),
  ('충청',   3),
  ('호남',   4),
  ('대경',   5),
  ('동남',   6),
  ('제주',   7),
  ('해외',   8)
on conflict do nothing;

-- 3) 소재지 → 권역 참조 ----------------------------------------------------
alter table public.location_tags
  add column if not exists region_tag_id uuid references public.location_region_tags(id);

comment on column public.location_tags.region_tag_id is
  '소속 권역(2뎁스 부모). 비어 있으면 STARTUP 권역 카드에서 미지정 칸에 모인다.';

create index if not exists idx_location_tags_region
  on public.location_tags (region_tag_id) where deleted_at is null;

-- 4) 백필: 기본 시드 시·도 18종을 권역에 붙인다 ------------------------------
-- 이름으로 잇는다. 소재지는 운영자가 고칠 수 있는 태그라 이름이 바뀐 행은 걸리지 않는데,
-- 그 경우 권역이 비어 미지정 칸에 서므로 화면에서 보고 채울 수 있다(조용히 틀리지 않는다).
-- 이미 권역이 지정된 행은 건드리지 않는다(재실행 안전).
with mapping(location_name, region_name) as (
  values
    ('서울', '수도권'), ('인천', '수도권'), ('경기', '수도권'),
    ('강원', '강원'),
    ('대전', '충청'), ('세종', '충청'), ('충북', '충청'), ('충남', '충청'),
    ('광주', '호남'), ('전북', '호남'), ('전남', '호남'),
    ('대구', '대경'), ('경북', '대경'),
    ('부산', '동남'), ('울산', '동남'), ('경남', '동남'),
    ('제주', '제주'),
    ('해외', '해외')
)
update public.location_tags lt
   set region_tag_id = lrt.id
  from mapping m
  join public.location_region_tags lrt
    on lrt.name = m.region_name and lrt.deleted_at is null
 where lt.name = m.location_name
   and lt.region_tag_id is null;
