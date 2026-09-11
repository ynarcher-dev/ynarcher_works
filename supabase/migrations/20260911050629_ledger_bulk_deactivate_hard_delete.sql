-- =====================================================================
-- 공용 DB 일괄 비활성화 + ADMIN 비활성 원장 영구 삭제
--
-- deactivate_entities는 기존 deactivate_entity를 한 트랜잭션에서 반복해 원장별 RLS와
-- 기여 이력 규칙을 그대로 쓴다. 영구 삭제는 DELETE 정책을 넓히지 않고 ADMIN RPC 한 곳에만
-- 열며, 되돌릴 수 없는 작업이므로 확인 문구·사유·연결 데이터 0건을 모두 요구한다.
-- =====================================================================

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
begin
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
    perform public.deactivate_entity(p_entity_key, v_id, btrim(p_reason));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.deactivate_entities(text, uuid[], text) is
  'STARTUP·NETWORKS 선택 행을 한 트랜잭션에서 일괄 비활성화한다. 기존 단건 RPC를 재사용해 RLS와 기여 이력 규칙을 보존한다.';

revoke all on function public.deactivate_entities(text, uuid[], text) from public;
revoke all on function public.deactivate_entities(text, uuid[], text) from anon;
grant execute on function public.deactivate_entities(text, uuid[], text) to authenticated;

create or replace function public.admin_entity_delete_blockers(
  p_entity_key text,
  p_id         uuid
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

  if p_entity_key = 'startups' then
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('applications'::text, '지원서'::text,
          (select count(*) from public.application_submissions where startup_id = p_id)),
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          (select count(*) from public.guest_invitations
            where company_id = p_id or (target_type = 'startup' and target_id = p_id))),
        ('investments'::text, '투자 이력'::text,
          (select count(*) from public.investments where startup_id = p_id)),
        ('ma_links'::text, 'M&A 연결'::text,
          ((select count(*) from public.ma_buyers where startup_id = p_id)
           + (select count(*) from public.ma_sellers where startup_id = p_id)
           + (select count(*) from public.ma_deals where target_company_id = p_id)
           + (select count(*) from public.ma_match_candidates
               where buyer_company_id = p_id or seller_company_id = p_id))),
        ('guest_users'::text, '연결 계정'::text,
          (select count(*) from public.users where company_id = p_id)),
        ('merged_rows'::text, '병합 원본'::text,
          (select count(*) from public.startups where merged_into_id = p_id)),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'startup' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'startup' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'startup' and target_id = p_id)),
        ('approvals'::text, '전자결재 연결'::text,
          (select count(*) from public.approval_program_links where target_type = 'startup' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;
  elsif p_entity_key = 'networks' then
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('merged_rows'::text, '병합 원본'::text,
          (select count(*) from public.networks where merged_into_id = p_id)),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'network' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'network' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'network' and target_id = p_id)),
        ('approvals'::text, '전자결재 연결'::text,
          (select count(*) from public.approval_program_links where target_type = 'network' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;
  else
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
end $$;

comment on function public.admin_entity_delete_blockers(text, uuid) is
  'ADMIN 비활성 원장 영구 삭제를 막는 업무 연결과 자료 건수. 삭제 RPC가 같은 함수를 다시 판정한다.';

revoke all on function public.admin_entity_delete_blockers(text, uuid) from public;
revoke all on function public.admin_entity_delete_blockers(text, uuid) from anon;
grant execute on function public.admin_entity_delete_blockers(text, uuid) to authenticated;

create or replace function public.admin_hard_delete_entity(
  p_entity_key   text,
  p_id           uuid,
  p_reason       text,
  p_confirm_text text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_name       text;
  v_deleted_at timestamptz;
  v_blockers   text;
  v_target     text;
  v_rows       integer;
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
  if btrim(coalesce(p_confirm_text, ''), E' .\t\r\n') <> '삭제합니다' then
    raise exception 'confirm_text_mismatch' using errcode = '22023';
  end if;

  execute format(
    'select name, deleted_at from public.%I
      where id = $1 and deleted_at is not null and merged_into_id is null',
    p_entity_key
  ) into v_name, v_deleted_at using p_id;

  if v_name is null then
    raise exception 'inactive_entity_not_found' using errcode = '02000';
  end if;

  select string_agg(b.blocker_label || ' ' || b.row_count || '건', ', ')
    into v_blockers
    from public.admin_entity_delete_blockers(p_entity_key, p_id) b;
  if v_blockers is not null then
    raise exception 'dependent_records_exist: %', v_blockers using errcode = '23001';
  end if;

  insert into public.audit_logs (
    actor_user_id, action, changed_workspace, before_data, reason
  ) values (
    app.current_app_user_id(),
    'LEDGER_HARD_DELETE',
    case when p_entity_key = 'startups' then 'startup' else 'networks' end,
    jsonb_build_object(
      'entity_key', p_entity_key,
      'entity_id', p_id,
      'entity_name', v_name,
      'deleted_at', v_deleted_at
    ),
    btrim(p_reason)
  );

  -- 내부 보조 행은 본체와 함께 제거한다. 업무 사실·첨부·외부 연결은 위 blocker가 0건일 때만 온다.
  if p_entity_key = 'startups' then
    delete from public.startup_managers where startup_id = p_id;
    v_target := 'startup';
  else
    v_target := 'network';
  end if;

  delete from public.notifications where target_type = v_target and target_id = p_id;
  delete from public.entity_codes where entity_table = p_entity_key and entity_id = p_id;
  delete from public.entity_contributions where entity_table = p_entity_key and entity_id = p_id;

  execute format('delete from public.%I where id = $1 and deleted_at is not null', p_entity_key)
    using p_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'inactive_entity_not_found' using errcode = '02000';
  end if;
end $$;

comment on function public.admin_hard_delete_entity(text, uuid, text, text) is
  'ADMIN 전용 STARTUP·NETWORKS 비활성 행 물리 삭제. 확인 문구·사유·업무 연결 0건을 강제하고 audit_logs를 남긴다.';

revoke all on function public.admin_hard_delete_entity(text, uuid, text, text) from public;
revoke all on function public.admin_hard_delete_entity(text, uuid, text, text) from anon;
grant execute on function public.admin_hard_delete_entity(text, uuid, text, text) to authenticated;
