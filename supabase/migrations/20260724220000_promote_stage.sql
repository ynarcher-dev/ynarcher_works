-- =====================================================================
-- 투자 집행 등록의 라운드(투자단계)를 승격 시 투자기업의 단계(startups.stage)로 전파
--
-- 배경: 투자 집행 등록의 '라운드'는 자유입력이었고 투자기업의 '단계'(startups.stage,
--       investment_stage_tags 원장 선택값)와 무관했다. 이를 바꿔 라운드를 투자단계 태그로 받고,
--       투자기업 전환(승격)과 함께 그 값을 startups.stage 로 세팅한다. 이미 pool_status 를
--       승격과 함께 세팅하던 것과 동일한 방식으로, promote_to_invested 에 p_stage 를 추가한다.
--
-- 근거: 20260724190000_promote_gated_by_investment.sql(현행 promote_to_invested),
--       20260714120000_startup_pool_lifecycle.sql(startups.stage·라이프사이클 게이트),
--       docs/docs_dev/11_migration_security_gate.md
--
-- 보안 게이트 사전 답변:
--   · 소유 워크스페이스: networks(스타트업 마스터). 전환 권한은 fund 투자 집행에서 파생(현행 유지).
--   · 데이터 등급: Internal (단계 = 내부 분류값. 개인정보/다운로드/Export 없음).
--   · 접근 주체: 내부 사용자만.
--   · Scope: global — 기존 SECURITY DEFINER 함수에 파라미터 1개(p_stage) 추가.
--   · 운영 영향: 추가적(additive). p_stage 미지정 시 기존 stage 보존(coalesce). 권한 로직 불변.
--   · SECURITY DEFINER 유지 사유: 담당자 부트스트랩(20260724190000과 동일). 함수가 접근하는
--     테이블 집합은 변하지 않는다(startups 는 이미 UPDATE 대상, 컬럼만 stage 추가).
-- =====================================================================

-- 파라미터가 늘어나므로(시그니처 변경) 기존 함수를 내리고 다시 만든다.
drop function if exists public.promote_to_invested(uuid, uuid, uuid[], text);

create or replace function public.promote_to_invested(
  p_startup_id       uuid,
  p_lead_user_id     uuid,
  p_support_user_ids uuid[] default '{}'::uuid[],
  p_pool_status      text   default null,
  p_stage            text   default null
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
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if p_lead_user_id is null then
    raise exception 'lead_required' using errcode = '23514';
  end if;

  select (management_status = 'invested')
    into v_is_invested
    from public.startups
   where id = p_startup_id and deleted_at is null;
  if not found then
    raise exception 'startup_not_found' using errcode = 'P0002';
  end if;

  -- 호출자 권한 판정
  if v_is_invested then
    -- 이미 투자기업(담당자 재구성·현황 변경): 관리자 또는 기존 담당자만.
    if not (app.is_admin() or app.is_startup_manager(p_startup_id, v_uid)) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  else
    -- 미투자 → 투자 전환: '자사 투자 집행이 있을 때만' 허용(투자 집행 등록 흐름 전용).
    -- 관리자는 브레이크글라스로 예외. 그 외에는 접근 가능한 펀드의 자사 투자 레코드가 필요하다.
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

  -- 담당자 재구성: 기존 리드 해제 → 리드/지원 upsert (리드 1명 유니크 인덱스 준수)
  update public.startup_managers set is_lead = false where startup_id = p_startup_id;

  insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
    values (p_startup_id, p_lead_user_id, true, v_uid)
  on conflict (startup_id, user_id)
    do update set is_lead = true, assigned_by = v_uid;

  foreach v_support in array coalesce(p_support_user_ids, '{}'::uuid[])
  loop
    if v_support is not null and v_support <> p_lead_user_id then
      insert into public.startup_managers (startup_id, user_id, is_lead, assigned_by)
        values (p_startup_id, v_support, false, v_uid)
      on conflict (startup_id, user_id)
        do update set is_lead = false, assigned_by = v_uid;
    end if;
  end loop;

  -- 투자기업으로 전환 + 관리현황·단계 지정(주어졌을 때만 갱신, 없으면 기존값 유지).
  -- 게이팅 트리거(app.startups_lifecycle_gate)가 invested 에서는 pool_status 를 보존한다.
  update public.startups
     set management_status = 'invested',
         pool_status = coalesce(p_pool_status, pool_status),
         stage       = coalesce(p_stage, stage)
   where id = p_startup_id;
end;
$$;
revoke all on function public.promote_to_invested(uuid, uuid, uuid[], text, text) from public;
grant execute on function public.promote_to_invested(uuid, uuid, uuid[], text, text) to authenticated;
