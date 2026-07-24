-- =====================================================================
-- 투자기업 전환을 '자사 투자 집행'으로 게이팅 + 승격 시 관리현황(pool_status) 동시 지정
--
-- 배경: 지금까지 promote_to_invested 는 미투자→투자 전환을 networks 쓰기 권한자면
--       누구나 호출할 수 있었다(STARTUP 편집화면에서 자유 전환). 이를 바꿔
--       "전환은 해당 스타트업에 자사 펀드 투자 집행(investments.is_own_investment)이
--        있을 때만" 가능하도록 서버에서 강제한다. UI 이동만으로는 우회 가능하므로
--       (CLAUDE.md: UI 숨김은 보안이 아니다) 권한 판정 자체를 옮긴다.
--
-- 근거: 20260714120000_startup_pool_lifecycle.sql(promote_to_invested 원본·startups RLS),
--       20260705170000_fund_schema.sql(investments RLS: fund 쓰기+can_access_fund),
--       20260723120000_fund_investment_link.sql(is_own_investment),
--       docs/docs_dev/11_migration_security_gate.md
--
-- 보안 게이트 사전 답변:
--   · 소유 워크스페이스: networks(스타트업 마스터). 단 '전환 권한'은 fund 투자 집행에서 파생.
--   · 데이터 등급: Internal (담당자·현황 = 내부 값. 개인정보 원본/다운로드/Export 없음).
--   · 접근 주체: 내부 사용자만 (게스트는 fund·networks 권한 없음).
--   · Scope: global (기존 SECURITY DEFINER 함수의 권한 로직 교체).
--   · 운영 영향: 미투자→투자 전환 경로가 'networks 쓰기'에서 '자사 투자 집행 존재(+fund 접근)'로
--               좁아진다. 관리자(is_admin)는 브레이크글라스로 유지. pool_status 를 승격과 함께 세팅.
--   · SECURITY DEFINER 유지 사유: 최초 담당자 부트스트랩(startup_managers 최초 INSERT)이
--     startup_managers RLS(기존 담당자만 INSERT)로 INVOKER 에선 불가 → 기존과 동일하게 DEFINER.
--     함수는 startups·startup_managers(쓰기), investments(읽기)만 접근한다.
-- =====================================================================

-- 시그니처가 바뀌므로(파라미터 추가) 기존 함수를 내리고 다시 만든다.
drop function if exists public.promote_to_invested(uuid, uuid, uuid[]);

create or replace function public.promote_to_invested(
  p_startup_id       uuid,
  p_lead_user_id     uuid,
  p_support_user_ids uuid[] default '{}'::uuid[],
  p_pool_status      text   default null
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

  -- 투자기업으로 전환 + 관리현황 지정(주어졌을 때만 갱신, 없으면 기존값 유지).
  -- 게이팅 트리거(app.startups_lifecycle_gate)가 invested 에서는 pool_status 를 보존한다.
  update public.startups
     set management_status = 'invested',
         pool_status = coalesce(p_pool_status, pool_status)
   where id = p_startup_id;
end;
$$;
revoke all on function public.promote_to_invested(uuid, uuid, uuid[], text) from public;
grant execute on function public.promote_to_invested(uuid, uuid, uuid[], text) to authenticated;
