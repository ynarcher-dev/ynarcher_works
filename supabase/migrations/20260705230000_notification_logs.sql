-- =====================================================================
-- [Phase 14] 알림 발송 로그
-- 알림톡/SMS/이메일 발송 이력(관측성/감사). 발송은 notifications-dispatch
-- Edge Function이 수행하며, 본 테이블은 결과 증적을 적재한다.
-- 근거: docs_planning 전자결재/캐피탈콜 알림 흐름, docs_dev/4_security_privacy_policy.md
-- =====================================================================

do $$ begin create type public.notification_channel as enum ('ALIMTALK','SMS','EMAIL');
exception when duplicate_object then null; end $$;

create table if not exists public.notification_logs (
  id            uuid primary key default gen_random_uuid(),
  channel       public.notification_channel not null,
  template_code text not null,
  recipient     text not null,          -- 개인정보: 목록 노출 시 마스킹 대상
  provider      text,                    -- 실제 발송 프로바이더('log'=폴백)
  status        text not null default 'SENT',  -- SENT | FAILED
  ref_type      text,                    -- 연계 리소스 유형(APPROVAL/CAPITAL_CALL/GUEST_OTP 등)
  ref_id        uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_notification_logs_created on public.notification_logs (created_at desc);
create index if not exists idx_notification_logs_ref on public.notification_logs (ref_type, ref_id);

-- RLS: 관리자/경영지원(관제)만 조회. 삽입은 서버(서비스 롤/Edge Function)만.
alter table public.notification_logs enable row level security;
drop policy if exists notification_logs_select on public.notification_logs;
create policy notification_logs_select on public.notification_logs for select
  using (app.is_admin() or app.can_read_workspace('management'));
