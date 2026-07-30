-- =====================================================================
-- [OFFICE] 반출대장 — 등록 트리거의 반납 컬럼 이름 정정
--
-- 20260730190000에서 returned_on → returned_at으로 바꾸면서 전이 트리거만 다시 만들고
-- 등록 트리거(app.stamp_validate_asset_checkout)를 빠뜨렸다. plpgsql은 함수 본문의
-- 필드 참조를 실행 시점에 확인하므로 마이그레이션은 통과했고, 실제 반출 등록에서만
-- `record "new" has no field "returned_on"`(42703)으로 터졌다.
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
-- 소유 워크스페이스: office / 데이터 등급: Internal / 감사 로그: 미대상
-- 보안 게이트: 새 테이블·RPC·Storage 정책 없음. SECURITY DEFINER 함수 재정의이며
--   search_path 고정과 권한 판정은 원본과 동일하다(직접 실행 권한 부여 없음 — 트리거 전용).
-- =====================================================================

create or replace function app.stamp_validate_asset_checkout()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  a public.assets%rowtype;
begin
  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  if NEW.created_by_name is null and NEW.created_by is not null then
    select u.name into NEW.created_by_name from public.users u where u.id = NEW.created_by;
  end if;

  select * into a from public.assets
   where id = NEW.asset_id and deleted_at is null;
  if not found then
    raise exception '존재하지 않는 자산입니다.';
  end if;
  if not a.is_portable then
    raise exception '반출 가능으로 설정되지 않은 자산입니다.';
  end if;
  if a.status = 'RETIRED' then
    raise exception '폐기된 자산은 반출할 수 없습니다.';
  end if;

  -- 표기는 등록 시점의 사실로 굳힌다(이후 자산명이 바뀌어도 대장은 그때 그 이름).
  NEW.asset_name      := a.name;
  NEW.asset_item_type := a.item_type;
  NEW.asset_serial_no := a.serial_no;
  NEW.branch_id       := a.branch_id;

  -- 초기 상태는 클라이언트가 정하지 않는다 — 화면에서 승인 단계를 감추는 것만으로는
  -- 승인을 건너뛰는 요청을 막을 수 없다.
  NEW.status := case when a.requires_approval then 'PENDING' else 'RESERVED' end
                ::public.asset_checkout_status;

  -- 처리 흔적은 등록 시점에 있을 수 없다.
  NEW.returned_at := null;
  NEW.returned_by := null;
  NEW.returned_by_name := null;
  NEW.decided_by := null;
  NEW.decided_at := null;

  return NEW;
end $$;
