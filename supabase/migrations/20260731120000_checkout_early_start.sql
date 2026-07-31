-- =====================================================================
-- [OFFICE] 반출대장 — 조기 반출은 실제 나간 시각을 적고, 반납은 언제든 받는다
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
-- 선행: 20260730250000(전이 트리거 최신판 — 자동 반출 시작 분기 포함)
--
-- 예약을 잡아 둔 사람이 물건이 일찍 돌아오자 약속한 시각 전에 '반출'을 눌렀다. 상태는
-- 반출 중이 됐지만 `checkout_at`은 여전히 내일 10:31을 가리켰다 — 원장이 "내일 나갈 물건이
-- 지금 나가 있다"고 적은 것이다. 그리고 그날 저녁 반납하려 하자 막혔다:
-- `asset_checkouts_returned_after`(returned_at >= checkout_at)에 걸린 것이다.
--
-- 막은 제약이 잘못된 것이 아니다. 돌아온 시각이 나간 시각보다 앞설 수는 없다. 잘못은 그
-- 앞에 있다 — **일찍 가져갔는데 원장이 예정 시각을 그대로 두었다.** 예약은 약속이고
-- `checkout_at`은 사실이어야 하는데, 둘을 한 칸에 담아 두고 약속 쪽을 남긴 것이다.
--
-- 두 자리를 고친다.
--
--   (1) 조기 반출: 예약을 반출 중으로 옮길 때 약속한 시각이 아직 오지 않았다면 그 시각을
--       지금으로 당긴다. 원장이 적는 것은 "언제 나가기로 했나"가 아니라 "언제 나갔나"다.
--       기간이 앞으로 늘어나므로 재고 판정을 다시 받는다 — 그 사이를 다른 사람이 잡고
--       있었다면 애초에 가져갈 수 없었던 것이므로, 거기서 막히는 것이 맞다.
--
--   (2) 반납은 언제든: 그럼에도 돌아온 시각이 나간 시각보다 앞선 행이 들어오면(위 보정이
--       없던 시절에 만들어진 건), 나간 시각을 돌아온 시각까지 당겨 스스로 맞춘다.
--       돌아온 물건이 그보다 늦게 나갔을 수는 없기 때문이다. 반납을 막아 세우고 사람에게
--       고치라고 하는 대신, 확실히 아는 사실(돌아왔다) 쪽에 원장을 맞춘다.
--
-- 소유 워크스페이스: office / 데이터 등급: Internal
-- 접근 주체: 내부 임직원 / Scope: global / 감사 로그: 미대상
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   - 새 테이블·뷰·RLS 정책·RPC·Storage 정책 없음. 기존 전이 트리거 함수의 본문만 바꾼다.
--   - SECURITY DEFINER 유지 + `set search_path = app, public` 고정.
--   - 권한 판정 분기(본인·자산 담당자·관리자)는 20260730250000판을 그대로 옮겨 왔다.
--     이번 변경은 그 판정을 통과한 뒤의 값 보정이며, 누가 무엇을 할 수 있는지는 달라지지 않는다.
--   - 보정 대상은 전이 중인 자기 행의 시각 두 컬럼뿐이고, 값은 now()와 returned_at에서만
--     나온다(호출자가 고른 값이 아니다).
-- =====================================================================

create or replace function app.validate_asset_checkout_transition()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_me      uuid    := app.current_app_user_id();
  v_manager boolean := app.is_admin() or app.can_write_workspace('management');
  v_owner   boolean := (OLD.created_by = app.current_app_user_id());
begin
  -- 대상 자산을 바꿔치기할 수 있으면 승인받은 물건과 실제로 나간 물건이 달라질 수 있고,
  -- 그 순간 대장 전체가 거짓이 된다.
  if NEW.asset_id is distinct from OLD.asset_id then
    raise exception '반출 건의 대상 자산은 변경할 수 없습니다.';
  end if;
  if NEW.created_by is distinct from OLD.created_by then
    raise exception '반출자는 변경할 수 없습니다.';
  end if;
  -- 스냅샷은 등록 시점의 사실이므로 이후에 고치지 않는다.
  NEW.asset_name      := OLD.asset_name;
  NEW.asset_item_type := OLD.asset_item_type;
  NEW.asset_serial_no := OLD.asset_serial_no;
  NEW.branch_id       := OLD.branch_id;

  -- 비활성화(soft delete)는 상태 전이와 다른 축이다 — 잘못 등록된 행을 걷어내는 조치이며
  -- 관리자만 한다.
  if NEW.deleted_at is distinct from OLD.deleted_at then
    if not app.is_admin() then
      raise exception '반출 건 비활성화는 관리자만 할 수 있습니다.';
    end if;
    return NEW;
  end if;

  if OLD.status in ('RETURNED', 'REJECTED', 'CANCELLED') then
    raise exception '종결된 반출 건은 수정할 수 없습니다.';
  end if;

  -- 자동 반출 시작(app.start_due_checkouts) — 예약 시각이 지난 건만, 상태 외에는 아무것도
  -- 바꾸지 않은 채로 통과한다.
  if coalesce(current_setting('app.checkout_auto_start', true), '') = 'on'
     and OLD.status = 'RESERVED'
     and NEW.status = 'OUT'
     and NEW.checkout_at <= now()
     and NEW.checkout_at is not distinct from OLD.checkout_at
     and NEW.due_at    is not distinct from OLD.due_at
     and NEW.quantity  is not distinct from OLD.quantity then
    return NEW;
  end if;

  if not (v_owner or v_manager) then
    raise exception '이 반출 건을 수정할 권한이 없습니다.';
  end if;

  -- 상태가 그대로면 값 수정이다(기간·목적·행선지·비고).
  if NEW.status = OLD.status then
    if OLD.status = 'OUT' and NEW.checkout_at is distinct from OLD.checkout_at then
      raise exception '이미 반출된 건의 반출 일시는 변경할 수 없습니다.';
    end if;
    return NEW;
  end if;

  -- 상태 전이. 아래에 없는 전이는 모두 거부한다.
  if OLD.status = 'PENDING' and NEW.status in ('RESERVED', 'REJECTED') then
    if not v_manager then
      raise exception '반출 승인·반려는 자산 담당자만 할 수 있습니다.';
    end if;
    NEW.decided_by := v_me;
    NEW.decided_at := now();

  elsif OLD.status in ('PENDING', 'RESERVED') and NEW.status = 'CANCELLED' then
    null;  -- 본인·관리자(위에서 이미 확인)

  elsif OLD.status = 'RESERVED' and NEW.status = 'OUT' then
    -- 조기 반출 — 약속한 시각이 아직 오지 않았는데 손에 쥐었다면, 원장이 적을 것은 예정이
    -- 아니라 사실이다. 여기서 당겨 두지 않으면 그 물건은 "내일 나갈 것이 지금 나가 있는"
    -- 상태로 남고, 오늘 반납하려는 순간 returned_at >= checkout_at 제약에 걸린다.
    --
    -- 기간이 앞으로 늘어나므로 재고 판정(app.check_asset_stock)을 다시 통과해야 한다.
    -- 그 사이를 다른 사람이 잡고 있었다면 애초에 지금 가져갈 수 없었던 것이다.
    if NEW.checkout_at > now() then
      NEW.checkout_at := now();
    end if;

  elsif OLD.status = 'OUT' and NEW.status = 'RETURNED' then
    -- 반납 시각은 화면이 지금을 채워 보내지만, 없으면 서버가 지금으로 본다.
    if NEW.returned_at is null then
      NEW.returned_at := now();
    end if;
    -- 반납은 언제든 받는다. 돌아온 시각이 나간 시각보다 앞선 행(위 보정이 없던 시절에
    -- 만들어진 건)은 나간 시각을 돌아온 시각까지 당겨 스스로 맞춘다 — 돌아온 물건이
    -- 그보다 늦게 나갔을 수는 없고, 확실히 아는 쪽은 돌아왔다는 사실이다.
    if NEW.returned_at < NEW.checkout_at then
      NEW.checkout_at := NEW.returned_at;
    end if;
    -- 기간 제약(due_at > checkout_at)은 그대로 지켜야 한다. 반납이 예정보다 뒤면 예정은
    -- 건드리지 않고, 예정까지 앞질러 당겨진 경우에만 최소 길이를 남긴다.
    if NEW.due_at <= NEW.checkout_at then
      NEW.due_at := NEW.checkout_at + interval '1 minute';
    end if;
    -- 반납 처리자는 클라이언트 값을 쓰지 않는다(대리 반납이 누구였는지가 기록의 핵심이다).
    NEW.returned_by := v_me;
    select u.name into NEW.returned_by_name from public.users u where u.id = v_me;

  else
    raise exception '허용되지 않은 상태 전이입니다(% → %).', OLD.status, NEW.status;
  end if;

  return NEW;
end $$;

comment on constraint asset_checkouts_returned_after on public.asset_checkouts is
  '돌아온 시각은 나간 시각보다 앞설 수 없다. 어긋나는 값이 들어오면 막지 않고 전이 트리거(app.validate_asset_checkout_transition)가 checkout_at을 returned_at까지 당겨 맞춘다 — 반납은 언제든 받는다.';
