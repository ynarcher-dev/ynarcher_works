-- =====================================================================
-- 투자기업 폐업일자(startups.closed_on) + 승격 RPC 에 폐업일자 파라미터 추가
--
-- 배경: 투자기업의 관리현황(pool_status)이 '폐업'이 되면 언제 폐업했는지 함께 기록해야 한다.
--       투자 집행 등록/수정 모달의 '투자기업 담당·현황'에서 관리현황을 폐업으로 지정할 때
--       폐업일자를 함께 입력받아, 승격 RPC(promote_to_invested)가 pool_status·stage 를 세팅하듯
--       closed_on 을 원자적으로 세팅한다. 폐업이 아닌 상태로 바뀌면 폐업일자는 자동 정리(NULL)한다.
--
-- 근거: 20260724220000_promote_stage.sql(현행 promote_to_invested — pool_status·stage 세팅),
--       20260714120000_startup_pool_lifecycle.sql(pool_status 게이팅·라이프사이클),
--       docs/docs_planning/3_5_workspace_fund.md §1.2, docs/docs_dev/11_migration_security_gate.md
--
-- 보안 게이트 사전 답변:
--   · 소유 워크스페이스: networks(스타트업 마스터). 전환 권한은 fund 투자 집행에서 파생(현행 유지).
--   · 데이터 등급: Internal (폐업일자 = 내부 상태값. 개인정보/파일/Export 없음).
--   · 접근 주체: 내부 사용자만.
--   · Scope: global — 기존 SECURITY DEFINER 함수에 파라미터 1개(p_closed_on) 추가 + 컬럼 1개 추가.
--   · 운영 영향: 추가적(additive). p_closed_on 미지정 시 폐업이면 NULL(일자 미상), 폐업 아니면 NULL.
--               권한 로직 불변. 함수가 접근하는 테이블 집합 불변(startups 는 이미 UPDATE 대상).
--   · SECURITY DEFINER 유지 사유: 담당자 부트스트랩(20260724220000과 동일).
-- =====================================================================

-- 1) 폐업일자 컬럼 --------------------------------------------------------
alter table public.startups
  add column if not exists closed_on date;

comment on column public.startups.closed_on is
  '폐업일자. 관리현황(pool_status)이 폐업일 때만 유효하며, 폐업이 아니면 승격 RPC가 NULL 로 정리한다. 근거: 20260724230000';

-- 2) promote_to_invested 재정의 — p_closed_on 추가 -----------------------
--    시그니처가 바뀌므로(파라미터 추가) 기존 함수를 내리고 다시 만든다.
drop function if exists public.promote_to_invested(uuid, uuid, uuid[], text, text);

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

  -- 투자기업으로 전환 + 관리현황·단계·폐업일자 지정(주어졌을 때만 갱신, 없으면 기존값 유지).
  -- 폐업일자는 결과 관리현황이 '폐업'일 때만 유효 — 그 외 상태에서는 NULL 로 자동 정리한다.
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
revoke all on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) from public;
grant execute on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) to authenticated;

comment on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) is
  '투자 승격 + 담당자 지정 + 관리현황·단계·폐업일자 세팅(원자). 폐업일자는 pool_status=폐업일 때만 유효. SECURITY DEFINER(담당자 부트스트랩). 근거: 20260724230000';
