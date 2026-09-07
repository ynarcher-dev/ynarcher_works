-- 게스트 계정 목록이 볼 사업 범위를 호출자가 정한다(2026-09-07).
--
-- 같은 날 GUEST계정 발급 창구가 AC 사이드바로 (되)옮겨 갔다(사용자 지정). 자리를 옮기면서
-- **보는 범위도 함께 좁힌다** — AC 사이드바에 선 화면이 AC가 모르는 사업의 참여 줄을 함께
-- 세우면, 그 화면이 어느 워크스페이스의 것인지 스스로 답하지 못한다.
--
-- **좁히는 것은 사업이지 계정이 아니다.** 목록에는 게스트 계정이 전부 서고, 달라지는 것은
-- 그 계정의 **참여 사업 칸**(건수·열린 건수·사업 목록)이다. 계정은 대상마다 하나이고 사업을
-- 가로질러 존재하므로(3_9_1), 사업 하나를 못 본다고 계정을 목록에서 빼면 그 계정이 이미
-- 있다는 사실 자체가 숨겨져 담당자가 같은 대상에 발급을 다시 시도하게 된다.
--
-- **ADMIN은 좁히지 않는다.** 인자를 주지 않으면 종전과 같이 전 워크스페이스를 센다 —
-- ADMIN '게스트 계정 관리'가 소유한 축은 계정의 정지·해제이고, 그것은 계정 자체에 걸리는
-- 일이라 사업을 가려서는 안 된다. 한 계정이 두 워크스페이스에 걸렸을 때 한쪽만 보이면
-- 정지의 파급을 화면이 말해 주지 못한다.
--
-- 판정을 함수 안에 넣지 않고 **인자로 받는 이유**는 같은 화면이 자리마다 다른 범위를 갖기
-- 때문이다. 함수가 호출자의 워크스페이스를 스스로 알아내려면 화면이 어디에 서 있는지를
-- 서버가 추측해야 하는데, 그것은 서버가 알 수 없는 사실이다. 권한은 이 인자가 정하지
-- 않는다 — 좁히기만 할 뿐 넓히지 못하고, 내부 사용자 여부는 함수 첫머리가 그대로 막는다.
--
-- 보안 게이트: 새 테이블·정책·Storage 없음. INVOKER 그대로라 참가자·사업·계정 조회는
-- 여전히 호출자의 RLS를 탄다. 인자는 필터일 뿐 노출면을 넓히지 않으며(값이 있으면 조건이
-- 하나 더 붙는다), 연락처 마스킹 판정(`app.is_admin()`)도 손대지 않았다.

begin;

-- 인자를 하나 늘리는 것은 새 오버로드다 — 새 인자에 기본값이 있어 옛 3인자 호출이 두 함수
-- 모두에 들어맞아 42725로 죽는다. 옛 시그니처를 먼저 걷고, 함께 사라지는 실행 권한을
-- 아래에서 되돌린다.
drop function if exists public.guest_accounts_list(text, integer, integer);

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
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at
      from public.programs    where deleted_at is null
    union all
    select 'ma_program', id, code, title, guest_access_ends_at
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
         (c.password_hash is not null),
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
    left join public.guest_credentials c on c.user_id = a.id
    left join public.startups s on s.id = a.company_id
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

-- 드롭과 함께 사라진 실행 권한을 원래대로 되돌린다(옛 함수의 ACL과 같은 범위).
--
-- **`revoke ... from public`이 먼저다.** 새로 만든 함수는 PostgreSQL 기본값으로 `PUBLIC`에
-- EXECUTE가 붙는데, 옛 함수의 ACL에는 그 항목이 없었다(어느 시점에 명시적으로 걷힌 상태였다).
-- 걷지 않으면 드롭·재생성이 **권한을 조용히 넓히는 일**이 된다 — 함수 본문을 한 줄도 안
-- 고쳤는데 실행할 수 있는 역할이 늘어나고, 그 사실은 diff에 나타나지 않는다.
revoke execute on function public.guest_accounts_list(text, integer, integer, text) from public;
grant execute on function public.guest_accounts_list(text, integer, integer, text)
  to anon, authenticated, service_role;

-- 주석도 드롭과 함께 사라진다. 되돌리되 새 인자의 뜻을 한 줄 더한다.
comment on function public.guest_accounts_list(text, integer, integer, text) is
  '전사 게스트 계정 목록. 내부 사용자 전원이 조회하되 연락처 원본은 ADMIN에게만 나간다(서버 마스킹). AC 발급 창구와 ADMIN 콘솔이 같은 함수를 쓴다 — 나누면 한쪽만 고쳐 어긋난다. p_entity_key는 **참여 사업 칸**이 볼 범위이며(계정 목록 자체는 좁혀지지 않는다) null이면 전 워크스페이스다. 근거: 3_9_1 §11.1~§11.2';

-- 같은 실수를 바로 앞 마이그레이션(20260907180000)에서 이미 저질렀다 — `network_facet_counts`를
-- 드롭·재생성하면서 원래 명시적으로 걷어 두었던 `public`·`anon`의 EXECUTE가 기본 권한으로
-- 되살아났고(20260905210000의 `revoke all ... from public, anon`), 주석도 함께 사라졌다.
-- **드롭·재생성은 함수 본문만 바꾸는 일이 아니다** — 권한과 주석이 조용히 초기값으로 돌아가고,
-- 그 사실은 diff 어디에도 나타나지 않는다. 여기서 둘 다 되돌린다.
revoke execute on function public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer, boolean)
  from public, anon;

comment on function public.network_facet_counts(
  text, text, text[], boolean, uuid[], uuid[], boolean, boolean, text[], text, integer, integer, boolean) is
  'NETWORKS 목록 요약 카드(구분·권역) 집계. 목록 RPC(my_/all_network_entities)를 그대로 호출해 묶으므로 필터 판정이 목록과 어긋나지 않는다. 각 축은 자기 조건을 빼고 세어 타일이 필터로 동작한다 — 권역 축은 자기 조건에 p_regions와 p_country_unset(미지정 칸)이 함께 든다. 구분·권역이 비어 있는 행의 키는 ''UNSET''. SECURITY INVOKER — public.networks의 RLS를 그대로 따른다.';

commit;
