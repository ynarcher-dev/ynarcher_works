-- =====================================================================
-- [Phase 12] 자산 원장 확장 — 취득부터 폐기까지 한 행에 담는다
--
-- 기획: docs_planning/3_7_2_management_assets.md
--
-- 지금까지 assets는 자산명·분류(자유입력)·상태·할당 대상·회수 예정일 다섯 값뿐이라
-- "어느 지사에 있는 물건인가", "언제 얼마에 들여왔는가"에 답할 수 없었다. 지사 귀속을
-- 필수로 두고 취득·폐기·금액·반출 가능 여부를 원장에 올린다.
--
-- 새 테이블을 만들지 않는다 — public.assets는 이미 management 워크스페이스 게이트로
-- RLS가 걸려 있고(assets_mgmt_select/_insert/_update, 20260705210000), 컬럼 확장은
-- 그 정책을 그대로 승계한다. DELETE 정책은 추가하지 않는다(soft delete 유지).
--
-- 소유 워크스페이스: management(경영 자원) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(외부 게스트 차단은 기존 워크스페이스 게이트가 담당)
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- =====================================================================

-- 1) 취득 형태 enum -----------------------------------------------------------
-- 화면에서 부르는 이름은 '분류'지만 컬럼은 그 값이 무엇을 가르는지(취득 형태)를 이름에 남긴다.
do $$
begin
  create type public.asset_acquisition as enum ('PURCHASE', 'LEASE', 'RENTAL', 'OTHER');
exception
  when duplicate_object then null;
end $$;

-- 2) 기존 컬럼 개칭: category → item_type -------------------------------------
-- 노트북·차량·라이선스·비품 같은 기존 값은 '품목'이었으므로 그 뜻을 이름에 옮긴다.
-- 이름을 재활용하면 뜻이 바뀐 컬럼이 남아 이후 조회가 어긋난다.
-- 양쪽 컬럼 존재 여부를 보고 판단해 재실행에도 안전하게 둔다.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'assets' and column_name = 'category'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'assets' and column_name = 'item_type'
  ) then
    alter table public.assets rename column category to item_type;
  end if;
end $$;

-- 3) 컬럼 추가 ---------------------------------------------------------------
alter table public.assets
  add column if not exists acquisition_type public.asset_acquisition not null default 'PURCHASE',
  add column if not exists branch_id        uuid references public.branches(id),
  add column if not exists acquired_on      date,
  add column if not exists disposed_on      date,
  add column if not exists amount           numeric(14, 2),
  add column if not exists is_portable      boolean not null default false;

comment on column public.assets.item_type is
  '품목(노트북·차량·라이선스·비품 등). 자유입력이며 태그 원장 승격은 후속 과제.';
comment on column public.assets.acquisition_type is
  '취득 형태(화면 라벨은 ''분류''). PURCHASE=구매, LEASE=리스, RENTAL=렌탈, OTHER=기타.';
comment on column public.assets.branch_id is
  '자산의 소재 지사(branches). 지사 탭이 곧 화면 구조라 필수 귀속이다.';
comment on column public.assets.disposed_on is
  '폐기일자. 값이 있으면 status는 RETIRED여야 한다(역방향은 강제하지 않는다).';
comment on column public.assets.amount is
  '취득가(원). 감가상각·재무 연동은 범위 밖이며 취득 원가 단일 값이다.';
comment on column public.assets.is_portable is
  '반출 가능 여부. 자산 원장이 기준값을 소유하고 OFFICE 반출대장이 소비한다.';

-- 4) 지사 백필 후 조건부 NOT NULL ---------------------------------------------
-- 귀속 없는 자산이 남으면 지사 탭 어디에도 뜨지 않아 사실상 유실된다. 다만 지사가 하나도
-- 없는 환경(신규 프로젝트·테스트 DB)에서 마이그레이션이 실패하지는 않아야 하므로,
-- 남은 NULL이 없을 때만 제약을 건다.
do $$
declare
  fallback_branch uuid;
  remaining int;
begin
  select id into fallback_branch
    from public.branches
   where deleted_at is null and is_active
   order by sort_order, name
   limit 1;

  if fallback_branch is not null then
    update public.assets set branch_id = fallback_branch where branch_id is null;
  end if;

  select count(*) into remaining from public.assets where branch_id is null;

  if remaining = 0 then
    alter table public.assets alter column branch_id set not null;
  else
    raise notice '[assets] branch_id NOT NULL 생략 — 귀속되지 않은 자산 %건(활성 지사 없음). 지사 등록 후 재실행하면 걸린다.', remaining;
  end if;
end $$;

-- 5) 기존 데이터 정합화 --------------------------------------------------------
-- 제약을 걸기 전에 어긋난 기존 행을 먼저 맞춘다 — 순서가 뒤바뀌면 ALTER 자체가 실패하고,
-- 그때 손으로 고치면 어떤 값을 왜 바꿨는지가 원장 밖에 남는다.
-- 할당 대상 없는 ASSIGNED는 실물 상태가 '가용'이다(사람이 지정되지 않은 할당은 없다).
update public.assets
   set status = 'AVAILABLE'
 where status = 'ASSIGNED' and assigned_to is null;

-- 폐기일자가 있으면 상태는 폐기다. 날짜가 이미 적혀 있다는 것이 폐기의 근거다.
update public.assets
   set status = 'RETIRED'
 where disposed_on is not null and status <> 'RETIRED';

-- 6) 제약 추가 ---------------------------------------------------------------
-- 값 규칙은 DB가 최종 판정한다. 화면 검증만 믿으면 임포터·RPC 등 다른 경로로 들어온 값이
-- 조용히 어긋난 채 남는다.
alter table public.assets drop constraint if exists assets_disposed_after_acquired_chk;
alter table public.assets add constraint assets_disposed_after_acquired_chk
  check (disposed_on is null or acquired_on is null or disposed_on >= acquired_on);

alter table public.assets drop constraint if exists assets_amount_nonneg_chk;
alter table public.assets add constraint assets_amount_nonneg_chk
  check (amount is null or amount >= 0);

-- 폐기일자 → 상태는 단방향 구속이다. 날짜를 모르는 과거 폐기 자산도 등록할 수 있어야 하므로
-- 그 역(RETIRED면 폐기일자 필수)은 강제하지 않는다.
alter table public.assets drop constraint if exists assets_disposed_requires_retired_chk;
alter table public.assets add constraint assets_disposed_requires_retired_chk
  check (disposed_on is null or status = 'RETIRED');

alter table public.assets drop constraint if exists assets_assigned_requires_target_chk;
alter table public.assets add constraint assets_assigned_requires_target_chk
  check (status <> 'ASSIGNED' or assigned_to is not null);

-- 7) 인덱스 ------------------------------------------------------------------
-- 지사 탭 조회(선택 지사의 자산을 자산명 순으로)가 기본 경로다.
create index if not exists idx_assets_branch_name on public.assets (branch_id, name);

-- 8) 트리거 ------------------------------------------------------------------
-- trg_assets_updated_at(app.set_updated_at)이 이미 걸려 있어 추가 작업이 없다.
