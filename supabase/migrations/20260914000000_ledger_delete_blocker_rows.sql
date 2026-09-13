-- =====================================================================
-- 비활성 원장 영구 삭제 — 선택 건별 차단 사유 조회
--
-- 기존 admin_entities_delete_blockers(text, uuid[])는 선택한 모든 행의 연결 건수를
-- 사유별로 **합산**해서 돌려준다. 그래서 확인창은 "첨부 자료 11건"까지만 말할 수 있고
-- 20건 중 어느 원장이 왜 막혔는지, 나머지는 지울 수 있는지는 말하지 못했다.
-- 관리자는 막힌 행을 골라낼 수 없어 선택 전체를 포기하게 된다.
--
-- 그래서 같은 판정(admin_entity_delete_blockers)을 행 단위로 펼쳐 돌려주는 함수를
-- 하나 더 둔다. 판정 자체는 단건 함수가 계속 소유하므로 blocker 목록이 늘거나 줄어도
-- 이 함수는 고칠 것이 없다. 합계 함수는 그대로 남겨 둔다 — 계약을 바꾸지 않는다.
--
-- 삭제 자체는 여전히 admin_hard_delete_entities가 한 트랜잭션으로 처리하며 한 행이라도
-- 막히면 전부 롤백한다. "가능한 것만 삭제"는 화면이 **막히지 않은 id만 보내는** 방식으로
-- 이루어지고, 서버는 받은 id를 행마다 다시 판정한다. 서버 판정은 한 칸도 느슨해지지 않는다.
-- =====================================================================

create or replace function public.admin_entities_delete_blocker_rows(
  p_entity_key text,
  p_ids        uuid[]
)
returns table (
  entity_id     uuid,
  blocker_key   text,
  blocker_label text,
  row_count     bigint
)
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
  ) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 or cardinality(p_ids) > 100 then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;

  return query
  select selected.id, b.blocker_key, b.blocker_label, b.row_count
    from (select distinct x as id from unnest(p_ids) as x) selected
    cross join lateral public.admin_entity_delete_blockers(p_entity_key, selected.id) b
   order by selected.id, b.blocker_label;
end $$;

comment on function public.admin_entities_delete_blocker_rows(text, uuid[]) is
  'ADMIN 다중 영구 삭제 확인용 연결 데이터를 선택 행별로 펼쳐 돌려준다(7종, 최대 100건). 판정은 admin_entity_delete_blockers가 소유하며, 여기에 나오지 않는 행만 삭제 RPC로 보낸다. 삭제 RPC는 받은 행의 blocker를 다시 판정한다.';

revoke all on function public.admin_entities_delete_blocker_rows(text, uuid[]) from public;
revoke all on function public.admin_entities_delete_blocker_rows(text, uuid[]) from anon;
grant execute on function public.admin_entities_delete_blocker_rows(text, uuid[]) to authenticated;
