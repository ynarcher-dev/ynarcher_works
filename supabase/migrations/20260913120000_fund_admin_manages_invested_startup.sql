-- =====================================================================
-- 투자기업의 관리 주체에 **그 투자를 집행한 펀드의 관리인력**을 더한다
--
-- 왜
--   투자기업 행의 잠금은 지금까지 `startup_managers`(딜메이커 정·부) 한 축이었다. 그런데
--   실제 운영에서 딜메이커를 지정하는 사람은 그 펀드의 관리인력(fund_managers.role='ADMIN')
--   이고, 대표펀드매니저·운용인력은 이름만 걸어 두는 자리다(2026-09-13 사용자 확정). 그래서
--   정작 관리 주체인 사람이 자기 펀드의 포트폴리오 기업 하나를 고치려면 자기를 딜메이커로
--   먼저 넣어야 했고, 그 한 걸음이 원장의 '누가 맡았는가'를 실제와 다르게 만들었다.
--
-- 무엇이 바뀌는가
--   판정식 하나가 늘어난다 — `app.can_manage_invested_startup(startup_id, user_id)`는
--   "이 기업의 딜메이커인가" 또는 "이 기업에 **자사 투자**를 집행한 살아 있는 펀드의
--   관리인력인가"를 묻는다. 종전에 `app.is_startup_manager()`를 부르던 투자기업 잠금
--   네 곳(기업 행 수정 USING·WITH CHECK, 담당자 원장 쓰기 셋, 승격 RPC)이 이 함수를 부른다.
--   딜메이커 지정까지 함께 열리는 것은 의도다 — 지정하는 사람이 곧 이들이기 때문이다.
--
-- 무엇을 열지 않는가
--   · **대표펀드매니저(funds.manager_id)와 운용인력(role='OPERATION')은 대상이 아니다.**
--     이름만 걸어 두는 자리라 관리 권한을 함께 주면 잠금이 사실상 FUND 전원으로 풀린다.
--   · **타사 투자 이력(is_own_investment=false)은 근거가 되지 않는다.** 남의 라운드를
--     기록해 둔 행이 우리 원장의 쓰기 자격을 만들 수는 없다(승격 RPC의 기존 잠금과 같은 결).
--   · **비활성 펀드(funds.deleted_at)는 근거가 되지 않는다.**
--   · 읽기(SELECT)·투자기업 직접 등록 금지(20260731180000)·게스트 차단(is_internal_user)은
--     그대로다. `app.is_startup_manager()` 자신의 뜻도 바뀌지 않는다 — 그 함수는 계속
--     "담당자 원장에 행이 있는가"만 답한다(다른 호출자가 이 확대를 물려받지 않게).
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: startup(스타트업 원장). 근거 원장: fund(investments·fund_managers)
--   · 데이터 등급: Personal(기업 정보·담당자 성명/연락처). 신규 노출 경로 없음
--   · 접근 주체: 종전(관리자 + 딜메이커) + 자사 투자 집행 펀드의 관리인력
--   · Scope 기준: 행 단위(투자기업 축). 워크스페이스 권한 판정은 손대지 않는다
--   · 신규 테이블·Storage·service_role 없음. DELETE 정책 신설 없음(startup_managers의
--     기존 DELETE 정책은 순수 배정 junction이라 종전대로 유지)
--   · SECURITY DEFINER 신규 1종(app.can_manage_invested_startup) — search_path 고정,
--     boolean 하나만 돌려주며 public·anon에서 REVOKE, authenticated에만 GRANT
--   · 운영 영향: 권한 경계 **확대**. 되돌리려면 다시 마이그레이션이 든다
--
-- 근거: 20260714120000(startup_managers·is_startup_manager), 20260731140000(투자기업 잠금),
--       20260903160000(promote_to_invested 현행), 20260906150000·20260909190000(can_write_startup),
--       20260724110000(fund_managers)
-- =====================================================================

-- ── (1) 투자기업 관리 자격 판정 ──────────────────────────────────────
-- SECURITY DEFINER인 이유는 기존 RLS 헬퍼와 같다 — 판정에 필요한 원장(investments·
-- fund_managers)은 FUND 권한자만 읽을 수 있어 호출자 권한으로 조회하면 답이 흔들린다.
-- 돌려주는 것은 boolean 하나뿐이라 이 우회로 새어 나가는 값이 없다.
create or replace function app.can_manage_invested_startup(p_startup_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_startup_manager(p_startup_id, p_user_id)
      or exists (
        select 1
          from public.investments i
          join public.funds f on f.id = i.fund_id
          join public.fund_managers fm on fm.fund_id = i.fund_id
         where i.startup_id = p_startup_id
           and i.is_own_investment
           and i.deleted_at is null
           and f.deleted_at is null
           and fm.user_id = p_user_id
           and fm.role = 'ADMIN'
      );
$$;

comment on function app.can_manage_invested_startup(uuid, uuid) is
  '이 투자기업의 관리 주체인가 — 딜메이커(startup_managers 정·부) 또는 자사 투자를 집행한 살아 있는 펀드의 관리인력(fund_managers.role=ADMIN). 대표펀드매니저·운용인력은 포함하지 않는다(2026-09-13 사용자 확정). 투자기업 잠금 네 곳이 이 함수 하나를 부른다.';

revoke all on function app.can_manage_invested_startup(uuid, uuid) from public, anon;
grant execute on function app.can_manage_invested_startup(uuid, uuid) to authenticated;

-- ── (2) 기업 행 수정 — USING은 계속 can_write_startup 한 곳이 답한다 ──
create or replace function app.can_write_startup(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.startups s
     where s.id = p_id
       and app.is_internal_user()
       and (
         s.management_status is distinct from 'invested'
         or app.is_admin()
         or app.can_manage_invested_startup(s.id, app.current_app_user_id())
       )
  );
$$;

comment on function app.can_write_startup(uuid) is
  '이 기업의 기존 행을 고칠 자격이 있는가(startups_update USING의 판정식). 내부 사용자 전원이되 투자기업은 관리자 또는 관리 주체(app.can_manage_invested_startup)만. 이 함수는 커밋된 값을 읽으므로 WITH CHECK 자리에 쓰지 말 것 — 그 절은 바뀔 값을 물어 투자기업 승격을 막는 다른 잠금이다. 근거: 3_3_5 §8.2';

-- WITH CHECK는 **바뀔 값**을 보는 별개의 물음이라 인라인으로 남는다(20260909190000 그대로).
-- 비담당자가 구분을 invested로 올리는 것을 막는 잠금이 이쪽이다.
drop policy if exists startups_update on public.startups;
create policy startups_update on public.startups for update
  using (app.can_write_startup(id))
  with check (
    app.is_internal_user()
    and (
      management_status is distinct from 'invested'
      or app.is_admin()
      or app.can_manage_invested_startup(id, app.current_app_user_id())
    )
  );

comment on policy startups_update on public.startups is
  'USING은 app.can_write_startup(id) 한 곳이 답한다(Edge Function·화면이 같은 식을 되묻기 위해). WITH CHECK는 바뀔 값을 보는 별개의 물음이라 인라인으로 남는다 — 비담당자가 구분을 invested로 올리는 것을 막는 잠금은 이쪽이다.';

-- ── (3) 담당자 원장(딜메이커 지정) 쓰기 ──────────────────────────────
-- 최초 부트스트랩은 종전대로 SECURITY DEFINER RPC(promote_to_invested)가 담당한다.
drop policy if exists startup_managers_insert on public.startup_managers;
create policy startup_managers_insert on public.startup_managers for insert
  with check (app.is_admin() or app.can_manage_invested_startup(startup_id, app.current_app_user_id()));

drop policy if exists startup_managers_update on public.startup_managers;
create policy startup_managers_update on public.startup_managers for update
  using (app.is_admin() or app.can_manage_invested_startup(startup_id, app.current_app_user_id()))
  with check (app.is_admin() or app.can_manage_invested_startup(startup_id, app.current_app_user_id()));

drop policy if exists startup_managers_delete on public.startup_managers;
create policy startup_managers_delete on public.startup_managers for delete
  using (app.is_admin() or app.can_manage_invested_startup(startup_id, app.current_app_user_id()));

comment on policy startup_managers_insert on public.startup_managers is
  '딜메이커 지정은 관리자 또는 이 기업의 관리 주체(딜메이커 본인 + 자사 투자 펀드의 관리인력)가 한다. 최초 지정은 promote_to_invested가 담당한다.';

-- ── (4) 승격·담당자 동기화 RPC ───────────────────────────────────────
-- 20260903160000 본문 그대로이며, 이미 투자기업인 경우의 권한 판정만 관리 주체 물음으로 바꾼다.
create or replace function public.promote_to_invested(
  p_startup_id       uuid,
  p_lead_user_id     uuid,
  p_support_user_ids uuid[] default '{}'::uuid[],
  p_pool_status      text   default null,
  p_stage            text   default null,
  p_closed_on        date   default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid         uuid := app.current_app_user_id();
  v_is_invested boolean;
  v_support     uuid;
  v_support_ids uuid[];
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_lead_user_id is null then
    raise exception 'lead_required' using errcode = '23514';
  end if;
  select coalesce(array_agg(distinct u.support_id), '{}'::uuid[])
    into v_support_ids
    from unnest(coalesce(p_support_user_ids, '{}'::uuid[])) as u(support_id)
   where u.support_id is not null
     and u.support_id <> p_lead_user_id;

  select (management_status = 'invested')
    into v_is_invested
    from public.startups
   where id = p_startup_id and deleted_at is null;
  if not found then
    raise exception 'startup_not_found' using errcode = 'P0002';
  end if;

  if v_is_invested then
    -- 이미 투자기업이면 관리 주체(딜메이커 또는 자사 투자 펀드의 관리인력)만 담당·현황을 고친다.
    if not (app.is_admin() or app.can_manage_invested_startup(p_startup_id, v_uid)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    if not (
      app.is_admin()
      or exists (
        select 1
          from public.investments i
         where i.startup_id = p_startup_id
           and i.is_own_investment
           and i.deleted_at is null
           and app.can_access_fund(i.fund_id)
      )
    ) then
      raise exception 'investment_required' using errcode = '42501';
    end if;
  end if;

  update public.startup_managers set is_lead = false where startup_id = p_startup_id;

  insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
    values (p_startup_id, p_lead_user_id, true, v_uid)
  on conflict (startup_id, user_id)
    do update set is_lead = true, assigned_by = v_uid;

  foreach v_support in array v_support_ids
  loop
    insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
      values (p_startup_id, v_support, false, v_uid)
    on conflict (startup_id, user_id)
      do update set is_lead = false, assigned_by = v_uid;
  end loop;

  delete from public.startup_managers m
   where m.startup_id = p_startup_id
     and not m.is_lead
     and m.user_id <> all (v_support_ids);

  update public.startups
     set management_status = 'invested',
         pool_status = coalesce(p_pool_status, pool_status),
         stage       = coalesce(p_stage, stage),
         closed_on   = case
                         when coalesce(p_pool_status, pool_status) = '폐업' then p_closed_on
                         else null
                       end
   where id = p_startup_id;
end;
$$;

comment on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) is
  '스타트업을 투자기업으로 승격하고 딜메이커(정 1 + 부 N)·관리현황·단계를 동기화한다. 신규 승격은 자사 투자 집행이 근거이고, 이미 투자기업인 행은 관리 주체(app.can_manage_invested_startup)만 고친다.';
