-- 게스트 계정 목록의 참여 사업 줄이 **사업 상태**를 함께 실어 온다(2026-09-07).
--
-- 무엇이 달라지는가:
--   `programs` jsonb의 원소에 `program_status` 한 칸이 붙는다. 값 자체는 사업 원장의
--   `status`(PROPOSED·SELECTED·DRAFT·OPERATING·FINISHED·CANCELLED …)를 그대로 옮긴 것이다.
--
-- 왜 필요한가:
--   "이 게스트가 이 사업에 지금 들어올 수 있는가"는 사업 상태·개방 상태·기간의 AND다.
--   참가자 명부(사업 상세)는 세 재료를 다 쥐고 있어 결론 한 칸(`loginBadge`)을 세우는데,
--   계정 목록은 사업 상태만 없어 같은 물음에 다르게 답했다 — 끝난 사업이 '이용 중'으로
--   보였다. 같은 사실을 두 화면이 다르게 말하면 어느 쪽이 사실인지 판정할 근거가 없다.
--   판정은 한 벌(`guestDoorBadge`)로 모으고, 여기서는 그 판정이 필요로 하는 재료를 채운다.
--
-- 왜 서버가 결론을 내지 않는가:
--   결론(라벨·톤·순서)은 화면의 어휘라 SQL이 문자열로 굳히면 두 곳(명부·계정 목록)이 같은
--   라벨을 각각 번역하게 된다. 서버는 재료를, 화면은 판정 한 벌을 갖는다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna (사업 원장 2종 · 참여 줄은 entity_key가 답한다)
--   - 데이터 등급: Internal — 사업 진행 상태이며 개인정보가 아니다.
--   - 접근 주체: 내부 사용자(게스트·비로그인은 함수 첫머리가 그대로 막는다)
--   - 신규 테이블·정책·Storage·RPC 없음. SECURITY INVOKER 그대로라 ledger CTE는 여전히
--     호출자의 RLS를 탄다 — 못 읽는 사업은 조인이 비어 목록에서 빠지고, 상태 한 칸이
--     새로 나가는 대상도 이미 그 사업을 읽을 수 있는 사용자뿐이다.
--   - 시그니처가 같아 `create or replace`다(드롭하지 않으므로 ACL·주석이 그대로 남는다 —
--     20260907190000이 드롭·재생성에서 겪은 자리다).
-- 근거: docs/docs_planning/3_9_1_guest_unified_account.md §11,
--       docs/docs_planning/3_4_4_ac_participant_pool.md
begin;

create or replace function public.guest_accounts_list(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  -- null이면 전 워크스페이스(ADMIN). 'program'이면 AC 사업만 센다.
  p_entity_key text default null
)
returns table(user_id uuid, name text, email text, phone text, user_type text, is_active boolean,
              company_name text, identities jsonb, has_password boolean, created_at timestamptz,
              last_login_at timestamptz, program_count integer, open_count integer,
              programs jsonb, total_count bigint)
language plpgsql stable set search_path = app, public as $fn$
#variable_conflict use_column
-- OUT 파라미터 이름이 조회 안의 컬럼과 겹친다. 아래는 전부 별칭으로 한정해 두었지만,
-- 한정을 빠뜨린 한 줄이 조용히 상수로 바뀌는 편이 더 나쁘다.
declare
  v_raw boolean := app.is_admin();
begin
  -- 없는 것과 못 보는 것이 같은 화면이 되지 않도록, 빈 목록이 아니라 사유로 답한다.
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception '내부 사용자만 게스트 계정 목록을 볼 수 있습니다.' using errcode = '42501';
  end if;
  -- 모르는 원장 키를 조용히 무시하면 '좁혔다고 생각했는데 전부 보이는' 화면이 된다.
  if p_entity_key is not null and p_entity_key not in ('program', 'ma_program') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;

  return query
  with ledger as (
    select 'program'::text as entity_key, id, code, title, status::text as status, guest_access_ends_at
      from public.programs    where deleted_at is null
    union all
    select 'ma_program', id, code, title, status::text, guest_access_ends_at
      from public.ma_programs where deleted_at is null
  ),
  accounts as (
    select u.id, u.name, u.email, u.phone, u.user_type::text as user_type, u.is_active,
           u.created_at, u.company_id
      from public.users u
     where app.is_guest_user_type(u.user_type)
       and u.deleted_at is null
       and (
         nullif(btrim(coalesce(p_search, '')), '') is null
         or u.name  ilike '%' || btrim(p_search) || '%'
         or u.email ilike '%' || btrim(p_search) || '%'
       )
  ),
  -- 참여 줄. 범위를 좁히는 자리는 여기 하나다 — 건수와 목록이 같은 조건에서 나와야
  -- "3건인데 두 줄만 보인다"가 생기지 않는다.
  --
  -- 닫힌 줄(미개방·차단)과 끝난 사업도 빼지 않는다. 담당자가 계정 하나를 열어 보는 이유는
  -- "지금 어디에 걸려 있나"만이 아니라 "그동안 어디에 걸렸었나"이기도 하다 — 걸러 내면
  -- 화면이 답할 수 있는 것이 현재뿐이 되고, 왜 안 들어와지는지를 묻는 문의에 답할 근거가
  -- 사라진다. 상태는 아래 `login_status`·`program_status`가 밝힌다.
  links as (
    select pp.user_id                                                     as user_id,
           count(*)::int                                                   as program_count,
           count(*) filter (where pp.login_status in ('INVITED', 'ACTIVE'))::int as open_count,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'program_id',     pp.program_id,
                 'entity_key',     pp.entity_key,
                 'workspace',      app.entity_key_workspace(pp.entity_key),
                 'code',           l.code,
                 'title',          l.title,
                 -- 이 줄의 자격. 같은 계정이 한 사업에 두 자격으로 걸리면 줄이 둘이다.
                 'master_table',   pp.master_table,
                 'login_status',   pp.login_status,
                 -- 사업이 끝났으면 문이 열려 있어도 게스트는 들어오지 못한다. 결론을 내는 것은
                 -- 화면이고 여기서는 그 판정의 재료를 넘긴다.
                 'program_status', l.status,
                 -- 기간은 사업이 갖는다. 같은 사업의 두 줄은 같은 값을 본다.
                 'access_ends_at', l.guest_access_ends_at
               )
               order by l.title
             ) filter (where l.id is not null),
             '[]'::jsonb
           ) as programs
      from public.program_participants pp
      left join ledger l on l.id = pp.program_id and l.entity_key = pp.entity_key
     where pp.user_id is not null
       and (p_entity_key is null or pp.entity_key = p_entity_key)
     group by pp.user_id
  ),
  logins as (
    select gi.app_user_id as user_id, max(gi.used_at) as last_login_at
      from public.guest_invitations gi
     where gi.app_user_id is not null
     group by gi.app_user_id
  ),
  -- 인격 목록. 유형(user_type)은 계정을 처음 세운 자격의 잔재라 이제 화면을 가르지 않는다 —
  -- 이 계정이 무엇으로 참여하는지는 여기가 답한다.
  personas as (
    select gi.user_id,
           jsonb_agg(
             jsonb_build_object(
               'master_table', gi.master_table,
               'master_id',    gi.master_id,
               'name',         coalesce(s.name, n.name)
             )
             order by gi.master_table
           ) as identities
      from public.guest_identities gi
      left join public.startups s on gi.master_table = 'startups' and s.id = gi.master_id
      left join public.networks n on gi.master_table = 'networks' and n.id = gi.master_id
     group by gi.user_id
  )
  select a.id,
         a.name,
         case when v_raw then a.email else app.mask_email(a.email) end,
         case when v_raw then a.phone else app.mask_phone(a.phone) end,
         a.user_type,
         a.is_active,
         s.name,
         coalesce(p.identities, '[]'::jsonb),
         -- 자격증명 표는 INVOKER가 닿지 못한다. 헬퍼가 불리언만 꺼내 온다.
         app.guest_has_password(a.id),
         a.created_at,
         g.last_login_at,
         coalesce(k.program_count, 0),
         coalesce(k.open_count, 0),
         coalesce(k.programs, '[]'::jsonb),
         count(*) over ()
    from accounts a
    left join links   k on k.user_id = a.id
    left join logins  g on g.user_id = a.id
    left join personas p on p.user_id = a.id
    left join public.startups s on s.id = a.company_id
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

commit;
