-- =====================================================================
-- M&A 기밀 경계
--   1) M&A 프로젝트는 최고관리자 또는 해당 프로젝트 PM·MEMBER만 열람한다.
--   2) BUYER·SELLER 원장은 작성자 외에 명시한 열람자만 내용을 읽는다.
--      M&A 워크스페이스 열람자는 목록에서 비공개 행의 존재와 시각만 알 수 있다.
--
-- 데이터 등급: Restricted / Scope: ma_program 및 ma_party 단건
-- 최고관리자(super_admin)는 app.is_admin()으로 두 경계를 모두 통과한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) BUYER·SELLER 열람자
-- ---------------------------------------------------------------------
alter table public.ma_buyers
  add column if not exists viewer_ids uuid[] not null default '{}'::uuid[];
alter table public.ma_sellers
  add column if not exists viewer_ids uuid[] not null default '{}'::uuid[];

comment on column public.ma_buyers.viewer_ids is
  '본문 열람이 허용된 내부 임직원. 작성자는 created_by로 별도 보유하며 배열에 중복 저장하지 않는다.';
comment on column public.ma_sellers.viewer_ids is
  '본문 열람이 허용된 내부 임직원. 작성자는 created_by로 별도 보유하며 배열에 중복 저장하지 않는다.';

create index if not exists idx_ma_buyers_viewer_ids
  on public.ma_buyers using gin (viewer_ids);
create index if not exists idx_ma_sellers_viewer_ids
  on public.ma_sellers using gin (viewer_ids);

-- 열람자는 살아 있는 내부 임직원이면서 M&A 워크스페이스를 읽을 수 있어야 한다.
-- 작성자는 created_by가 답하므로 배열에서 제거하고, 중복·NULL도 저장 전에 정규화한다.
create or replace function app.validate_ma_party_viewers()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_bad uuid;
begin
  select coalesce(array_agg(x order by x), '{}'::uuid[])
    into new.viewer_ids
    from (
      select distinct id as x
        from unnest(coalesce(new.viewer_ids, '{}'::uuid[])) id
       where id is not null
         and id is distinct from new.created_by
    ) normalized;

  select ids.id
    into v_bad
    from unnest(new.viewer_ids) ids(id)
    left join public.users u
      on u.id = ids.id
     and u.deleted_at is null
     and u.is_active
     and not app.is_guest_user_type(u.user_type)
   where u.id is null
      or (
        u.user_type::text <> 'super_admin'
        and not exists (
          select 1
            from public.workspace_permissions wp
           where wp.user_id = u.id
             and wp.workspace_key::text = 'mna'
             and wp.permission_level in ('read', 'write')
             and (wp.expires_at is null or wp.expires_at > now())
        )
      )
   limit 1;

  if v_bad is not null then
    raise exception 'M&A 열람 권한이 없는 사용자는 열람자로 지정할 수 없습니다: %', v_bad
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

revoke all on function app.validate_ma_party_viewers() from public, anon, authenticated;

drop trigger if exists trg_ma_buyers_validate_viewers on public.ma_buyers;
create trigger trg_ma_buyers_validate_viewers
  before insert or update of viewer_ids, created_by on public.ma_buyers
  for each row execute function app.validate_ma_party_viewers();

drop trigger if exists trg_ma_sellers_validate_viewers on public.ma_sellers;
create trigger trg_ma_sellers_validate_viewers
  before insert or update of viewer_ids, created_by on public.ma_sellers
  for each row execute function app.validate_ma_party_viewers();

-- 한 건의 실제 내용을 읽을 수 있는가. SECURITY DEFINER는 RLS 재귀를 피하기 위한 것이며,
-- 호출자 신원은 app.current_app_user_id()에서만 읽고 대상 종류도 두 값으로 고정한다.
create or replace function app.can_read_ma_party(p_target_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case p_target_type
    when 'ma_buyer' then exists (
      select 1
        from public.ma_buyers x
       where x.id = p_id
         and x.deleted_at is null
         and (
           app.is_admin()
           or (
             app.can_read_workspace('mna')
             and (
               x.created_by = app.current_app_user_id()
               or app.current_app_user_id() = any (x.viewer_ids)
             )
           )
         )
    )
    when 'ma_seller' then exists (
      select 1
        from public.ma_sellers x
       where x.id = p_id
         and x.deleted_at is null
         and (
           app.is_admin()
           or (
             app.can_read_workspace('mna')
             and (
               x.created_by = app.current_app_user_id()
               or app.current_app_user_id() = any (x.viewer_ids)
             )
           )
         )
    )
    else false
  end;
$fn$;

create or replace function app.can_manage_ma_party(p_target_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select app.is_admin() or (
    app.can_write_workspace('mna')
    and case p_target_type
      when 'ma_buyer' then exists (
        select 1 from public.ma_buyers x
         where x.id = p_id and x.deleted_at is null
           and x.created_by = app.current_app_user_id()
      )
      when 'ma_seller' then exists (
        select 1 from public.ma_sellers x
         where x.id = p_id and x.deleted_at is null
           and x.created_by = app.current_app_user_id()
      )
      else false
    end
  );
$fn$;

revoke all on function app.can_read_ma_party(text, uuid) from public, anon;
revoke all on function app.can_manage_ma_party(text, uuid) from public, anon;
grant execute on function app.can_read_ma_party(text, uuid) to authenticated;
grant execute on function app.can_manage_ma_party(text, uuid) to authenticated;

comment on function app.can_read_ma_party(text, uuid) is
  'M&A BUYER·SELLER 본문 열람 판정: 최고관리자 또는 M&A 권한이 있는 작성자·명시 열람자.';
comment on function app.can_manage_ma_party(text, uuid) is
  'M&A BUYER·SELLER 수정 판정: 최고관리자 또는 M&A 쓰기 권한이 있는 작성자.';

-- 열람자 선택창 역시 저장 트리거와 같은 모집단을 쓴다. 화면에서 전 임직원을 보여 준 뒤 저장할
-- 때 거절하면 누구를 고를 수 있는지 사용자가 추측해야 하므로 서버가 후보 자체를 좁혀 답한다.
create or replace function public.ma_party_viewer_candidates()
returns table(id uuid, name text, email text)
language plpgsql
stable
security definer
set search_path = app, public
as $fn$
begin
  if app.is_guest() or not app.can_write_workspace('mna') then
    raise exception 'M&A 열람자를 지정할 권한이 없습니다.' using errcode = '42501';
  end if;

  return query
  select u.id, u.name, u.email
    from public.users u
   where u.deleted_at is null
     and u.is_active
     and not app.is_guest_user_type(u.user_type)
     and (
       u.user_type::text = 'super_admin'
       or exists (
         select 1
           from public.workspace_permissions wp
          where wp.user_id = u.id
            and wp.workspace_key::text = 'mna'
            and wp.permission_level in ('read', 'write')
            and (wp.expires_at is null or wp.expires_at > now())
       )
     )
   order by u.name, u.id;
end;
$fn$;

revoke all on function public.ma_party_viewer_candidates() from public, anon;
grant execute on function public.ma_party_viewer_candidates() to authenticated;

-- 원장 본체는 내용이므로 작성자·열람자·최고관리자에게만 SELECT를 허용한다.
drop policy if exists ma_buyers_select on public.ma_buyers;
create policy ma_buyers_select on public.ma_buyers for select to authenticated
  using (app.can_read_ma_party('ma_buyer', id));
drop policy if exists ma_buyers_insert on public.ma_buyers;
create policy ma_buyers_insert on public.ma_buyers for insert to authenticated
  with check (
    app.can_write_workspace('mna')
    and created_by = app.current_app_user_id()
  );
drop policy if exists ma_buyers_update on public.ma_buyers;
create policy ma_buyers_update on public.ma_buyers for update to authenticated
  using (app.can_manage_ma_party('ma_buyer', id))
  with check (
    app.is_admin()
    or (
      app.can_write_workspace('mna')
      and created_by = app.current_app_user_id()
    )
  );

drop policy if exists ma_sellers_select on public.ma_sellers;
create policy ma_sellers_select on public.ma_sellers for select to authenticated
  using (app.can_read_ma_party('ma_seller', id));
drop policy if exists ma_sellers_insert on public.ma_sellers;
create policy ma_sellers_insert on public.ma_sellers for insert to authenticated
  with check (
    app.can_write_workspace('mna')
    and created_by = app.current_app_user_id()
  );
drop policy if exists ma_sellers_update on public.ma_sellers;
create policy ma_sellers_update on public.ma_sellers for update to authenticated
  using (app.can_manage_ma_party('ma_seller', id))
  with check (
    app.is_admin()
    or (
      app.can_write_workspace('mna')
      and created_by = app.current_app_user_id()
    )
  );

-- 목록 전용 안전 투영. 권한 없는 행은 id·등록/수정 시각과 잠금 문구만 반환한다.
-- 검색어나 진행여부로 비공개 본문을 추측하지 못하도록 잠긴 행은 기본 목록에서만 포함한다.
create or replace function public.ma_party_posts_list(
  p_target_type text,
  p_keyword text default null,
  p_decisions text[] default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public
as $fn$
declare
  v_result jsonb;
begin
  if app.current_app_user_id() is null
     or app.is_guest()
     or not app.can_read_workspace('mna') then
    raise exception 'M&A 목록 열람 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_target_type not in ('ma_buyer', 'ma_seller') then
    raise exception '지원하지 않는 M&A 게시글 종류입니다: %', p_target_type
      using errcode = '22023';
  end if;

  with source as (
    select 'ma_buyer'::text as target_type,
           x.id, x.name, x.industries, x.wish, x.available_funds,
           null::text as decision, x.contact_name, x.contact_email, x.phone,
           x.startup_id, x.created_at, x.updated_at, x.created_by, x.viewer_ids,
           u.name as creator_name,
           app.can_read_ma_party('ma_buyer', x.id) as can_read
      from public.ma_buyers x
      left join public.users u on u.id = x.created_by
     where p_target_type = 'ma_buyer'
       and x.deleted_at is null
    union all
    select 'ma_seller'::text,
           x.id, x.name, x.industries, x.wish, x.available_funds,
           x.decision::text, x.contact_name, x.contact_email, x.phone,
           x.startup_id, x.created_at, x.updated_at, x.created_by, x.viewer_ids,
           u.name,
           app.can_read_ma_party('ma_seller', x.id)
      from public.ma_sellers x
      left join public.users u on u.id = x.created_by
     where p_target_type = 'ma_seller'
       and x.deleted_at is null
  ), filtered as (
    select *
      from source s
     where (
       s.can_read
       and (
         nullif(btrim(coalesce(p_keyword, '')), '') is null
         or s.name ilike '%' || btrim(p_keyword) || '%'
         or coalesce(s.wish, '') ilike '%' || btrim(p_keyword) || '%'
       )
       and (
         coalesce(cardinality(p_decisions), 0) = 0
         or (s.decision is null and '__unset__' = any (p_decisions))
         or s.decision = any (p_decisions)
       )
     )
     or (
       not s.can_read
       and nullif(btrim(coalesce(p_keyword, '')), '') is null
       and coalesce(cardinality(p_decisions), 0) = 0
     )
  ), page as (
    select *
      from filtered
     order by updated_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', case when can_read then name else '열람 권한이 없는 게시글' end,
          'industries', case when can_read then industries else '[]'::jsonb end,
          'wish', case when can_read then wish end,
          'available_funds', case when can_read then available_funds end,
          'decision', case when can_read then decision end,
          'contact_name', case when can_read then contact_name end,
          'contact_email', case when can_read then contact_email end,
          'phone', case when can_read then phone end,
          'startup_id', case when can_read then startup_id end,
          'created_at', created_at,
          'updated_at', updated_at,
          'created_by', case when can_read then created_by end,
          'viewer_ids', case when can_read then to_jsonb(viewer_ids) else '[]'::jsonb end,
          'creator_name', case when can_read then creator_name end,
          'can_read', can_read
        ) order by updated_at desc
      ) from page
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'totalAll', (select count(*) from source)
  ) into v_result;

  return v_result;
end;
$fn$;

revoke all on function public.ma_party_posts_list(text, text, text[], integer, integer)
  from public, anon;
grant execute on function public.ma_party_posts_list(text, text, text[], integer, integer)
  to authenticated;

comment on function public.ma_party_posts_list(text, text, text[], integer, integer) is
  'M&A BUYER·SELLER 목록의 안전 투영. 작성자·열람자·최고관리자는 내용 요약을, 그 밖의 M&A 열람자는 존재와 시각만 본다.';

-- 대시보드의 전사 누적도 목록의 '존재 공개'와 같은 답을 내야 한다. 본문 RLS를 우회하는 대신
-- 반환값을 건수 두 개로 고정하고, M&A 내부 사용자만 실행할 수 있게 함수 첫머리에서 막는다.
create or replace function public.ma_party_ledger_counts(p_table text)
returns table(mine bigint, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if app.current_app_user_id() is null
     or app.is_guest()
     or not app.can_read_workspace('mna') then
    raise exception 'M&A 원장 건수 조회 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_table not in ('ma_sellers', 'ma_buyers') then
    raise exception '지원하지 않는 M&A 원장입니다.' using errcode = '22023';
  end if;

  return query execute format(
    $sql$
      select
        count(*) filter (
          where p.created_by = app.current_app_user_id()
             or exists (
               select 1
                 from public.entity_contributions c
                where c.entity_table = %L
                  and c.entity_id = p.id
                  and c.user_id = app.current_app_user_id()
             )
        )::bigint as mine,
        count(*)::bigint as total
      from public.%I p
      where p.deleted_at is null
        and p.merged_into_id is null
    $sql$,
    p_table,
    p_table
  );
end;
$fn$;

revoke all on function public.ma_party_ledger_counts(text) from public, anon;
grant execute on function public.ma_party_ledger_counts(text) to authenticated;

-- AI 초안 생성은 열람자가 아니라 작성자·최고관리자만 실행한다.
create or replace function public.can_write_ma_seller(p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = app, public
as $fn$
  select app.can_manage_ma_party('ma_seller', p_id);
$fn$;

revoke all on function public.can_write_ma_seller(uuid) from public, anon;
grant execute on function public.can_write_ma_seller(uuid) to authenticated;

-- 다형 패널도 원장 본문과 같은 경계를 따른다.
drop policy if exists entity_contributions_select on public.entity_contributions;
create policy entity_contributions_select on public.entity_contributions for select to authenticated
  using (
    case
      when entity_table = 'ma_buyers' then app.can_read_ma_party('ma_buyer', entity_id)
      when entity_table = 'ma_sellers' then app.can_read_ma_party('ma_seller', entity_id)
      when app.entity_key_workspace_scoped(entity_table)
        then app.can_read_workspace(app.entity_key_workspace(entity_table))
      when app.entity_key_workspace(entity_table) = 'fund'
        then app.can_read_workspace('fund') and app.can_access_fund(entity_id)
      else
        app.can_read_workspace(app.entity_key_workspace(entity_table))
        and app.can_access_ws_program(app.entity_key_workspace(entity_table), entity_id)
    end
  );

drop policy if exists entity_contributions_insert on public.entity_contributions;
create policy entity_contributions_insert on public.entity_contributions for insert to authenticated
  with check (
    (
      case
        when entity_table = 'ma_buyers' then app.can_manage_ma_party('ma_buyer', entity_id)
        when entity_table = 'ma_sellers' then app.can_manage_ma_party('ma_seller', entity_id)
        when app.entity_key_workspace_scoped(entity_table)
          then app.can_write_workspace(app.entity_key_workspace(entity_table))
        when app.entity_key_workspace(entity_table) = 'fund'
          then app.can_write_workspace('fund') and app.can_access_fund(entity_id)
        else
          app.can_write_workspace(app.entity_key_workspace(entity_table))
          and app.can_access_ws_program(app.entity_key_workspace(entity_table), entity_id)
      end
    )
    and (user_id is null or user_id = app.current_app_user_id())
  );

drop policy if exists entity_feedback_select on public.entity_feedback;
create policy entity_feedback_select on public.entity_feedback for select to authenticated
  using (
    case
      when target_type = 'approval' then app.can_read_approval(target_id)
      when target_type = 'board_post' then app.can_read_board_post(target_id)
      when target_type = 'office_minute' then app.can_read_minute(target_id)
      when target_type = 'ma_buyer' then app.can_read_ma_party('ma_buyer', target_id)
      when target_type = 'ma_seller' then app.can_read_ma_party('ma_seller', target_id)
      when app.entity_key_workspace_scoped(target_type)
        then app.can_read_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_read_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_read_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

drop policy if exists entity_feedback_insert on public.entity_feedback;
create policy entity_feedback_insert on public.entity_feedback for insert to authenticated
  with check (
    case
      when target_type = 'approval' then app.can_read_approval(target_id)
      when target_type = 'board_post' then app.can_read_board_post(target_id)
      when target_type = 'office_minute' then app.can_read_minute(target_id)
      when target_type = 'ma_buyer' then app.can_read_ma_party('ma_buyer', target_id)
      when target_type = 'ma_seller' then app.can_read_ma_party('ma_seller', target_id)
      when app.entity_key_workspace_scoped(target_type)
        then app.can_write_workspace(app.entity_key_workspace(target_type))
      when app.entity_key_workspace(target_type) = 'fund'
        then app.can_write_workspace('fund') and app.can_access_fund(target_id)
      else
        app.can_write_workspace(app.entity_key_workspace(target_type))
        and app.can_access_ws_program(app.entity_key_workspace(target_type), target_id)
    end
  );

-- 첨부 메타·다운로드도 같은 판정을 통과해야 한다. Storage SELECT는 이미 폐쇄되어 있고,
-- material-download가 이 SELECT 정책을 호출자 JWT로 재검증한다.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
  using (
    app.is_admin()
    or (
      app.current_app_user_id() is not null
      and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest')
      and (
        case
          when target_type = 'ma_buyer' then app.can_read_ma_party('ma_buyer', target_id)
          when target_type = 'ma_seller' then app.can_read_ma_party('ma_seller', target_id)
          else true
        end
      )
      and (
        target_type not in ('office_minute', 'office_minute_voice')
        or app.can_read_minute(target_id)
      )
      and (target_type <> 'approval' or app.can_read_approval(target_id))
    )
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert to authenticated
  with check (
    uploaded_by = app.current_app_user_id()
    and app.current_app_user_id() is not null
    and (
      case
        when target_type = 'ma_buyer' then app.can_manage_ma_party('ma_buyer', target_id)
        when target_type = 'ma_seller' then app.can_manage_ma_party('ma_seller', target_id)
        else true
      end
    )
    and (
      target_type not in ('office_minute', 'office_minute_voice')
      or app.is_minute_author(target_id)
    )
    and (target_type <> 'approval' or app.is_approval_drafter(target_id))
  );

drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments for update to authenticated
  using (
    case
      when target_type = 'ma_buyer' then app.can_manage_ma_party('ma_buyer', target_id)
      when target_type = 'ma_seller' then app.can_manage_ma_party('ma_seller', target_id)
      else app.is_admin() or uploaded_by = app.current_app_user_id()
    end
  )
  with check (
    case
      when target_type = 'ma_buyer' then app.can_manage_ma_party('ma_buyer', target_id)
      when target_type = 'ma_seller' then app.can_manage_ma_party('ma_seller', target_id)
      else app.is_admin() or uploaded_by = app.current_app_user_id()
    end
  );

-- 회의록/결재에서 M&A 원장을 연결할 때도 실제 본문 열람 권한을 요구한다.
create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x where x.id = p_target_id and x.deleted_at is null)
    when 'network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.networks x where x.id = p_target_id and x.deleted_at is null and x.merged_into_id is null)
    when 'ma_buyer' then app.can_read_ma_party('ma_buyer', p_target_id)
    when 'ma_seller' then app.can_read_ma_party('ma_seller', p_target_id)
    else false
  end;
$fn$;

revoke all on function app.can_link_entity_target(text, uuid) from public, anon;
grant execute on function app.can_link_entity_target(text, uuid) to authenticated;

-- 프로젝트에 연결하는 행도 호출자가 실제로 읽을 수 있는 게시글만 받는다. 피커 RLS만 믿으면
-- UUID를 직접 넣은 RPC 호출이 비공개 게시글의 유효성 검사 통로가 될 수 있다.
create or replace function app.validate_ma_program_party_link_access()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $fn$
begin
  if new.buyer_id is not null
     and not app.can_read_ma_party('ma_buyer', new.buyer_id) then
    raise exception '열람할 수 없는 M&A BUYER 게시글은 프로젝트에 연결할 수 없습니다.'
      using errcode = '42501';
  end if;
  if new.seller_id is not null
     and not app.can_read_ma_party('ma_seller', new.seller_id) then
    raise exception '열람할 수 없는 M&A SELLER 게시글은 프로젝트에 연결할 수 없습니다.'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

revoke all on function app.validate_ma_program_party_link_access()
  from public, anon, authenticated;

drop trigger if exists trg_ma_program_party_links_validate_access
  on public.ma_program_party_links;
create trigger trg_ma_program_party_links_validate_access
  before insert or update of buyer_id, seller_id on public.ma_program_party_links
  for each row execute function app.validate_ma_program_party_link_access();

-- ---------------------------------------------------------------------
-- (2) M&A 프로젝트: 최고관리자 또는 PM·MEMBER만
-- ---------------------------------------------------------------------
create or replace function app.can_access_ws_program(ws_key text, target_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $fn$
  select case
    when ws_key = 'mna' then
      app.is_admin()
      or (
        app.can_read_workspace('mna')
        and (
          exists (
            select 1
              from public.ma_program_managers pm
             where pm.program_id = target_program_id
               and pm.user_id = app.current_app_user_id()
               and pm.role in ('PM', 'MEMBER')
          )
          -- 등록과 담당자 저장이 두 요청인 현재 흐름을 위한 짧은 부트스트랩 권한.
          -- 담당자가 한 명이라도 생기면 생성자는 명단에 없는 한 즉시 접근을 잃는다.
          or exists (
            select 1
              from public.ma_programs p
             where p.id = target_program_id
               and p.created_by = app.current_app_user_id()
               and not exists (
                 select 1 from public.ma_program_managers pm
                  where pm.program_id = p.id
               )
          )
        )
      )
    else
      app.is_admin()
      or app.get_scope_type(ws_key) = 'global'
      or (
        app.get_scope_type(ws_key) in ('program', 'project', 'fund')
        and app.get_scope_id(ws_key) = target_program_id
      )
  end;
$fn$;

revoke all on function app.can_access_ws_program(text, uuid) from public, anon;
grant execute on function app.can_access_ws_program(text, uuid) to authenticated;

comment on function app.can_access_ws_program(text, uuid) is
  '단건 사업 접근. M&A는 최고관리자 또는 해당 프로젝트 PM·MEMBER만, 다른 워크스페이스는 기존 global/단건 scope 규칙을 따른다.';

-- 신규 M&A 프로젝트는 아직 담당자 행이 없으므로 생성자에게 INSERT만 허용한다.
-- 저장 직후 set_ma_program_staffing이 PM·MEMBER 명단을 만들면 이후 모든 조회는 위 헬퍼가 판정한다.
drop policy if exists ma_programs_insert on public.ma_programs;
create policy ma_programs_insert on public.ma_programs for insert to authenticated
  with check (
    app.can_write_workspace('mna')
    and created_by = app.current_app_user_id()
  );
