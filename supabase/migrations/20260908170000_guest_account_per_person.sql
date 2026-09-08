-- =====================================================================
-- [외부 포털 확장 1/N] 계정의 단위를 원장 행에서 사람으로 옮긴다
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §5
--
-- 배경:
--   3_9_1 §4는 "계정 = 사람이다. 로그인 ID(이메일) 하나, 비밀번호 하나"로
--   시작해 놓고, 실제 발급은 원장 행이 이메일을 정하게 두었다.
--     · issue_guest_account(p_master_table, p_master_id) — 사람을 인자로 받지 않고
--       이름·이메일·연락처를 startups.contact / networks 에서 꺼내 쓴다.
--     · guest_identities의 PK가 (master_table, master_id) — 원장 행 하나에 계정 하나.
--   원장 행에 이메일이 하나뿐이라 결과는 **회사 = 계정**이었고, 같은 회사에
--   두 번째 사람을 발급할 방법이 없다(①번 분기가 첫 계정을 그대로 돌려준다).
--
--   AC에서는 참을 만했다 — 참여기업 대표 한 명이 자료를 내고 공지를 보면 된다.
--   M&A·FUND에서는 사고다:
--     · 인수 후보사 담당자가 셋인데 계정이 하나면 비밀번호를 셋이 돌려 쓴다.
--     · **누가 어느 자료를 열었는지 감사할 수 없다** — M&A에서는 필수다.
--     · 담당자 한 명이 이직하면 회사 계정 전체를 갈아야 한다.
--     · 포트폴리오사에서 CFO가 재무를, IR이 사업진행을 올리는데 계정을 공유한다.
--
-- 이 파일이 하는 일:
--   (1) guest_identities PK에 user_id를 더해 원장 행 : 계정을 1:N으로 푼다.
--   (2) issue_guest_account가 사람(이름·이메일·연락처)을 인자로 받는다.
--       인자를 비우면 종전대로 원장 연락처에서 꺼내므로 기존 호출이 그대로 산다.
--
-- 이 파일이 하지 않는 일:
--   · master_table CHECK 확대(ma_sellers·ma_buyers) — M&A 창구를 여는 마이그레이션의 몫.
--   · guest_identities SELECT 정책 좁히기 — 같은 이유로 뒤 파일에서 한다. 지금은
--     새는 것이 없다(startups·networks는 전사 공용 원장이라 그 사실이 이미 공개다).
--     **M&A를 열기 전에 반드시 선행되어야 한다**(3_9_2 §7).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest
--   - 데이터 등급: guest_identities = Internal (계정 자체는 users, 자격증명은 별도 원장)
--   - 접근 주체: 내부 사용자만(쓰기는 이 RPC 하나, 읽기는 기존 정책 그대로)
--   - Scope 기준: 없음 — 발급만으로는 아무것도 보이지 않는다. 권한이 걸리는 자리는
--     발급이 아니라 매핑(program_participants)이며 그 판정은 바뀌지 않는다.
--   - 감사 로그: app.log_guest_access가 GUEST_ACCOUNT_ISSUE / GUEST_IDENTITY_ADD를
--     그대로 적재한다. payload에 person_source를 더해 **원장에서 꺼낸 것인지 담당자가
--     지정한 것인지**를 남긴다 — 나중에 "이 계정 이메일을 누가 정했나"를 답해야 한다.
--   - 운영 영향:
--     · PK 확장은 제약을 **느슨하게** 하는 방향이라 기존 행은 한 줄도 잃지 않는다.
--     · 옛 2인자 시그니처를 **먼저 drop**한다. 오버로드로 남기면 옛 호출이 42725
--       (function is not unique)로 죽고, 기본값을 가진 한 벌만 두면 이미 배포된
--       프론트와 SQL 호출부가 그대로 동작해 DB 선행 순서가 깨지지 않는다.
--     · **함수 본문 전수 조사는 한 벌이다.** 본문은 의존성으로 추적되지 않아 살아남은
--       함수가 호출 순간에만 죽는다(2026-09-03·09-04·09-05에 세 번 겪었다).
--       조사 결과 — 이 파일은 **다른 함수를 고치지 않는다**:
--         · issue_guest_account를 본문에서 부르는 것은 open_program_guest_access 하나이고,
--           2인자 호출이라 새 기본값으로 그대로 해석된다(원장 연락처 경로 = 종전 동작).
--         · guest_identities를 읽는 것은 open_program_guest_access(v_had 판정) ·
--           guest_accounts_list(personas CTE) 둘인데, 둘 다 exists / group by라
--           1:N에서 문법이 깨지지 않는다.
--       **남는 것 하나**: open_program_guest_access의 v_had는 "이 원장 행에 계정이
--       있는가"를 보므로, 같은 회사의 다른 담당자가 계정을 가진 것만으로 처음 들어오는
--       사람에게 초기 비밀번호 안내가 나가지 않게 된다. 이 함수는 setof 반환에
--       return next 구조라 여기서 통째로 다시 쓰면 옮겨 적다 틀릴 위험이 크고,
--       **한 원장 행에 계정이 여럿 생기는 것은 발급 화면이 선 뒤의 일**이므로 그
--       화면과 같은 커밋에서 고친다(PROGRESS Phase 17). 프론트도 같다 —
--       participantHooks의 Map이 원장 행당 계정 하나를 전제한다(계정 유무 판정은
--       그대로 맞고, 마지막 접속만 임의의 한 계정 것이 된다).
--   - SECURITY DEFINER 신설: 없음. issue_guest_account는 종전 그대로 DEFINER이며
--     (users_insert 정책의 MANAGEMENT 분기가 게스트 행을 배제해 INVOKER로는 성립하지
--     않는다) 첫머리의 호출자 검증과 search_path 고정도 그대로 둔다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 원장 행 : 계정 = 1 : N
--
--     PK를 (master_table, master_id) → (master_table, master_id, user_id)로 넓힌다.
--     한 회사에 담당자가 여럿이면 그 회사 행을 가리키는 인격이 여러 줄이다.
--
--     user_id 단독 인덱스는 그대로 둔다(계정 하나가 가진 인격을 모으는 조회가
--     personas CTE에 있다). 새 PK의 앞머리가 (master_table, master_id)라 원장 행으로
--     찾는 조회는 여전히 그 인덱스를 탄다 — 따로 만들지 않는다.
-- ---------------------------------------------------------------------
alter table public.guest_identities
  drop constraint if exists guest_identities_pkey;

alter table public.guest_identities
  add constraint guest_identities_pkey
  primary key (master_table, master_id, user_id);

comment on table public.guest_identities is
  '원장 행(startups·networks) → 게스트 계정 매핑. 한 계정이 여러 인격을 가질 수 있고(참가기업+참가전문가), 2026-09-08부터 **한 원장 행도 계정 여럿을 가질 수 있다**(회사 담당자가 여럿). 쓰기는 issue_guest_account RPC 전용. 근거: 3_9_2 §5';

comment on column public.guest_identities.master_table is
  '인격의 출처 원장: startups(참가기업) | networks(참가전문가). 화면을 가르는 자격은 계정이 아니라 참여 줄이 답하지만, 계정이 어떤 인격들을 갖고 있는지는 이 표가 답한다. 발급 창구가 보는 범위도 이 값이 정한다(3_9_2 §6).';

-- ---------------------------------------------------------------------
-- (2) 발급 — 사람을 인자로 받는다
--
--     찾는 순서는 종전 셋을 그대로 두되, **사람이 정해진 뒤에** 찾는다.
--       ⓪ 사람 확정: 인자가 있으면 그것, 없으면 원장 연락처(종전 동작).
--       ① 이 원장 행 × 이 이메일에 인격이 있으면 그 계정.
--       ② 없으면 같은 이메일의 게스트 계정(다른 자격으로 이미 들어와 있다).
--       ③ 그것도 없으면 새 계정.
--
--     ①이 이메일까지 보는 것이 이번 변경의 핵심이다. 종전에는 원장 행만 보아
--     두 번째 사람의 발급 요청이 첫 사람의 계정을 돌려받았다.
--
--     ②는 그대로 둔다 — 같은 사람이 A기업 대표이자 다른 회사 자문 전문가일 때
--     계정이 하나로 남아야 한다(3_9_1 §4가 정한 것이고 바뀌지 않는다).
-- ---------------------------------------------------------------------
drop function if exists public.issue_guest_account(text, uuid);

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
  if p_master_table not in ('startups', 'networks') then
    raise exception '지원하지 않는 원장입니다: %', p_master_table using errcode = '22023';
  end if;

  -- ⓪ 사람 확정. 원장 값은 **기본값**이지 정답이 아니다 — 담당자가 넘긴 값이 이긴다.
  --   셋 중 하나만 넘어와도 나머지는 원장에서 채운다(발급 폼이 이름만 고치는 경우).
  if p_master_table = 'startups' then
    select s.representative, nullif(s.contact ->> 'email', ''), nullif(s.contact ->> 'phone', '')
      into v_name, v_email, v_phone
      from public.startups s
     where s.id = p_master_id and s.deleted_at is null;
    v_user_type := 'external_startup';
    v_company   := p_master_id;
  else
    select n.name, nullif(n.email, ''), nullif(n.phone, '')
      into v_name, v_email, v_phone
      from public.networks n
     where n.id = p_master_id and n.deleted_at is null and n.merged_into_id is null;
    v_user_type := 'external_expert';
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
  '원장 행에 게스트 계정을 세운다(멱등, 키는 원장 행 × 이메일). 사람을 지정하지 않으면 원장 연락처를 쓴다 — 한 회사에 담당자가 여럿이면 각각 발급된다. 내부 사용자 전원. 발급만으로는 아무것도 보이지 않으므로 권한이 걸릴 자리는 여기가 아니라 매핑이다. 근거: 3_9_2 §5';

