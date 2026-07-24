-- =====================================================================
-- [Phase 8] FUND 목적관리 — 규약 투자의무(주목적·특수목적) 원장 + 투자 부합 매핑
--
-- 배경
--   펀드의 약정총액(결성액)은 규약상 주목적(MAIN)·특수목적(SPECIAL) 투자의무와 그 나머지
--   일반(관리 대상 아님)으로 나뉜다. 주목적·특수목적은 펀드마다 N개이며 각 항목은 텍스트 조건과
--   목표비율(약정총액 대비 %)을 가진다. 투자 집행 시 그 기업이 어느 목적에 부합하는지 체크(N:N)하고,
--   목적별 달성률(부합 투자의 집행액 합 ÷ 약정총액)을 영업·운용보고에 자동 산출한다.
--   기존 계획(§2.3 "주목적1·2·3 / 특수목적" Y/N 고정 플래그)을 N개 + 비율 원장으로 확장한다.
--
--   1) fund_purposes        : 펀드별 목적 원장(kind·label·target_pct·sort_order)
--   2) investment_purposes  : 투자↔목적 부합 매핑(N:N). RLS 표준화를 위해 fund_id 비정규화
--   3) set_fund_purposes        : 펀드 목적 집합 원자 교체 RPC(SECURITY INVOKER)
--   4) set_investment_purposes  : 한 투자의 부합 목적 매핑 원자 교체 RPC(SECURITY INVOKER)
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW/R.
--   · 신규 테이블 2종: RLS 즉시 활성화, SELECT/INSERT/UPDATE/DELETE 정책 분리,
--     판정은 app.can_read/write_workspace('fund') + app.can_access_fund(fund_id) 헬퍼 경유
--     (기존 funds/fund_managers와 동일 원천). 외부 게스트는 fund 읽기 권한이 없어 접근 불가.
--   · RPC 2종은 SECURITY INVOKER — RLS 우회 없음. 접근 판정은 정책 헬퍼를 그대로 호출하고,
--     실제 DML은 각 테이블 RLS가 재차 강제(belt-and-suspenders). search_path 고정,
--     GRANT EXECUTE = authenticated 한정. SECURITY DEFINER/Storage/service_role 없음.
--   · 목적/매핑은 순수 설정·분류 데이터(개인정보·파일 없음). 배정 junction 선례(fund_managers)를
--     따라 제거는 hard DELETE로 처리(목적 삭제 시 부합 매핑도 cascade). 감사 필요 시 후속 확장.
-- 근거: docs_planning/3_5_workspace_fund.md §2.3, §3.2(2항), §3.3(4항)
-- =====================================================================

-- 1) fund_purposes 원장 --------------------------------------------------
create table if not exists public.fund_purposes (
  id         uuid primary key default gen_random_uuid(),
  fund_id    uuid not null references public.funds(id) on delete cascade,
  kind       text not null check (kind in ('MAIN','SPECIAL')),  -- 주목적/특수목적
  label      text not null,                                     -- 텍스트 조건(직접 입력)
  target_pct numeric(5,2),                                      -- 목표비율(약정총액 대비 %)
  sort_order integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fund_purposes_fund on public.fund_purposes (fund_id);

comment on table public.fund_purposes is
  '펀드 규약 투자의무 목적 원장(MAIN=주목적, SPECIAL=특수목적). target_pct는 약정총액 대비 목표비율(%). 근거: 3_5_workspace_fund.md §2.3';

-- 2) investment_purposes 매핑(N:N) -------------------------------------
--    fund_id는 RLS 표준(can_access_fund(fund_id)) 재사용 + 조회 단순화를 위한 비정규화.
create table if not exists public.investment_purposes (
  investment_id uuid not null references public.investments(id) on delete cascade,
  purpose_id    uuid not null references public.fund_purposes(id) on delete cascade,
  fund_id       uuid not null references public.funds(id) on delete cascade,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  primary key (investment_id, purpose_id)
);
create index if not exists idx_investment_purposes_purpose on public.investment_purposes (purpose_id);
create index if not exists idx_investment_purposes_fund on public.investment_purposes (fund_id);

comment on table public.investment_purposes is
  '투자↔목적 부합 매핑(N:N). fund_id는 RLS 표준화용 비정규화. 근거: 3_5_workspace_fund.md §1.2';

-- updated_at 트리거(fund_purposes만; 매핑은 갱신 없이 교체).
drop trigger if exists trg_fund_purposes_updated_at on public.fund_purposes;
create trigger trg_fund_purposes_updated_at before update on public.fund_purposes
  for each row execute function app.set_updated_at();

-- 3) RLS: FUND 스코프(funds/fund_managers와 동일 헬퍼) -------------------
do $$
declare t text;
begin
  foreach t in array array['fund_purposes','investment_purposes'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format(
      'create policy %I on public.%I for select using (app.can_read_workspace(''fund'') and app.can_access_fund(fund_id))',
      t||'_select', t);

    execute format('drop policy if exists %I on public.%I', t||'_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (app.can_write_workspace(''fund'') and app.can_access_fund(fund_id))',
      t||'_insert', t);

    execute format('drop policy if exists %I on public.%I', t||'_update', t);
    execute format(
      'create policy %I on public.%I for update using (app.can_write_workspace(''fund'') and app.can_access_fund(fund_id)) with check (app.can_write_workspace(''fund'') and app.can_access_fund(fund_id))',
      t||'_update', t);

    execute format('drop policy if exists %I on public.%I', t||'_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (app.can_write_workspace(''fund'') and app.can_access_fund(fund_id))',
      t||'_delete', t);
  end loop;
end $$;

-- 4) set_fund_purposes — 펀드 목적 집합 원자 교체 -----------------------
--    p_purposes: jsonb 배열 [{id?, kind, label, target_pct?, sort_order?}, ...]
--    id가 있으면 갱신, 없으면 신규. 입력에 없는 기존 목적은 삭제(부합 매핑 cascade).
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
     and e->>'kind' in ('MAIN','SPECIAL')
  on conflict (id) do update
     set kind       = excluded.kind,
         label      = excluded.label,
         target_pct = excluded.target_pct,
         sort_order = excluded.sort_order;
end $$;

revoke all on function public.set_fund_purposes(uuid, jsonb) from public;
grant execute on function public.set_fund_purposes(uuid, jsonb) to authenticated;

comment on function public.set_fund_purposes(uuid, jsonb) is
  '펀드 목적(주목적/특수목적) 집합 원자 교체. SECURITY INVOKER — 권한은 fund_purposes RLS가 판정.';

-- 5) set_investment_purposes — 한 투자의 부합 목적 매핑 원자 교체 --------
create or replace function public.set_investment_purposes(
  p_investment_id uuid,
  p_purpose_ids   uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_uid  uuid := app.current_app_user_id();
  v_fund uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- 투자 소속 펀드 조회(investments SELECT RLS가 접근을 판정 → 권한 없으면 v_fund null).
  select fund_id into v_fund from public.investments where id = p_investment_id and deleted_at is null;
  if v_fund is null then
    raise exception 'investment_not_found_or_forbidden' using errcode = '42501';
  end if;

  delete from public.investment_purposes where investment_id = p_investment_id;

  -- 같은 펀드에 속한 목적만 매핑(교차 펀드 오염 차단). insert는 RLS가 재차 강제.
  insert into public.investment_purposes (investment_id, purpose_id, fund_id, created_by)
  select p_investment_id, pid, v_fund, v_uid
    from unnest(coalesce(p_purpose_ids, '{}'::uuid[])) pid
   where pid is not null
     and exists (
       select 1 from public.fund_purposes fp where fp.id = pid and fp.fund_id = v_fund
     );
end $$;

revoke all on function public.set_investment_purposes(uuid, uuid[]) from public;
grant execute on function public.set_investment_purposes(uuid, uuid[]) to authenticated;

comment on function public.set_investment_purposes(uuid, uuid[]) is
  '투자↔목적 부합 매핑 원자 교체. SECURITY INVOKER — 권한은 investment_purposes/investments RLS가 판정.';
