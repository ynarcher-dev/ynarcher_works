-- =====================================================================
-- 비활성 원장 콘솔 — 조회·복구를 7종 원장으로 넓히고 funds 특례를 거둔다
--
-- 소유 워크스페이스: admin(조작) + startup/networks/project/mna/fund(원장)
-- 데이터 등급: Internal / 접근 주체: 내부 super_admin / Scope: global
--
-- 배경. 20260911045056은 비활성 원장 조회·복구를 STARTUP·NETWORKS 둘에만 열었고,
-- 20260911105139은 일괄 비활성화만 7종으로 넓히면서 funds 한 종에 직접 UPDATE 특례를 두었다.
-- 그 결과 (1) 사업·딜·거래상대·조합은 비활성으로 내려가면 다시 찾을 공식 창구가 없고,
-- (2) funds만 비활성화 사유가 entity_contributions.note에 남지 않는다.
--
-- 이 마이그레이션이 정하는 것.
--   · deactivate_entities의 funds 특례를 제거한다. 7종 모두 deactivate_entity를 거치므로
--     기여 트리거가 같은 트랜잭션에서 사유를 기록한다. funds에는 2026-07-24부터
--     trg_funds_contribution이 붙어 있어 app.has_contribution_trigger('funds')가 참이다.
--   · admin_inactive_ledger_entities와 restore_entity/restore_entities를 7종으로 넓힌다.
--   · 영구 삭제 RPC 네 개(admin_entity_delete_blockers·admin_entities_delete_blockers·
--     admin_hard_delete_entity·admin_hard_delete_entities)를 7종으로 넓히고, 기능 표
--     (admin_ledger_console_capabilities.can_hard_delete)도 7종 모두 참으로 연다.
--   · 업무 워크스페이스 원장의 비활성화 게이트에 ADMIN 예외를 둔다(아래 (0)).
--   · UI가 원장별로 무엇이 가능한지 추측하지 않도록 admin_ledger_console_capabilities가
--     명시적 boolean을 돌려준다.
--
-- 기여 로그 키(entity_contributions.entity_table)는 테이블명과 다르다. 현재 트리거 인자를
-- 그대로 따른다: startups→'startups', networks→'networks', programs→'program',
-- ma_programs→'ma_program', ma_buyers→'ma_buyers', ma_sellers→'ma_sellers', funds→'fund'.
--
-- SECURITY 특성. 조회·복구 본체는 SECURITY INVOKER를 유지해 원장 RLS가 판정한다.
-- 예외는 M&A 당사자 둘뿐이다 — ma_buyers/ma_sellers의 SELECT 정책은 app.can_read_ma_party()
-- 를 거치고 그 함수가 `deleted_at is null`을 요구하므로, 최고관리자도 비활성 행을 읽지
-- 못한다. 조회조차 되지 않는 행은 복구도 할 수 없어 기능이 조용히 비어 버린다. 그래서
-- 그 둘만 app 스키마의 좁은 SECURITY DEFINER 헬퍼 두 개를 경유하고, 헬퍼는 각각 자기 안에서
-- app.is_admin()을 다시 강제하며 자기 테이블 말고는 아무것도 건드리지 않는다.
--
-- 영구 삭제 blocker를 세운 근거.
--   programs·ma_programs·funds를 가리키는 직접 FK는 대부분 `on delete cascade`이고
--   (application_submissions·fund_lps·investments·capital_calls·program_managers 등),
--   그 위에 (entity_key, program_id) 다형 원장 열 벌 남짓이 FK 없이 붙어 있다. blocker를
--   한 칸이라도 빠뜨리면 삭제가 거절되는 대신 업무 자료가 조용히 cascade로 사라진다.
--   그래서 blocker 목록은 **FK가 cascade든 아니든 업무·공용 기록이면 전부 막는 쪽**으로
--   세운다. 카탈로그에서 뽑은 직접 FK 의존 표와 다형 참조를 원장별로 아래 (8)에 적었고,
--   기존 startups·networks blocker 집합은 한 칸도 줄이지 않는다.
--   모듈 하위 표(program_module_assignees·program_module_public_links)는 부모
--   program_modules 행이 이미 막으므로 따로 세지 않는다 — 부모 없이 존재할 수 없다.
--
-- 다형 어휘(원장 → target_type / master_table / 기여 키 / 감사 워크스페이스).
--   startups    → startup    / startups    / startups    / startup
--   networks    → network    / networks    / networks    / networks
--   programs    → program    / —           / program     / project
--   ma_programs → ma_program / —           / ma_program  / mna
--   ma_buyers   → ma_buyer   / ma_buyers   / ma_buyers   / mna
--   ma_sellers  → ma_seller  / ma_sellers  / ma_sellers  / mna
--   funds       → fund       / —           / fund        / fund
-- =====================================================================

-- ---------------------------------------------------------------------
-- (0) 생성자 전용 비활성화 게이트에 ADMIN 예외를 둔다.
--     20260911105139이 세운 트리거 다섯(programs·ma_programs·ma_buyers·ma_sellers·funds)은
--     그대로 두고 함수 본문만 바꾼다. 최고관리자는 생성자가 아니어도 활성→비활성 전이를
--     할 수 있고, 그 밖의 사용자에게는 기존 생성자 검사가 한 칸도 느슨해지지 않는다.
-- ---------------------------------------------------------------------
create or replace function app.guard_workspace_creator_deactivation()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
begin
  if old.deleted_at is null
     and new.deleted_at is not null
     and not app.is_admin()
     and old.created_by is distinct from app.current_app_user_id()
  then
    raise exception 'creator_required' using errcode = '42501';
  end if;

  return new;
end $$;

comment on function app.guard_workspace_creator_deactivation() is
  '업무 워크스페이스 원장의 활성→비활성 전이는 생성자에게 허용하며, 최고관리자(app.is_admin())는 생성자가 아니어도 허용한다. 그 밖의 사용자에게는 생성자 검사가 그대로 적용되고 목록·상세·직접 UPDATE에 동일하게 걸린다.';

revoke all on function app.guard_workspace_creator_deactivation() from public;
revoke all on function app.guard_workspace_creator_deactivation() from anon;
revoke all on function app.guard_workspace_creator_deactivation() from authenticated;

-- ---------------------------------------------------------------------
-- (1) M&A 당사자 전용 좁은 DEFINER 헬퍼 — 비활성 행 조회
-- ---------------------------------------------------------------------
create or replace function app.admin_inactive_ma_party_page(
  p_entity_key text,
  p_keyword    text,
  p_limit      integer,
  p_offset     integer
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
security definer
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

  if p_entity_key = 'ma_buyers' then
    return query
    select b.id,
           b.name,
           nullif(b.industries->>0, ''),
           b.contact_name,
           b.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.ma_buyers b
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'ma_buyers'
           and c.entity_id = b.id
           and c.action = 'deactivated'
         order by c.created_at desc, c.id desc
         limit 1
      ) d on true
     where b.deleted_at is not null
       and b.merged_into_id is null
       and (
         v_keyword is null
         or b.name ilike '%' || v_keyword || '%'
         or coalesce(b.contact_name, '') ilike '%' || v_keyword || '%'
       )
     order by b.deleted_at desc, b.name, b.id
     limit v_limit offset v_offset;
  elsif p_entity_key = 'ma_sellers' then
    return query
    select s.id,
           s.name,
           nullif(s.industries->>0, ''),
           s.contact_name,
           s.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.ma_sellers s
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'ma_sellers'
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
         or coalesce(s.contact_name, '') ilike '%' || v_keyword || '%'
       )
     order by s.deleted_at desc, s.name, s.id
     limit v_limit offset v_offset;
  else
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
end $$;

comment on function app.admin_inactive_ma_party_page(text, text, integer, integer) is
  'M&A BUYER·SELLER 비활성 행 조회 전용 DEFINER 헬퍼. can_read_ma_party()가 비활성 행을 최고관리자에게도 가리므로 이 한 곳에서만 우회하며, 내부에서 app.is_admin()을 다시 강제한다.';

revoke all on function app.admin_inactive_ma_party_page(text, text, integer, integer) from public;
revoke all on function app.admin_inactive_ma_party_page(text, text, integer, integer) from anon;
grant execute on function app.admin_inactive_ma_party_page(text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- (2) M&A 당사자 전용 좁은 DEFINER 헬퍼 — 비활성 행 복구
--     사유는 contribution_ctx로 넘겨 기존 기여 트리거가 reactivated 이력을 남기게 한다.
-- ---------------------------------------------------------------------
create or replace function app.admin_restore_ma_party(
  p_entity_key text,
  p_id         uuid,
  p_reason     text
)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_rows integer;
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in ('ma_buyers', 'ma_sellers') then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
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

  return v_rows;
end $$;

comment on function app.admin_restore_ma_party(text, uuid, text) is
  'M&A BUYER·SELLER 비활성 행 복구 전용 DEFINER 헬퍼. 자기 테이블의 deleted_at만 되돌리고 병합 원본은 건드리지 않는다.';

revoke all on function app.admin_restore_ma_party(text, uuid, text) from public;
revoke all on function app.admin_restore_ma_party(text, uuid, text) from anon;
grant execute on function app.admin_restore_ma_party(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (3) 비활성 원장 목록 — 7종 명시 분기
--     merged_into_id가 없는 원장(programs·ma_programs·funds)에서는 그 칸을 참조하지 않는다.
-- ---------------------------------------------------------------------
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

  elsif p_entity_key = 'programs' then
    -- programs에는 merged_into_id가 없다. 병합 조건을 넣지 않는다.
    return query
    select p.id,
           p.title,
           p.category,
           p.host_organization,
           p.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.programs p
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'program'
           and c.entity_id = p.id
           and c.action = 'deactivated'
         order by c.created_at desc, c.id desc
         limit 1
      ) d on true
     where p.deleted_at is not null
       and (
         v_keyword is null
         or p.title ilike '%' || v_keyword || '%'
         or coalesce(p.code, '') ilike '%' || v_keyword || '%'
         or coalesce(p.host_organization, '') ilike '%' || v_keyword || '%'
       )
     order by p.deleted_at desc, p.title, p.id
     limit v_limit offset v_offset;

  elsif p_entity_key = 'ma_programs' then
    return query
    select m.id,
           m.title,
           m.category,
           m.host_organization,
           m.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.ma_programs m
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'ma_program'
           and c.entity_id = m.id
           and c.action = 'deactivated'
         order by c.created_at desc, c.id desc
         limit 1
      ) d on true
     where m.deleted_at is not null
       and (
         v_keyword is null
         or m.title ilike '%' || v_keyword || '%'
         or coalesce(m.code, '') ilike '%' || v_keyword || '%'
         or coalesce(m.host_organization, '') ilike '%' || v_keyword || '%'
       )
     order by m.deleted_at desc, m.title, m.id
     limit v_limit offset v_offset;

  elsif p_entity_key in ('ma_buyers', 'ma_sellers') then
    return query
    select h.entity_id,
           h.entity_name,
           h.category,
           h.detail,
           h.deleted_at,
           h.deactivated_by,
           h.deactivation_reason,
           h.total_count
      from app.admin_inactive_ma_party_page(p_entity_key, v_keyword, v_limit, v_offset) h;

  elsif p_entity_key = 'funds' then
    return query
    select f.id,
           f.name,
           f.status::text,
           f.code,
           f.deleted_at,
           d.user_name,
           d.note,
           count(*) over()
      from public.funds f
      left join lateral (
        select c.user_name, c.note
          from public.entity_contributions c
         where c.entity_table = 'fund'
           and c.entity_id = f.id
           and c.action = 'deactivated'
         order by c.created_at desc, c.id desc
         limit 1
      ) d on true
     where f.deleted_at is not null
       and (
         v_keyword is null
         or f.name ilike '%' || v_keyword || '%'
         or coalesce(f.code, '') ilike '%' || v_keyword || '%'
       )
     order by f.deleted_at desc, f.name, f.id
     limit v_limit offset v_offset;

  else
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
end $$;

comment on function public.admin_inactive_ledger_entities(text, text, integer, integer) is
  'ADMIN 전용 비활성 원장 목록. 7종(startups·networks·programs·ma_programs·ma_buyers·ma_sellers·funds)을 같은 표시 계약으로 페이지 조회한다. 기여 이력 키는 각 원장의 현재 트리거 인자를 따른다.';

revoke all on function public.admin_inactive_ledger_entities(text, text, integer, integer) from public;
revoke all on function public.admin_inactive_ledger_entities(text, text, integer, integer) from anon;
grant execute on function public.admin_inactive_ledger_entities(text, text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- (4) 단건 복구 — 7종
--     STARTUP·NETWORKS의 활성 중복 차단과 NETWORKS 필수값 검사는 그대로 둔다.
--     나머지 다섯은 자기 테이블의 deleted_at만 되돌린다.
-- ---------------------------------------------------------------------
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
  v_rows   integer;
  v_row    record;
  v_match  boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
  ) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if v_reason = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  -- M&A 당사자는 SELECT 정책이 비활성 행을 가리므로 좁은 DEFINER 헬퍼 한 곳으로만 간다.
  if p_entity_key in ('ma_buyers', 'ma_sellers') then
    if app.admin_restore_ma_party(p_entity_key, p_id, v_reason) = 0 then
      raise exception 'not_found_or_forbidden' using errcode = '42501';
    end if;
    return;
  end if;

  if p_entity_key in ('startups', 'networks') then
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
  end if;

  perform set_config(
    'app.contribution_ctx',
    jsonb_build_object(
      'action', 'reactivated',
      'source', 'manual',
      'note', v_reason
    )::text,
    true
  );

  if p_entity_key in ('startups', 'networks') then
    execute format(
      'update public.%I
          set deleted_at = null
        where id = $1 and deleted_at is not null and merged_into_id is null',
      p_entity_key
    ) using p_id;
  else
    -- programs·ma_programs·funds에는 merged_into_id 칸이 없다.
    execute format(
      'update public.%I
          set deleted_at = null
        where id = $1 and deleted_at is not null',
      p_entity_key
    ) using p_id;
  end if;
  get diagnostics v_rows = row_count;

  -- 조회와 UPDATE 사이에 다른 관리자가 먼저 복구한 경우도 성공으로 가장하지 않는다.
  if v_rows = 0 then
    raise exception 'not_found_or_forbidden' using errcode = '42501';
  end if;
end $$;

comment on function public.restore_entity(text, uuid, text) is
  'ADMIN 전용 7종 원장 soft-delete 복구. STARTUP·NETWORKS는 활성 중복·병합 행·필수값 누락을 그대로 차단하고, 나머지는 자기 테이블의 deleted_at만 되돌린다. reactivated 기여 이력을 같은 트랜잭션에 남긴다.';

revoke all on function public.restore_entity(text, uuid, text) from public;
revoke all on function public.restore_entity(text, uuid, text) from anon;
grant execute on function public.restore_entity(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (5) 다중 복구 — 허용 목록만 7종으로 넓힌다. 검증은 단건 함수가 그대로 소유한다.
-- ---------------------------------------------------------------------
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
  if p_entity_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
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
    perform public.restore_entity(p_entity_key, v_id, btrim(p_reason));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.restore_entities(text, uuid[], text) is
  'ADMIN 비활성 원장 선택 행을 한 트랜잭션에서 복구한다(7종). 한 행이라도 단건 복구 검증에 실패하면 전체 롤백.';

revoke all on function public.restore_entities(text, uuid[], text) from public;
revoke all on function public.restore_entities(text, uuid[], text) from anon;
grant execute on function public.restore_entities(text, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------
-- (6) 일괄 비활성화 — funds 직접 UPDATE 특례 제거
--     7종 모두 deactivate_entity를 거치므로 기여 트리거가 사유를 note에 남긴다.
-- ---------------------------------------------------------------------
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

  -- 원장별 예외를 두지 않는다. 사유가 남지 않는 경로가 하나라도 있으면 비활성 목록의
  -- '누가·왜' 칸이 그 원장에서만 비어 버린다.
  for v_id in select distinct x from unnest(p_ids) as x
  loop
    perform public.deactivate_entity(p_entity_key, v_id, btrim(p_reason));
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

comment on function public.deactivate_entities(text, uuid[], text) is
  '데이터 센터와 업무 워크스페이스 목록의 선택 행을 한 트랜잭션에서 비활성화한다(7종). 전부 deactivate_entity를 거쳐 원장별 RLS·생성자 트리거·기여 이력 사유를 그대로 통과한다.';

revoke all on function public.deactivate_entities(text, uuid[], text) from public;
revoke all on function public.deactivate_entities(text, uuid[], text) from anon;
grant execute on function public.deactivate_entities(text, uuid[], text) to authenticated;

-- 단건 비활성화 RPC의 권한도 여기서 명시적으로 다시 못박는다(기존 정의는 바꾸지 않는다).
revoke all on function public.deactivate_entity(text, uuid, text) from public;
revoke all on function public.deactivate_entity(text, uuid, text) from anon;
grant execute on function public.deactivate_entity(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (7) 원장별 콘솔 기능 표 — UI가 추측하지 않도록 명시적 boolean으로 답한다.
--     7종 모두 can_hard_delete=true이며 unsupported_note는 비어 있다.
--     can_hard_delete=false인 원장이 생기면 UI는 그 원장의 영구 삭제 경로를 감춘다.
-- ---------------------------------------------------------------------
create or replace function public.admin_ledger_console_capabilities(
  p_entity_key text default null
)
returns table (
  entity_key        text,
  can_list          boolean,
  can_restore       boolean,
  can_hard_delete   boolean,
  unsupported_note  text
)
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_key text := nullif(btrim(p_entity_key), '');
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if v_key is not null and v_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
  ) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;

  return query
  select c.entity_key, c.can_list, c.can_restore, c.can_hard_delete, c.unsupported_note
    from (values
      ('startups'::text,    true, true, true, null::text),
      ('networks'::text,    true, true, true, null::text),
      ('programs'::text,    true, true, true, null::text),
      ('ma_programs'::text, true, true, true, null::text),
      ('ma_buyers'::text,   true, true, true, null::text),
      ('ma_sellers'::text,  true, true, true, null::text),
      ('funds'::text,       true, true, true, null::text)
    ) as c(entity_key, can_list, can_restore, can_hard_delete, unsupported_note)
   where v_key is null or c.entity_key = v_key
   order by c.entity_key;
end $$;

comment on function public.admin_ledger_console_capabilities(text) is
  'ADMIN 비활성 원장 콘솔이 원장별로 무엇을 할 수 있는지 답하는 표. 조회·복구·영구 삭제 모두 7종 원장에서 참이며 미지원 사유는 없다.';

revoke all on function public.admin_ledger_console_capabilities(text) from public;
revoke all on function public.admin_ledger_console_capabilities(text) from anon;
grant execute on function public.admin_ledger_console_capabilities(text) to authenticated;

-- ---------------------------------------------------------------------
-- (8) 영구 삭제 blocker — 7종 명시 분기
--     같은 UUID가 다른 워크스페이스의 다형 원장에 떠 있을 수 있으므로, program_id를 쓰는
--     표는 entity_key를 반드시 함께 건다. entity_key 칸이 없는 program_notices는 부모
--     모듈(program_modules.entity_key)로 소속을 가린다.
-- ---------------------------------------------------------------------
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

  elsif p_entity_key = 'programs' then
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('applications'::text, '지원양식·지원서'::text,
          ((select count(*) from public.application_forms where program_id = p_id)
           + (select count(*) from public.application_submissions where program_id = p_id))),
        ('staffing'::text, '담당자·부서 배치'::text,
          ((select count(*) from public.program_departments where program_id = p_id)
           + (select count(*) from public.program_managers where program_id = p_id))),
        ('timeline'::text, '일정·일정 충돌'::text,
          ((select count(*) from public.program_timeline_items where program_id = p_id)
           + (select count(*) from public.timeline_conflicts where program_id = p_id))),
        ('modules'::text, '모듈·본문'::text,
          ((select count(*) from public.program_modules
             where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_posts
               where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_links
               where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_overviews
               where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_announcements
               where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_questions
               where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_notices n
               where n.program_id = p_id
                 and exists (select 1 from public.program_modules m
                              where m.id = n.program_module_id and m.entity_key = 'program')))),
        ('participants'::text, '참가자 명부'::text,
          ((select count(*) from public.program_participants
             where program_id = p_id and entity_key = 'program')
           + (select count(*) from public.program_participant_entries
               where program_id = p_id and entity_key = 'program'))),
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          (select count(*) from public.guest_invitations
            where target_type = 'program' and target_id = p_id)),
        ('exports'::text, '내보내기 작업'::text,
          (select count(*) from public.export_jobs where program_id = p_id)),
        ('kpi_snapshots'::text, 'KPI 스냅샷'::text,
          (select count(*) from public.module_kpi_snapshots where program_id = p_id)),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'program' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'program' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'program' and target_id = p_id)),
        ('approvals'::text, '전자결재 연결'::text,
          (select count(*) from public.approval_program_links where target_type = 'program' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;

  elsif p_entity_key = 'ma_programs' then
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('staffing'::text, '담당자·부서 배치'::text,
          ((select count(*) from public.ma_program_departments where program_id = p_id)
           + (select count(*) from public.ma_program_managers where program_id = p_id))),
        ('timeline'::text, '일정'::text,
          (select count(*) from public.ma_program_timeline_items where program_id = p_id)),
        ('party_links'::text, '거래상대 연결'::text,
          (select count(*) from public.ma_program_party_links where program_id = p_id)),
        ('modules'::text, '모듈·본문'::text,
          ((select count(*) from public.program_modules
             where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_posts
               where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_links
               where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_overviews
               where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_announcements
               where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_questions
               where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_notices n
               where n.program_id = p_id
                 and exists (select 1 from public.program_modules m
                              where m.id = n.program_module_id and m.entity_key = 'ma_program')))),
        ('participants'::text, '참가자 명부'::text,
          ((select count(*) from public.program_participants
             where program_id = p_id and entity_key = 'ma_program')
           + (select count(*) from public.program_participant_entries
               where program_id = p_id and entity_key = 'ma_program'))),
        ('retired_modules'::text, '퇴역 모듈 원장'::text,
          ((select count(*) from public._retired_ma_program_links where program_id = p_id)
           + (select count(*) from public._retired_ma_program_modules where program_id = p_id)
           + (select count(*) from public._retired_ma_program_participants where program_id = p_id)
           + (select count(*) from public._retired_ma_program_posts where program_id = p_id))),
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          (select count(*) from public.guest_invitations
            where target_type = 'ma_program' and target_id = p_id)),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'ma_program' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'ma_program' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'ma_program' and target_id = p_id)),
        ('approvals'::text, '전자결재 연결'::text,
          (select count(*) from public.approval_program_links where target_type = 'ma_program' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;

  elsif p_entity_key = 'funds' then
    -- approval_program_links는 CHECK가 program·ma_program만 받으므로 조합에는 오지 않는다.
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('fund_lps'::text, '조합원(LP)'::text,
          (select count(*) from public.fund_lps where fund_id = p_id)),
        ('capital_calls'::text, '캐피탈콜·납입'::text,
          ((select count(*) from public.capital_calls where fund_id = p_id)
           + (select count(*) from public.capital_call_payments where fund_id = p_id))),
        ('investments'::text, '투자 이력·투자목적'::text,
          ((select count(*) from public.investments where fund_id = p_id)
           + (select count(*) from public.investment_purposes where fund_id = p_id))),
        ('fund_purposes'::text, '결성목적'::text,
          (select count(*) from public.fund_purposes where fund_id = p_id)),
        ('managers'::text, '담당자'::text,
          (select count(*) from public.fund_managers where fund_id = p_id)),
        ('content'::text, '사업개요·공지·Q&A'::text,
          ((select count(*) from public.program_overviews
             where program_id = p_id and entity_key = 'fund')
           + (select count(*) from public.program_announcements
               where program_id = p_id and entity_key = 'fund')
           + (select count(*) from public.program_questions
               where program_id = p_id and entity_key = 'fund'))),
        ('participants'::text, '참가자 명부'::text,
          (select count(*) from public.program_participants
            where program_id = p_id and entity_key = 'fund')),
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          (select count(*) from public.guest_invitations
            where target_type = 'fund' and target_id = p_id)),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'fund' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'fund' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'fund' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;

  elsif p_entity_key = 'ma_buyers' then
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('program_links'::text, 'M&A 사업 연결'::text,
          (select count(*) from public.ma_program_party_links where buyer_id = p_id)),
        ('merged_rows'::text, '병합 원본'::text,
          (select count(*) from public.ma_buyers where merged_into_id = p_id)),
        ('participants'::text, '참가자 명부'::text,
          ((select count(*) from public.program_participants
             where master_table = 'ma_buyers' and master_id = p_id)
           + (select count(*) from public.program_participant_entries
               where master_table = 'ma_buyers' and master_id = p_id))),
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          ((select count(*) from public.guest_identities
             where master_table = 'ma_buyers' and master_id = p_id)
           + (select count(*) from public.guest_invitations
               where target_type = 'ma_buyer' and target_id = p_id))),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'ma_buyer' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'ma_buyer' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'ma_buyer' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;

  elsif p_entity_key = 'ma_sellers' then
    return query
    select b.blocker_key, b.blocker_label, b.row_count
      from (values
        ('program_links'::text, 'M&A 사업 연결'::text,
          (select count(*) from public.ma_program_party_links where seller_id = p_id)),
        ('merged_rows'::text, '병합 원본'::text,
          (select count(*) from public.ma_sellers where merged_into_id = p_id)),
        ('participants'::text, '참가자 명부'::text,
          ((select count(*) from public.program_participants
             where master_table = 'ma_sellers' and master_id = p_id)
           + (select count(*) from public.program_participant_entries
               where master_table = 'ma_sellers' and master_id = p_id))),
        ('guest_accounts'::text, '게스트 초대·계정'::text,
          ((select count(*) from public.guest_identities
             where master_table = 'ma_sellers' and master_id = p_id)
           + (select count(*) from public.guest_invitations
               where target_type = 'ma_seller' and target_id = p_id))),
        ('attachments'::text, '첨부 자료'::text,
          (select count(*) from public.attachments where target_type = 'ma_seller' and target_id = p_id)),
        ('feedback'::text, '피드백'::text,
          (select count(*) from public.entity_feedback where target_type = 'ma_seller' and target_id = p_id)),
        ('minutes'::text, '회의록 연결'::text,
          (select count(*) from public.meeting_minute_links where target_type = 'ma_seller' and target_id = p_id))
      ) as b(blocker_key, blocker_label, row_count)
     where b.row_count > 0;

  else
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
end $$;

comment on function public.admin_entity_delete_blockers(text, uuid) is
  'ADMIN 비활성 원장 영구 삭제를 막는 업무 연결과 자료 건수(7종). FK가 on delete cascade여도 업무·공용 기록이면 전부 막는다 — 거절 대신 조용한 cascade가 가장 나쁜 실패다. program_id를 쓰는 다형 표는 entity_key를 함께 걸어 워크스페이스가 섞이지 않게 하고, 모듈 하위 표는 부모 program_modules 행이 대신 막는다. 삭제 RPC가 같은 함수를 다시 판정한다.';

revoke all on function public.admin_entity_delete_blockers(text, uuid) from public;
revoke all on function public.admin_entity_delete_blockers(text, uuid) from anon;
grant execute on function public.admin_entity_delete_blockers(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (9) 다중 blocker 합계 — 허용 목록만 7종으로 넓힌다. 판정은 단건 함수가 소유한다.
-- ---------------------------------------------------------------------
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
  if p_entity_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
  ) then
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
  'ADMIN 다중 영구 삭제 확인용 연결 데이터 합계(7종, 최대 100건). 삭제 RPC는 각 행의 단건 blocker를 다시 판정한다.';

revoke all on function public.admin_entities_delete_blockers(text, uuid[]) from public;
revoke all on function public.admin_entities_delete_blockers(text, uuid[]) from anon;
grant execute on function public.admin_entities_delete_blockers(text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- (10) 단건 영구 삭제 — 7종 명시 분기
--      식별자를 동적 SQL로 만들지 않는다. 원장마다 표 이름·이름 칸·병합 조건·다형 어휘가
--      다르므로 한 분기에서 전부 확정하고, 그 분기 밖에서는 어떤 이름도 새로 만들지 않는다.
--      지우는 것은 파생·내부 기록(notifications·entity_codes·entity_contributions와
--      STARTUP의 startup_managers)과 본체뿐이다. 업무 자료는 위 blocker가 0건일 때만 온다.
-- ---------------------------------------------------------------------
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
  v_target     text;  -- attachments·notifications 등 다형 target_type
  v_contrib    text;  -- entity_contributions.entity_table (표 이름과 다르다)
  v_workspace  text;  -- audit_logs.changed_workspace
  v_rows       integer;
begin
  if not app.is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_entity_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
  ) then
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if btrim(coalesce(p_confirm_text, ''), E' .\t\r\n') <> '삭제합니다' then
    raise exception 'confirm_text_mismatch' using errcode = '22023';
  end if;

  -- 비활성 행만 온다. 병합 칸이 있는 넷은 병합 원본도 함께 거른다.
  if p_entity_key = 'startups' then
    select s.name, s.deleted_at into v_name, v_deleted_at
      from public.startups s
     where s.id = p_id and s.deleted_at is not null and s.merged_into_id is null;
    v_target := 'startup'; v_contrib := 'startups'; v_workspace := 'startup';

  elsif p_entity_key = 'networks' then
    select n.name, n.deleted_at into v_name, v_deleted_at
      from public.networks n
     where n.id = p_id and n.deleted_at is not null and n.merged_into_id is null;
    v_target := 'network'; v_contrib := 'networks'; v_workspace := 'networks';

  elsif p_entity_key = 'programs' then
    select p.title, p.deleted_at into v_name, v_deleted_at
      from public.programs p
     where p.id = p_id and p.deleted_at is not null;
    v_target := 'program'; v_contrib := 'program'; v_workspace := 'project';

  elsif p_entity_key = 'ma_programs' then
    select m.title, m.deleted_at into v_name, v_deleted_at
      from public.ma_programs m
     where m.id = p_id and m.deleted_at is not null;
    v_target := 'ma_program'; v_contrib := 'ma_program'; v_workspace := 'mna';

  elsif p_entity_key = 'ma_buyers' then
    select b.name, b.deleted_at into v_name, v_deleted_at
      from public.ma_buyers b
     where b.id = p_id and b.deleted_at is not null and b.merged_into_id is null;
    v_target := 'ma_buyer'; v_contrib := 'ma_buyers'; v_workspace := 'mna';

  elsif p_entity_key = 'ma_sellers' then
    select s.name, s.deleted_at into v_name, v_deleted_at
      from public.ma_sellers s
     where s.id = p_id and s.deleted_at is not null and s.merged_into_id is null;
    v_target := 'ma_seller'; v_contrib := 'ma_sellers'; v_workspace := 'mna';

  elsif p_entity_key = 'funds' then
    select f.name, f.deleted_at into v_name, v_deleted_at
      from public.funds f
     where f.id = p_id and f.deleted_at is not null;
    v_target := 'fund'; v_contrib := 'fund'; v_workspace := 'fund';

  else
    -- 위 허용 목록과 이 분기 둘 다 통과해야 한다. 한쪽만 열려도 삭제는 일어나지 않는다.
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;

  -- 일곱 원장 모두 이름 칸이 NOT NULL이므로 null은 "그런 비활성 행이 없다"는 뜻이다.
  if v_name is null then
    raise exception 'inactive_entity_not_found' using errcode = '02000';
  end if;

  select string_agg(b.blocker_label || ' ' || b.row_count || '건', ', ')
    into v_blockers
    from public.admin_entity_delete_blockers(p_entity_key, p_id) b;
  if v_blockers is not null then
    raise exception 'dependent_records_exist: %', v_blockers using errcode = '23001';
  end if;

  -- 되돌릴 수 없는 작업이라 지우기 전에 남긴다.
  insert into public.audit_logs (
    actor_user_id, action, changed_workspace, before_data, reason
  ) values (
    app.current_app_user_id(),
    'LEDGER_HARD_DELETE',
    v_workspace,
    jsonb_build_object(
      'entity_key', p_entity_key,
      'entity_id', p_id,
      'entity_name', v_name,
      'deleted_at', v_deleted_at
    ),
    btrim(p_reason)
  );

  -- 파생·내부 기록만 본체와 함께 제거한다.
  -- entity_codes는 발급 트리거가 붙은 셋(programs·ma_programs·funds)에만 행이 있고
  -- 레지스트리 키가 표 이름이다. 나머지 넷에서는 0건이라 조건만 두고 지나간다.
  if p_entity_key = 'startups' then
    delete from public.startup_managers where startup_id = p_id;
  end if;

  delete from public.notifications where target_type = v_target and target_id = p_id;
  delete from public.entity_codes where entity_table = p_entity_key and entity_id = p_id;
  delete from public.entity_contributions where entity_table = v_contrib and entity_id = p_id;

  if p_entity_key = 'startups' then
    delete from public.startups
     where id = p_id and deleted_at is not null and merged_into_id is null;
  elsif p_entity_key = 'networks' then
    delete from public.networks
     where id = p_id and deleted_at is not null and merged_into_id is null;
  elsif p_entity_key = 'programs' then
    delete from public.programs where id = p_id and deleted_at is not null;
  elsif p_entity_key = 'ma_programs' then
    delete from public.ma_programs where id = p_id and deleted_at is not null;
  elsif p_entity_key = 'ma_buyers' then
    delete from public.ma_buyers
     where id = p_id and deleted_at is not null and merged_into_id is null;
  elsif p_entity_key = 'ma_sellers' then
    delete from public.ma_sellers
     where id = p_id and deleted_at is not null and merged_into_id is null;
  elsif p_entity_key = 'funds' then
    delete from public.funds where id = p_id and deleted_at is not null;
  else
    raise exception 'unsupported_entity' using errcode = '22023';
  end if;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'inactive_entity_not_found' using errcode = '02000';
  end if;
end $$;

comment on function public.admin_hard_delete_entity(text, uuid, text, text) is
  'ADMIN 전용 7종 원장 비활성 행 물리 삭제. 확인 문구 "삭제합니다"·사유·blocker 0건을 강제하고 지우기 전에 audit_logs(LEDGER_HARD_DELETE)를 원장의 워크스페이스로 남긴다. 지우는 것은 파생·내부 기록(notifications·entity_codes·entity_contributions, STARTUP은 startup_managers까지)과 본체뿐이며 업무 자료는 blocker가 대신 막는다. 표 이름·이름 칸·병합 조건·다형 어휘는 7종 분기에서만 정해지고 동적 식별자를 만들지 않는다.';

revoke all on function public.admin_hard_delete_entity(text, uuid, text, text) from public;
revoke all on function public.admin_hard_delete_entity(text, uuid, text, text) from anon;
grant execute on function public.admin_hard_delete_entity(text, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- (11) 다중 영구 삭제 — 허용 목록만 7종으로 넓힌다.
--      확인 문구·사유·blocker·감사 로그는 단건 함수가 행마다 다시 판정하고, 함수 호출
--      한 번이 한 트랜잭션이므로 한 행이라도 막히면 전부 롤백된다.
-- ---------------------------------------------------------------------
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
  if p_entity_key not in (
    'startups', 'networks', 'programs', 'ma_programs', 'ma_buyers', 'ma_sellers', 'funds'
  ) then
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
  'ADMIN 비활성 원장 선택 행 물리 삭제(7종, 최대 100건). 단건 확인 문구·사유·blocker·감사 로그 규칙을 그대로 재사용하며 한 행이라도 실패하면 전체 롤백.';

revoke all on function public.admin_hard_delete_entities(text, uuid[], text, text) from public;
revoke all on function public.admin_hard_delete_entities(text, uuid[], text, text) from anon;
grant execute on function public.admin_hard_delete_entities(text, uuid[], text, text) to authenticated;
