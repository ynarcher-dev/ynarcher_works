-- =====================================================================
-- FUND 인력 배정 RPC — 대표펀드매니저(funds.manager_id) + 운용/관리 인력(fund_managers) 원자 교체
--
-- 배경
--   펀드 상세의 인력 편집기에서 대표펀드매니저·운용인력(OPERATION)·관리인력(ADMIN)을 한 번에
--   지정한다. funds.manager_id 갱신 + fund_managers 전체 교체를 두 요청으로 나누면 비원자적이므로
--   RPC 한 트랜잭션으로 묶는다(startup promote_to_invested·program set_program_staffing과 같은 결).
--
-- SECURITY INVOKER 인 이유
--   DEFINER로 만들면 funds·fund_managers의 RLS를 우회해 쓰기 규칙을 함수 안에 복제해야 하고
--   그 복제본이 곧 권한 구멍이 된다. INVOKER면 funds UPDATE 정책(can_write_workspace('fund')+
--   can_access_fund)과 fund_managers write 정책이 그대로 판정한다 — 권한 단일 원천이 정책에 남는다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: fund. 데이터 등급: Internal(인력 배정). 개인정보 원본·파일 없음.
--   · 신규 테이블/Storage 없음. RPC는 SECURITY INVOKER(RLS 우회 없음), search_path 고정,
--     호출자 존재만 확인(실권한은 RLS가 강제). GRANT EXECUTE = authenticated 한정.
-- 근거: 20260724110000_fund_period_and_managers.sql(fund_managers·RLS),
--       20260721150000_...startup_global.sql(INVOKER 스탬프 RPC 패턴)
-- =====================================================================

create or replace function public.set_fund_staffing(
  p_fund_id    uuid,
  p_manager_id uuid,
  p_operators  uuid[] default '{}'::uuid[],
  p_admins     uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_uid uuid := app.current_app_user_id();
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- 대표펀드매니저 갱신. funds UPDATE RLS가 쓰기 권한을 판정한다(권한 없으면 0행 → forbidden).
  update public.funds set manager_id = p_manager_id where id = p_fund_id;
  if not found then
    raise exception 'fund_not_found_or_forbidden' using errcode = '42501';
  end if;

  -- 운용/관리 인력 전체 교체. fund_managers write RLS가 판정한다. 대표는 manager_id가 소유하므로
  -- 여기 행은 is_lead=false로만 둔다(대표=OPERATION lead 개념은 쓰지 않는다).
  delete from public.fund_managers where fund_id = p_fund_id;

  insert into public.fund_managers (fund_id, user_id, role, is_lead, assigned_by)
  select p_fund_id, u, 'OPERATION', false, v_uid
    from unnest(coalesce(p_operators, '{}'::uuid[])) u
   where u is not null
  on conflict (fund_id, user_id) do update set role = 'OPERATION', assigned_by = v_uid;

  insert into public.fund_managers (fund_id, user_id, role, is_lead, assigned_by)
  select p_fund_id, u, 'ADMIN', false, v_uid
    from unnest(coalesce(p_admins, '{}'::uuid[])) u
   where u is not null
  on conflict (fund_id, user_id) do update set role = 'ADMIN', assigned_by = v_uid;
end $$;

revoke all on function public.set_fund_staffing(uuid, uuid, uuid[], uuid[]) from public;
grant execute on function public.set_fund_staffing(uuid, uuid, uuid[], uuid[]) to authenticated;

comment on function public.set_fund_staffing(uuid, uuid, uuid[], uuid[]) is
  '펀드 인력 배정: 대표펀드매니저(funds.manager_id) + 운용(OPERATION)/관리(ADMIN) 인력(fund_managers) 원자 교체. SECURITY INVOKER — 권한은 각 원장 RLS가 판정.';
