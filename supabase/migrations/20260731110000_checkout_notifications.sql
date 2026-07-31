-- =====================================================================
-- [OFFICE] 반출대장 — 승인 요청·결정 인앱 알림 팬아웃
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
-- 선행: 20260722120000(notifications 원장 + 멘션 팬아웃), 20260730230000(assets.manager_id)
--
-- 승인이 필요한 물품은 요청을 넣어도 승인권자가 대장을 열어 보기 전까지 아무도 모른다.
-- 신청자 쪽도 마찬가지여서, 승인이 났는지 반려됐는지 알려면 대장을 다시 열어야 한다.
-- 두 방향 모두 "가서 확인하기"에 기대고 있었고, 그래서 요청이 며칠씩 묵을 수 있었다.
--
-- 인앱 알림 원장(public.notifications)을 그대로 쓴다. 알림의 소유자는 화면이 아니라 DB
-- 트리거라는 규약도 그대로다 — 클라이언트는 notifications에 INSERT하지 않는다(정책이
-- with check(false)로 막고 있으며, 정의자 권한 트리거만 채운다).
--
-- 두 방향, 세 가지 유형:
--   * checkout_request   요청(PENDING 생성)      → 그 물건의 승인권자에게
--   * checkout_approved  승인(PENDING→RESERVED)  → 신청자에게
--   * checkout_rejected  반려(PENDING→REJECTED)  → 신청자에게
--
-- 승인/반려를 한 유형으로 묶지 않은 이유는 화면이 본문을 파싱해 결과를 알아내지 않게 하기
-- 위해서다. 유형이 곧 결과이면 목록은 문구만 고르면 된다.
--
-- 받는 사람(요청 알림):
--   물건에 관리자(assets.manager_id)가 지정돼 있으면 그 사람 하나. 비어 있으면 실제로
--   승인할 수 있는 사람 전원(MANAGEMENT 쓰기 권한자 + 최고 관리자)에게 보낸다 — 담당자
--   원장이 비면 공동관리라는 이 프로젝트의 판정 규칙과 같은 결이며, 승인 권한 판정
--   (app.validate_asset_checkout_transition)이 보는 대상과도 일치한다.
--   자기 자신에게는 보내지 않는다(관리자가 스스로 낸 요청).
--
-- 이동 대상은 반출 건이 아니라 그 물건이다(target_type='asset_checkout', target_id=asset_id).
-- 화면이 여는 것은 물품 모달이고, 그 안에 요청·이력·처리 버튼이 모두 있기 때문이다.
-- 반출 건 자체는 근거(ref_id)로만 남긴다.
--
-- 소유 워크스페이스: office(반출) / 알림은 수신자 개인 귀속(self scope)
-- 데이터 등급: Internal(물품명·기간·목적 미리보기 — 개인정보 원본 없음)
-- 접근 주체: 내부 임직원(수신자 본인만 자기 알림 조회) / Scope: self / 감사 로그: 미대상
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   - 새 테이블·뷰·Storage 정책 없음. notifications의 기존 RLS(SELECT 본인 / INSERT
--     with check(false) / UPDATE 본인)를 그대로 쓴다.
--   - SECURITY DEFINER 함수 1종 추가: `set search_path = app, public` 고정, 트리거 전용이라
--     GRANT EXECUTE를 따로 부여하지 않는다(=직접 호출 경로 없음).
--   - 별도 caller 권한검사를 두지 않는 근거: 이 트리거는 asset_checkouts의 INSERT/UPDATE
--     RLS와 전이 트리거를 이미 통과한 요청에만 붙는다. 즉 "요청을 넣을 수 있었던 사람"과
--     "승인할 수 있었던 사람"만 이 경로에 도달한다.
--   - 수신자를 호출자가 고를 수 없다. 대상은 자산의 manager_id 또는 권한 원장
--     (workspace_permissions)에서만 나오며, 인자를 받지 않는다.
--   - 알림 본문에는 목적·행선지 등 Internal 값만 담고 개인정보 원본은 담지 않는다.
-- =====================================================================

-- 1) 팬아웃 트리거 함수 --------------------------------------------------------
create or replace function app.fanout_checkout_notifications()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_manager  uuid;
  v_period   text;
  v_actor    uuid;
  v_actor_nm text;
begin
  -- 표시용 기간. 분까지만 적는다(대장의 표기 규칙과 같다 — 초는 아무 것도 가르지 않는다).
  v_period := to_char(NEW.checkout_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
           || ' ~ '
           || to_char(NEW.due_at      at time zone 'Asia/Seoul', 'MM-DD HH24:MI');

  -- ── 요청(PENDING 생성) → 승인권자에게 ──────────────────────────────────
  if TG_OP = 'INSERT' and NEW.status = 'PENDING' then
    select a.manager_id into v_manager
      from public.assets a
     where a.id = NEW.asset_id and a.deleted_at is null;

    insert into public.notifications
      (recipient_id, actor_id, actor_name, type,
       target_type, target_id, ref_type, ref_id, body_preview)
    select distinct u.id,
           NEW.created_by,
           NEW.created_by_name,
           'checkout_request',
           'asset_checkout',
           NEW.asset_id,
           'asset_checkouts',
           NEW.id,
           left(NEW.asset_name || ' · ' || NEW.quantity || '개 · ' || v_period
                || ' · ' || NEW.purpose, 120)
      from public.users u
     where u.deleted_at is null
       and u.id is distinct from NEW.created_by   -- 자기 요청을 자기에게 알리지 않는다
       and (
         -- 관리자가 지정된 물건은 그 사람에게만.
         (v_manager is not null and u.id = v_manager)
         -- 비어 있으면 실제로 승인할 수 있는 사람 전원(공동관리).
         or (v_manager is null and (
              u.user_type::text = 'super_admin'
              or exists (
                select 1
                  from public.workspace_permissions p
                 where p.user_id = u.id
                   and p.workspace_key::text = 'management'
                   and p.permission_level = 'write'
                   and (p.expires_at is null or p.expires_at > now())
              )
            ))
       );

    return NEW;
  end if;

  -- ── 결정(승인·반려) → 신청자에게 ──────────────────────────────────────
  if TG_OP = 'UPDATE'
     and OLD.status = 'PENDING'
     and NEW.status in ('RESERVED', 'REJECTED') then
    -- 결정자는 전이 트리거가 decided_by에 이미 찍어 두었다(클라이언트 값이 아니다).
    v_actor := coalesce(NEW.decided_by, app.current_app_user_id());
    select u.name into v_actor_nm from public.users u where u.id = v_actor;

    insert into public.notifications
      (recipient_id, actor_id, actor_name, type,
       target_type, target_id, ref_type, ref_id, body_preview)
    select NEW.created_by,
           v_actor,
           v_actor_nm,
           case when NEW.status = 'RESERVED' then 'checkout_approved' else 'checkout_rejected' end,
           'asset_checkout',
           NEW.asset_id,
           'asset_checkouts',
           NEW.id,
           left(NEW.asset_name || ' · ' || NEW.quantity || '개 · ' || v_period
                || coalesce(' · ' || nullif(btrim(NEW.decision_note), ''), ''), 120)
     where exists (
       select 1 from public.users u
        where u.id = NEW.created_by and u.deleted_at is null
     );

    return NEW;
  end if;

  return NEW;
end $$;

-- AFTER로 다는 이유: 상태와 결정자(decided_by)를 확정하는 것은 BEFORE 전이 트리거이고,
-- 재고 판정(zstock)도 BEFORE에서 돈다. 그 둘이 통과해 행이 실제로 남은 뒤에만 알려야
-- "실패한 요청의 알림"이 생기지 않는다.
drop trigger if exists trg_asset_checkouts_notify on public.asset_checkouts;
create trigger trg_asset_checkouts_notify
  after insert or update on public.asset_checkouts
  for each row execute function app.fanout_checkout_notifications();

comment on function app.fanout_checkout_notifications() is
  'OFFICE 반출대장 인앱 알림 팬아웃. 승인 요청(PENDING 생성)은 자산 관리자(manager_id, 없으면 MANAGEMENT 쓰기 권한자+최고 관리자)에게, 승인·반려 결정은 신청자에게 보낸다. 이동 대상은 물품(target_type=asset_checkout, target_id=asset_id)이며 반출 건은 ref_id로만 남는다.';
