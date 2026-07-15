-- =====================================================================
-- [Phase 7] 프로그램 상세 우측 패널(자료·코멘트·변동이력) 재사용 배선
-- 배경: NETWORKS 상세 우측 3패널(자료 관리 attachments / 코멘트 entity_feedback /
--       변동 이력 entity_contributions)을 AC 프로그램 상세에서 재사용한다.
--   - attachments: 기존 RLS가 워크스페이스 무관(내부 사용자 열람 + 본인 업로드)이라 그대로 재사용 → 변경 없음.
--   - entity_feedback / entity_contributions: 기존 RLS가 networks 전용이라, 다형 target/entity가
--     'program'인 행에 한해 AC 워크스페이스 + program 스코프로 열람/기록을 허용하도록 확장한다.
--     (networks 대상 행의 판정은 종전과 100% 동일 — CASE로 target_type/entity_table 분기.)
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블/RPC/Storage/SECURITY DEFINER 없음. 기존 RLS 정책 재정의 + 데이터 백필뿐.
--   - 권한 판정은 app.can_read/write_workspace('ac'|'networks') + app.can_access_program() 헬퍼만 경유.
--   - 확장은 오직 target/entity='program' 분기에만 적용 → networks 대상은 권한 변화 없음(over-grant 없음).
--   - update/delete 정책은 종전 유지(feedback=작성자·admin, contributions=append-only). 물리 삭제 미허용.
--   - 개인정보 원본/다운로드/Export 영향 없음(Internal 등급 내부 협업 데이터).
-- 근거: 20260707240000_entity_feedback.sql, 20260707150000_networks_contributions.sql,
--       20260715130000_program_managers.sql(ac + can_access_program 패턴), 20260705120200_rls_helpers.sql
-- =====================================================================

-- (1) entity_feedback(코멘트): program 대상은 AC 스코프, 그 외(networks 8종)는 종전대로.
drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select
  using (
    case
      when target_type = 'program'
        then app.can_read_workspace('ac') and app.can_access_program(target_id)
      else app.can_read_workspace('networks')
    end
  );

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert
  with check (
    case
      when target_type = 'program'
        then app.can_write_workspace('ac') and app.can_access_program(target_id)
      else app.can_write_workspace('networks')
    end
  );
-- update(소프트 삭제/수정) 정책은 작성자 본인·admin 기준으로 종전 유지 → 재정의하지 않는다.

-- (2) entity_contributions(변동 이력): program 대상은 AC 스코프, 그 외는 종전대로.
--     insert/delete 정책만 존재(append-only) — select/insert 두 정책만 재정의한다.
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select
  using (
    case
      when entity_table = 'program'
        then app.can_read_workspace('ac') and app.can_access_program(entity_id)
      else app.can_read_workspace('networks')
    end
  );

drop policy if exists entity_contributions_insert on public.entity_contributions;
create policy entity_contributions_insert on public.entity_contributions for insert
  with check (
    case
      when entity_table = 'program'
        then app.can_write_workspace('ac') and app.can_access_program(entity_id)
      else app.can_write_workspace('networks')
    end
  );

-- (3) 백필: 기존 프로그램의 created_by를 최초 'created' 기여로 이관(중복 방지, networks 백필과 동일 패턴).
--     이후 등록/수정 기여는 앱(recordProgramContribution)이 기록한다.
insert into public.entity_contributions (entity_table, entity_id, user_id, user_name, action, source, created_at)
select 'program', p.id, p.created_by, u.name, 'created', 'manual', p.created_at
from public.programs p
left join public.users u on u.id = p.created_by
where p.created_by is not null
  and p.deleted_at is null
  and not exists (
    select 1 from public.entity_contributions c
    where c.entity_table = 'program' and c.entity_id = p.id
  );
