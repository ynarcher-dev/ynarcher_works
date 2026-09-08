-- =====================================================================
-- [외부 포털 확장 4/N] 발급 창구가 세우는 계정을 원장으로 좁힌다
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §6
--
-- 2026-09-07에 이렇게 정했다:
--   "좁히는 것은 사업이지 계정이 아니다 — 목록에는 게스트 계정이 전부 서고 달라지는
--    것은 참여 사업 칸뿐이다. 계정은 대상마다 하나이고 사업을 가로질러 존재하므로,
--    사업 하나를 못 본다고 계정을 빼면 이미 있다는 사실이 숨겨져 같은 대상에 발급을
--    다시 시도하게 된다."
--
-- **M&A가 들어오면 그 근거가 성립하지 않는다.** AC 창구가 발급하는 대상은
-- startups·networks 행이고 M&A 창구는 ma_sellers·ma_buyers 행이라, 애초에 재시도가
-- 일어날 수 있는 같은 대상이 아니다(중복 발급은 issue_guest_account의 1번 분기가
-- 계속 막는다). 반면 계정을 전부 세우면 ma_sellers 인격이 AC 창구에 선다.
--
-- **인자를 대체하지 않고 더한다.** p_entity_key와 p_master_tables는 서로 다른
-- 질문에 답한다 — 저쪽은 참여 사업 칸이 어느 사업을 세는가이고, 이쪽은 어느 계정이
-- 목록에 서는가다. p_entity_key를 걷으면 AC 창구가 AC가 모르는 사업의 참여 줄을
-- 세우게 되어 그 화면이 어느 워크스페이스의 것인지 스스로 답하지 못한다.
--
-- **함수 본문은 20260907220000에서 그대로 떠 왔고 세 곳만 바뀐다**(시그니처, 인자
-- 검증, accounts CTE의 조건). 손으로 옮겨 적지 않은 이유는 본문이 130줄이고 OUT
-- 파라미터와 컬럼 이름이 겹쳐(#variable_conflict use_column) 한 줄이 어긋나면
-- 조용히 상수가 되기 때문이다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest
--   - 데이터 등급: Internal (계정 목록. 원본 연락처는 종전대로 ADMIN에게만 나간다)
--   - 접근 주체: 내부 사용자 전원(함수 첫머리 판정 무변경)
--   - Scope 기준: 이 인자는 **권한이 아니라 자리**를 좁힌다. 권한은 두 겹이 이미
--     건다 — guest_identities의 원장별 정책(20260908180000)과 invoker의 사업 원장 RLS.
--   - 감사 로그: 없음(조회)
--   - 운영 영향: 옛 4인자 시그니처를 먼저 drop하고 기본값을 가진 한 벌만 남긴다.
--     인자를 주지 않으면 종전과 같이 전부 센다(ADMIN 화면 무변경).
--   - SECURITY DEFINER 신설: 없음. 종전대로 INVOKER다.
-- =====================================================================

drop function if exists public.guest_accounts_list(text, integer, integer, text);

create or replace function public.guest_accounts_list(
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  -- null이면 전 워크스페이스(ADMIN). 'program'이면 AC 사업만 센다.
  p_entity_key text default null,
  -- 이 창구가 세울 계정을 원장으로 좁힌다. null이면 전부(ADMIN).
  -- p_entity_key와 다른 질문에 답한다 — 저쪽은 참여 사업 칸이 어느 사업을 세는가이고,
  -- 이쪽은 어느 계정이 목록에 서는가다. AC 창구에 ma_sellers 인격을 가진 계정이 서면
  -- 참여 사업 칸이 비어 있어도 그 사람 계정이 있다는 사실이 드러난다.
  p_master_tables text[] default null
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
  if p_master_tables is not null and exists (
    select 1 from unnest(p_master_tables) t
     where t not in ('startups', 'networks', 'ma_sellers', 'ma_buyers')
  ) then
    raise exception '알 수 없는 인격 원장이 섞여 있습니다.' using errcode = '22023';
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
       -- 이 창구의 원장으로 좁힌다. 이 조회도 guest_identities를 지나므로 원장별
       -- 정책(20260908180000)이 한 겹 더 걸린다 — 읽을 수 없는 원장의 인격은
       -- 애초에 보이지 않는다.
       and (
         p_master_tables is null
         or exists (
           select 1 from public.guest_identities gi
            where gi.user_id = u.id
              and gi.master_table = any (p_master_tables)
         )
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
