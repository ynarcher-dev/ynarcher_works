-- =====================================================================
-- [MANAGEMENT/OFFICE] 자산 '보관 위치' — 지사 안에서 물건이 실제로 놓인 자리
--
-- 기획: docs_planning/3_7_2_management_assets.md · 3_1_2_office_asset_checkout.md
--
-- OFFICE 자산 현황이 답해야 할 질문은 "회사에 이런 물건이 있나, 있다면 어디 있나"다.
-- 지금까지 뒷 절반의 답은 지사(branch)뿐이었는데, 지사는 화면의 탭으로 이미 골라 놓은
-- 값이라 목록의 모든 카드가 같은 답을 되풀이했다 — 물건을 가지러 가는 사람에게는 답이
-- 아니다. 지사 아래의 자리(회의실·창고·서버랙)를 담을 칸을 원장에 둔다.
--
-- 자유입력으로 둔다. 자리 이름은 지사마다 다르고(같은 '3층 창고'가 지사마다 다른 방이다)
-- 원장으로 승격하면 지사×자리의 조합을 관리해야 하는데, 그 관리 비용을 치를 만큼 값의
-- 종류가 많지 않다. 품목(item_type)과 같은 판단이다.
--
-- 같은 마이그레이션에서 반출 후보 뷰의 serial_no를 걷어낸다. 시리얼 번호는 OFFICE 화면에
-- 노출하지 않기로 한 값인데(2026-09-02), 화면에서 지우고 뷰에 남겨 두면 "숨겼을 뿐 내려오는"
-- 상태가 된다 — 내보내지 않기로 한 값은 서버에서 내보내지 않는다.
--
-- 새 테이블을 만들지 않는다 — public.assets는 management 워크스페이스 게이트로 RLS가
-- 이미 걸려 있고(assets_mgmt_select/_insert/_update, 20260705210000) 컬럼 확장은 그
-- 정책을 그대로 승계한다.
--
-- 소유 워크스페이스: management(자산 원장) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(자산 현황의 게이트는 뷰 본문의 app.is_internal_user())
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- 보안 게이트: 새 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
--   뷰 재생성은 기존과 동일하게 본문 게이트 + authenticated 한정 GRANT를 유지하고,
--   내보내는 컬럼은 줄어들기만 한다(serial_no 제거).
-- =====================================================================

-- 1) 컬럼 ---------------------------------------------------------------------
alter table public.assets
  add column if not exists location text;

comment on column public.assets.location is
  '보관 위치 — 지사 안에서 물건이 놓인 자리(예: 3층 회의실, 지하 창고 A). 자유입력이며 지사(branch_id)의 하위 값이다. OFFICE 자산 현황이 카드와 상세에 그대로 적는다.';

-- 2) 반출 후보 뷰 -------------------------------------------------------------
-- 뷰는 필요한 만큼만 내려보낸다. 위치는 물건을 찾는 데 필요한 값이라 넣고, 시리얼 번호는
-- 화면에 적지 않기로 했으므로 뺀다(검색도 이제 이름·품목·위치·비고로 건다).
drop view if exists public.portable_assets;

create view public.portable_assets as
  select
    a.id,
    a.name,
    a.item_type,
    a.branch_id,
    a.location,
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
  'OFFICE 자산 현황의 공용 물품(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고·보유 수량은 물건을 알아보고 몇 개 남았는지 세기 위해, location은 지사 안에서 어디로 가면 되는지 답하기 위해, manager_id는 그 물건을 맡은 사람을 적기 위해, is_pinned는 중요 자산을 목록 맨 위에 세우기 위해 포함한다(이름 결합은 화면이 한다). 시리얼 번호·금액·할당 대상은 내보내지 않는다.';
