-- =====================================================================
-- 스타트업 대표자·핵심인력의 NETWORKS 강제 연결을 되돌린다
--
-- 회의록은 NETWORKS에 이미 등록된 외부 인물을 계속 연결할 수 있다. 그러나 STARTUP의
-- 대표자·핵심인력을 NETWORKS 원장으로 승격하거나, STARTUP 게스트 계정 발급을 NETWORKS
-- 대표자에 의존시키지 않는다. 참여 조직과 로그인 명의는 다시 STARTUP 원장 한 행이 답한다.
--
-- 데이터 보존:
--   · 자동 생성된 NETWORKS 인물 행은 삭제하지 않고 category만 미지정으로 돌린다.
--   · startup_form 관계 줄은 대표자 참조에서 파생된 값이고 수동 관계가 0건임을 배포 전에
--     확인했다. 관계 표는 기능 전체와 함께 제거한다.
--   · 기존 STARTUP guest_identities와 게스트 계정은 그대로 둔다.
-- =====================================================================

-- STARTUP 폼에서 파생되는 관계를 먼저 멈춘다.
drop trigger if exists trg_startups_sync_affiliations on public.startups;
drop function if exists app.sync_startup_affiliations();

-- JSON 안의 연결 키도 제거해 AI나 후속 코드가 죽은 NETWORKS 참조를 다시 사용하지 않게 한다.
update public.startups s
   set team_profile = pg_catalog.jsonb_set(
         s.team_profile,
         '{members}',
         coalesce(
           (
             select pg_catalog.jsonb_agg(member - 'networkId' order by ord)
               from pg_catalog.jsonb_array_elements(
                      coalesce(s.team_profile -> 'members', '[]'::jsonb)
                    ) with ordinality as x(member, ord)
           ),
           '[]'::jsonb
         ),
         true
       )
 where s.team_profile ? 'members'
   and exists (
     select 1
       from pg_catalog.jsonb_array_elements(
              coalesce(s.team_profile -> 'members', '[]'::jsonb)
            ) member
      where member ? 'networkId'
   );

drop index if exists public.idx_startups_representative_network;
alter table public.startups
  drop column if exists representative_network_id;

-- STARTUP 피커가 만든 NETWORKS 행은 지우지 않는다. 재사용 여부를 사람이 판단할 수 있도록
-- 원장 행은 보존하고, 더 이상 존재하지 않는 구분만 미지정으로 되돌린다.
update public.networks
   set category = null
 where category = 'startup';

alter table public.networks
  drop constraint if exists networks_category_chk;
alter table public.networks
  add constraint networks_category_chk check (
    category is null or category in (
      'experts', 'van', 'exp', 'investors',
      'corporates', 'institutions', 'universities', 'etc', 'vendors'
    )
  );

comment on column public.networks.category is
  '구분 코드(experts|van|exp|investors|corporates|institutions|universities|etc|vendors). null = 미분류. 라벨은 화면 상수가 소유한다.';

-- 이 표에는 배포 직전 startup_form 1건만 있고 수동 관계는 없었다. STARTUP 결합 전용 기능을
-- 원래대로 걷되, NETWORKS의 기존 affiliation/profile.affiliation_history 칸은 건드리지 않는다.
drop table if exists public.network_affiliations;
drop function if exists app.enforce_network_affiliation_org();

-- 대표자 NETWORKS 인격을 강제하던 보조 유일 인덱스도 걷는다. 기본 PK와 게스트 이메일
-- 유일 인덱스는 유지되어 같은 이메일의 게스트 계정 중복은 계속 차단된다.
drop index if exists public.uq_guest_identities_network_person;

-- STARTUP 게스트는 다시 STARTUP의 대표자·이메일·연락처를 기본값으로 사용한다.

create or replace function public.issue_guest_account(
  p_master_table text,
  p_master_id    uuid,
  p_name         text default null,
  p_email        text default null,
  p_phone        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  v_existing  uuid;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_user_type text;
  v_company   uuid;
  v_new       uuid;
  v_email_key text;
  -- 원장에서 꺼냈는가, 담당자가 지정했는가. 감사 로그가 이 사실을 남긴다.
  v_source    text;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  -- 게스트가 게스트를 만들 수 있으면 계정 원장이 밖에서 자란다.
  if app.is_guest() then
    raise exception '내부 사용자만 게스트 계정을 발급할 수 있습니다.' using errcode = '42501';
  end if;
  if p_master_table is null or p_master_id is null then
    raise exception '원장과 대상을 지정해야 합니다.' using errcode = '22023';
  end if;
  -- 허용 목록. 여기 없는 원장은 계정을 세울 수 없다 — 그리고 그 강제는 이 함수만이
  -- 아니라 guest_identities·program_participants의 CHECK가 함께 진다(한 곳만 열면
  -- 다른 곳에서 막혀, 발급은 되는데 명부에 담기지 않는 계정이 생긴다).
  if p_master_table not in ('startups', 'networks', 'ma_sellers', 'ma_buyers') then
    raise exception '지원하지 않는 원장입니다: %', p_master_table using errcode = '22023';
  end if;

  -- ⓪ 사람 확정. 원장 값은 **기본값**이지 정답이 아니다 — 담당자가 넘긴 값이 이긴다.
  --   셋 중 하나만 넘어와도 나머지는 원장에서 채운다(발급 폼이 이름만 고치는 경우).
  --
  --   `else`를 쓰지 않고 원장마다 `when`을 적는다 — 원장이 둘일 때는 else가 곧 나머지
  --   하나였지만 넷이 된 지금은 모르는 값이 조용히 마지막 가지로 흘러든다. 어느 가지도
  --   타지 않으면 v_name이 비고 아래 'not found'가 사유와 함께 멈춘다.
  if p_master_table = 'startups' then
    -- top-level 칸을 먼저 본다. contact jsonb는 20260710140000 이후 아무도 쓰지 않는
    -- 옛 칸이라, 그것만 보면 화면에 이메일이 보이는 기업이 여기서는 '없음'이 된다.
    select s.representative,
           coalesce(nullif(s.email, ''), nullif(s.contact ->> 'email', '')),
           coalesce(nullif(s.phone, ''), nullif(s.contact ->> 'phone', ''))
      into v_name, v_email, v_phone
      from public.startups s
     where s.id = p_master_id and s.deleted_at is null;
    v_user_type := 'external_startup';
    -- company_id는 startups(id) FK다. 스타트업 인격만 그 칸을 채울 수 있고, 나머지
    -- 원장은 비워 둔다 — 소속은 guest_identities가 답한다(3_9_2 §5).
    v_company   := p_master_id;
  elsif p_master_table = 'networks' then
    select n.name, nullif(n.email, ''), nullif(n.phone, '')
      into v_name, v_email, v_phone
      from public.networks n
     where n.id = p_master_id and n.deleted_at is null and n.merged_into_id is null;
    v_user_type := 'external_expert';
  elsif p_master_table = 'ma_sellers' then
    select nullif(x.contact_name, ''), nullif(x.contact_email, ''), nullif(x.phone, '')
      into v_name, v_email, v_phone
      from public.ma_sellers x
     where x.id = p_master_id and x.deleted_at is null;
    -- user_type을 늘리지 않는다(2026-09-08 확정). 3종이 서로 갈라 판정하는 자리가 없고
    -- 30여 곳에서 한 묶음으로만 쓰인다 — 무엇인지는 master_table이 답한다. 매각 기업·
    -- 인수 후보사는 둘 다 기업이므로 external_startup을 그대로 쓴다.
    v_user_type := 'external_startup';
  elsif p_master_table = 'ma_buyers' then
    select nullif(x.contact_name, ''), nullif(x.contact_email, ''), nullif(x.phone, '')
      into v_name, v_email, v_phone
      from public.ma_buyers x
     where x.id = p_master_id and x.deleted_at is null;
    v_user_type := 'external_startup';
  end if;

  -- 원장 행 자체가 없으면 여기서 멈춘다(인자를 다 넘겨도 마찬가지다 —
  -- 없는 대상에 인격을 붙이면 그 계정이 무엇에 속하는지 답할 수 없다).
  if not found then
    raise exception '원장에서 대상을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  v_source := case
    when coalesce(nullif(btrim(p_email), ''), nullif(btrim(p_name), ''), nullif(btrim(p_phone), '')) is null
      then 'ledger' else 'specified'
  end;

  v_name  := coalesce(nullif(btrim(p_name),  ''), v_name);
  v_email := coalesce(nullif(btrim(p_email), ''), v_email);
  v_phone := coalesce(nullif(btrim(p_phone), ''), v_phone);

  -- 비교는 소문자로 하고 **저장은 적힌 그대로** 한다. 유일 인덱스가 lower(email)이라
  -- 판정은 어차피 대소문자를 가리지 않으며, 여기서 낮춰 저장하면 담당자가 적은 표기가
  -- 화면·메일 안내에서 조용히 바뀐다(우리가 고칠 값이 아니다).
  v_email_key := lower(v_email);

  if v_name is null then
    raise exception '이름이 없어 계정을 세울 수 없습니다. 담당자 이름을 지정하거나 원장에서 보완하십시오.'
      using errcode = '22023';
  end if;
  if v_email is null then
    raise exception '이메일이 없어 계정을 세울 수 없습니다(이메일이 로그인 ID입니다). 담당자 이메일을 지정하거나 원장에서 보완하십시오.'
      using errcode = '22023';
  end if;

  -- 내부 임직원의 주소로 게스트 계정을 세우지 않는다.
  --
  -- 종전에는 이 길이 사실상 닫혀 있었다 — 이메일이 원장에서만 왔기 때문이다. 담당자가
  -- 직접 적게 되면서 오타 한 번으로 자기 회사 주소가 들어올 수 있게 됐다. 유일 인덱스
  -- (uq_users_guest_email)는 **게스트끼리만** 막으므로 이 조합은 조용히 저장된다.
  --
  -- 그러면 한 이메일에 users 행이 둘이 되고, 임직원 목록을 묻는 조회는 유형으로
  -- 거르므로(lib/userTypes) 겉으로는 멀쩡하지만 사람을 이메일로 찾는 자리마다 답이
  -- 둘이 된다. 게스트 로그인 경로도 그 사람을 영영 받지 않는다(유형이 다르다).
  -- 즉 만들어 봐야 쓰이지 않는 행이므로, 만들지 않고 사유를 말한다.
  if exists (
    select 1 from public.users u
     where u.deleted_at is null
       and lower(u.email) = v_email_key
       and not app.is_guest_user_type(u.user_type)
  ) then
    raise exception '이 이메일은 내부 임직원 계정입니다. 게스트 계정은 다른 주소로 세우십시오.'
      using errcode = '22023';
  end if;

  -- ① 이 원장 행 × 이 사람에게 이미 계정이 있는가.
  --    재운 계정(deleted_at)은 세지 않는다 — 병합으로 흡수된 계정이 새 발급을
  --    영원히 막으면 안 된다(그 매핑은 병합이 이미 옮겼다).
  select gi.user_id into v_existing
    from public.guest_identities gi
    join public.users u on u.id = gi.user_id and u.deleted_at is null
   where gi.master_table = p_master_table
     and gi.master_id    = p_master_id
     and lower(u.email)  = v_email_key;
  if v_existing is not null then
    return v_existing;
  end if;

  -- ② 같은 이메일의 게스트 계정이 이미 있는가 — 같은 사람이 다른 자격으로 들어와 있는 경우다.
  --    이때는 계정을 만들지 않고 **인격만 하나 더 붙인다.**
  select u.id into v_existing
    from public.users u
   where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
     and u.deleted_at is null
     and lower(u.email) = v_email_key;

  if v_existing is null then
    -- ③ 새 계정. 여기서만 연락처가 필요하다 — 초기 비밀번호이기 때문이며, 이미 계정이
    --    있는 사람은 자기 비밀번호로 들어오므로 위 두 갈래에서는 묻지 않는다.
    if v_phone is null then
      raise exception '연락처가 없어 계정을 세울 수 없습니다(연락처가 초기 비밀번호입니다). 담당자 연락처를 지정하거나 원장에서 보완하십시오.'
        using errcode = '22023';
    end if;

    insert into public.users (user_type, name, email, phone, company_id)
    values (v_user_type::public.user_type, v_name, v_email, v_phone, v_company)
    returning id into v_new;

    -- 게스트 워크스페이스 권한 한 벌. **범위(scope)는 화면을 가르지 않는다** — 게스트가
    -- 보는 것은 전적으로 app.guest_program_ids()/guest_module_ids()가 판정하며, 자격은
    -- 세션에 고정된 참여 줄이 답한다. 여기 값은 권한 템플릿과의 형식만 맞춘다.
    insert into public.workspace_permissions (user_id, workspace_key, permission_level, scope_type, scope_id)
    values (v_new, 'guest', 'write', 'self'::public.scope_type, null)
    on conflict (user_id, workspace_key) do nothing;

    -- 자격증명 자리를 비워 둔 채로 함께 만든다. 행이 없으면 로그인 경로가 "초기 상태"와
    -- "계정 없음"을 구분하지 못한다.
    insert into public.guest_credentials (user_id) values (v_new)
    on conflict (user_id) do nothing;
  else
    v_new := v_existing;
  end if;

  -- 인격을 붙인다. 한 계정이 여러 인격을 갖는 것도(참가기업 + 참가전문가),
  -- 한 원장 행이 여러 계정을 갖는 것도(회사 담당자 여럿) 정상이다.
  insert into public.guest_identities (master_table, master_id, user_id, created_by)
  values (p_master_table, p_master_id, v_new, v_uid)
  on conflict (master_table, master_id, user_id) do nothing;

  perform app.log_guest_access(
    v_new,
    case when v_existing is null then 'GUEST_ACCOUNT_ISSUE' else 'GUEST_IDENTITY_ADD' end,
    'guest:account',
    jsonb_build_object(
      'master_table',  p_master_table,
      'master_id',     p_master_id,
      -- 이 계정의 이메일을 누가 정했는가. 원장 연락처를 그대로 쓴 것과 담당자가
      -- 지정한 것은 나중에 갈라 물어야 하는 사실이다.
      'person_source', v_source
    ),
    null
  );

  return v_new;
end;
$fn$;

revoke all on function public.issue_guest_account(text, uuid, text, text, text) from public;
grant execute on function public.issue_guest_account(text, uuid, text, text, text) to authenticated;

comment on function public.issue_guest_account(text, uuid, text, text, text) is
  '원장 행 × 사람에게 게스트 계정을 세우고 인격을 붙인다(멱등: 같은 이메일이면 그 계정을 그대로 돌려준다). 원장 값은 기본값이고 담당자가 넘긴 값이 이긴다. 스타트업의 이메일·연락처는 top-level 컬럼을 먼저 보고 옛 contact jsonb를 뒤에 본다(2026-09-09). 근거: 3_9_1 §4, 3_9_2 §5';
