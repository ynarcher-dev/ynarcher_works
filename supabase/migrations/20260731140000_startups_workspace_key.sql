-- =====================================================================
-- STARTUP 워크스페이스 키 이전 — 스타트업 원장의 권한 판정을 networks → startup 으로
--
-- 배경
--   `startup` 워크스페이스 키는 20260716130000 에서 신설되고 20260716130100 이 권한 템플릿·
--   실권한까지 배포했다. 그런데 정작 `startups` 원장의 RLS 는 20260705120400(당시 스타트업은
--   NETWORKS 마스터의 한 종류였다) 시절의 `networks` 키를 그대로 쓰고 있었다. 그래서
--     · ADMIN 권한 콘솔의 STARTUP 스위치를 켜도 실제 쓰기는 되지 않고,
--     · NETWORKS 쓰기만 가진 사람이 STARTUP 화면의 데이터를 고칠 수 있었다.
--   권한 콘솔의 스위치와 실제 동작이 어긋난 상태이므로, 이전을 마저 끝낸다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: startup (스타트업 원장·담당자·다형 부속 레코드)
--   · 데이터 등급: Internal (개인정보 원본 컬럼은 기존 민감정보 정책이 별도 관리)
--   · 접근 주체: 내부 사용자만. 외부 게스트는 startup 권한이 없어 접근 불가(종전과 동일)
--   · Scope: global (워크스페이스 단위. 투자기업만 행단위 담당자 잠금이 추가로 걸린다)
--   · 감사 로그: 권한 경계 변경이나 데이터 조작이 아니므로 신규 적재 경로 없음.
--     레코드 변동 이력(entity_contributions)은 기존 트리거가 그대로 남긴다
--   · 운영 영향: 기본 템플릿 기준 management_support · mna_manager · project_manager 는
--     networks=write / startup=read 이므로 **스타트업 쓰기 권한을 잃는다**. 유지하려면
--     ADMIN 권한 콘솔에서 해당 역할의 STARTUP 을 write 로 올린다(이 마이그레이션은
--     권한 값을 건드리지 않는다 — 권한 상향은 콘솔의 결정 영역이다)
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블 없음. 기존 정책의 워크스페이스 키만 교체(SELECT/INSERT/UPDATE 분리 유지)
--   · DELETE 정책 신설 없음(soft delete 유지)
--   · 판정은 app.can_read_workspace()/can_write_workspace()/is_startup_manager() 헬퍼 경유
--   · UPDATE 정책의 WITH CHECK 를 USING 과 동일하게 유지(투자 승격 우회 차단 규칙 보존)
--   · SECURITY DEFINER 헬퍼는 search_path 고정 유지(정의 본문 변경만)
--   · 개인정보 원본·다운로드·Export 경로 변경 없음
--
-- 근거: 20260716130000/130100(startup 키 신설·배포), 20260705120500(startups 기본 정책),
--       20260714120000(startups UPDATE·startup_managers), 20260724120000(다형 정책·키 매핑),
--       docs/docs_master/CLAUDE.md(업무 화면은 STARTUP, 물리 원장만 NETWORKS 스키마에 유지)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 다형 키 → 워크스페이스 매핑에 스타트업 분기 추가
--     entity_contributions.entity_table 은 'startups'(원장 트리거 인자),
--     entity_feedback.target_type / meeting_minute_links.target_type 은 'startup' 을 쓴다.
--     둘 다 같은 원장을 가리키므로 나란히 매핑한다.
-- ---------------------------------------------------------------------
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
           when 'startups'        then 'startup'
           when 'startup'         then 'startup'
           else 'networks'
         end;
$$;

comment on function app.entity_key_workspace(text) is
  '다형 키(entity_table/target_type) → 소유 워크스페이스 키. 사업 3종·fund·startup 은 각자 원장이라 키를 분리하고, 나머지 네트워크 원장만 networks 로 남는다.';

-- ---------------------------------------------------------------------
-- (2) entity_contributions — 워크스페이스 단위로 판정하는 분기에 startup 포함
--     networks 와 startup 은 사업·펀드와 달리 레코드 단위 스코프가 없어 워크스페이스 권한만 본다.
-- ---------------------------------------------------------------------
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select
  using (
    case
      when app.entity_key_workspace(entity_table) in ('networks', 'startup')
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
        when app.entity_key_workspace(entity_table) in ('networks', 'startup')
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
-- (3) entity_feedback — 동일 규칙(게시글·회의록 분기는 보존)
-- ---------------------------------------------------------------------
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) in ('networks', 'startup')
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
      when target_type = 'board_post'
        then app.can_read_board_post(target_id)
      when target_type = 'office_minute'
        then app.can_read_minute(target_id)
      when app.entity_key_workspace(target_type) in ('networks', 'startup')
        then app.can_write_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_write_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

-- ---------------------------------------------------------------------
-- (4) startups 원장 정책 — networks → startup
--     UPDATE 의 투자기업 잠금(관리자 또는 지정 담당자)은 20260714120000 규칙 그대로 유지한다.
-- ---------------------------------------------------------------------
drop policy if exists startups_select on public.startups;
create policy startups_select on public.startups for select
  using (app.can_read_workspace('startup'));

drop policy if exists startups_insert on public.startups;
create policy startups_insert on public.startups for insert
  with check (app.can_write_workspace('startup'));

drop policy if exists startups_update on public.startups;
create policy startups_update on public.startups for update
  using (
    app.can_write_workspace('startup')
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.is_startup_manager(id, app.current_app_user_id())
    )
  )
  with check (
    app.can_write_workspace('startup')
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.is_startup_manager(id, app.current_app_user_id())
    )
  );

-- ---------------------------------------------------------------------
-- (5) startup_managers 열람 — startup 읽기 권한자
--     변경(INSERT/UPDATE/DELETE) 정책은 관리자·기존 담당자 기준이라 워크스페이스 키와 무관하다.
-- ---------------------------------------------------------------------
drop policy if exists startup_managers_select on public.startup_managers;
create policy startup_managers_select on public.startup_managers for select
  using (app.can_read_workspace('startup'));

-- ---------------------------------------------------------------------
-- (6) 회의록 링크 대상 판정 — startup 분기를 startup 읽기 권한으로
-- ---------------------------------------------------------------------
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
      app.can_read_workspace('startup')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'fund' then
      app.can_read_workspace('fund') and app.can_access_fund(p_target_id)
      and exists (select 1 from public.funds x
                   where x.id = p_target_id and x.deleted_at is null)
    else false
  end;
$$;

-- ---------------------------------------------------------------------
-- (7) 스타트업 멘토링 피드백 집계 RPC — 게이트를 startup 읽기로
--     대상이 스타트업 한 곳이므로 소유 워크스페이스를 따른다(20260705160000 의 networks 게이트 교체).
-- ---------------------------------------------------------------------
create or replace function public.startup_growth_metrics(p_startup_id uuid)
returns table (
  technology          numeric,
  business_model      numeric,
  credibility         numeric,
  collaboration       numeric,
  matching_feasibility numeric,
  sample_count        bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    round(avg(score_technology)::numeric, 2),
    round(avg(score_business_model)::numeric, 2),
    round(avg(score_credibility)::numeric, 2),
    round(avg(score_collaboration)::numeric, 2),
    round(avg(score_matching_feasibility)::numeric, 2),
    count(*)
  from public.mentor_feedback_records
  where startup_id = p_startup_id
    and app.can_read_workspace('startup');
$$;
