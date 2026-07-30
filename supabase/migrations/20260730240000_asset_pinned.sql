-- =====================================================================
-- [MANAGEMENT/OFFICE] 자산 '중요' 표시 — 목록 순서를 무시하고 최상단에 둔다
--
-- 기획: docs_planning/3_7_2_management_assets.md · 3_1_2_office_asset_checkout.md
--
-- 자산 목록은 자산명 순이다. 그 순서는 찾을 이름을 알 때에만 도움이 되고, "이 지사에서
-- 늘 먼저 보아야 하는 물건"(공용 빔프로젝터·법인 차량 키 등)은 이름 순의 어딘가에 묻힌다.
-- 게시판의 상단 고정과 같은 장치를 자산에 둔다 — 중요로 표시한 자산은 정렬을 건너뛰고
-- 맨 위에 서고, 목록의 번호 칸은 순번 대신 핀 표식을 받는다(순번이 뜻을 잃으므로).
--
-- 값은 자산의 속성이므로 화면마다 다르게 보일 이유가 없다. MANAGEMENT 자산 관리에서
-- 지정하고, OFFICE 반출대장도 같은 값으로 같은 자리에 세운다.
--
-- 새 테이블을 만들지 않는다 — public.assets는 management 워크스페이스 게이트로 RLS가
-- 이미 걸려 있고(assets_mgmt_select/_insert/_update, 20260705210000) 컬럼 확장은 그
-- 정책을 그대로 승계한다.
--
-- 소유 워크스페이스: management(자산 원장) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(반출 화면의 게이트는 뷰 본문의 app.is_internal_user())
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- 보안 게이트: 새 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
--   뷰 재생성은 기존과 동일하게 본문 게이트 + authenticated 한정 GRANT를 유지한다.
-- =====================================================================

-- 1) 컬럼 ---------------------------------------------------------------------
alter table public.assets
  add column if not exists is_pinned boolean not null default false;

comment on column public.assets.is_pinned is
  '중요 표시. 켜면 목록 정렬(자산명 순)을 무시하고 최상단에 서며 번호 칸에 핀 표식이 붙는다. 자산의 속성이라 MANAGEMENT 자산 관리와 OFFICE 반출대장이 같은 값을 쓴다.';

-- 2) 인덱스 ------------------------------------------------------------------
-- 목록의 기본 경로가 "지사 하나를 고정 먼저, 그 안에서 자산명 순"으로 바뀌었으므로
-- 정렬 세 축을 그대로 담은 인덱스를 둔다. 기존 (branch_id, name)은 검색·집계가 계속 쓴다.
create index if not exists idx_assets_branch_pinned_name
  on public.assets (branch_id, is_pinned desc, name);

-- 3) 반출 후보 뷰 -------------------------------------------------------------
-- 반출대장도 같은 순서로 세우려면 이 값이 뷰를 통과해야 한다. 금액·할당 대상은 여전히
-- 내보내지 않는다(빌리는 데 필요한 정보가 아니다).
drop view if exists public.portable_assets;

create view public.portable_assets as
  select
    a.id,
    a.name,
    a.item_type,
    a.serial_no,
    a.branch_id,
    a.requires_approval,
    a.note,
    a.photo_paths,
    a.quantity,
    a.manager_id,
    a.is_pinned
  from public.assets a
 where a.deleted_at is null
   and a.is_portable
   and a.status <> 'RETIRED'
   and app.is_internal_user();

revoke all on public.portable_assets from public;
grant select on public.portable_assets to authenticated;

comment on view public.portable_assets is
  'OFFICE 반출대장의 후보 자산(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고·보유 수량은 물건을 알아보고 몇 개 남았는지 세기 위해, manager_id는 그 물건을 맡은 사람을 표에 적기 위해, is_pinned는 중요 자산을 목록 맨 위에 세우기 위해 포함하고(이름 결합은 화면이 한다), 금액과 할당 대상은 내보내지 않는다.';
