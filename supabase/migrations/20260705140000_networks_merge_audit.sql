-- =====================================================================
-- [Phase 6] NETWORKS 중복 병합 감사 트리거
-- startups/experts/partners의 merged_into_id 설정(병합) 시 audit_logs에 자동 기록.
-- audit_logs 직접 INSERT는 RLS로 차단되므로 SECURITY DEFINER 트리거로 적재한다.
-- 근거: docs_planning/2_business_scenarios.md (병합 감사 로그)
-- =====================================================================

create or replace function app.audit_networks_merge()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if tg_op = 'UPDATE'
     and new.merged_into_id is distinct from old.merged_into_id
     and new.merged_into_id is not null then
    insert into public.audit_logs (
      actor_user_id, action, changed_workspace, before_data, after_data, reason
    )
    values (
      app.current_app_user_id(),
      'NETWORKS_MERGE',
      'networks',
      jsonb_build_object('table', tg_table_name, 'id', new.id),
      jsonb_build_object('merged_into_id', new.merged_into_id),
      nullif(current_setting('app.audit_reason', true), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_startups_merge_audit on public.startups;
create trigger trg_startups_merge_audit
  after update of merged_into_id on public.startups
  for each row execute function app.audit_networks_merge();

drop trigger if exists trg_experts_merge_audit on public.experts;
create trigger trg_experts_merge_audit
  after update of merged_into_id on public.experts
  for each row execute function app.audit_networks_merge();

drop trigger if exists trg_partners_merge_audit on public.partners;
create trigger trg_partners_merge_audit
  after update of merged_into_id on public.partners
  for each row execute function app.audit_networks_merge();
