-- =====================================================================
-- GUEST 계정 등록 일원화 — 소속(affiliation)을 필수 칸으로, 연락처를 선택으로
--
-- 사용자 확정(2026-09-14): GUEST 계정의 필수 칸은 **이름·이메일·소속** 셋이고
-- **연락처는 선택**이다. 종전 규칙(연락처 필수)은 연락처가 초기 비밀번호였기 때문에
-- 성립했고, 그 근거는 같은 날 고정 초기 비밀번호로 대체된다
-- (20260914220000_guest_fixed_initial_password.sql). 두 파일은 한 결정의 앞뒤이며,
-- 이 파일이 칸을, 저 파일이 자격증명을 맡는다.
--
-- 무엇이 바뀌는가
--   · public.users.affiliation  — 새 칸. **표시·검색용 소속 문자열**이며 nullable이다.
--     `company_id`(startups FK)와 **다른 축**이다: 저쪽은 스타트업 인격의 소속 원장 행을
--     가리키는 관계이고, 이쪽은 사람이 스스로 적는 소속 이름이다. 원장 행이 없는 계정도
--     소속은 있으며, 그래서 FK가 아니라 텍스트다. 이름은 `public.networks.affiliation`과
--     같은 말을 쓴다 — 원장에서 옮겨 담는 값이므로 창구마다 다른 이름을 두지 않는다.
--   · 기존 계정은 이 칸이 비어 있어도 그대로 산다. **소급 강제를 걸지 않는다** —
--     nullable이고 CHECK도 두지 않으며, 필수 판정은 **생성 경로에만** 있다.
--   · uq_users_guest_phone 삭제 — 연락처가 초기 비밀번호였을 때만 성립하던 유일성이다.
--     번호가 자격증명이 아니게 된 이상 같은 대표번호를 두 담당자가 쓰는 것을 막을 근거가
--     없고, 그대로 두면 "선택 칸인데 남이 먼저 쓰면 못 넣는" 칸이 된다.
--   · **NETWORKS 폴백은 비어 있을 수 있다.** 소속의 원장 기본값은 기업 원장에서는 기업명
--     (NOT NULL)이지만 NETWORKS에서는 `affiliation` 칸이라 비어 있을 수 있다. 그 사람에게
--     계정을 세우려면 담당자가 소속을 적거나 원장을 보완해야 하며, 적지 않으면 발급이 사유와
--     함께 멈춘다. `networks.name`으로 대신 채우지 않는다 — 이름은 사람이고 소속은 그 사람이
--     속한 곳이라, 채우는 순간 화면이 없는 사실을 말한다. 화면(계정 생성 창)은 소속을 필수로
--     받으므로 이 경로에서 멈추는 것은 원장 값을 그대로 쓰려 한 호출뿐이다.
--     (`open_program_guest_access`는 2026-09-13부터 이 함수를 부르지 않으므로 문을 여는
--      경로는 이 요구에 걸리지 않는다 — 그 경로는 계정이 없는 줄을 애초에 거절한다.)
--   · 생성·수정·조회 창구 넷이 같은 규칙을 말하도록 함께 고친다.
--       - public.issue_guest_account   (원장 인격을 붙이는 발급 경로)
--       - public.create_guest_account  (단건 중앙 창구)
--       - public.create_guest_accounts (엄격 일괄 창구)
--       - public.admin_update_guest_contact (ADMIN 계정 정보 수정)
--       - public.guest_accounts_list   (목록 — 소속을 돌려주고 검색에도 건다)
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md §2)
--   · 소유 워크스페이스: guest. 원장 연결 판정은 종전대로 대상 원장에 위임한다.
--   · 데이터 등급: 소속은 Personal(개인 식별에 기여하는 프로필 값)이되 연락처와 달리
--     자격증명이 아니다. 그래서 마스킹 대상에 넣지 않는다 — 목록에서 사람을 가려내는
--     값이고, 가리면 담당자가 동명이인을 구분할 수단이 사라진다. ADMIN 여부와 무관하게
--     내부 사용자에게 원문으로 보인다(이메일·연락처는 종전 마스킹 그대로다).
--   · 새 표·새 정책·Storage 변경 없음. 새 칸 하나는 기존 users 정책을 그대로 상속한다.
--   · 새 SECURITY DEFINER 신설 없음. 기존 DEFINER 함수 넷의 본문만 바꾸며 전부
--     `set search_path = ''`와 함수 첫 줄의 주체 재검증을 유지한다.
--   · GRANT/REVOKE: 시그니처가 바뀌는 함수는 drop 후 재생성하므로 실행권한을 다시 적는다
--     (public·anon·service_role 회수, authenticated에만 부여). 시그니처가 같은 함수는
--     `create or replace`라 ACL이 유지되지만 규칙상 다시 명시한다.
--   · 삭제 정책 신설 없음. 이 파일은 계정을 지우지 않는다.
--   · 되돌리기: 칸은 남겨 두고 함수만 이전 정의로 되돌리면 종전 동작으로 복귀한다.
--     uq_users_guest_phone은 되살릴 때 중복 데이터가 이미 생겼을 수 있으므로 그때
--     충돌 목록을 먼저 확인해야 한다(이 파일은 그 인덱스를 되살리지 않는다).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- (1) 소속 칸
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists affiliation text;

comment on column public.users.affiliation is
  'GUEST 계정의 소속(기관·회사 이름). 표시·검색용 문자열이며 company_id(startups FK)와 다른 축이다 — 원장 행이 없는 계정도 소속은 있다. 2026-09-14부터 생성 경로에서 필수이며, 그 전에 만들어진 계정은 비어 있을 수 있다(소급 강제 없음).';

-- ---------------------------------------------------------------------
-- (2) 연락처 유일 인덱스 철회
--
--     이 인덱스의 사유는 주석에 그대로 적혀 있었다 — "초기 비밀번호 원천인 전화번호는
--     계정 하나에만 속한다". 초기 비밀번호가 고정값이 된 이상 그 사유가 사라졌고,
--     연락처가 선택 칸이 되면서 오히려 해가 된다: 회사 대표번호를 적은 담당자 둘 중
--     뒤에 온 사람이 이유 없이 막힌다.
--
--     이메일 유일성(uq_users_email_live)은 그대로 둔다 — 그쪽은 로그인 아이디다.
-- ---------------------------------------------------------------------
drop index if exists public.uq_users_guest_phone;

-- ---------------------------------------------------------------------
-- (3) issue_guest_account — 원장 인격을 붙이는 발급 경로
--
--     본문은 20260911221000의 것을 그대로 두고 세 곳만 바꾼다.
--       · 인자에 p_affiliation을 더한다(원장 값이 기본, 담당자 지정이 우선).
--       · **새 계정을 세울 때** 연락처 대신 소속을 요구한다. 요구의 총량은 그대로다 —
--         종전에도 이 자리에서 연락처가 없으면 멈췄다.
--       · 이미 있는 계정을 돌려주는 두 갈래(①·②)에서는 **아무 칸도 덮지 않는다.**
--         남의 계정의 소속을 이 호출이 조용히 바꾸면, 값을 고친 사람이 어디에도 남지
--         않는다(고치는 자리는 ADMIN 창구 하나다).
--
--     시그니처가 바뀌므로 drop 후 재생성한다. 인자 셋에 기본값이 있으므로 본문에서
--     2인자로 부르는 기존 함수들(open_program_guest_access 계열)은 그대로 붙는다.
-- ---------------------------------------------------------------------
drop function if exists public.issue_guest_account(text, uuid, text, text, text);

create function public.issue_guest_account(
  p_master_table text,
  p_master_id    uuid,
  p_name         text default null,
  p_email        text default null,
  p_phone        text default null,
  p_affiliation  text default null
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
  v_affil     text;
  v_user_type text;
  v_company   uuid;
  v_new       uuid;
  v_email_key text;
  -- 원장에서 꺼냈는가, 담당자가 지정했는가. 감사 로그가 이 사실을 남긴다.
  v_source    text;
  -- 같은 이메일을 쥔 기존 계정의 이름(②-1 대조용).
  v_other_name text;
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
  --   넷 중 하나만 넘어와도 나머지는 원장에서 채운다(발급 폼이 이름만 고치는 경우).
  --
  --   소속의 출처는 원장마다 다르다. NETWORKS는 사람 원장이라 `affiliation` 칸이 그대로
  --   답하고, 기업 원장(스타트업·SELLER·BUYER)은 **그 기업의 이름**이 곧 그 사람의 소속이다
  --   (담당자 개인이 아니라 회사로 들어오는 자리이기 때문이다).
  --
  --   `else`를 쓰지 않고 원장마다 `when`을 적는다 — 원장이 둘일 때는 else가 곧 나머지
  --   하나였지만 넷이 된 지금은 모르는 값이 조용히 마지막 가지로 흘러든다. 어느 가지도
  --   타지 않으면 v_name이 비고 아래 'not found'가 사유와 함께 멈춘다.
  if p_master_table = 'startups' then
    -- top-level 칸을 먼저 본다. contact jsonb는 20260710140000 이후 아무도 쓰지 않는
    -- 옛 칸이라, 그것만 보면 화면에 이메일이 보이는 기업이 여기서는 '없음'이 된다.
    select s.representative,
           coalesce(nullif(s.email, ''), nullif(s.contact ->> 'email', '')),
           coalesce(nullif(s.phone, ''), nullif(s.contact ->> 'phone', '')),
           nullif(btrim(s.name), '')
      into v_name, v_email, v_phone, v_affil
      from public.startups s
     where s.id = p_master_id and s.deleted_at is null;
    v_user_type := 'external_startup';
    -- company_id는 startups(id) FK다. 스타트업 인격만 그 칸을 채울 수 있고, 나머지
    -- 원장은 비워 둔다 — 소속은 guest_identities가 답한다(3_9_2 §5).
    v_company   := p_master_id;
  elsif p_master_table = 'networks' then
    select n.name, nullif(n.email, ''), nullif(n.phone, ''), nullif(btrim(n.affiliation), '')
      into v_name, v_email, v_phone, v_affil
      from public.networks n
     where n.id = p_master_id and n.deleted_at is null and n.merged_into_id is null;
    v_user_type := 'external_expert';
  elsif p_master_table = 'ma_sellers' then
    select nullif(x.contact_name, ''), nullif(x.contact_email, ''), nullif(x.phone, ''),
           nullif(btrim(x.name), '')
      into v_name, v_email, v_phone, v_affil
      from public.ma_sellers x
     where x.id = p_master_id and x.deleted_at is null;
    -- user_type을 늘리지 않는다(2026-09-08 확정). 3종이 서로 갈라 판정하는 자리가 없고
    -- 30여 곳에서 한 묶음으로만 쓰인다 — 무엇인지는 master_table이 답한다. 매각 기업·
    -- 인수 후보사는 둘 다 기업이므로 external_startup을 그대로 쓴다.
    v_user_type := 'external_startup';
  elsif p_master_table = 'ma_buyers' then
    select nullif(x.contact_name, ''), nullif(x.contact_email, ''), nullif(x.phone, ''),
           nullif(btrim(x.name), '')
      into v_name, v_email, v_phone, v_affil
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
    when coalesce(
           nullif(btrim(p_email), ''),
           nullif(btrim(p_name), ''),
           nullif(btrim(p_phone), ''),
           nullif(btrim(p_affiliation), '')
         ) is null
      then 'ledger' else 'specified'
  end;

  v_name  := coalesce(nullif(btrim(p_name),        ''), v_name);
  v_email := coalesce(nullif(btrim(p_email),       ''), v_email);
  v_phone := coalesce(nullif(btrim(p_phone),       ''), v_phone);
  v_affil := coalesce(nullif(btrim(p_affiliation), ''), v_affil);

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
  if v_affil is not null and length(v_affil) > 200 then
    raise exception '소속은 200자를 넘을 수 없습니다.' using errcode = '22023';
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
  --
  --    **돌려주기만 하고 아무 칸도 덮지 않는다.** 소속을 여기서 갱신하면 남의 계정 값이
  --    발급 호출 한 번에 조용히 바뀌고, 그 변경은 감사 로그의 '수정'으로 남지 않는다.
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

  -- ②-1 같은 이메일인데 **이름이 다르면** 다른 사람이다 (2026-09-11, 3_3_8 §6).
  --     종전에는 이름을 보지 않고 인격만 붙여, 실수로 같은 이메일이 들어간 두 사람(A기업
  --     홍길동 / B기업 임꺽정)이 한 계정이 되었다 — 먼저 들어온 쪽이 두 기업의 자료를 다
  --     본다. 이메일은 한 사람이 하나씩 쓰는 값이라 "같은 이메일 + 다른 이름"은 오입력
  --     말고는 생기지 않는다. 대조는 공백·법인 표기를 걷은 뒤 한다(홍 길동 / 홍길동).
  if v_existing is not null then
    select u.name into v_other_name from public.users u where u.id = v_existing;
    if app.norm_entity_name(v_other_name) is distinct from app.norm_entity_name(v_name) then
      raise exception '이 이메일(%)은 다른 사람(%)의 게스트 계정에 쓰이고 있습니다. 원장의 이메일을 확인하십시오.',
        v_email, v_other_name
        using errcode = '23505', hint = 'guest_email_name_mismatch:' || v_existing;
    end if;
  end if;

  if v_existing is null then
    -- ③ 새 계정. **여기서만 소속이 필요하다** — 계정 등록의 필수 칸 셋 중 하나이며,
    --    이미 계정이 있는 사람은 위 두 갈래에서 그대로 돌아가므로 묻지 않는다.
    --    종전에는 이 자리가 연락처를 요구했다(초기 비밀번호였기 때문이다). 연락처는
    --    이제 선택이라 없어도 계정이 선다.
    if v_affil is null then
      raise exception '소속이 없어 계정을 세울 수 없습니다. 소속을 지정하거나 원장에서 보완하십시오.'
        using errcode = '22023';
    end if;

    insert into public.users (user_type, name, email, phone, affiliation, company_id)
    values (v_user_type::public.user_type, v_name, v_email, v_phone, v_affil, v_company)
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

revoke all on function public.issue_guest_account(text, uuid, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.issue_guest_account(text, uuid, text, text, text, text)
  to authenticated;

comment on function public.issue_guest_account(text, uuid, text, text, text, text) is
  '원장 행 × 사람에게 게스트 계정을 세우고 인격을 붙인다(멱등: 같은 이메일·같은 이름이면 그 계정을 그대로 돌려주며 아무 칸도 덮지 않는다). 새 계정의 필수 칸은 이름·이메일·소속이고 연락처는 선택이다(2026-09-14). 소속은 원장에서 기본값을 꺼내고(NETWORKS는 affiliation, 기업 원장은 기업명) 담당자가 넘긴 값이 이긴다. 같은 이메일인데 이름이 다르면 거절한다(3_3_8 §6). 근거: 3_9_1 §4·§6, 3_9_2 §5';

-- ---------------------------------------------------------------------
-- (4) create_guest_account — 단건 중앙 창구
--
--     원장을 고르면 (3)에 그대로 위임하고, 고르지 않으면 임시 GUEST 계정을 만든다.
--     시그니처가 바뀌므로 drop 후 재생성한다.
-- ---------------------------------------------------------------------
drop function if exists public.create_guest_account(text, text, text, text, uuid);

create function public.create_guest_account(
  p_name         text,
  p_email        text,
  p_phone        text default null,
  p_master_table text default null,
  p_master_id    uuid default null,
  p_affiliation  text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_actor         uuid := app.current_app_user_id();
  v_name          text := nullif(btrim(p_name), '');
  v_email         text := nullif(btrim(p_email), '');
  v_phone         text := nullif(btrim(p_phone), '');
  v_affil         text := nullif(btrim(p_affiliation), '');
  v_existing      uuid;
  v_existing_name text;
  v_new           uuid;
begin
  if v_actor is null or app.is_guest() then
    raise exception '내부 사용자만 GUEST 계정을 생성할 수 있습니다.' using errcode = '42501';
  end if;

  if (p_master_table is null) <> (p_master_id is null) then
    raise exception '원장을 연결하려면 원장 종류와 대상을 함께 지정해야 합니다.' using errcode = '22023';
  end if;

  if p_master_table is not null then
    return public.issue_guest_account(
      p_master_table,
      p_master_id,
      v_name,
      v_email,
      v_phone,
      v_affil
    );
  end if;

  -- 필수 칸 셋. 연락처는 여기서 묻지 않는다(2026-09-14 — 선택 칸이다).
  if v_name is null or v_email is null or v_affil is null then
    raise exception '이름, 이메일, 소속을 모두 입력해야 합니다.' using errcode = '22023';
  end if;
  if length(v_affil) > 200 then
    raise exception '소속은 200자를 넘을 수 없습니다.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.users u
     where u.deleted_at is null
       and lower(u.email) = lower(v_email)
       and not app.is_guest_user_type(u.user_type)
  ) then
    raise exception '이 이메일은 내부 임직원 계정입니다. GUEST 계정은 다른 주소로 생성하십시오.'
      using errcode = '22023';
  end if;

  select u.id, u.name
    into v_existing, v_existing_name
    from public.users u
   where u.deleted_at is null
     and app.is_guest_user_type(u.user_type)
     and lower(u.email) = lower(v_email);

  -- 멱등 반환. **기존 계정의 칸은 덮지 않는다**(발급 경로와 같은 규약) — 값을 고치는
  -- 자리는 ADMIN 창구 하나이며, 그 경로만 사유와 변경 전/후를 남긴다.
  if v_existing is not null then
    if app.norm_entity_name(v_existing_name) is distinct from app.norm_entity_name(v_name) then
      raise exception '이 이메일(%)은 다른 사람(%)의 GUEST 계정에 쓰이고 있습니다.',
        v_email, v_existing_name
        using errcode = '23505', hint = 'guest_email_name_mismatch:' || v_existing;
    end if;
    return v_existing;
  end if;

  insert into public.users (user_type, name, email, phone, affiliation)
  values ('temporary_guest', v_name, v_email, v_phone, v_affil)
  returning id into v_new;

  insert into public.workspace_permissions
    (user_id, workspace_key, permission_level, scope_type, scope_id)
  values (v_new, 'guest', 'write', 'self', null)
  on conflict (user_id, workspace_key) do nothing;

  insert into public.guest_credentials (user_id)
  values (v_new)
  on conflict (user_id) do nothing;

  perform app.log_guest_access(
    v_new,
    'GUEST_ACCOUNT_ISSUE',
    'guest:account',
    jsonb_build_object('person_source', 'manual', 'master_table', null, 'master_id', null),
    null
  );

  return v_new;
end;
$fn$;

revoke all on function public.create_guest_account(text, text, text, text, uuid, text)
  from public, anon, service_role;
grant execute on function public.create_guest_account(text, text, text, text, uuid, text)
  to authenticated;

comment on function public.create_guest_account(text, text, text, text, uuid, text) is
  '모든 내부 화면이 공유하는 GUEST 계정 단건 생성 경로. 필수 칸은 이름·이메일·소속이고 연락처는 선택이다(2026-09-14). 원장은 선택이며, 없으면 temporary_guest를 만들고 있으면 issue_guest_account로 인격을 연결한다. 같은 이메일·같은 이름이면 기존 계정을 그대로 돌려주고 아무 칸도 덮지 않는다.';

-- ---------------------------------------------------------------------
-- (5) create_guest_accounts — 엄격 일괄 창구
--
--     계약의 변경점만 적는다(나머지는 20260913140000 머리말 그대로).
--       · 행에 `affiliation`이 들어오고 **필수**다: AFFILIATION_REQUIRED /
--         AFFILIATION_TOO_LONG.
--       · 연락처는 선택이다: PHONE_REQUIRED·PHONE_DUPLICATE_IN_BATCH·PHONE_TAKEN_GUEST가
--         **사라지고** PHONE_INVALID만 남는다(값이 있을 때 형식만 본다).
--       · 배치 안 중복 판정은 이메일 하나만 본다. 연락처는 나눠 쓸 수 있는 값이 되었다.
--       · 동시성의 마지막 판정은 이제 이메일 유일 인덱스(uq_users_email_live) 하나다.
--         연락처 인덱스는 (2)에서 철회했으므로 unique_violation 분기에서도 뺀다.
-- ---------------------------------------------------------------------
create or replace function public.create_guest_accounts(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_max        constant integer := 200;
  v_actor      uuid    := app.current_app_user_id();
  v_parsed     jsonb;
  v_results    jsonb   := '[]'::jsonb;
  v_created    integer := 0;
  v_failed     integer := 0;
  v_iter       record;
  v_row        jsonb;
  v_errors     jsonb;
  v_idx        integer;
  v_key        text;
  v_name       text;
  v_email      text;
  v_email_key  text;
  v_affil      text;
  v_phone      text;
  v_phone_key  text;
  v_master_tbl text;
  v_master_txt text;
  v_master_id  uuid;
  v_user_type  text;
  v_company    uuid;
  v_new        uuid;
  v_state      text;
  v_msg        text;
  v_constraint text;
begin
  -- 호출 자체의 인가. 화면에서 감추는 것은 인가가 아니므로 여기서 막는다.
  if v_actor is null or app.is_guest() then
    raise exception '내부 사용자만 GUEST 계정을 생성할 수 있습니다.' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception '입력은 행 배열(jsonb array)이어야 합니다.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception '생성할 행을 하나 이상 넣어야 합니다.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > v_max then
    raise exception '한 번에 처리할 수 있는 행은 최대 %건입니다.', v_max using errcode = '22023';
  end if;

  -- ① 입력을 한 번만 훑어 정규화하고, 배치 안 중복을 행마다 표시한다.
  --    중복 표시는 창(window)으로 센다 — 같은 키를 가진 행 전부에 같은 답이 붙어야 하며
  --    어느 하나를 승자로 고르지 않는다. 세는 축은 이메일과 호출자 key 둘뿐이다.
  with raw as (
    select (t.ord - 1)::integer as idx,
           case when jsonb_typeof(t.elem) = 'object' then t.elem else null end as obj
      from jsonb_array_elements(p_rows) with ordinality as t(elem, ord)
  ),
  norm as (
    select r.idx,
           r.obj is not null                                          as is_object,
           nullif(btrim(coalesce(r.obj ->> 'key', '')), '')            as key,
           nullif(btrim(coalesce(r.obj ->> 'name', '')), '')           as name,
           nullif(btrim(coalesce(r.obj ->> 'email', '')), '')          as email,
           nullif(btrim(coalesce(r.obj ->> 'affiliation', '')), '')    as affiliation,
           nullif(btrim(coalesce(r.obj ->> 'phone', '')), '')          as phone,
           nullif(btrim(coalesce(r.obj ->> 'master_table', '')), '')   as master_table,
           nullif(btrim(coalesce(r.obj ->> 'master_id', '')), '')      as master_id
      from raw r
  ),
  keyed as (
    select n.*,
           app.norm_email(n.email) as email_key,
           app.norm_phone(n.phone) as phone_key
      from norm n
  ),
  flagged as (
    select k.*,
           (k.email_key is not null and count(*) over (partition by k.email_key) > 1) as dup_email,
           (k.key       is not null and count(*) over (partition by k.key)       > 1) as dup_key
      from keyed k
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'idx',          f.idx,
               'is_object',    f.is_object,
               'key',          f.key,
               'name',         f.name,
               'email',        f.email,
               'email_key',    f.email_key,
               'affiliation',  f.affiliation,
               'phone',        f.phone,
               'phone_key',    f.phone_key,
               'master_table', f.master_table,
               'master_id',    f.master_id,
               'dup_email',    f.dup_email,
               'dup_key',      f.dup_key
             ) order by f.idx
           ),
           '[]'::jsonb
         )
    into v_parsed
    from flagged f;

  -- ② 행마다 독립적으로 판정하고 만든다.
  for v_iter in
    select e.elem from jsonb_array_elements(v_parsed) as e(elem)
     order by (e.elem ->> 'idx')::integer
  loop
    v_row        := v_iter.elem;
    v_errors     := '[]'::jsonb;
    v_new        := null;
    v_user_type  := null;
    v_company    := null;
    v_master_id  := null;
    v_idx        := (v_row ->> 'idx')::integer;
    v_key        := v_row ->> 'key';
    v_name       := v_row ->> 'name';
    v_email      := v_row ->> 'email';
    v_email_key  := v_row ->> 'email_key';
    v_affil      := v_row ->> 'affiliation';
    v_phone      := v_row ->> 'phone';
    v_phone_key  := v_row ->> 'phone_key';
    v_master_tbl := v_row ->> 'master_table';
    v_master_txt := v_row ->> 'master_id';

    -- ②-1 입력 자체의 문제. 칸마다 모아서 한 번에 돌려준다(한 칸 고치고 다시 올리는
    --      왕복을 만들지 않는다).
    if not coalesce((v_row ->> 'is_object')::boolean, false) then
      v_errors := v_errors || app.guest_batch_error(
        'row', 'ROW_NOT_OBJECT', '행은 name·email·affiliation을 가진 객체여야 합니다.');
    else
      if v_name is null then
        v_errors := v_errors || app.guest_batch_error(
          'name', 'NAME_REQUIRED', '이름을 입력해야 합니다.');
      elsif length(v_name) > 100 then
        v_errors := v_errors || app.guest_batch_error(
          'name', 'NAME_TOO_LONG', '이름은 100자를 넘을 수 없습니다.');
      end if;

      if v_email is null then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_REQUIRED', '이메일을 입력해야 합니다(이메일이 로그인 ID입니다).');
      -- 형식 검사는 admin_update_guest_contact와 같은 식을 쓴다 — 같은 계정 원장의
      -- 같은 칸이므로 창구마다 다른 기준을 두지 않는다.
      elsif length(v_email) > 254
         or v_email_key !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_INVALID', '이메일 형식이 올바르지 않습니다.');
      elsif coalesce((v_row ->> 'dup_email')::boolean, false) then
        v_errors := v_errors || app.guest_batch_error(
          'email', 'EMAIL_DUPLICATE_IN_BATCH',
          '같은 이메일이 입력 안에 두 번 이상 있습니다. 해당 행 전부를 만들지 않습니다.');
      end if;

      if v_affil is null then
        v_errors := v_errors || app.guest_batch_error(
          'affiliation', 'AFFILIATION_REQUIRED', '소속을 입력해야 합니다.');
      elsif length(v_affil) > 200 then
        v_errors := v_errors || app.guest_batch_error(
          'affiliation', 'AFFILIATION_TOO_LONG', '소속은 200자를 넘을 수 없습니다.');
      end if;

      -- 연락처는 선택이다. 적었을 때만 형식을 본다 — 빈 칸을 사유로 세우면 선택 칸이
      -- 아니고, 형식을 안 보면 쓸 수 없는 번호가 원장에 그대로 남는다.
      if v_phone is not null
         and (v_phone_key is null or length(v_phone_key) < 9 or length(v_phone_key) > 15) then
        v_errors := v_errors || app.guest_batch_error(
          'phone', 'PHONE_INVALID', '연락처는 숫자 9~15자리여야 합니다(비워 둘 수 있습니다).');
      end if;

      -- 호출자 식별자가 겹치면 결과를 입력 행에 되짚을 수 없다. index는 항상 고유하므로
      -- 결과 자체는 쓸 수 있지만, key로 짝을 맞추는 화면이 잘못 붙이는 것을 막는다.
      if coalesce((v_row ->> 'dup_key')::boolean, false) then
        v_errors := v_errors || app.guest_batch_error(
          'key', 'KEY_DUPLICATE_IN_BATCH', '같은 key가 입력 안에 두 번 이상 있습니다.');
      end if;

      if (v_master_tbl is null) <> (v_master_txt is null) then
        v_errors := v_errors || app.guest_batch_error(
          'master_table', 'MASTER_PAIR_REQUIRED',
          '원장을 연결하려면 master_table과 master_id를 함께 지정해야 합니다.');
      elsif v_master_tbl is not null then
        if v_master_tbl not in ('startups', 'networks', 'ma_sellers', 'ma_buyers') then
          v_errors := v_errors || app.guest_batch_error(
            'master_table', 'MASTER_TABLE_UNKNOWN', '지원하지 않는 원장입니다.');
        elsif v_master_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          v_errors := v_errors || app.guest_batch_error(
            'master_id', 'MASTER_ID_INVALID', 'master_id가 uuid 형식이 아닙니다.');
        end if;
      end if;
    end if;

    -- ②-2 DB가 답해야 하는 문제 + 삽입. 한 행의 실패가 다른 행을 되돌리지 않도록
    --      행마다 예외 블록(=savepoint)을 둔다.
    if v_errors = '[]'::jsonb then
      begin
        if v_master_tbl is not null then
          v_master_id := v_master_txt::uuid;

          -- 원장 연결은 **그 원장 행을 읽을 수 있는 사람만** 한다. M&A는 존재 자체가
          -- 기밀이라 '없음'과 '권한 없음'을 갈라 답하지 않는다(can_read_ma_party가 둘을
          -- 같은 false로 돌려준다 — 여기서 되살리면 이메일만으로 매각 검토를 알 수 있다).
          if not app.can_read_master_table(v_master_tbl)
             or (v_master_tbl = 'ma_sellers' and not app.can_read_ma_party('ma_seller', v_master_id))
             or (v_master_tbl = 'ma_buyers'  and not app.can_read_ma_party('ma_buyer',  v_master_id)) then
            v_errors := v_errors || app.guest_batch_error(
              'master_table', 'MASTER_FORBIDDEN', '이 원장 대상에 계정을 연결할 권한이 없습니다.');

          -- 흡수된 행(merged_into_id)은 고를 수 없다 — 화면의 원장 선택창과 같은 기준이며,
          -- 인격을 비켜 간 행에 붙이면 그 계정이 어느 정본에 속하는지 답할 수 없다.
          -- can_read_ma_party는 살아 있는지만 보고 병합은 보지 않으므로 M&A도 여기서
          -- 따로 확인한다. **권한 판정 뒤에 오는 순서**라 못 읽는 사람에게는 여전히
          -- FORBIDDEN 하나만 가고 병합 여부도 새지 않는다.
          elsif v_master_tbl = 'startups' and not exists (
            select 1 from public.startups s
             where s.id = v_master_id and s.deleted_at is null and s.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          elsif v_master_tbl = 'networks' and not exists (
            select 1 from public.networks n
             where n.id = v_master_id and n.deleted_at is null and n.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          elsif v_master_tbl = 'ma_sellers' and not exists (
            select 1 from public.ma_sellers x
             where x.id = v_master_id and x.deleted_at is null and x.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          elsif v_master_tbl = 'ma_buyers' and not exists (
            select 1 from public.ma_buyers x
             where x.id = v_master_id and x.deleted_at is null and x.merged_into_id is null
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'master_id', 'MASTER_NOT_FOUND', '원장에서 살아 있는 정본 대상을 찾을 수 없습니다.');
          end if;

          -- 유형을 늘리지 않는다 — 무엇인지는 guest_identities.master_table이 답한다
          -- (2026-09-08 확정). company_id는 startups(id) FK라 그 인격만 채운다.
          if v_master_tbl = 'networks' then
            v_user_type := 'external_expert';
          else
            v_user_type := 'external_startup';
          end if;
          if v_master_tbl = 'startups' then
            v_company := v_master_id;
          end if;
        else
          v_user_type := 'temporary_guest';
        end if;

        -- 이메일은 활성 계정 전체에서 하나다. **정지 계정도 자리를 지킨다**(is_active를
        -- 보지 않는다) — 정지는 잠시 막은 상태이고 계정은 살아 있다. 재운 계정(deleted_at)
        -- 만 자리를 비켜 주며, 이 기준이 uq_users_email_live와 같다. 식도 같은 모양으로
        -- 적어 그 인덱스를 탄다.
        --
        -- **연락처는 더 이상 묻지 않는다**(2026-09-14). 자격증명이 아니게 되어 유일
        -- 인덱스를 철회했으므로, 여기서만 막으면 화면과 DB의 기준이 갈린다.
        if v_errors = '[]'::jsonb then
          if exists (
            select 1 from public.users u
             where u.deleted_at is null
               and lower(btrim(u.email)) = v_email_key
               and not app.is_guest_user_type(u.user_type)
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_INTERNAL',
              '이 이메일은 내부 임직원 계정입니다. GUEST 계정은 다른 주소로 만드십시오.');
          elsif exists (
            select 1 from public.users u
             where u.deleted_at is null
               and lower(btrim(u.email)) = v_email_key
               and app.is_guest_user_type(u.user_type)
          ) then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_GUEST',
              '이 이메일을 쓰는 GUEST 계정이 이미 있습니다(정지된 계정도 포함). 기존 계정을 이 경로로 재사용하지 않습니다.');
          end if;
        end if;

        if v_errors = '[]'::jsonb then
          insert into public.users (user_type, name, email, affiliation, phone, company_id)
          values (v_user_type::public.user_type, v_name, v_email, v_affil, v_phone, v_company)
          returning id into v_new;

          insert into public.workspace_permissions
            (user_id, workspace_key, permission_level, scope_type, scope_id)
          values (v_new, 'guest', 'write', 'self', null);

          -- 자격증명 자리를 비워 둔 채 함께 만든다. 행이 없으면 로그인 경로가
          -- "초기 상태"와 "계정 없음"을 구분하지 못한다.
          insert into public.guest_credentials (user_id) values (v_new);

          if v_master_tbl is not null then
            insert into public.guest_identities (master_table, master_id, user_id, created_by)
            values (v_master_tbl, v_master_id, v_new, v_actor);
          end if;

          perform app.log_guest_access(
            v_new,
            'GUEST_ACCOUNT_ISSUE',
            'guest:account',
            jsonb_build_object(
              'person_source', 'manual',
              'source',        'batch',
              'batch_index',   v_idx,
              'batch_key',     v_key,
              'master_table',  v_master_tbl,
              'master_id',     v_master_id
            ),
            null
          );
        end if;
      exception
        -- 인가 실패는 행 사유로 접지 않는다 — 전체 호출이 멈춰야 하는 사실이다.
        when insufficient_privilege then
          raise;
        when unique_violation then
          get stacked diagnostics
            v_constraint = constraint_name,
            v_msg        = message_text;
          v_new := null;
          -- 사전 검사를 통과한 뒤에도 인덱스가 막았다면 같은 키를 다른 요청이 방금 만든
          -- 것이다(검사와 삽입 사이의 틈). 남은 유일 인덱스는 이메일 하나다.
          if coalesce(v_constraint, '') = 'uq_users_email_live'
             or position('uq_users_email_live' in coalesce(v_msg, '')) > 0 then
            v_errors := v_errors || app.guest_batch_error(
              'email', 'EMAIL_TAKEN_GUEST', '방금 다른 요청이 이 이메일로 계정을 만들었습니다.');
          else
            -- 어느 값이 부딪혔는지 모르는 중복은 **문구를 그대로 돌려주지 않는다.**
            -- 원본 메시지에는 인덱스·컬럼 이름과 호출자가 볼 수 없는 계정의 값이
            -- 그대로 담긴다(숨은 계정의 존재를 되짚는 통로가 된다). 진단은 서버
            -- 로그로만 남기고 화면에는 담당자가 할 수 있는 일만 말한다.
            raise log 'create_guest_accounts 중복 거부: index=% constraint=% message=%',
              v_idx, v_constraint, v_msg;
            v_errors := v_errors || app.guest_batch_error(
              'row', 'DB_CONFLICT',
              '이미 있는 값과 부딪혀 만들지 못했습니다. 입력을 확인한 뒤 다시 시도하십시오.');
          end if;
        when others then
          get stacked diagnostics
            v_state = returned_sqlstate,
            v_msg   = message_text;
          v_new := null;
          -- 같은 이유로 원본 메시지·SQLSTATE를 밖으로 내보내지 않는다.
          raise log 'create_guest_accounts 행 실패: index=% sqlstate=% message=%',
            v_idx, v_state, v_msg;
          v_errors := v_errors || app.guest_batch_error(
            'row', 'DB_ERROR', '이 행을 만들지 못했습니다. 담당자에게 문의하십시오.');
      end;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'index',        v_idx,
        'key',          v_key,
        'status',       (case when v_new is not null then 'CREATED' else 'FAILED' end)::text,
        'user_id',      v_new,
        'user_type',    case when v_new is not null then v_user_type end,
        'master_table', v_master_tbl,
        'master_id',    v_master_txt,
        'errors',       v_errors
      )
    );

    if v_new is not null then
      v_created := v_created + 1;
    else
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'total',   jsonb_array_length(p_rows),
    'created', v_created,
    'failed',  v_failed,
    'rows',    v_results
  );
end;
$fn$;

revoke all on function public.create_guest_accounts(jsonb)
  from public, anon, service_role;
grant execute on function public.create_guest_accounts(jsonb)
  to authenticated;

comment on function public.create_guest_accounts(jsonb) is
  'GUEST 계정 엄격 일괄 생성. 행마다 이름·이메일·소속이 필수이고 연락처는 선택이다(2026-09-14). 내부 사용자만 호출하며, 행마다 독립적으로 만들고 이미 쓰이는 이메일(정지 계정 포함)은 기존 계정을 재사용하지 않고 그 행만 실패시킨다. 배치 안 이메일 중복은 관련 행 전부를 실패시킨다. 원장 연결은 그 원장을 읽을 수 있는 사람만 할 수 있고 M&A는 존재를 답하지 않는다. 결과는 입력 index/key·status·user_id·칸별 사유를 담은 jsonb.';

-- ---------------------------------------------------------------------
-- (6) admin_update_guest_contact — ADMIN 계정 정보 수정
--
--     바뀌는 것 셋.
--       · 소속을 함께 고친다(선택 — 비우면 지워진다).
--       · 연락처가 선택이 되었다. 빈 값은 **지우라는 뜻**이며, 이메일만 필수다.
--       · 연락처 중복 검사를 걷는다(유일 인덱스를 철회했으므로 여기만 막으면 갈린다).
--
--     세션을 죽이는 조건은 종전과 같이 **이메일 또는 연락처가 바뀔 때**다. 이메일은
--     로그인 아이디이고, 연락처는 자격증명은 아니지만 재설정 링크의 수신처가 될 수
--     있어(이메일이 없는 계정) 바뀌면 살아 있는 링크를 함께 비워야 한다. 소속만 고치면
--     세션도 링크도 건드리지 않는다 — 로그인과 무관한 표시값이다.
-- ---------------------------------------------------------------------
drop function if exists public.admin_update_guest_contact(uuid, text, text, text);

create function public.admin_update_guest_contact(
  p_user_id     uuid,
  p_email       text,
  p_phone       text,
  p_affiliation text,
  p_reason      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_account    public.users%rowtype;
  v_email      text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone      text := nullif(btrim(coalesce(p_phone, '')), '');
  v_affil      text := nullif(btrim(coalesce(p_affiliation, '')), '');
  v_reason     text := nullif(btrim(coalesce(p_reason, '')), '');
  v_norm_email text;
  v_norm_phone text;
  v_holder     text;
  v_email_changed boolean;
  v_phone_changed boolean;
  v_affil_changed boolean;
  v_reset_cleared boolean := false;
  v_version    integer;
begin
  if not app.is_admin() then
    raise exception 'GUEST 계정 정보는 시스템 관리자만 수정할 수 있습니다.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception '수정 사유를 입력해야 합니다.' using errcode = '22023';
  end if;
  -- 이메일만 필수다. 연락처·소속은 **현재 값을 함께 보내는 규약**을 그대로 쓰며,
  -- 빈 값은 "지운다"는 뜻이다(바꾸지 않을 칸은 현재 값을 그대로 보낸다).
  if v_email is null then
    raise exception '이메일(로그인 ID)은 비울 수 없습니다.' using errcode = '22023';
  end if;

  v_norm_email := app.norm_email(v_email);
  v_norm_phone := app.norm_phone(v_phone);

  -- 형식 검사. 이메일은 로그인 아이디라 공백·다중 @를 허용하지 않고, 전화는 값이 있을
  -- 때만 숫자 9~15자리를 요구한다(02-123-4567 = 9자리, 국가번호 포함 최대 15자리 — E.164).
  if length(v_email) > 254 or v_norm_email !~ '^[^@[:space:]]+@[^@[:space:].]+(\.[^@[:space:].]+)+$' then
    raise exception '이메일 형식이 올바르지 않습니다: %', v_email using errcode = '22023';
  end if;
  if v_phone is not null
     and (v_norm_phone is null or length(v_norm_phone) < 9 or length(v_norm_phone) > 15) then
    raise exception '연락처는 숫자 9~15자리여야 합니다(비워 둘 수 있습니다).' using errcode = '22023';
  end if;
  if v_affil is not null and length(v_affil) > 200 then
    raise exception '소속은 200자를 넘을 수 없습니다.' using errcode = '22023';
  end if;

  select u.* into v_account
    from public.users u
   where u.id = p_user_id and u.deleted_at is null
   for update;
  if not found then
    raise exception '대상 계정을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not app.is_guest_user_type(v_account.user_type) then
    raise exception 'GUEST 계정이 아닙니다. 임직원 연락처는 인사 원장이 소유합니다.'
      using errcode = '22023';
  end if;

  -- 중복은 **정지된 계정까지** 본다. 정지는 되돌릴 수 있으므로, 정지 계정의 아이디를
  -- 다른 계정에 붙이면 해제하는 순간 살아 있는 계정 둘이 같은 아이디를 갖는다.
  -- 이메일은 내부 임직원까지 포함한 전체 활성 users에서 하나다(uq_users_email_live와 같은 범위).
  -- 조건을 인덱스 식(lower(btrim(email)))과 같은 모양으로 적는다. app.norm_email과 값은
  -- 같지만, 같은 식으로 물어야 부분 유일 인덱스를 타고 판정이 인덱스와 어긋나지 않는다.
  --
  -- **연락처는 더 이상 유일하지 않다**(2026-09-14, uq_users_guest_phone 철회). 자격증명이
  -- 아니게 되었으므로 회사 대표번호를 여럿이 공유하는 것을 막을 근거가 없다.
  select u.name into v_holder
    from public.users u
   where u.id <> p_user_id
     and u.deleted_at is null
     and lower(btrim(u.email)) = v_norm_email
   limit 1;
  if v_holder is not null then
    raise exception '이 이메일은 이미 다른 계정(%)이 쓰고 있습니다.', v_holder
      using errcode = '23505';
  end if;

  v_email_changed := app.norm_email(v_account.email) is distinct from v_norm_email;
  v_phone_changed := app.norm_phone(v_account.phone) is distinct from v_norm_phone;
  v_affil_changed := nullif(btrim(coalesce(v_account.affiliation, '')), '') is distinct from v_affil;

  -- 표기만 다른 재전송(대소문자·하이픈)은 값이 같으므로 아무 일도 하지 않는다.
  -- 세션을 죽이지도, 감사 로그에 빈 줄을 남기지도 않는다.
  if not v_email_changed and not v_phone_changed and not v_affil_changed then
    return jsonb_build_object(
      'user_id', p_user_id,
      'changed', false,
      'email_changed', false,
      'phone_changed', false,
      'affiliation_changed', false,
      'session_version', v_account.session_version
    );
  end if;

  update public.users
     set email = v_email,
         phone = v_phone,
         affiliation = v_affil,
         -- 아이디나 수신처가 바뀌면 옛 세션과 단명 티켓(설정·선택)은 그 자리에서 죽는다.
         -- 소속만 바뀐 경우에는 올리지 않는다 — 로그인과 무관한 표시값이라 세션을 끊을
         -- 이유가 없고, 끊으면 담당자가 표기 하나 고칠 때마다 게스트를 밖으로 밀어낸다.
         -- is_active는 이 창구의 사실이 아니므로 그대로 둔다.
         session_version = session_version
                         + (case when v_email_changed or v_phone_changed then 1 else 0 end),
         updated_at = now()
   where id = p_user_id
  returning session_version into v_version;

  -- 살아 있는 재설정 링크도 함께 죽인다. 링크는 **옛 수신처로 나간 열쇠**이므로, 주소나
  -- 번호가 바뀐 뒤에도 그것이 통하면 방금 끊어 낸 옛 수신처가 계정을 다시 가져간다.
  -- **비밀번호 해시는 건드리지 않는다** — 정보 수정은 초기화가 아니다(초기화는 별개
  -- 창구이며 사유를 따로 받는다). 잠금 카운터도 그대로 둔다: 그것은 시도 이력의 사실이다.
  -- 소속만 바뀐 경우에는 수신처가 그대로이므로 링크를 비우지 않는다.
  if v_email_changed or v_phone_changed then
    update public.guest_credentials
       set reset_token_hash = null,
           reset_expires_at = null,
           reset_session_version = null
     where user_id = p_user_id
       and (reset_token_hash is not null
            or reset_expires_at is not null
            or reset_session_version is not null);
    v_reset_cleared := found;
  end if;

  perform app.log_guest_change(
    p_user_id,
    'GUEST_CONTACT_UPDATE',
    'guest:contact',
    jsonb_build_object(
      'email', v_account.email,
      'phone', v_account.phone,
      'affiliation', v_account.affiliation
    ),
    jsonb_build_object(
      'email', v_email,
      'phone', v_phone,
      'affiliation', v_affil,
      'reset_link_cleared', v_reset_cleared
    ),
    v_reason
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'changed', true,
    'email_changed', v_email_changed,
    'phone_changed', v_phone_changed,
    'affiliation_changed', v_affil_changed,
    'reset_link_cleared', v_reset_cleared,
    'session_version', v_version
  );
end;
$fn$;

revoke all on function public.admin_update_guest_contact(uuid, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.admin_update_guest_contact(uuid, text, text, text, text)
  to authenticated;

comment on function public.admin_update_guest_contact(uuid, text, text, text, text) is
  'ADMIN 전용 GUEST 계정 정보 수정(이메일·연락처·소속). users만 고치고 원장은 건드리지 않는다. 이메일만 필수이며 빈 연락처·빈 소속은 지운다는 뜻이다. 이메일 중복은 정지 계정까지 보고, 이메일이나 연락처가 바뀌면 session_version을 올려 세션과 단명 티켓을 무효화하고 살아 있는 재설정 링크를 비운다(소속만 바뀌면 둘 다 그대로). 비밀번호 해시·잠금과 is_active는 유지한다. 변경 전/후를 audit_logs에 남긴다. 근거: 3_9_1 §6.2';

-- ---------------------------------------------------------------------
-- (7) guest_accounts_list — 소속을 함께 돌려주고 검색에도 건다
--
--     반환 형이 바뀌므로 drop 후 재생성한다. 인자 목록은 그대로다.
--     소속은 마스킹하지 않는다(머리말의 데이터 등급 판단 참조).
-- ---------------------------------------------------------------------
drop function if exists public.guest_accounts_list(text, integer, integer, text, text[], boolean, text);

create function public.guest_accounts_list(
  p_search        text    default null,
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_entity_key    text    default null,
  p_master_tables text[]  default null,
  p_only_orphans  boolean default false,
  p_facet         text    default null
)
returns table(user_id uuid, name text, email text, phone text, affiliation text,
              user_type text, is_active boolean,
              company_name text, identities jsonb, has_password boolean,
              created_at timestamptz, last_login_at timestamptz,
              program_count integer, open_count integer, programs jsonb, total_count bigint)
language plpgsql
stable
security invoker
set search_path = app, public
as $fn$
#variable_conflict use_column
declare
  v_raw   boolean := app.is_admin();
  v_term  text    := nullif(btrim(coalesce(p_search, '')), '');
  v_digit text    := app.norm_phone(p_search);
begin
  if app.current_app_user_id() is null or app.is_guest() then
    raise exception '내부 사용자만 게스트 계정 목록을 볼 수 있습니다.' using errcode = '42501';
  end if;
  if p_entity_key is not null and p_entity_key not in ('program', 'ma_program', 'fund') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;
  if p_master_tables is not null and exists (
    select 1 from unnest(p_master_tables) t
     where t not in ('startups', 'networks', 'ma_sellers', 'ma_buyers')
  ) then
    raise exception '알 수 없는 인격 원장이 섞여 있습니다.' using errcode = '22023';
  end if;
  if p_facet is not null
     and p_facet not in ('startups', 'networks', 'ma_sellers', 'ma_buyers', 'fund', 'unlinked') then
    raise exception '알 수 없는 GUEST 계정 탭입니다: %', p_facet using errcode = '22023';
  end if;

  return query
  with ledger as (
    select 'program'::text as entity_key, id, code, title, status::text as status,
           guest_access_ends_at
      from public.programs where deleted_at is null
    union all
    select 'ma_program', id, code, title, status::text, guest_access_ends_at
      from public.ma_programs where deleted_at is null
    union all
    select 'fund', id, code, name, status::text, guest_access_ends_at
      from public.funds where deleted_at is null
  ),
  accounts as (
    select u.id, u.name, u.email, u.phone, u.affiliation,
           u.user_type::text as user_type, u.is_active,
           u.created_at, u.company_id
      from public.users u
     where app.is_guest_user_type(u.user_type)
       and u.deleted_at is null
       and (
         v_term is null
         or u.name  ilike '%' || v_term || '%'
         or u.email ilike '%' || v_term || '%'
         -- 소속도 검색 축이다. 목록의 한 열로 서는 값이라 눈에 보이는 것으로 걸러진다
         -- (보이지 않는 값으로 걸러지면 방금 본 줄이 사라진 이유를 화면이 답하지 못한다).
         or u.affiliation ilike '%' || v_term || '%'
         or (v_digit is not null and app.norm_phone(u.phone) like '%' || v_digit || '%')
       )
       and app.guest_account_visible(u.id)
       and (
         p_master_tables is null
         or exists (
           select 1 from public.guest_identities gi
            where gi.user_id = u.id and gi.master_table = any (p_master_tables)
         )
       )
       and (
         p_facet is null
         or (
           p_facet in ('startups', 'networks', 'ma_sellers', 'ma_buyers')
           and exists (
             select 1 from public.guest_identities gi
              where gi.user_id = u.id and gi.master_table = p_facet
           )
         )
         or (
           p_facet = 'fund'
           and exists (
             select 1
               from public.program_participants pp
               join public.funds f on f.id = pp.program_id and f.deleted_at is null
              where pp.user_id = u.id and pp.entity_key = 'fund'
           )
         )
         or (p_facet = 'unlinked' and app.guest_account_is_unlinked(u.id))
       )
  ),
  participations as (
    select distinct on (p.user_id, p.entity_key, p.program_id)
           p.user_id, p.entity_key, p.program_id, p.master_table, p.login_status
      from public.program_participants p
     where p.user_id is not null
       and (p_entity_key is null or p.entity_key = p_entity_key)
     order by p.user_id, p.entity_key, p.program_id,
              case p.login_status
                when 'ACTIVE'      then 1
                when 'INVITED'     then 2
                when 'BLOCKED'     then 3
                when 'NOT_ALLOWED' then 4
                else 5
              end,
              p.master_table nulls last,
              p.id
  ),
  links as (
    select t.user_id,
           count(*) filter (where l.id is not null)::int as program_count,
           count(*) filter (
             where l.id is not null and t.login_status in ('INVITED', 'ACTIVE')
           )::int as open_count,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'program_id', t.program_id,
                 'entity_key', t.entity_key,
                 'workspace', app.entity_key_workspace(t.entity_key),
                 'code', l.code,
                 'title', l.title,
                 'master_table', t.master_table,
                 'login_status', t.login_status,
                 'program_status', l.status,
                 'access_ends_at', l.guest_access_ends_at
               ) order by l.title
             ) filter (where l.id is not null),
             '[]'::jsonb
           ) as programs
      from participations t
      left join ledger l on l.id = t.program_id and l.entity_key = t.entity_key
     group by t.user_id
  ),
  logins as (
    select gi.app_user_id as user_id, max(gi.used_at) as last_login_at
      from public.guest_invitations gi
     where gi.app_user_id is not null
     group by gi.app_user_id
  ),
  personas as (
    select gi.user_id,
           jsonb_agg(
             jsonb_build_object(
               'master_table', gi.master_table,
               'master_id', gi.master_id,
               'name', coalesce(s.name, n.name, ms.name, mb.name)
             ) order by gi.master_table
           ) as identities
      from public.guest_identities gi
      left join public.startups s
        on gi.master_table = 'startups' and s.id = gi.master_id
      left join public.networks n
        on gi.master_table = 'networks' and n.id = gi.master_id
      left join public.ma_sellers ms
        on gi.master_table = 'ma_sellers' and ms.id = gi.master_id
      left join public.ma_buyers mb
        on gi.master_table = 'ma_buyers' and mb.id = gi.master_id
     where case gi.master_table
             when 'ma_sellers' then app.can_read_ma_party('ma_seller', gi.master_id)
             when 'ma_buyers'  then app.can_read_ma_party('ma_buyer',  gi.master_id)
             else true
           end
     group by gi.user_id
  )
  select a.id,
         a.name,
         case when v_raw then a.email else app.mask_email(a.email) end,
         case when v_raw then a.phone else app.mask_phone(a.phone) end,
         -- 소속은 가리지 않는다 — 기관 이름이라 개인 연락 수단이 아니고, 목록에서
         -- 동명이인을 가려내는 유일한 값이다.
         a.affiliation,
         a.user_type,
         a.is_active,
         s.name,
         coalesce(p.identities, '[]'::jsonb),
         app.guest_has_password(a.id),
         a.created_at,
         g.last_login_at,
         coalesce(k.program_count, 0),
         coalesce(k.open_count, 0),
         coalesce(k.programs, '[]'::jsonb),
         count(*) over ()
    from accounts a
    left join links k on k.user_id = a.id
    left join logins g on g.user_id = a.id
    left join personas p on p.user_id = a.id
    left join public.startups s on s.id = a.company_id
   where not coalesce(p_only_orphans, false) or coalesce(k.program_count, 0) = 0
   order by a.is_active desc, a.name
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

revoke all on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text)
  from public, anon;
grant execute on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text)
  to authenticated;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean, text) is
  '전사 GUEST 계정 목록. 이름·이메일·소속·연락처를 검색하고 소속은 마스킹 없이 돌려준다(기관 이름이라 개인 연락 수단이 아니다 — 이메일·연락처는 ADMIN에게만 원문). p_facet은 스타트업·전문가·BUYER·SELLER 인격, FUND 참여, 분류 미연결을 서버 페이징 전에 분류한다. 한 계정의 복수 인격은 각 탭에 각각 나타나며, 원장 인격 없이 PROJECT·M&A에 계정만 추가한 경우는 미연결에 남는다. 참여 사업과 M&A 인격은 호출자가 읽을 수 있는 범위만 반환한다.';

commit;
