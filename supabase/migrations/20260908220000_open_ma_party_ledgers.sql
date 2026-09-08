-- =====================================================================
-- [외부 포털 확장 6/N] M&A 원장 두 종을 계정·명부에 연다
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §5~§6
--
-- 외부인이 들어오는 자리를 AC 하나에서 AC·FUND·M&A 셋으로 넓히는 일의 DB 절반이다.
-- 화면(워크스페이스별 '계정생성' 탭과 그 하위 원장 탭)은 같은 커밋에서 함께 선다.
--
-- **전화번호 칸을 더하는 이유**(2026-09-08 사용자 지정 "M&A 원장에 전화번호를 넣으면
-- 해결되지 않나?"):
--   초기 비밀번호가 연락처다. 두 M&A 원장에는 이메일만 있고 전화번호가 없어, 원장에서
--   꺼내는 경로만으로는 새 계정의 자격증명을 만들 수 없었다. 발급 폼에서 담당자가 직접
--   적을 수도 있지만(20260908170000이 p_phone을 열었다) 그러면 **같은 사실이 두 곳에**
--   살게 된다 — 원장에는 이메일만 있고 전화번호는 계정에만 있어, 나중에 번호가 바뀌면
--   어느 쪽이 정본인지 답할 근거가 없다. 연락처는 그 회사의 사실이므로 원장이 갖는다.
--
--   NOT NULL을 걸지 않는다: 이미 있는 행에 번호가 없고, 지금 잠그면 그 행은 저장 자체가
--   막혀 채워 넣을 수도 없다(networks.country_tag_id가 먼저 밟은 길).
--
-- **CHECK 둘과 함수 둘을 같은 파일에서 연다.** 한 곳만 열면 발급은 되는데 명부에 담기지
-- 않는 계정이 생기고, 그 계정은 아무 문도 열지 못한 채 원장에만 남는다.
--
--   (1) guest_identities_master_table_check  — 인격 매핑
--   (2) program_participants_master_table_chk — 명부 행
--   (3) issue_guest_account                   — 허용 목록 + 원장 분기
--   (4) guest_accounts_list                   — 인격 이름 조인
--
-- **else를 when으로 편다.** 원장이 둘일 때는 else가 곧 나머지 하나였지만 넷이 된 지금은
-- 모르는 값이 조용히 마지막 가지로 흘러든다(20260908210000에서 같은 결함을 이미 한 번
-- 고쳤다 — 그때는 폴백의 이메일 조회가 ma_sellers를 networks에서 찾고 있었다).
--
-- **user_type은 늘리지 않는다.** 3종이 서로 갈라 판정하는 자리가 없고 30여 곳에서 한
-- 묶음으로만 쓰인다 — 무엇인지는 master_table이 답한다. 매각 기업·인수 후보사는 둘 다
-- 기업이므로 external_startup을 그대로 쓴다.
--
-- **company_id는 비워 둔다.** 그 칸은 startups(id) FK라 M&A 원장 id를 담을 수 없다.
-- ma_sellers·ma_buyers에 startup_id가 있어 그것을 넣을 수도 있으나 넣지 않는다 — 그러면
-- 그 계정의 소속이 '연결된 스타트업'이 되어, 인수 후보사 담당자가 그 스타트업의 사람으로
-- 읽힌다. 소속은 guest_identities가 답한다.
--
-- **함수 본문 전수 조사**(표·컬럼·제약을 건드릴 때의 한 벌):
--   'startups', 'networks' 두 값을 본문에 나열한 함수를 카탈로그로 훑어 이 파일에서
--   함께 고친 것이 위 (3)(4)다. 나머지 일치는 판정 대상이 아니었다 —
--   app.can_read_master_table(20260908180000)은 이미 네 값을 알고 있고(그때 M&A를 내다보고
--   넣었다), open_program_guest_access(20260908210000)의 원장 이메일 폴백은 어제 when으로
--   좁혀 두어 M&A는 null로 떨어진다(그리고 이제 issue_guest_account가 사유를 답한다).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: mna(원장 2종) / guest(계정·인격)
--   - 데이터 등급: Confidential — ma_sellers·ma_buyers의 연락처는 개인정보이고, 그 행의
--     존재 자체가 "어느 기업이 매각·인수를 검토 중인가"를 말한다.
--   - 접근 주체: 원장 읽기는 각 원장의 기존 SELECT 정책 그대로. 계정 목록에 그 인격이
--     서는 것은 app.can_read_master_table이 판정한다(20260908180000, 미지 원장은 false).
--   - Scope 기준: 무변경. 이 파일은 허용 목록만 넓히고 판정식은 하나도 새로 쓰지 않는다.
--   - 신규 테이블 없음. 신규 정책 없음. 신규 SECURITY DEFINER 없음
--     (issue_guest_account는 종전대로 DEFINER, guest_accounts_list는 종전대로 INVOKER).
--   - 컬럼 신설 2종(ma_sellers.phone · ma_buyers.phone): 기존 원장 정책이 그대로 덮는다.
--     마스킹은 화면이 기존 콘텐츠 키(mna.sellers · mna.buyers)를 그대로 쓴다.
--   - 감사 로그: 무변경(GUEST_ACCOUNT_ISSUE payload에 master_table 값이 둘 더 나타난다).
--   - 운영 영향: 이 파일만으로는 아무 일도 일어나지 않는다 — M&A 원장을 고를 수 있게
--     되는 것은 화면이 그 탭을 세운 뒤부터다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (0) 연락처 — 초기 비밀번호가 되는 값이라 계정이 아니라 원장이 갖는다
-- ---------------------------------------------------------------------
alter table public.ma_sellers add column if not exists phone text;
alter table public.ma_buyers  add column if not exists phone text;

comment on column public.ma_sellers.phone is
  '셀러 쪽 담당자 연락처. 게스트 계정의 초기 비밀번호가 되는 값이라 계정이 아니라 원장이 갖는다(같은 사실이 두 곳에 살면 번호가 바뀐 날 어느 쪽이 정본인지 답할 수 없다). 개인정보이므로 화면은 마스킹 정책(mna.sellers)을 거쳐 렌더한다.';
comment on column public.ma_buyers.phone is
  '바이어 쪽 담당자 연락처. 게스트 계정의 초기 비밀번호가 되는 값이라 원장이 갖는다. 개인정보이므로 화면은 마스킹 정책(mna.buyers)을 거쳐 렌더한다.';

-- ---------------------------------------------------------------------
-- (1) 인격 매핑이 받는 원장
-- ---------------------------------------------------------------------
alter table public.guest_identities
  drop constraint if exists guest_identities_master_table_check;
alter table public.guest_identities
  add constraint guest_identities_master_table_check
  check (master_table in ('startups', 'networks', 'ma_sellers', 'ma_buyers'));

-- ---------------------------------------------------------------------
-- (2) 명부 행이 받는 원장
--
--     null은 그대로 허용한다 — 원장이 없는 내부 임직원 참가자 줄이다.
-- ---------------------------------------------------------------------
alter table public.program_participants
  drop constraint if exists program_participants_master_table_chk;
alter table public.program_participants
  add constraint program_participants_master_table_chk
  check (master_table is null
         or master_table in ('startups', 'networks', 'ma_sellers', 'ma_buyers'));

-- ---------------------------------------------------------------------
-- (3) 계정 발급 — 허용 목록과 원장 분기
-- ---------------------------------------------------------------------
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
set search_path = app, public
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
    select s.representative, nullif(s.contact ->> 'email', ''), nullif(s.contact ->> 'phone', '')
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

-- ---------------------------------------------------------------------
-- (4) 계정 목록 — 인격 이름 조인
--
--     인자 검증(p_master_tables)은 20260908200000이 이미 네 값을 받고 있었다 —
--     그때 M&A를 내다보고 넣었으므로 여기서 고칠 것이 없다.
-- ---------------------------------------------------------------------
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
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;
