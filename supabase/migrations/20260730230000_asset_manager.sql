-- =====================================================================
-- [Phase 12] 자산 관리자(manager_id) — 할당 대상과 다른 축이다
--
-- 기획: docs_planning/3_7_2_management_assets.md · 3_1_2_office_asset_checkout.md
--
-- 20260730220000에서 반출대장의 '관리자' 열을 할당 대상(assigned_to)으로 채웠으나 이는
-- 틀렸다. 할당 대상은 **이 물건을 쓰는 사람**이다 — 노트북을 지급받은 직원이 그 예이고,
-- status=ASSIGNED가 그 값을 필수로 요구한다. 반면 회의실 빔프로젝터처럼 여럿이 돌려 쓰는
-- 공용 비품은 누구에게도 지급되지 않아 할당 대상이 비어 있는 것이 정상이며, 그래서 정작
-- 반출 대상 물품에서만 관리자 칸이 늘 비게 된다.
--
-- 두 값은 다른 질문에 답한다: 지금 누가 쓰는가(assigned_to)와 이 물건을 누가 맡았는가
-- (manager_id). 폐기하면 할당은 비우지만 관리자는 남는다 — 맡은 사람은 물건을 정리하는
-- 순간까지가 아니라 정리한 뒤에도 그 물건을 설명할 수 있는 사람이다.
--
-- 새 테이블을 만들지 않는다. public.assets는 management 워크스페이스 게이트로 RLS가 이미
-- 걸려 있고(assets_mgmt_select/_insert/_update, 20260705210000) 컬럼 확장은 그 정책을
-- 그대로 승계한다.
--
-- 소유 워크스페이스: management(자산 원장) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(뷰 본문의 app.is_internal_user()가 반출 화면의 게이트)
-- Scope: global / 감사 로그: 미대상(개인정보 원본·다운로드·Export·권한 변경 없음)
-- =====================================================================

-- 1) 컬럼 ---------------------------------------------------------------------
-- on delete는 걸지 않는다 — 임직원은 물리 삭제하지 않고(soft delete) 퇴사자의 이름이
-- 남아 있어야 "이 물건은 누가 맡았었나"에 답할 수 있다.
alter table public.assets
  add column if not exists manager_id uuid references public.users(id);

comment on column public.assets.manager_id is
  '자산 관리자. 이 물건을 맡아 반출 요청·승인을 받는 사람이며, 물건을 지급받아 쓰는 사람(assigned_to)과는 다른 축이다. MANAGEMENT 자산 관리 폼에서 지정하고 OFFICE 반출대장이 표에 적는다.';

-- 관리자별 조회('내가 맡은 물건')는 아직 화면이 없어 인덱스를 만들지 않는다.
-- 지금 있는 경로는 지사 단위 목록뿐이며 (branch_id, name) 인덱스가 그것을 덮는다.

-- 2) 반출 후보 뷰 -------------------------------------------------------------
-- assigned_to를 도로 내린다. 반출 화면이 필요로 한 값은 처음부터 관리자였고, 할당 대상은
-- '이 물건을 지금 쓰는 사람'이라 반출대장이 알아야 할 정보가 아니다(누가 갖고 나갔는지는
-- 반출 원장이 답한다). 금액과 함께 계속 막는다.
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
    a.manager_id
  from public.assets a
 where a.deleted_at is null
   and a.is_portable
   and a.status <> 'RETIRED'
   and app.is_internal_user();

revoke all on public.portable_assets from public;
grant select on public.portable_assets to authenticated;

comment on view public.portable_assets is
  'OFFICE 반출대장의 후보 자산(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고·보유 수량은 물건을 알아보고 몇 개 남았는지 세기 위해, manager_id는 그 물건을 맡은 사람을 표에 적기 위해 포함하고(이름 결합은 화면이 한다), 금액과 할당 대상은 내보내지 않는다.';
