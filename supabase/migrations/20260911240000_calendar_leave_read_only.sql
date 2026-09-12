-- 전사 일정: 휴가는 보기만 한다 + 손으로 쌓인 휴가 행 정리 (2026-09-11 사용자 확정)
--
-- 휴가(`system_events.event_type = 'LEAVE'`)는 앞으로 **전자결재 승인이 자동으로 배정**한다.
-- 그래서 사람이 캘린더에서 만들거나 지울 수 있으면 같은 휴가가 두 경로로 갈려 어느 쪽이 사실인지
-- 판정할 근거가 없어진다 — 결재 없이 캘린더에만 선 휴가, 캘린더에서 지웠는데 결재에는 승인으로
-- 남은 휴가가 그것이다. 화면(`DayAgenda`)이 휴가 줄을 누르지 못하게 막지만 **UI에서 숨기는 것은
-- 보안이 아니므로** 정책이 함께 막는다(PostgREST로 직접 쏘면 화면 가드는 없는 것과 같다).
--
-- 막는 것은 쓰기뿐이고 **읽기는 그대로 연다**(`system_events_select` 미변경) — 캘린더에서 휴가가
-- 보여야 한다는 것이 이 결정의 전제다.
--
-- 앞으로 휴가를 만들 경로는 전자결재 쪽의 `SECURITY DEFINER` RPC 또는 `service_role`이다. 둘 다
-- RLS를 거치지 않으므로 이 정책이 그 길을 막지 않는다. 반대로 **지금은 휴가를 만들 수 있는 경로가
-- 하나도 없다** — 그것이 의도다(결재 연동 전까지 휴가는 원장에 새로 쌓이지 않는다).
--
-- 보안 게이트(11_migration_security_gate.md): 새 표·새 RPC·DEFINER 함수·Storage 없음. 기존 정책
-- 두 개를 **좁히기만** 한다. DELETE 정책은 만들지 않고 정리도 soft delete(`deleted_at`)라 되돌릴
-- 수 있다. 권한 판정은 기존 `app.can_write_workspace()` 헬퍼를 그대로 경유한다.
begin;

-- (1) 지금까지 캘린더에서 손으로 등록된 휴가를 정리한다.
--     물리 삭제하지 않는다 — 물리 삭제 예외 셋(모듈 인스턴스·게스트 명부 행·기안 단계 문서) 중
--     어디에도 해당하지 않고, 이 행들은 담당자가 만든 그릇이 아니라 '누가 언제 쉬었다'는 기록이다.
--     앱의 삭제 경로도 같은 soft delete라 화면에서 지운 것과 같은 상태가 된다.
update public.system_events
   set deleted_at = now()
 where event_type = 'LEAVE'
   and deleted_at is null;

-- (2) 화면발 휴가 생성을 막는다.
drop policy if exists system_events_insert on public.system_events;
create policy system_events_insert on public.system_events for insert
  with check (
    app.can_write_workspace(workspace_key::text)
    and created_by = app.current_app_user_id()
    and event_type <> 'LEAVE'
  );
comment on policy system_events_insert on public.system_events is
  '본인 소유 + 소유 워크스페이스 쓰기 권한. 휴가는 전자결재가 서버에서 만든다.';

-- (3) 휴가 행의 수정·삭제(soft delete)를 막는다.
--     USING이 휴가 행 자체를 잠그고, WITH CHECK가 업무 일정을 휴가로 바꿔 넣는 길을 함께 닫는다
--     (하나만 걸면 '수정은 못 하는데 새로 만들어 넣을 수는 있는' 구멍이 남는다).
drop policy if exists system_events_update on public.system_events;
create policy system_events_update on public.system_events for update
  using (
    app.can_write_workspace(workspace_key::text)
    and event_type <> 'LEAVE'
  )
  with check (
    app.can_write_workspace(workspace_key::text)
    and event_type <> 'LEAVE'
  );
comment on policy system_events_update on public.system_events is
  '소유 워크스페이스 쓰기 권한. 휴가 행은 읽기만 한다(전자결재 소유) — 수정·soft delete 모두 막는다.';

commit;
