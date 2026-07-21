-- =====================================================================
-- NETWORKS 공동관리 확정 — 파괴적 작업 가드 해제 + 기여 로그 사칭 차단
--
-- 배경
--   NETWORKS 8종은 담당자 원장이 없는 '공동관리' 콘텐츠다. 그런데 비활성화·병합만은
--   `app.is_entity_contributor()`(기여 로그 기반)로 잠가 두었다. 이 판정에는 두 가지 결함이 있다.
--
--   (1) 우회 가능 — entity_contributions INSERT 정책이 워크스페이스 단위라, networks 쓰기
--       권한자는 아무 레코드에나 자기 기여를 한 줄 넣을 수 있다. 지우려는 레코드에 기여를
--       먼저 기록하면 그대로 통과한다. 실제로 앱의 이동·비활성화 경로가 그 순서로 동작해 왔다.
--       즉 이 가드는 통제가 아니라 방지턱이었다.
--   (2) 로그 유실 시 전면 개방 — 기여 기록이 0건이면 잠금을 피하려 공용 허용으로 폴백한다.
--       그런데 앱의 기여 기록은 insert 결과의 error를 확인하지 않아 조용히 실패할 수 있다.
--       기록이 실패한 레코드는 오히려 아무나 지울 수 있게 된다.
--
-- 결정
--   NETWORKS는 수정·비활성화·병합 모두 `networks` 쓰기 권한자 공용으로 확정한다.
--   담당자를 지정하는 콘텐츠(STARTUP 투자기업, PROGRAM 계열)는 각자의 담당자 원장으로
--   판정하며 이 마이그레이션의 영향을 받지 않는다.
--     - startups: startups_update 정책이 app.is_startup_manager()로 강제(20260714120000)
--     - programs 계열: app.can_access_program() / program_managers
--
--   안전장치는 유지된다 — 비활성화는 물리 삭제가 아닌 soft delete(deleted_at)이고,
--   사유 입력이 필수이며, 기여 로그에 'deactivated'로 남는다. 되돌리기와 추적이 모두 가능하다.
--
-- 기여 로그의 역할 재정의
--   기여 로그는 이제 권한 판정에 쓰이지 않는다. '누가 이 레코드에 관여했는가'를 보여주는
--   서술적 이력(변동 이력 패널·기여자 목록)으로만 쓴다.
--
-- 소유 워크스페이스: networks · 데이터 등급: Internal
-- 접근 주체: 내부 사용자(임직원) · Scope: global(워크스페이스 단위)
-- 근거: docs/docs_dev/11_migration_security_gate.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 파괴적 작업 가드 트리거 해제
--
--     테이블 이름을 나열하지 않고 카탈로그에서 이 함수에 걸린 트리거를 찾아 지운다.
--     원 마이그레이션(20260707160000)은 8종을 루프로 걸었지만, 이후 새 마스터가 추가될 때마다
--     각자 트리거를 따로 붙였다 — exp(20260707180000), global_networks(20260707220000).
--     이름을 하드코딩하면 그런 뒤늦은 추가분을 놓쳐 함수 DROP이 의존성 오류로 막힌다.
--     (실제로 처음 적용 시도에서 이 두 개가 걸려 롤백됐다.)
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select n2.nspname as sch, c.relname as tbl, t.tgname as trg
      from pg_trigger t
      join pg_class c      on c.oid  = t.tgrelid
      join pg_namespace n2 on n2.oid = c.relnamespace
      join pg_proc p       on p.oid  = t.tgfoid
      join pg_namespace n  on n.oid  = p.pronamespace
     where n.nspname = 'app'
       and p.proname = 'guard_network_destructive'
       and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on %I.%I;', r.trg, r.sch, r.tbl);
    raise notice '가드 트리거 해제: %.% (%)', r.sch, r.tbl, r.trg;
  end loop;
end $$;

drop function if exists app.guard_network_destructive();

-- 판정 헬퍼도 함께 제거한다. 남겨 두면 '기여자 = 권한자'라는 폐기된 모델이 코드에 남아
-- 다음 사람이 다시 끌어 쓴다. 호출처는 위 트리거가 유일했다(전수 확인).
drop function if exists app.is_entity_contributor(text, uuid);

-- ---------------------------------------------------------------------
-- (2) 기여 로그 사칭 차단
--     로그가 권한을 주지는 않게 되었지만, 여전히 '누가 했는가'의 기록이다.
--     지금 INSERT 정책은 user_id를 검사하지 않아 남의 이름으로 기록을 남길 수 있다.
--
--     실제 차단은 (3)의 무조건 스탬프가 담당하고, 아래 조건은 이중 방어다.
--     `user_id is null` 을 함께 허용하는 이유: BEFORE 트리거와 WITH CHECK의 평가 순서에
--     의존하지 않기 위해서다. 트리거가 먼저 돌면 스탬프된 본인 id가 검사되고, 정책이 먼저
--     평가되면 클라이언트가 보낸 null이 통과한 뒤 트리거가 본인 id로 덮어쓴다.
--     어느 순서든 '남의 명의로 기록된 행'은 만들어지지 않는다.
-- ---------------------------------------------------------------------
drop policy if exists entity_contributions_insert on public.entity_contributions;
create policy entity_contributions_insert on public.entity_contributions for insert
  with check (
    (
      case
        when entity_table = 'program'
          then app.can_write_workspace('ac') and app.can_access_program(entity_id)
        else app.can_write_workspace('networks')
      end
    )
    -- 본인 명의로만 기록할 수 있다(admin도 예외 없음 — 감사 기록의 무결성).
    and (user_id is null or user_id = app.current_app_user_id())
  );

-- ---------------------------------------------------------------------
-- (3) 기여자 스탬프를 신뢰 가능하게 고정
--     종전에는 클라이언트가 user_id를 명시하면 스탬프가 덮어쓰지 않아 그 값을 그대로 믿었다.
--     (2)의 정책만으로도 사칭은 막히지만, 스탬프 자체를 무조건으로 바꿔 두 겹으로 만든다.
-- ---------------------------------------------------------------------
create or replace function app.stamp_contribution_actor()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  -- 행위자는 언제나 현재 세션 사용자다(클라이언트가 보낸 값은 무시).
  NEW.user_id := app.current_app_user_id();
  -- 이름 비정규화: users RLS(본인/admin만 조회)에 막히지 않도록 여기서 채운다(SECURITY DEFINER).
  -- 표시 전용 스냅샷이며, 이후 개명은 소급하지 않는다(당시 표기 보존).
  NEW.user_name := null;
  if NEW.user_id is not null then
    select u.name into NEW.user_name from public.users u where u.id = NEW.user_id;
  end if;
  return NEW;
end $$;
