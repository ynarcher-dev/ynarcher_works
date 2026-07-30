-- =====================================================================
-- [Phase 12] 반출 후보 뷰에 비품 관리자(할당 대상)를 싣는다
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
--
-- 반출대장 표에서 "이 물건은 누구에게 물어봐야 하나"에 답할 자리가 없었다. 그 답은 이미
-- 자산 원장에 있다 — MANAGEMENT 자산관리의 할당 대상(assigned_to)이 곧 그 비품을 관리하는
-- 사람이다. 없는 개념을 새로 만들지 않고 원장의 그 값을 뷰로 내보낸다.
--
-- 20260730210000에서는 '금액·할당 대상은 내보내지 않는다'고 두었으나, 반출 요청·승인의
-- 상대가 누구인지 모르는 채로 표를 읽게 하는 편이 더 나쁘다. 내보내는 것은 사용자 id 하나이며
-- 이름은 화면이 임직원 디렉토리(public.users, 내부 사용자 전원 조회 가능)에서 붙인다 —
-- 뷰가 users를 조인하면 이 뷰 하나가 인사 원장의 노출 경계를 겸하게 된다. 금액은 그대로 막는다.
--
-- 소유 워크스페이스: management(자산 원장) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(뷰 본문의 app.is_internal_user()가 그대로 게이트)
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- =====================================================================

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
    a.assigned_to
  from public.assets a
 where a.deleted_at is null
   and a.is_portable
   and a.status <> 'RETIRED'
   and app.is_internal_user();

revoke all on public.portable_assets from public;
grant select on public.portable_assets to authenticated;

comment on view public.portable_assets is
  'OFFICE 반출대장의 후보 자산(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고·보유 수량은 물건을 알아보고 몇 개 남았는지 세기 위해, assigned_to는 그 비품의 관리자를 표에 적기 위해 포함하고(이름 결합은 화면이 한다), 금액은 내보내지 않는다.';
