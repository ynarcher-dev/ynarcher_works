-- =====================================================================
-- FUND 상세 우측 공용 패널(코멘트·변동이력·관련회의록)을 위한 다형 키 'fund' 확장
--
-- 배경
--   FUND 상세를 AC 상세와 동일한 우측 패널 구성으로 만든다(자료관리·코멘트·변동이력·관련회의록).
--   자료관리(attachments)는 정책이 워크스페이스 무관이라 target_type='fund'가 그대로 통과하지만,
--   코멘트(entity_feedback)·변동이력(entity_contributions)·관련회의록(meeting_minute_links)은
--   다형 키를 app.entity_key_workspace로 워크스페이스에 매핑해 판정한다. 'fund'는 지금 매핑이 없어
--   else 분기로 떨어져 networks 권한으로 잘못 게이팅되고(코멘트·이력), 회의록 링크는 CHECK가 거부한다.
--
-- 결정
--   1) app.entity_key_workspace에 'fund' → 'fund' 분기 추가.
--   2) entity_contributions·entity_feedback 정책에 fund 분기 추가 — 사업(program)이 아니므로
--      can_access_ws_program이 아니라 펀드 단건 스코프 헬퍼 app.can_access_fund(id)로 위임한다
--      (funds 원장 RLS와 동일 경계).
--   3) funds에 변동이력 트리거 부착 — 범용 app.log_entity_contribution('fund')를 그대로 재사용한다.
--      (funds는 지금까지 기여 기록 경로가 없었다.)
--   4) meeting_minute_links의 target_type CHECK·app.can_link_minute_target에 'fund' 추가 —
--      펀드를 회의록 연동 대상으로 허용(양방향 열람은 기존 can_read_minute가 그대로 처리).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: fund. 데이터 등급: Internal(코멘트·이력 본문). 개인정보 원본·파일 없음.
--   · 접근 주체: 내부 FUND 열람/쓰기 권한자 + 해당 펀드 접근권(app.can_access_fund).
--   · Scope: 워크스페이스(fund) + 단건 펀드. 회의록 링크는 소속 회의록 read scope(can_read_minute).
--   · 정책: entity_contributions/entity_feedback SELECT/INSERT 분리 유지, DELETE 정책 없음(soft/append-only).
--   · 신규 SECURITY DEFINER 없음 — 기존 헬퍼(app.can_access_fund, app.log_entity_contribution,
--     app.can_link_minute_target) 재사용/확장. 기존 program/networks/office 분기는 전부 보존.
--   · 변경은 전부 가산적('fund' 행이 아직 없음) — 기존 워크스페이스 접근 경계 불변.
-- 근거: 20260721130000_program_entity_key_split.sql(다형 키 RLS),
--       20260723235000_office_record_feedback.sql(현행 feedback 정책),
--       20260721150000_entity_contribution_trigger_startup_global.sql(범용 기록 트리거),
--       20260723220000_meeting_minute_links.sql(회의록 링크 CHECK·판정 헬퍼),
--       20260705170000_fund_schema.sql(can_access_fund 스코프)
-- =====================================================================

-- (1) 다형 키 → 워크스페이스 매핑에 fund 추가 -----------------------------
create or replace function app.entity_key_workspace(p_entity_key text)
returns text
language sql
immutable
set search_path = app, public
as $$
  select case p_entity_key
           when 'program'         then 'ac'
           when 'ma_program'      then 'mna'
           when 'project_program' then 'project'
           when 'fund'            then 'fund'
           else 'networks'
         end;
$$;

-- (2) entity_contributions 정책 — fund 분기 추가(그 외 분기 보존) ---------
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select
  using (
    case
      when app.entity_key_workspace(entity_table) = 'networks'
        then app.can_read_workspace('networks')
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
        when app.entity_key_workspace(entity_table) = 'networks'
          then app.can_write_workspace('networks')
        when app.entity_key_workspace(entity_table) = 'fund'
          then app.can_write_workspace('fund') and app.can_access_fund(entity_id)
        else
          app.can_write_workspace(app.entity_key_workspace(entity_table))
          and app.can_access_ws_program(app.entity_key_workspace(entity_table), entity_id)
      end
    )
    and (user_id is null or user_id = app.current_app_user_id())
  );

-- (3) entity_feedback 정책 — fund 분기 추가(board_post/office_minute/networks/사업 분기 보존) ----
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) = 'networks'
        then app.can_read_workspace('networks')
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
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) = 'networks'
        then app.can_write_workspace('networks')
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_write_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

-- (4) funds 변동이력 트리거 — 범용 기록 함수 재사용(entity_table='fund') -----
drop trigger if exists trg_funds_contribution on public.funds;
create trigger trg_funds_contribution
  after insert or update on public.funds
  for each row execute function app.log_entity_contribution('fund');

-- (5) 회의록 링크 대상에 fund 허용 --------------------------------------
alter table public.meeting_minute_links
  drop constraint if exists meeting_minute_links_target_type_check;
alter table public.meeting_minute_links
  add constraint meeting_minute_links_target_type_check
  check (target_type in ('program', 'ma_program', 'project_program', 'startup', 'fund'));

create or replace function app.can_link_minute_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
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
    when 'fund' then
      app.can_read_workspace('fund') and app.can_access_fund(p_target_id)
      and exists (select 1 from public.funds x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$$;

comment on function app.entity_key_workspace(text) is
  '다형 키(entity_table/target_type) → 소유 워크스페이스 키. 사업 3종·fund는 각자 원장이라 키를 분리한다.';
comment on trigger trg_funds_contribution on public.funds is
  'funds AFTER INSERT/UPDATE 변동이력 기록(entity_table=''fund''). 범용 app.log_entity_contribution 재사용.';
