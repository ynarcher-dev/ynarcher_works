-- =====================================================================
-- 투자기업 딜메이커(부) 지정 해제 반영
--
-- 배경:
--   promote_to_invested는 리드 담당자 변경과 지원 담당자 추가/upsert만 수행하고,
--   p_support_user_ids에서 빠진 기존 지원 담당자를 지우지 않았다. 그래서 펀드 투자
--   수정 모달에서 딜메이커(부) 칩을 제거해도 startup_managers 행이 남아 다시
--   표시됐다.
--
-- 조치:
--   담당자 동기화를 "리드 1명 + 전달된 지원 담당자 전체" 상태로 맞춘다.
--   리드가 아닌 기존 담당자 중 요청 지원 목록에 없는 사람은 hard DELETE한다.
--
-- 보안 게이트:
--   SECURITY DEFINER와 기존 권한 판정은 유지한다. 접근 원장(startups,
--   startup_managers, investments)과 함수 인자는 변하지 않고, 누락된 지원 담당자
--   행을 정리하는 삭제만 추가한다.
-- =====================================================================

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
    if not (app.is_admin() or app.is_startup_manager(p_startup_id, v_uid)) then
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

revoke all on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) from public;
grant execute on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) to authenticated;

comment on function public.promote_to_invested(uuid, uuid, uuid[], text, text, date) is
  '투자 승격 + 담당자 지정 + 관리현황/투자단계/폐업일자 세팅. 지원 담당자는 p_support_user_ids와 전량 동기화해 빠진 담당자를 삭제한다. SECURITY DEFINER(담당자 부트스트랩). 근거: 20260903160000';
