-- =====================================================================
-- ADMIN 비활성 원장 다중 복구·다중 영구 삭제
--
-- 단건 함수들을 같은 요청 안에서 반복해 검증·이력 규칙을 복제하지 않는다. PostgreSQL 함수
-- 호출 한 번이 한 트랜잭션이므로 어느 한 행이 중복·필수값·연결 데이터에서 막히면 전부 롤백된다.
-- =====================================================================

create or replace function public.restore_entities(
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
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in ('startups', 'networks') then
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
    perform public.restore_entity(p_entity_key, v_id, btrim(p_reason));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.restore_entities(text, uuid[], text) is
  'ADMIN 비활성 원장 선택 행을 한 트랜잭션에서 복구한다. 한 행이라도 단건 복구 검증에 실패하면 전체 롤백.';

revoke all on function public.restore_entities(text, uuid[], text) from public;
revoke all on function public.restore_entities(text, uuid[], text) from anon;
grant execute on function public.restore_entities(text, uuid[], text) to authenticated;

create or replace function public.admin_entities_delete_blockers(
  p_entity_key text,
  p_ids        uuid[]
)
returns table (
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
  if p_entity_key not in ('startups', 'networks') then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 or cardinality(p_ids) > 100 then
    raise exception 'invalid_selection' using errcode = '22023';
  end if;

  return query
  select b.blocker_key, b.blocker_label, sum(b.row_count)::bigint
    from (select distinct x as id from unnest(p_ids) as x) selected
    cross join lateral public.admin_entity_delete_blockers(p_entity_key, selected.id) b
   group by b.blocker_key, b.blocker_label
   order by b.blocker_label;
end $$;

comment on function public.admin_entities_delete_blockers(text, uuid[]) is
  'ADMIN 다중 영구 삭제 확인용 연결 데이터 합계. 삭제 RPC는 각 행의 단건 blocker를 다시 판정한다.';

revoke all on function public.admin_entities_delete_blockers(text, uuid[]) from public;
revoke all on function public.admin_entities_delete_blockers(text, uuid[]) from anon;
grant execute on function public.admin_entities_delete_blockers(text, uuid[]) to authenticated;

create or replace function public.admin_hard_delete_entities(
  p_entity_key   text,
  p_ids          uuid[],
  p_reason       text,
  p_confirm_text text
)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in ('startups', 'networks') then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    raise exception 'empty_selection' using errcode = '22023';
  end if;
  if cardinality(p_ids) > 100 then
    raise exception 'too_many_entities' using errcode = '22023';
  end if;

  for v_id in select distinct x from unnest(p_ids) as x
  loop
    perform public.admin_hard_delete_entity(
      p_entity_key,
      v_id,
      btrim(p_reason),
      p_confirm_text
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.admin_hard_delete_entities(text, uuid[], text, text) is
  'ADMIN 비활성 원장 선택 행 물리 삭제. 단건 확인·blocker·감사 로그 규칙을 재사용하며 한 행이라도 실패하면 전체 롤백.';

revoke all on function public.admin_hard_delete_entities(text, uuid[], text, text) from public;
revoke all on function public.admin_hard_delete_entities(text, uuid[], text, text) from anon;
grant execute on function public.admin_hard_delete_entities(text, uuid[], text, text) to authenticated;
