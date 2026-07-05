-- =====================================================================
-- [Phase 2] 공통 지원 테이블 (다형 공통 테이블 원칙)
-- - attachments: 전 도메인 공통 첨부(target_type/target_id 다형 구조)
-- - audit_logs: 권한 변경/민감 액션 감사 로그(수정·삭제 불가, 트리거 INSERT)
-- - access_logs: 다운로드/열람 사유 로그
-- - system_events: 전사 통합 캘린더/이벤트 피드(4개 레이어)
-- 근거: docs/docs_dev/7_database_design_guidelines.md §2.3, 3_..._rls_matrix §4.6
-- =====================================================================

-- 공통 첨부파일 ----------------------------------------------------------
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null,   -- 'STARTUP' | 'EXPERT' | 'PARTNER' | 'PROGRAM' | ...
  target_id    uuid not null,
  file_name    text not null,
  storage_path text not null,   -- S3 키(직접 접근 금지, Presigned URL 경유)
  content_type text,
  byte_size    bigint,
  uploaded_by  uuid references public.users(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_attachments_target on public.attachments (target_type, target_id);

-- 감사 로그(Append-only) --------------------------------------------------
create table if not exists public.audit_logs (
  id                uuid primary key default gen_random_uuid(),
  actor_user_id     uuid,
  target_user_id    uuid,
  action            text not null,   -- 'PERMISSION_CHANGE' | 'SENSITIVE_ACTION' | ...
  changed_workspace text,
  before_permission text,
  after_permission  text,
  before_data       jsonb,
  after_data        jsonb,
  reason            text,
  request_ip        inet,
  user_agent        text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_audit_logs_target on public.audit_logs (target_user_id, created_at desc);

-- 열람/다운로드 사유 로그 --------------------------------------------------
create table if not exists public.access_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid,
  resource_type text,
  resource_id   uuid,
  reason        text,
  request_ip    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_access_logs_user on public.access_logs (user_id, created_at desc);

-- 전사 통합 이벤트/캘린더 --------------------------------------------------
create table if not exists public.system_events (
  id            uuid primary key default gen_random_uuid(),
  event_type    text not null,               -- 캘린더 레이어: 'AC' | 'PROJECT' | 'FUND' | 'COMPANY'
  workspace_key public.workspace_key not null,
  title         text not null,
  body          text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  ref_type      text,
  ref_id        uuid,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_system_events_period on public.system_events (starts_at, ends_at);

drop trigger if exists trg_system_events_updated_at on public.system_events;
create trigger trg_system_events_updated_at before update on public.system_events
  for each row execute function app.set_updated_at();
