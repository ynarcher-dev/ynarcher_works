-- =====================================================================
-- [보안 안정화 P0-2] workspace_key enum 정합화 1/2: hub → office 개명 + startup 신설
-- 근거: docs/docs_dev/12_immediate_security_stabilization_tasks.md §3.2,
--       docs/docs_dev/2_auth_permissions_architecture.md §3.1(10키 정본),
--       docs/docs_master/CLAUDE.md(HUB의 전사 포털 역할은 OFFICE가 승계)
--
-- 결정 사항:
-- - `hub`는 사용자에게 더 이상 노출되지 않으므로 별도 키로 남기지 않고
--   enum RENAME VALUE로 `office`로 완전 대체한다. 기존 permission_templates /
--   workspace_permissions / system_events.workspace_key 데이터가 자동 이관된다.
-- - `startup`은 독립 프론트 라우트(/startup)와 별도 권한 제어가 필요하므로
--   독립 workspace key로 신설한다.
-- - 신설 enum 값은 같은 트랜잭션에서 사용할 수 없으므로(PG 제약),
--   이 값을 참조하는 시드/정책 갱신은 다음 마이그레이션(130100)에서 수행한다.
-- =====================================================================

alter type public.workspace_key rename value 'hub' to 'office';

alter type public.workspace_key add value if not exists 'startup' after 'office';
