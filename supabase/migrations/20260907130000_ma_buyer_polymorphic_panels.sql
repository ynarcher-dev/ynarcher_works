-- =====================================================================
-- M&A BUYER 상세 우측 패널 4종을 연다 — 자료·관련 회의록·변동 이력·코멘트
--
-- 배경: 20260907120000은 원장만 세우고 다형 원장(기여 로그·피드백·회의록 링크)에는 손대지
--   않았다. 그때 미룬 이유는 "이 원장이 필요로 하는 것보다 넓은 변경"이라는 것이었는데,
--   패널 넷이 붙어야 한다는 요구가 확정되면서 그 판단이 뒤집혔다. 여기서 그 배선을 연다.
--
-- 관통하는 문제는 하나다 — 다형 키의 id가 무엇인가. 정책들은 지금까지
--   entity_key_workspace(key) in ('networks','startup') 으로 "워크스페이스 권한만 보면 되는
--   원장"을 골라냈다. 그런데 이 조건은 키가 아니라 워크스페이스를 보고 있어서, mna로
--   매핑되는 새 키가 들어오면 딜과 같은 취급을 받아 can_access_ws_program('mna', id)에
--   걸린다 — 바이어 id는 사업 id가 아니므로 언제나 거짓이고, 패널 넷이 전부 빈다.
--   워크스페이스로 물으면 답할 수 없는 물음이라 키로 묻는 판정(2절)을 따로 세운다.
--
-- 자료(attachments)는 여기서 손댈 것이 없다 — 그 정책은 내부 사용자면 통과이고 회의록·결재
--   두 키만 예외로 좁힌다(20260826130000). 새 키는 그 예외에 들지 않으므로 그대로 붙는다.
--
-- 키는 둘이다. 기여 로그의 entity_table은 표 이름(ma_buyers)이고 — 트리거 인자가 그
--   값이며 update_entity/deactivate_entity가 has_contribution_trigger로 표를 찾는다 —
--   자료·피드백·회의록 링크의 target_type은 단수 키(ma_buyer)다(startups/startup,
--   networks/network가 이미 같은 짝이다). 둘 다 mna로 매핑한다.
--
-- 보안 게이트(11_migration_security_gate.md) 점검:
--   - 소유 워크스페이스: mna / 데이터 등급: Internal / 접근 주체: 내부 사용자만.
--   - 넓어지는 접근은 없다. 새 키가 없던 자리에 새 키를 더할 뿐이고, 기존 키의 판정 경로는
--     2절에서 이름만 바뀐 채 같은 값을 낸다(networks·startup은 워크스페이스만 보고,
--     fund·사업 3종은 레코드 스코프까지 본다 — 전과 동일).
--   - 새 테이블·Storage 정책 없음. SECURITY DEFINER 함수는 재작성이며 search_path 고정과
--     authenticated 한정 grant를 유지한다. 감사 로그 대상 행위(다운로드·Export) 변화 없음.
--   - 게스트는 mna 권한이 없어 can_read/write_workspace('mna')에서 그대로 막힌다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 다형 키 → 소유 워크스페이스: ma_buyers / ma_buyer 추가
-- ---------------------------------------------------------------------
create or replace function app.entity_key_workspace(p_entity_key text)
returns text
language sql
immutable
set search_path = app, public
as $fn$
  select case p_entity_key
           when 'program'         then 'ac'
           when 'ma_program'      then 'mna'
           when 'project_program' then 'project'
           when 'fund'            then 'fund'
           when 'startups'        then 'startup'
           when 'startup'         then 'startup'
           when 'ma_buyers'       then 'mna'
           when 'ma_buyer'        then 'mna'
           else 'networks'
         end;
$fn$;

comment on function app.entity_key_workspace(text) is
  '다형 키(entity_table/target_type) → 소유 워크스페이스 키. 한 워크스페이스가 성격이 다른 원장 둘을 가질 수 있으므로(mna: 딜 ma_program + 바이어 ma_buyer) 이 함수만으로는 판정이 끝나지 않는다 — id가 스코프인지 원장 행인지는 app.entity_key_workspace_scoped()가 답한다.';

-- ---------------------------------------------------------------------
-- (2) 이 키의 id는 스코프인가 원장 행인가
--
-- 사업·펀드는 id 자체가 접근 스코프라 워크스페이스 권한 위에 레코드 판정이 한 겹 더 붙는다.
-- 네트워크·스타트업·바이어는 그런 스코프가 없어 워크스페이스 권한 하나로 끝난다.
--
-- 이 사실을 워크스페이스로 물으면 답이 나오지 않는다 — mna 하나에 두 성격이 함께 있기
-- 때문이다. 그래서 키로 묻고, 그 목록을 정책 네 곳에 흩지 않고 여기 하나에 둔다(흩어 두면
-- 원장을 하나 더할 때 한 곳을 빠뜨려도 아무것도 알려 주지 않는다 — 그때 그 원장의 패널은
-- 오류 없이 그냥 빈다).
-- ---------------------------------------------------------------------
create or replace function app.entity_key_workspace_scoped(p_entity_key text)
returns boolean
language sql
immutable
set search_path = app, public
as $fn$
  select p_entity_key in ('networks', 'network', 'startups', 'startup', 'ma_buyers', 'ma_buyer');
$fn$;

grant execute on function app.entity_key_workspace_scoped(text) to authenticated;

comment on function app.entity_key_workspace_scoped(text) is
  '이 다형 키의 id가 접근 스코프가 아니라 그냥 원장 행인가. 참이면 워크스페이스 권한 하나로 판정이 끝나고, 거짓이면 레코드 판정(can_access_ws_program/can_access_fund)이 한 겹 더 붙는다. 원장을 더할 때 여기 넣지 않으면 그 원장의 다형 패널은 오류 없이 조용히 빈다.';

-- ---------------------------------------------------------------------
-- (3) 기여 로그 정책 — 워크스페이스 나열을 키 판정으로 바꾼다(값은 동일)
-- ---------------------------------------------------------------------
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select
  using (
    case
      when app.entity_key_workspace_scoped(entity_table)
        then app.can_read_workspace(app.entity_key_workspace(entity_table))
      when app.entity_key_workspace(entity_table) = 'fund'
        then app.can_read_workspace('fund') and app.can_access_fund(entity_id)
      else
        app.can_read_workspace(app.entity_key_workspace(entity_table))
        and app.can_access_ws_program(app.entity_key_workspace(entity_table), entity_id)
    end
  );

drop policy if exists entity_contributions_insert on public.entity_contributions;
create policy entity_contributions_insert on public.entity_contributions for insert
  with check (
    (
      case
        when app.entity_key_workspace_scoped(entity_table)
          then app.can_write_workspace(app.entity_key_workspace(entity_table))
        when app.entity_key_workspace(entity_table) = 'fund'
          then app.can_write_workspace('fund') and app.can_access_fund(entity_id)
        else
          app.can_write_workspace(app.entity_key_workspace(entity_table))
          and app.can_access_ws_program(app.entity_key_workspace(entity_table), entity_id)
      end
    )
    and (user_id is null or user_id = app.current_app_user_id())
  );

-- ---------------------------------------------------------------------
-- (4) 피드백(코멘트) 정책 — 같은 교체. 문서 열람으로 갈리는 세 키는 그대로 앞에 둔다.
-- ---------------------------------------------------------------------
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when target_type = 'approval'
        then app.can_read_approval(target_id)
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace_scoped(target_type)
        then app.can_read_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_read_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_read_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert
  with check (
    case
      when target_type = 'approval'
        then app.can_read_approval(target_id)
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace_scoped(target_type)
        then app.can_write_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_write_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

-- ---------------------------------------------------------------------
-- (5) 변동 이력 트리거 — 이력을 남기는 것은 화면이 아니라 원장이다
--
-- 트리거가 붙으면 app.has_contribution_trigger('ma_buyers')가 참이 되어 update_entity·
-- deactivate_entity RPC가 이 원장을 받는다(그 둘은 손으로 적은 허용 목록이 아니라 트리거
-- 존재를 카탈로그에서 확인한다). 그래서 수정·삭제 사유가 이력의 note로 남는다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_ma_buyers_contribution on public.ma_buyers;
create trigger trg_ma_buyers_contribution
  after insert or update on public.ma_buyers
  for each row execute function app.log_entity_contribution('ma_buyers');

-- ---------------------------------------------------------------------
-- (6) 회의록 연동 — 대상 종류에 ma_buyer 추가
--
-- 외부 참석자(EXTERNAL_ATTENDEE) 제약은 건드리지 않는다: 회의에 오는 것은 사람이고 사람은
-- 네트워크 원장에 있다. 바이어는 기업 원장이라 '이 회의가 다룬 대상'(SUBJECT)으로만 걸린다.
-- ---------------------------------------------------------------------
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_target_type_check;
alter table public.meeting_minute_links
  add constraint meeting_minute_links_target_type_check
  check (target_type in (
    'program', 'ma_program', 'project_program', 'startup', 'fund', 'network', 'ma_buyer'
  ));

comment on constraint meeting_minute_links_target_type_check on public.meeting_minute_links is
  '연동 대상 다형 키. 프론트 MINUTE_LINK_TARGET_TYPES(minuteLinks.ts)와 값이 정확히 일치해야 한다.';

create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'project_program' then
      app.can_read_workspace('project') and app.can_access_ws_program('project', p_target_id)
      and exists (select 1 from public.project_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.networks x
                   where x.id = p_target_id and x.deleted_at is null and x.merged_into_id is null)
    when 'ma_buyer' then
      app.can_read_workspace('mna')
      and exists (select 1 from public.ma_buyers x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$fn$;

revoke all on function app.can_link_entity_target(text, uuid) from public;
grant execute on function app.can_link_entity_target(text, uuid) to authenticated;

comment on function app.can_link_entity_target(text, uuid) is
  '요청자가 연동 대상 원장 행을 열람 가능한가(각 원장 SELECT 정책 재현 + 소프트삭제·병합·미존재 배제). 회의록 연동·결재 프로젝트 연동이 공유한다.';
