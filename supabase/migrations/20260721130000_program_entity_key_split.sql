-- =====================================================================
-- 다형 키 분리 — AC·M&A·PROJECT 사업이 공유하던 'program' 값을 워크스페이스별로 나눈다
--
-- 배경
--   AC·M&A·PROJECT는 화면을 공유하되 원장은 물리적으로 분리되어 있다
--   (programs / ma_programs / project_programs). 그런데 상세 우측 패널이 쓰는 다형 키는
--   세 워크스페이스가 'program' 하나를 함께 써 왔다.
--
--   그 결과 entity_contributions·entity_feedback의 RLS가 'program'을 전부 AC로 판정한다
--   (20260715150000). M&A·PROJECT 사용자는 AC 권한이 없으면 자기 사업의 변동 이력과 코멘트를
--   보지 못하고, AC 권한자는 반대로 남의 워크스페이스 기록을 볼 수 있다. 값 하나가 세 개의
--   서로 다른 접근 경계를 덮고 있던 셈이다.
--
-- 결정
--   다형 키를 원장별로 분리한다 — 'program'(AC) / 'ma_program' / 'project_program'.
--   정책은 값만 보고 워크스페이스를 판정할 수 있게 되고, 단건 스코프는 이미 마련된
--   app.can_access_ws_program(ws_key, id)로 위임한다(AC 전용 can_access_program의 제네릭 버전).
--
--   대안(값은 두고 정책이 세 원장을 조회해 소속을 찾는 방식)은 백필이 없는 대신 행마다
--   최대 3회 조회를 물어야 해, 변동 이력을 볼 때마다 비용을 지불하는 구조가 된다.
--   백필은 한 번이므로 이쪽을 택한다.
--
-- 적용 범위
--   RLS가 워크스페이스로 갈리는 두 테이블만 나눈다 — entity_contributions, entity_feedback.
--   attachments는 정책이 워크스페이스 무관(내부 사용자 열람 + 본인 업로드)이라 키를 나눠도
--   접근 경계가 달라지지 않으므로 'program'을 그대로 둔다. 불필요한 백필로 기존 첨부를
--   화면에서 잃을 위험만 만들기 때문이다.
--
-- 소유 워크스페이스: ac / mna / project · 데이터 등급: Internal
-- 접근 주체: 내부 사용자(임직원) · Scope: 워크스페이스 + 단건 사업(program|project)
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260715150000_program_detail_panels.sql(현행 정책), 20260720130000_ws_program_scope_helper.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 백필 — 기존 행의 다형 키를 원장 소속에 따라 재기입
--     정책 교체 전에 수행한다. 순서가 뒤바뀌면 재기입 대상 행이 새 정책에 막혀 보이지 않는다.
--     (마이그레이션은 소유자 권한으로 실행되어 RLS를 우회하므로 실제 위험은 없으나,
--      의도를 명확히 하기 위해 백필을 앞에 둔다.)
-- ---------------------------------------------------------------------
update public.entity_contributions c
   set entity_table = 'ma_program'
 where c.entity_table = 'program'
   and exists (select 1 from public.ma_programs p where p.id = c.entity_id);

update public.entity_contributions c
   set entity_table = 'project_program'
 where c.entity_table = 'program'
   and exists (select 1 from public.project_programs p where p.id = c.entity_id);

update public.entity_feedback f
   set target_type = 'ma_program'
 where f.target_type = 'program'
   and exists (select 1 from public.ma_programs p where p.id = f.target_id);

update public.entity_feedback f
   set target_type = 'project_program'
 where f.target_type = 'program'
   and exists (select 1 from public.project_programs p where p.id = f.target_id);

-- ---------------------------------------------------------------------
-- (2) 판정 헬퍼 — 다형 키 → 워크스페이스 키
--     정책 세 곳에서 같은 CASE를 반복하지 않도록 한 곳에 모은다. 새 사업 워크스페이스가
--     생기면 여기만 고친다.
--     'program' 외의 값(networks 8종·global_networks·startups 등)은 networks로 떨어진다 —
--     종전 정책의 else 분기와 동일하다.
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
           else 'networks'
         end;
$$;

grant execute on function app.entity_key_workspace(text) to authenticated;

comment on function app.entity_key_workspace(text) is
  '다형 키(entity_table/target_type) → 소유 워크스페이스 키. 사업 3종은 각자 원장이 분리되어 있어 키도 분리한다.';

-- ---------------------------------------------------------------------
-- (3) entity_contributions 정책 재정의 (변동 이력)
--     append-only 유지 — update/delete 정책은 만들지 않는다.
--     INSERT의 본인 명의 조건은 20260721120000에서 도입한 것을 그대로 승계한다.
-- ---------------------------------------------------------------------
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select
  using (
    case
      when app.entity_key_workspace(entity_table) = 'networks'
        then app.can_read_workspace('networks')
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
        else
          app.can_write_workspace(app.entity_key_workspace(entity_table))
          and app.can_access_ws_program(app.entity_key_workspace(entity_table), entity_id)
      end
    )
    -- 본인 명의로만 기록할 수 있다. 실제 차단은 app.stamp_contribution_actor의 무조건 스탬프가
    -- 담당하고, 아래는 이중 방어다(평가 순서에 의존하지 않도록 null도 허용).
    and (user_id is null or user_id = app.current_app_user_id())
  );

-- ---------------------------------------------------------------------
-- (4) entity_feedback 정책 재정의 (코멘트)
--     update(작성자 본인·admin 소프트 삭제) 정책은 종전 유지 — 재정의하지 않는다.
-- ---------------------------------------------------------------------
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when app.entity_key_workspace(target_type) = 'networks'
        then app.can_read_workspace('networks')
      else
        app.can_read_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert
  with check (
    case
      when app.entity_key_workspace(target_type) = 'networks'
        then app.can_write_workspace('networks')
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );
