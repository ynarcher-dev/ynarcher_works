-- =====================================================================
-- 리스트뷰 일괄 비활성화 확장 + 워크스페이스 생성자 전용 게이트
--
-- 데이터 센터(startups/networks)는 기존 원장별 쓰기 정책을 그대로 따른다.
-- 업무 워크스페이스의 사업·딜·거래상대·펀드는 생성자만 비활성화할 수 있다.
-- UI 체크박스는 편의를 위한 표기일 뿐이므로, 단건 REST UPDATE까지 포함해 DB 트리거가
-- 같은 규칙을 최종 강제한다.
-- =====================================================================

create or replace function app.guard_workspace_creator_deactivation()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and old.created_by is distinct from app.current_app_user_id()
  then
    raise exception 'creator_required' using errcode = '42501';
  end if;

  return new;
end $$;

comment on function app.guard_workspace_creator_deactivation() is
  '업무 워크스페이스 원장의 활성→비활성 전이는 생성자에게만 허용한다. 목록·상세·직접 UPDATE에 동일하게 적용한다.';

revoke all on function app.guard_workspace_creator_deactivation() from public;
revoke all on function app.guard_workspace_creator_deactivation() from anon;
revoke all on function app.guard_workspace_creator_deactivation() from authenticated;

drop trigger if exists trg_programs_creator_deactivation on public.programs;
create trigger trg_programs_creator_deactivation
  before update of deleted_at on public.programs
  for each row execute function app.guard_workspace_creator_deactivation();

drop trigger if exists trg_ma_programs_creator_deactivation on public.ma_programs;
create trigger trg_ma_programs_creator_deactivation
  before update of deleted_at on public.ma_programs
  for each row execute function app.guard_workspace_creator_deactivation();

drop trigger if exists trg_ma_buyers_creator_deactivation on public.ma_buyers;
create trigger trg_ma_buyers_creator_deactivation
  before update of deleted_at on public.ma_buyers
  for each row execute function app.guard_workspace_creator_deactivation();

drop trigger if exists trg_ma_sellers_creator_deactivation on public.ma_sellers;
create trigger trg_ma_sellers_creator_deactivation
  before update of deleted_at on public.ma_sellers
  for each row execute function app.guard_workspace_creator_deactivation();

drop trigger if exists trg_funds_creator_deactivation on public.funds;
create trigger trg_funds_creator_deactivation
  before update of deleted_at on public.funds
  for each row execute function app.guard_workspace_creator_deactivation();

create or replace function public.deactivate_entities(
  p_entity_key text,
  p_ids        uuid[],
  p_reason     text
)
returns integer
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_id    uuid;
  v_count integer := 0;
  v_rows  integer;
begin
  if p_entity_key not in (
    'startups',
    'networks',
    'programs',
    'ma_programs',
    'ma_buyers',
    'ma_sellers',
    'funds'
  ) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'empty_selection' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 100 then
    raise exception 'too_many_entities' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  for v_id in select distinct x from unnest(p_ids) as x
  loop
    if p_entity_key = 'funds' then
      update public.funds
         set deleted_at = now()
       where id = v_id
         and deleted_at is null;
      get diagnostics v_rows = row_count;
      if v_rows = 0 then
        raise exception 'not_found_or_forbidden' using errcode = '42501';
      end if;
    else
      -- 나머지 원장은 기여 이력 트리거가 있으므로 기존 단건 RPC를 거쳐 사유까지 남긴다.
      perform public.deactivate_entity(p_entity_key, v_id, btrim(p_reason));
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.deactivate_entities(text, uuid[], text) is
  '데이터 센터와 업무 워크스페이스 목록의 선택 행을 한 트랜잭션에서 비활성화한다. 워크스페이스 원장은 생성자 전용 트리거를 함께 통과한다.';

revoke all on function public.deactivate_entities(text, uuid[], text) from public;
revoke all on function public.deactivate_entities(text, uuid[], text) from anon;
grant execute on function public.deactivate_entities(text, uuid[], text) to authenticated;
