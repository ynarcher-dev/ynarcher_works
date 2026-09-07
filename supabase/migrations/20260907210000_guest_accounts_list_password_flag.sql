-- 게스트 계정 목록이 자격증명 표를 직접 읽지 않는다(2026-09-07).
--
-- `guest_accounts_list`는 INVOKER인데 본문이 `public.guest_credentials`를 조인했다. 그 표는
-- 2026-09-05에 `revoke all ... from anon, authenticated`로 **테이블 권한 자체를** 걷어 둔
-- 원장이라(정책 0건의 Default Deny 위에 권한까지 없다), 호출자가 `authenticated`인 순간
-- `permission denied for table guest_credentials`(42501)로 죽는다. PostgREST가 이 SQLSTATE를
-- 403으로 내보내 화면에서는 '권한이 없다'로 보였다 — AC 'GUEST계정 발급'과 ADMIN·OFFICE의
-- '게스트 계정 관리'가 2026-09-05 계정 통합 이래 한 번도 열리지 않았다.
--
-- **RLS로 막힌 표와 권한으로 막힌 표는 INVOKER 함수 안에서 다르게 실패한다.** 정책이 없어
-- 0행이면 함수는 그냥 빈 값을 얻지만(왼쪽 조인이라 `has_password`가 false가 될 뿐이다),
-- 테이블 권한이 없으면 조회 자체가 예외로 죽는다. 이 표는 뒤쪽이라 조용히 틀린 값이 아니라
-- 아예 열리지 않는 화면이 됐고, 그래서 표면이 '403'이었다.
--
-- **고치는 방향은 표를 여는 것이 아니라 파생값만 꺼내 오는 것이다.** `authenticated`에
-- SELECT를 주면 정책이 없어 어차피 0행이라 `has_password`가 전원 false로 조용히 거짓을
-- 말하고(열리기는 하되 틀린 화면이다), 정책을 하나 만들면 해시가 사는 표에 내부 사용자용
-- 조회 경로가 생긴다. 목록이 실제로 필요한 것은 **해시가 아니라 있고 없음 한 칸**이므로,
-- 그 불리언만 답하는 DEFINER 헬퍼를 두고 표는 계속 `service_role`만 닿게 남긴다.
--
-- DEFINER를 쓰는 것이 '정책을 함수 안에 복제하지 말라'는 규칙과 어긋나지 않는다 — 그 규칙은
-- 복제할 정책이 있는 원장의 이야기이고, 여기서 우회하는 대상은 정책이 아니라 **아무에게도
-- 열리지 않기로 한 표**다. 나가는 값도 행이 아니라 불리언 하나다.
--
-- 보안 게이트: 새 테이블·Storage·정책 없음. 새 함수 1종(DEFINER)은 `app` 스키마라
-- PostgREST에 노출되지 않고(밖에서 직접 부르는 경로가 없다), `search_path`를 고정했으며,
-- `public`에서 실행 권한을 걷고 `authenticated`에만 준다(INVOKER 목록 함수가 그 역할로 돈다).
-- 반환값이 불리언 한 칸이라 해시·잠금 카운터는 여전히 어느 역할에도 나가지 않는다.
-- `guest_accounts_list`는 시그니처가 그대로라 `create or replace`이며 ACL은 손대지 않는다.

begin;

-- 비밀번호가 서 있는가. 표가 아니라 이 한 칸만 밖으로 나간다.
create or replace function app.guest_has_password(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.guest_credentials c
     where c.user_id = p_user_id
       and c.password_hash is not null
  );
$$;

revoke all on function app.guest_has_password(uuid) from public;
grant execute on function app.guest_has_password(uuid) to authenticated;

comment on function app.guest_has_password(uuid) is
  '게스트 계정에 비밀번호가 서 있는가. guest_credentials는 service_role만 닿는 표라 INVOKER 함수가 조인하면 42501로 죽는다 — 표를 여는 대신 파생 불리언만 꺼낸다. 근거: 3_9_1 §11.1';

-- 시그니처가 같으므로 교체만 한다(드롭하지 않아 ACL·주석이 그대로다). 본문에서 달라진 것은
-- 자격증명 조인 한 줄이 헬퍼 호출로 바뀐 것뿐이다.
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
