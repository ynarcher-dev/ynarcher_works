-- =====================================================================
-- [MANAGEMENT/OFFICE] 자산의 '반출' 축을 'OFFICE 공개' 한 값으로 줄인다
--
-- 기획: docs_planning/3_7_2_management_assets.md · 3_1_2_office_asset_checkout.md
--
-- 2026-08-25에 OFFICE 반출대장(예약·승인·반출·반납)이 폐지됐는데 자산 원장에는 그 시절의
-- 값 둘이 그대로 남아 있었다.
--
--  1) requires_approval — 이 값을 읽는 화면이 하나도 없다. 승인을 판정할 자리가 사라졌으니
--     자산마다 켜고 끌 수 있는 유령값이고, 폼·표·일괄 설정까지 그 값을 위해 서 있었다.
--  2) is_portable — 이름은 반출을 가리키는데 실제로 하는 일은 하나다: 이 물건을 OFFICE
--     자산 현황(임직원 전원 조회)에 세울 것인가. 없어진 기능의 스위치로 읽힌 탓에 2026-08-26에
--     실제로 꺼져 OFFICE 목록이 통째로 비었다.
--
-- 그래서 화면에서는 requires_approval을 걷고 is_portable의 이름만 'OFFICE 자산 현황에 공개'로
-- 바로잡았다. 이 마이그레이션이 서버에서 하는 일은 그에 맞춰 **뷰가 내보내는 것을 줄이는 것**
-- 하나다 — requires_approval은 뷰에 실려 내려오지만 OFFICE 화면이 읽지 않는 값이라, 두면
-- "숨겼을 뿐 오는" 상태가 된다(2026-09-02에 serial_no를 걷어낸 것과 같은 규칙).
--
-- **컬럼은 지우지 않는다.** requires_approval을 드롭하면 보존해 둔 반출 원장
-- (public.asset_checkouts)의 자동 개시 트리거가 이 컬럼을 본문에서 읽고 있어 함께 죽는다.
-- 그 원장을 남긴 이유가 "반출 관리를 앱으로 되돌릴 필요가 생기면 화면만 다시 세우면 된다"인데,
-- 컬럼을 지우면 그 약속이 깨진다. 지금 그 값을 바꿀 화면이 없을 뿐 값과 원장은 그대로 잠든다.
-- 같은 이유로 is_portable도 개칭하지 않는다 — 이름을 바꾸면 뷰·트리거·통합검색이 함께 따라와야
-- 하고, 잠든 원장의 복원 경로가 다시 어긋난다. 이름의 어긋남은 컬럼 주석이 답한다.
--
-- 소유 워크스페이스: management(자산 원장) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(뷰 본문의 app.is_internal_user())
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- 보안 게이트: 새 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음. RLS 정책 변경 없음
--   (public.assets의 워크스페이스 게이트 그대로). 뷰는 기존과 동일한 본문 게이트와
--   authenticated 한정 GRANT를 유지하며 내보내는 컬럼은 줄어들기만 한다.
-- 멱등: drop view if exists + create view, comment만 — 재실행해도 같은 결과다.
-- =====================================================================

-- 1) 컬럼 주석 — 이름과 뜻이 어긋난 자리를 원장이 직접 말한다 -------------------
comment on column public.assets.is_portable is
  'OFFICE 자산 현황(public.portable_assets)에 이 물건을 공개할지. 이름은 반출대장 시절의 것이며(2026-08-25 폐지) 지금 이 값이 정하는 것은 반출 가능 여부가 아니라 임직원 전원에게 보일지 하나다. MANAGEMENT 자산 관리 폼의 ''OFFICE 자산 현황에 공개'' 스위치가 유일한 쓰기 경로다.';

comment on column public.assets.requires_approval is
  '[휴면] 반출 시 승인 필요 여부. 반출대장 폐지(2026-08-25) 이후 이 값을 읽는 화면이 없고 2026-09-06에 자산 관리 폼·표·일괄 설정에서도 걷어냈다. 컬럼을 남기는 것은 보존된 public.asset_checkouts의 자동 개시 트리거가 이 이름으로 읽기 때문이며, 반출 흐름을 되살리는 날 화면과 함께 다시 쓴다.';

-- 2) 공용 물품 뷰 — 화면이 읽지 않는 값은 내려보내지 않는다 --------------------
drop view if exists public.portable_assets;

create view public.portable_assets as
  select
    a.id,
    a.name,
    a.item_type,
    a.branch_id,
    a.location,
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
  'OFFICE 자산 현황의 공용 물품(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고·보유 수량은 물건을 알아보고 몇 개인지 세기 위해, location은 지사 안에서 어디로 가면 되는지 답하기 위해, manager_id는 그 물건을 맡은 사람을 적기 위해, is_pinned는 중요 자산을 목록 맨 위에 세우기 위해 포함한다(이름 결합은 화면이 한다). 시리얼 번호·금액·할당 대상은 내보내지 않으며, requires_approval은 2026-09-06에 걷어냈다(읽는 화면이 없다).';
