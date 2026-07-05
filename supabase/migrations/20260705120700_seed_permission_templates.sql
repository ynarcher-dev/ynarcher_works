-- =====================================================================
-- [Phase 2] 권한 템플릿 시드 (사용자 유형별 기본 권한 매트릭스)
-- 근거: docs/docs_dev/2_auth_permissions_architecture.md §5 (기본형 매트릭스)
-- - 표기 없는(none) 조합은 행을 생성하지 않는다(부재 = none).
-- - 멱등: (user_type, workspace_key) 충돌 시 값 갱신.
-- =====================================================================

insert into public.permission_templates (user_type, workspace_key, permission_level, scope_type) values
  -- 최고 관리자 (ADMIN 포함 전 영역 RW / global, GUEST 제외)
  ('super_admin','hub','write','global'),
  ('super_admin','networks','write','global'),
  ('super_admin','ac','write','global'),
  ('super_admin','fund','write','global'),
  ('super_admin','mna','write','global'),
  ('super_admin','project','write','global'),
  ('super_admin','management','write','global'),
  ('super_admin','admin','write','global'),

  -- 경영진 (ADMIN 제외 전 영역 R / global)
  ('executive','hub','read','global'),
  ('executive','networks','read','global'),
  ('executive','ac','read','global'),
  ('executive','fund','read','global'),
  ('executive','mna','read','global'),
  ('executive','project','read','global'),
  ('executive','management','read','global'),

  -- 경영지원
  ('management_support','hub','read','global'),
  ('management_support','networks','write','global'),
  ('management_support','ac','read','global'),
  ('management_support','fund','read','global'),
  ('management_support','project','write','department'),
  ('management_support','management','write','global'),

  -- 투자실 (FUND)
  ('fund_manager','hub','read','global'),
  ('fund_manager','networks','write','global'),
  ('fund_manager','ac','read','global'),
  ('fund_manager','fund','write','fund'),
  ('fund_manager','project','write','project'),
  ('fund_manager','management','read','global'),

  -- AC 사업부
  ('ac_business','hub','read','global'),
  ('ac_business','networks','write','global'),
  ('ac_business','ac','write','program'),
  ('ac_business','project','write','project'),
  ('ac_business','management','read','global'),

  -- M&A팀
  ('mna_manager','hub','read','global'),
  ('mna_manager','networks','write','global'),
  ('mna_manager','mna','write','global'),
  ('mna_manager','project','write','project'),

  -- 프로젝트팀
  ('project_manager','hub','read','global'),
  ('project_manager','networks','write','global'),
  ('project_manager','ac','read','global'),
  ('project_manager','project','write','project'),
  ('project_manager','management','read','global'),

  -- 외부 스타트업 / 전문가 / 임시 게스트 (GUEST 전용)
  ('external_startup','guest','write','company'),
  ('external_expert','guest','write','self'),
  ('temporary_guest','guest','read','temporary'),

  -- 읽기 전용 사용자 (ADMIN 제외 전 영역 R / global)
  ('read_only','hub','read','global'),
  ('read_only','networks','read','global'),
  ('read_only','ac','read','global'),
  ('read_only','fund','read','global'),
  ('read_only','mna','read','global'),
  ('read_only','project','read','global'),
  ('read_only','management','read','global')
on conflict (user_type, workspace_key)
  do update set permission_level = excluded.permission_level,
                scope_type       = excluded.scope_type;
