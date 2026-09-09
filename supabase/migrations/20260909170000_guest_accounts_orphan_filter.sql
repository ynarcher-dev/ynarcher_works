-- ADMIN 게스트 계정 목록에 '참여 사업 0건' 축을 연다(2026-09-09).
--
-- 명부 행을 실제로 뺄 수 있게 되면서(`remove_program_participants`, 20260909160000) **참여가
-- 0건인 계정**이 생길 수 있다. 그 계정은 로그인은 되는데 들어가면 아무것도 없다 — 문이 하나도
-- 없기 때문이다. 종전에도 논리적으로 가능했지만(마지막 사업을 차단하면 같은 상태다) 그 상태를
-- 찾을 방법이 없었다.
--
-- **자동으로 재우지 않는다**(사용자 지정 2026-09-09). 참여가 0건이라는 것은 '더 이상 쓰지
-- 않는다'가 아니라 '지금 걸린 사업이 없다'이고, 다음 기수에 다시 초대될 사람이 그 사이에
-- 정지되면 그때 왜 못 들어오는지를 아무도 답하지 못한다. 그리고 자동으로 재우면 사업 담당자의
-- 행동이 ADMIN의 축(계정 상태)을 건드리게 되어, 2026-09-05에 가른 '문과 계정'의 경계가 흐려진다.
-- 그래서 시스템은 **보이게만** 하고 정지는 사람이 고른다.
--
-- 축을 화면이 아니라 서버에 두는 이유는 이 목록이 서버 페이징이기 때문이다. 클라이언트에서
-- 거르면 한 페이지 안에서만 걸러져 '2페이지에는 더 있는데 1페이지에서 0건'이 된다.
--
-- **인자를 늘리므로 옛 시그니처를 먼저 드롭한다.** `create or replace`로 인자를 하나 늘리면
-- 교체가 아니라 새 오버로드가 되고, 새 인자에 기본값이 있으면 옛 5인자 호출이 두 함수 모두에
-- 걸려 `42725 function is not unique`로 죽는다. 드롭하면 ACL과 주석이 조용히 초기값으로
-- 돌아가므로 아래에서 원래대로 되돌린다(드롭 전 `proacl` 확인: anon 포함 기존 그대로).
--
-- 보안 게이트: 새 테이블·새 정책·Storage 변경 없음. 함수는 여전히 SECURITY INVOKER이고
-- 인가(내부 사용자만·게스트 차단)와 마스킹 분기는 그대로다 — 더해진 것은 결과를 좁히는
-- 조건 하나뿐이라 노출면은 줄어들기만 한다.

begin;

drop function if exists public.guest_accounts_list(text, integer, integer, text, text[]);

CREATE OR REPLACE FUNCTION public.guest_accounts_list(p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_entity_key text DEFAULT NULL::text, p_master_tables text[] DEFAULT NULL::text[], p_only_orphans boolean DEFAULT false)
 RETURNS TABLE(user_id uuid, name text, email text, phone text, user_type text, is_active boolean, company_name text, identities jsonb, has_password boolean, created_at timestamp with time zone, last_login_at timestamp with time zone, program_count integer, open_count integer, programs jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'app', 'public'
AS $function$
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
               'name',         coalesce(s.name, n.name, ms.name, mb.name)
             )
             order by gi.master_table
           ) as identities
      from public.guest_identities gi
      -- 원장 표를 **직접 조인**한다(판정식을 복제하지 않는다). 이 함수는 INVOKER라 각
      -- 원장의 SELECT 정책이 그대로 판정하므로, ma_sellers를 읽지 못하는 사용자에게는
      -- 이름이 null로 온다 — 그리고 그 사용자에게는 애초에 그 행이 목록에 서지 않는다
      -- (guest_identities_select가 app.can_read_master_table로 좁힌다, 20260908180000).
      left join public.startups  s  on gi.master_table = 'startups'   and s.id  = gi.master_id
      left join public.networks  n  on gi.master_table = 'networks'   and n.id  = gi.master_id
      left join public.ma_sellers ms on gi.master_table = 'ma_sellers' and ms.id = gi.master_id
      left join public.ma_buyers  mb on gi.master_table = 'ma_buyers'  and mb.id = gi.master_id
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
   -- 참여가 0건인 계정만. 마지막 사업에서 빠진 계정은 로그인은 되는데 아무것도 보이지
   -- 않으므로, 그 사실을 찾을 수 있어야 정지 여부를 사람이 판단할 수 있다.
   -- `links`는 p_entity_key로 좁혀지므로 이 축은 **좁히지 않고 부를 때만** 뜻이 맞는다.
   where not coalesce(p_only_orphans, false) or coalesce(k.program_count, 0) = 0
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$
;

-- 드롭 전 권한을 그대로 되돌린다(Supabase 기본 + PUBLIC). 이 함수는 INVOKER라 호출자의
-- RLS가 그대로 판정하고, 함수 본문 첫 줄이 게스트·비로그인을 막는다.
grant execute on function public.guest_accounts_list(text, integer, integer, text, text[], boolean)
  to public, anon, authenticated, service_role;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean) is
  '게스트 계정 목록(내부 사용자 전용, INVOKER). p_entity_key·p_master_tables로 창구를 좁히고, p_only_orphans는 참여 사업이 0건인 계정만 남긴다.';

commit;
