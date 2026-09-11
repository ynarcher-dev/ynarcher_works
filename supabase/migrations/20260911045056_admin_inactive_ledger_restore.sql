-- =====================================================================
-- ADMIN 비활성 원장 조회·복구
--
-- 소유 워크스페이스: admin(조작) + startup/networks(원장)
-- 데이터 등급: Internal / 접근 주체: 내부 super_admin / Scope: global
--
-- 비활성 행은 업무 원장에 그대로 남아 있지만 활성 목록은 deleted_at is null만 읽으므로
-- 다시 찾고 복구할 공식 창구가 없었다. ADMIN 전용 목록 RPC와 복구 RPC를 세우고, 복구도
-- 기존 기여 트리거가 같은 트랜잭션에서 기록하도록 contribution_ctx를 경유한다.
-- SECURITY INVOKER를 유지해 원장 RLS를 우회하지 않으며, 함수 안의 app.is_admin()이
-- 관리자 전용 경계를 한 번 더 강제한다.
-- =====================================================================

alter table public.entity_contributions
  drop constraint if exists entity_contributions_action_chk;

alter table public.entity_contributions
  add constraint entity_contributions_action_chk
  check (action in ('created', 'merged', 'enriched', 'edited', 'deactivated', 'reactivated'));

create or replace function public.admin_inactive_ledger_entities(
  p_entity_key text,
  p_keyword    text default null,
  p_limit      integer default 20,
  p_offset     integer default 0
)
returns table (
  entity_id            uuid,
  entity_name          text,
  category             text,
  detail               text,
  deleted_at           timestamptz,
  deactivated_by       text,
  deactivation_reason  text,
  total_count          bigint
)
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_keyword text := nullif(btrim(p_keyword), '');
  v_limit   integer := greatest(1, least(coalesce(p_limit, 20), 100));
  v_offset  integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  if p_entity_key = 'startups' then
    return query
    select s.id,
           s.name,
           s.management_status,
           s.representative,
           s.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.startups s
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'startups'
           and c.entity_id = s.id
           and c.action = 'deactivated'
         order by c.created_at desc, c.id desc
         limit 1
      ) d on true
     where s.deleted_at is not null
       and s.merged_into_id is null
       and (
         v_keyword is null
         or s.name ilike '%' || v_keyword || '%'
         or coalesce(s.representative, '') ilike '%' || v_keyword || '%'
       )
     order by s.deleted_at desc, s.name, s.id
     limit v_limit offset v_offset;
  elsif p_entity_key = 'networks' then
    return query
    select n.id,
           n.name,
           n.category,
           n.affiliation,
           n.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.networks n
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'networks'
           and c.entity_id = n.id
           and c.action = 'deactivated'
         order by c.created_at desc, c.id desc
         limit 1
      ) d on true
     where n.deleted_at is not null
       and n.merged_into_id is null
       and (
         v_keyword is null
         or n.name ilike '%' || v_keyword || '%'
         or coalesce(n.affiliation, '') ilike '%' || v_keyword || '%'
       )
     order by n.deleted_at desc, n.name, n.id
     limit v_limit offset v_offset;
  else
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
end $$;

comment on function public.admin_inactive_ledger_entities(text, text, integer, integer) is
  'ADMIN 전용 비활성 원장 목록. STARTUP·NETWORKS의 미병합 soft-delete 행을 같은 표시 계약으로 페이지 조회한다.';

revoke all on function public.admin_inactive_ledger_entities(text, text, integer, integer) from public;
revoke all on function public.admin_inactive_ledger_entities(text, text, integer, integer) from anon;
grant execute on function public.admin_inactive_ledger_entities(text, text, integer, integer) to authenticated;

create or replace function public.restore_entity(
  p_entity_key text,
  p_id         uuid,
  p_reason     text
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_rows  integer;
  v_row   record;
  v_match boolean;
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in ('startups', 'networks') then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  -- 복구 직전에 활성 중복을 다시 본다. 이름·이메일·전화 중 빈 값이 아닌 두 칸 이상이
  -- 일치하면 담당자의 병합 판단 없이 같은 대상을 둘로 되살리지 않는다.
  if p_entity_key = 'startups' then
    select s.id, s.name, s.email, s.phone, null::uuid as country_tag_id
      into v_row
      from public.startups s
     where s.id = p_id
       and s.deleted_at is not null
       and s.merged_into_id is null;
  else
    select n.id, n.name, n.email, n.phone, n.country_tag_id
      into v_row
      from public.networks n
     where n.id = p_id
       and n.deleted_at is not null
       and n.merged_into_id is null;
  end if;

  if v_row.id is null then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
  if p_entity_key = 'networks' and v_row.country_tag_id is null then
    raise exception 'restore_required_fields_missing' using errcode = '23514';
  end if;

  execute format(
    'select exists (
       select 1
         from public.%I x
        where x.id <> $1
          and x.deleted_at is null
          and x.merged_into_id is null
          and (
            case when nullif(lower(btrim($2)), '''') is not null
                       and lower(btrim(x.name)) = lower(btrim($2)) then 1 else 0 end
            + case when nullif(lower(btrim($3)), '''') is not null
                       and lower(btrim(coalesce(x.email, ''''))) = lower(btrim($3)) then 1 else 0 end
            + case when nullif(regexp_replace($4, ''\D'', '''', ''g''), '''') is not null
                       and regexp_replace(coalesce(x.phone, ''''), ''\D'', '''', ''g'')
                           = regexp_replace($4, ''\D'', '''', ''g'') then 1 else 0 end
          ) >= 2
     )',
    p_entity_key
  ) into v_match using p_id, v_row.name, v_row.email, v_row.phone;

  if v_match then
    raise exception 'active_duplicate_exists' using errcode = '23505';
  end if;

  perform set_config(
    'app.contribution_ctx',
    jsonb_build_object(
      'action', 'reactivated',
      'source', 'manual',
      'note', btrim(p_reason)
    )::text,
    true
  );

  execute format(
    'update public.%I
        set deleted_at = null
      where id = $1 and deleted_at is not null and merged_into_id is null',
    p_entity_key
  ) using p_id;
  get diagnostics v_rows = row_count;

  -- 조회와 UPDATE 사이에 다른 관리자가 먼저 복구한 경우도 성공으로 가장하지 않는다.
  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
end $$;

comment on function public.restore_entity(text, uuid, text) is
  'ADMIN 전용 STARTUP·NETWORKS soft-delete 복구. 활성 중복·병합 행·필수값 누락을 차단하고 reactivated 기여 이력을 같은 트랜잭션에 남긴다.';

revoke all on function public.restore_entity(text, uuid, text) from public;
revoke all on function public.restore_entity(text, uuid, text) from anon;
grant execute on function public.restore_entity(text, uuid, text) to authenticated;
