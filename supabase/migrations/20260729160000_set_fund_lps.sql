-- =====================================================================
-- [Phase 8] FUND 출자자(LP) 명부 원자 교체 — set_fund_lps
--
-- 배경(사용자 확정)
--   조합원은 한 명씩 등록하는 대상이 아니라 **명부 단위로 한 번에 짜는 대상**이다(결성 시 LP
--   구성을 통째로 입력하고, 이후에도 한 화면에서 여러 줄을 같이 고친다). 화면을 명부 편집
--   (행 추가/삭제 + 일괄 저장)으로 바꾸면서 저장도 한 번에 원자 교체한다 —
--   행마다 따로 쏘면 중간에 실패했을 때 지분율(합 100%)이 깨진 상태로 남는다.
--
--   set_fund_lps(p_fund_id, p_rows):
--     · id가 있으면 갱신, 없으면 신규.
--     · payload에서 빠진 기존 LP는 soft delete(`deleted_at`) — 물리 삭제 금지 원칙 유지.
--     · 빠진 LP의 캐피탈 콜 납입 행은 hard DELETE. 명부에서 사라진 조합원의 납입이
--       실출자금액 집계에만 남으면 출자자 표와 펀드 개요가 어긋난다(차수 삭제와 같은 판단).
--       납입 행은 순수 배정성 데이터라 set_capital_call_payments도 hard DELETE 한다.
--     · 지분율은 여기서 쓰지 않는다 — sync_fund_lp_ownership 트리거가 파생한다(20260729140000).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW.
--   · 새 테이블·새 정책·Storage·service_role 없음. 기존 fund_lps/capital_call_payments RLS 상속.
--   · SECURITY INVOKER + search_path 고정 — 접근 판정은 정책 헬퍼(can_write_workspace/
--     can_access_fund)를 그대로 호출하고, 실제 DML은 RLS가 재차 강제한다.
--     DEFINER로 만들면 각 원장의 RLS를 우회하게 되어 정책을 함수 안에 복제해야 한다.
--   · GRANT EXECUTE는 authenticated 한정, public REVOKE.
-- 근거: docs_planning/3_5_workspace_fund.md §2.2
-- =====================================================================

create or replace function public.set_fund_lps(
  p_fund_id uuid,
  p_rows    jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_uid   uuid := app.current_app_user_id();
  v_keep  uuid[];
  v_drop  uuid[];
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- 접근 판정은 정책 헬퍼를 그대로 호출(권한 단일 원천). 실제 DML은 RLS가 재차 강제한다.
  if not (app.can_write_workspace('fund') and app.can_access_fund(p_fund_id)) then
    raise exception 'fund_not_found_or_forbidden' using errcode = '42501';
  end if;

  -- payload가 유지하려는 기존 LP id 목록.
  select coalesce(array_agg((e->>'id')::uuid), '{}'::uuid[]) into v_keep
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
   where nullif(e->>'id','') is not null;

  -- 명부에서 빠진 조합원 = 이번 저장으로 제외된 LP.
  select coalesce(array_agg(fl.id), '{}'::uuid[]) into v_drop
    from public.fund_lps fl
   where fl.fund_id = p_fund_id
     and fl.deleted_at is null
     and not (fl.id = any(v_keep));

  if array_length(v_drop, 1) is not null then
    -- 납입 행 먼저 제거(집계 트리거가 실납입액·실출자금액을 되돌린다).
    delete from public.capital_call_payments p where p.lp_id = any(v_drop);
    -- 원장은 soft delete. 지분율 트리거가 남은 조합원 기준으로 100%를 다시 나눈다.
    update public.fund_lps fl
       set deleted_at = now()
     where fl.id = any(v_drop);
  end if;

  -- 신규 삽입 / 기존 갱신(조합원명이 빈 행은 무시).
  insert into public.fund_lps (id, fund_id, name, lp_type, commitment_amount, contact)
  select coalesce(nullif(e->>'id','')::uuid, gen_random_uuid()),
         p_fund_id,
         trim(e->>'name'),
         coalesce(nullif(e->>'lp_type',''), 'LIMITED')::public.fund_lp_type,
         coalesce(nullif(e->>'commitment_amount','')::numeric, 0),
         coalesce(e->'contact', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
   where coalesce(trim(e->>'name'), '') <> ''
  on conflict (id) do update
     set name              = excluded.name,
         lp_type           = excluded.lp_type,
         commitment_amount = excluded.commitment_amount,
         contact           = excluded.contact,
         -- 지웠다가 되살리는 경로(같은 id를 다시 보냄)도 여기서 열어둔다.
         deleted_at        = null
   -- 다른 펀드의 LP id를 실어 보내 남의 원장을 덮어쓰는 것을 막는다.
   where public.fund_lps.fund_id = p_fund_id;
end $$;

revoke all on function public.set_fund_lps(uuid, jsonb) from public;
grant execute on function public.set_fund_lps(uuid, jsonb) to authenticated;

comment on function public.set_fund_lps(uuid, jsonb) is
  '펀드 출자자(LP) 명부 원자 교체. 빠진 LP는 soft delete + 납입 행 제거, 지분율은 트리거 파생. SECURITY INVOKER — 권한은 fund_lps RLS가 판정. 근거: 3_5_workspace_fund.md §2.2';
