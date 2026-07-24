-- =====================================================================
-- [Phase 8] FUND 목적관리 — 목적 구분에 의무투자(MANDATORY) 추가
--
-- 배경
--   기존 목적 구분은 주목적(MAIN)·특수목적(SPECIAL) 2종이었다(20260724200000). 규약상 최상위
--   투자의무인 '의무투자'를 별도 구분으로 승격해 주목적 위에 단일 항목(펀드당 1건)으로 노출한다.
--   규칙(텍스트 조건 + 목표비율 + 부합 투자 집행 달성률)은 주목적과 동일하며, 단일 제약은 화면에서만
--   강제한다(원장은 kind 값만 확장). 근거: docs_planning/3_5_workspace_fund.md §2.3
--
--   1) fund_purposes.kind CHECK 제약을 ('MAIN','SPECIAL') → ('MANDATORY','MAIN','SPECIAL')로 교체
--   2) set_fund_purposes RPC의 kind 화이트리스트에 'MANDATORY' 추가(본문은 20260724200000과 동일)
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 신규 테이블·정책·Storage 없음.
--   · CHECK 제약 확장은 값 허용 범위만 넓힌다(축소 아님) — 기존 행은 모두 유효, 데이터 손실 없음.
--   · RPC는 20260724200000과 동일한 SECURITY INVOKER 재정의 — 권한 판정은 fund_purposes RLS가
--     그대로 강제한다(우회 없음). search_path 고정, GRANT EXECUTE = authenticated 한정.
-- =====================================================================

-- 1) CHECK 제약 교체(의무투자 추가) -------------------------------------
alter table public.fund_purposes
  drop constraint if exists fund_purposes_kind_check;
alter table public.fund_purposes
  add constraint fund_purposes_kind_check
  check (kind in ('MANDATORY','MAIN','SPECIAL'));

comment on table public.fund_purposes is
  '펀드 규약 투자의무 목적 원장(MANDATORY=의무투자, MAIN=주목적, SPECIAL=특수목적). target_pct는 약정총액 대비 목표비율(%). 근거: 3_5_workspace_fund.md §2.3';

-- 2) set_fund_purposes 재정의 — kind 화이트리스트에 MANDATORY 추가 --------
--    본문은 20260724200000과 동일(원자 교체 + 라벨 빈 행 무시). 화이트리스트만 확장.
create or replace function public.set_fund_purposes(
  p_fund_id  uuid,
  p_purposes jsonb default '[]'::jsonb
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
  -- 접근 판정은 정책 헬퍼를 그대로 호출(권한 단일 원천). 실제 DML은 RLS가 재차 강제한다.
  if not (app.can_write_workspace('fund') and app.can_access_fund(p_fund_id)) then
    raise exception 'fund_not_found_or_forbidden' using errcode = '42501';
  end if;

  -- 사용자가 제거한 목적 삭제(부합 매핑은 FK cascade로 함께 제거).
  delete from public.fund_purposes p
   where p.fund_id = p_fund_id
     and p.id not in (
       select (e->>'id')::uuid
         from jsonb_array_elements(coalesce(p_purposes, '[]'::jsonb)) e
        where nullif(e->>'id','') is not null
     );

  -- 신규 삽입/기존 갱신(라벨이 빈 행은 무시).
  insert into public.fund_purposes (id, fund_id, kind, label, target_pct, sort_order, created_by)
  select coalesce(nullif(e->>'id','')::uuid, gen_random_uuid()),
         p_fund_id,
         e->>'kind',
         trim(e->>'label'),
         nullif(e->>'target_pct','')::numeric,
         coalesce((e->>'sort_order')::int, (ord - 1)::int),
         v_uid
    from jsonb_array_elements(coalesce(p_purposes, '[]'::jsonb)) with ordinality as t(e, ord)
   where coalesce(trim(e->>'label'), '') <> ''
     and e->>'kind' in ('MANDATORY','MAIN','SPECIAL')
  on conflict (id) do update
     set kind       = excluded.kind,
         label      = excluded.label,
         target_pct = excluded.target_pct,
         sort_order = excluded.sort_order;
end $$;

revoke all on function public.set_fund_purposes(uuid, jsonb) from public;
grant execute on function public.set_fund_purposes(uuid, jsonb) to authenticated;

comment on function public.set_fund_purposes(uuid, jsonb) is
  '펀드 목적(의무투자/주목적/특수목적) 집합 원자 교체. SECURITY INVOKER — 권한은 fund_purposes RLS가 판정.';
