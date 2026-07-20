-- =====================================================================
-- [Phase 9/11] 워크스페이스 제네릭 프로그램 스코프 헬퍼
-- 배경: app.can_access_program()은 워크스페이스 키 'ac'를 하드코딩하고 있어(20260705120200_rls_helpers.sql:159)
--   M&A/PROJECT 원장에는 재사용할 수 없다. 동일한 판정 로직을 워크스페이스 키로 파라미터화한다.
--
-- 판정 규칙(AC 원본과 동일):
--   - 관리자(super_admin)는 전면 허용
--   - 해당 워크스페이스 scope_type이 'global'이면 허용
--   - scope_type이 대상 단건 범위('program' | 'project')이고 scope_id가 일치하면 허용
--   그 외는 거부(default deny). 워크스페이스 열람/쓰기 권한 자체는 호출부의
--   app.can_read_workspace()/can_write_workspace()가 별도로 강제한다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - SECURITY DEFINER + search_path 고정(app, public). 기존 헬퍼(get_scope_type/get_scope_id)만 경유하며
--     auth.jwt()를 직접 파싱하지 않는다.
--   - 신규 테이블/Storage/개인정보 Export 없음. 기존 app.can_access_program()은 변경하지 않는다(AC 무영향).
--   - GRANT EXECUTE는 authenticated 한정.
-- 근거: 20260705120200_rls_helpers.sql:123-169, 20260705120000_init_schema_enums.sql:24-26(scope_type enum)
-- =====================================================================

create or replace function app.can_access_ws_program(ws_key text, target_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or app.get_scope_type(ws_key) = 'global'
      or (app.get_scope_type(ws_key) in ('program', 'project')
          and app.get_scope_id(ws_key) = target_program_id);
$$;

grant execute on function app.can_access_ws_program(text, uuid) to authenticated;

comment on function app.can_access_ws_program(text, uuid) is
  '워크스페이스 키로 파라미터화한 단건 사업 접근 판정. AC 전용 app.can_access_program()의 제네릭 버전(mna/project용).';
