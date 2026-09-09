-- =====================================================================
-- FUND를 게스트 맥락 하나로 세운다 — 대상은 포트폴리오사, 명단은 포트폴리오
-- 정본: docs/docs_planning/3_9_2_external_portal_expansion.md §9
--
-- 배경:
--   2026-09-05에 게스트 세션의 맥락 클레임을 `program_id`에서 `context_type`+`context_id`로
--   일반화하며 **FUND가 들어올 자리를 비워 두었다.** 비워 둔 자리를 채우는 일이 이 파일이며,
--   실제로 하는 일은 새 계통을 만드는 것이 아니라 **이미 통합된 원장에 키 하나를 여는 것**이다.
--   2026-09-03에 모듈·명부·게스트향 원장을 한 벌로 합치고 행마다 `entity_key`가 소속을 답하게
--   해 두었으므로, 개요·공지사항·Q&A·게스트 문(門)은 값 하나만 열면 그대로 선다.
--
-- 이 파일이 여는 것(고정 3메뉴 + 문):
--   program_participants · program_overviews · program_announcements · program_questions
--
-- 이 파일이 **열지 않는 것**: program_modules · program_posts · program_links ·
--   program_module_public_links. 온기보고(모듈)는 서식·회차·영업보고서 편입 시점이 아직
--   정해지지 않았고(3_9_2 §9는 스스로를 '아이데이션 단계'라 적어 두었다), **값을 미리 열어
--   두면 "고를 수 있는 값"으로 읽힌다** — 2026-09-07에 PROJECT를 걷으며 CHECK를 좁힌 근거
--   그대로다. 모듈을 여는 날 그 네 표의 CHECK를 함께 연다.
--
-- 무엇이 명단인가(2026-09-09 사용자 확정):
--   PROJECT·M&A는 `program_participant_entries`가 명단을 지지만 **FUND는 포트폴리오가 곧
--   명단이다.** `investments`가 이미 "이 조합이 누구에게 투자했는가"를 답하고 있어, 같은
--   사실을 적는 표를 하나 더 두면 어긋날 자리만 는다. 그래서 이 파일은 FUND용 명단 원장을
--   만들지 않고, 화면이 포트폴리오에서 골라 문(`program_participants`)을 연다.
--
-- 딜메이커는 게스트가 아니다(2026-09-09 사용자 확정):
--   딜메이커는 `startup_managers.user_id` → `users`, 곧 **내부 임직원**이다. 포털은 밖에서
--   들어오는 사람을 위한 문인데 딜메이커는 이미 안에 있으므로, 문을 하나 더 내지 않고
--   WORKS 안에 창을 낸다 — 계정도 비밀번호도 감사 기록도 한 사람에 하나로 남는다.
--   `issue_guest_account`의 내부 임직원 이메일 가드(20260908170000)는 **그대로 둔다.**
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: fund (게스트 계정 자체는 guest)
--   - 데이터 등급: Internal — 이 파일이 게스트에게 여는 것은 조합 개요·공지·본인 Q&A뿐이고,
--     FUND 원장 본체(LP·캐피탈 콜·투자 조건)에는 게스트 정책을 만들지 않는다.
--   - 접근 주체: 외부 스타트업(포트폴리오사) + 그 조합의 담당자(fund_managers)
--   - Scope 기준: fund — `app.can_access_ws_program`이 종전 program/project 외에 fund
--     스코프도 받도록 넓힌다(넓히는 것은 판정 대상이 아니라 **읽는 자리**다).
--   - 감사 로그: 종전 경로 그대로. `app.log_guest_access`가 GUEST_ACCESS_OPEN /
--     _WINDOW / _REMOVE를 적재하고, 이 파일은 그 함수를 손대지 않는다.
--   - 신규 테이블: 없음. 신규 SECURITY DEFINER: 없음(기존 함수의 분기만 넓힌다).
--   - 운영 영향:
--     · CHECK 넓히기는 제약을 **느슨하게** 하는 방향이라 기존 행을 한 줄도 잃지 않는다.
--     · `app.program_ws`가 'fund'를 답하기 시작하므로 그 값을 case로 받는 함수가 전부
--       분기를 하나씩 더 갖는다. 빠뜨리면 오류가 아니라 **null로 떨어져 조용히 막힌다**
--       (Default Deny) — 그래서 아래 (2)~(7)은 한 벌이다.
--     · **함수 본문 전수 조사는 한 벌이다.** 표를 지울 때와 같은 이유로 본문은 의존성으로
--       추적되지 않는다. `programs`/`ma_programs`를 union하거나 `program_ws`를 case로 받는
--       함수를 카탈로그로 훑어 아래 12종을 고쳤다:
--         app.assert_program_exists · app.program_ws · app.program_row ·
--         app.is_program_manager · app.can_access_ws_program · app.default_access_end ·
--         app.guest_program_ids · app.guest_session_program_id ·
--         public.guest_my_participations · public.guest_accounts_list ·
--         public.open_program_guest_access · public.set_program_guest_access_window
--       손대지 않은 것: close/reopen/remove 계열과 명부 정책은 `app.is_program_manager`와
--       `app.entity_key_workspace`만 경유해 원장을 가리지 않는다.
--     · 게스트 앱·Edge Function은 이 파일보다 **뒤에** 배포해도 된다. 새 키를 아무도
--       쓰지 않는 동안은 아무 행도 생기지 않는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 접근 기간은 조합이 갖는다
--
--     기간을 참여 줄마다 두지 않는 이유는 2026-09-05에 사업에서 정한 것과 같다 —
--     포트폴리오사가 스무 곳이면 같은 값을 스무 번 적는 일이고, 그 스무 값이 어긋날 수
--     있다는 것 자체가 결함이다. 조합 하나만 막을 일은 기간이 아니라 차단이 답한다.
-- ---------------------------------------------------------------------
alter table public.funds
  add column if not exists guest_access_ends_at timestamptz;

comment on column public.funds.guest_access_ends_at is
  '이 조합 게스트(포트폴리오사)의 접근 종료. null이면 제한 없음. 첫 개방 때 기본값(존속기간 종료 + 14일)이 채워지고 담당자가 덮어쓴다. 근거: 3_9_1 §8';

-- ---------------------------------------------------------------------
-- (2) 사업 원장 판정 셋 — 'fund'를 받는다
--
--     세 함수가 답하는 것이 각각 다르다: 실재하는가(assert), 어느 워크스페이스인가(ws),
--     그 한 줄이 무엇인가(row). 하나만 고치면 나머지가 null을 답해 조용히 막힌다.
-- ---------------------------------------------------------------------
create or replace function app.assert_program_exists(p_entity_key text, p_program_id uuid)
returns boolean language plpgsql stable set search_path = app, public as $fn$
declare
  v_table text;
  v_found boolean;
begin
  v_table := case p_entity_key
    when 'program'    then 'programs'
    when 'ma_program' then 'ma_programs'
    when 'fund'       then 'funds'
  end;
  if v_table is null then
    return false;
  end if;
  -- 화이트리스트로 고른 이름만 들어가므로 동적 SQL 주입면이 없다.
  execute format('select exists (select 1 from public.%I where id = $1)', v_table)
    into v_found using p_program_id;
  return v_found;
end;
$fn$;

create or replace function app.program_ws(p_program_id uuid)
returns text language sql stable security definer set search_path = app, public as $fn$
  select case
    when p_program_id is null then null
    when exists (select 1 from public.programs    where id = p_program_id) then 'project'
    when exists (select 1 from public.ma_programs where id = p_program_id) then 'mna'
    when exists (select 1 from public.funds       where id = p_program_id) then 'fund'
  end;
$fn$;

comment on function app.program_ws(uuid) is
  '이 id가 어느 원장의 것인가 — programs=project / ma_programs=mna / funds=fund. 게스트 계통(문·기간·개방)이 사업과 조합을 같은 경로로 다루므로 조합도 여기서 답한다.';

create or replace function app.program_row(p_program_id uuid)
returns jsonb language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_table text;
  v_row   jsonb;
begin
  v_table := case app.program_ws(p_program_id)
    when 'project' then 'programs'
    when 'mna'     then 'ma_programs'
    when 'fund'    then 'funds'
  end;
  if v_table is null then
    return null;
  end if;
  execute format('select to_jsonb(p) from public.%I p where p.id = $1', v_table)
    into v_row using p_program_id;
  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------
-- (3) 담당자 판정 — 조합의 담당자는 fund_managers다
--
--     문을 여닫고 기간을 정하는 사람이 그 조합의 운용역이어야 한다. `manager_id`
--     (대표펀드매니저) 한 칸이 아니라 `fund_managers` 표를 보는 이유는 사업이 그런
--     것과 같다 — 대표 한 사람이 자리를 비웠을 때 아무도 문을 열 수 없어서는 안 된다.
--
--     **부모 컬럼 이름이 원장마다 다르다**(사업은 `program_id`, 조합은 `fund_id`).
--     이름을 맞추려고 컬럼을 개명하지 않는 이유는 `fund_managers`를 읽는 화면·RPC가
--     이미 여럿이라 이름 하나를 위해 그 전부를 건드리게 되기 때문이다. 그래서 표마다
--     부모 컬럼을 함께 적는다 — 예외를 만드는 대신 값으로 든다.
-- ---------------------------------------------------------------------
create or replace function app.is_program_manager(p_program_id uuid)
returns boolean language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_table text;
  v_col   text;
  v_ok    boolean;
begin
  if app.is_admin() then
    return true;
  end if;
  case app.program_ws(p_program_id)
    when 'project' then v_table := 'program_managers';    v_col := 'program_id';
    when 'mna'     then v_table := 'ma_program_managers'; v_col := 'program_id';
    when 'fund'    then v_table := 'fund_managers';       v_col := 'fund_id';
    else return false;
  end case;
  execute format(
    'select exists (select 1 from public.%I m where m.%I = $1 and m.user_id = $2)', v_table, v_col)
    into v_ok using p_program_id, app.current_app_user_id();
  return v_ok;
end;
$fn$;

comment on function app.is_program_manager(uuid) is
  '요청자가 그 사업·조합의 담당자인가. 원장이 셋이라 program_ws로 담당자 표와 부모 컬럼을 고른다(program_managers.program_id / ma_program_managers.program_id / fund_managers.fund_id). 게스트 로그인 개방·차단·기간·명부 제거의 인가 기준.';

-- ---------------------------------------------------------------------
-- (4) 스코프 판정 — 'fund' 스코프도 단건 접근으로 읽는다
--
--     통합 원장의 정책이 전부 `app.can_access_ws_program(entity_key_workspace(...), program_id)`
--     한 줄이라, FUND 행이 들어오면 이 함수가 'fund' 스코프를 읽을 수 있어야 한다.
--     `app.can_access_fund()`를 여기서 부르지 않는 이유는 그 함수가 워크스페이스 키를
--     'fund'로 **박아** 두었기 때문이다 — 파라미터를 받는 이쪽에 값 하나를 더하는 편이
--     판정이 한 자리에 남는다(같은 사실을 두 함수가 답하면 어긋나는 날이 온다).
--
--     값 셋이 섞일 자리는 없다. 스코프는 워크스페이스 키별로 저장되므로, 'fund' 스코프는
--     `get_scope_type('fund')`에서만 나오고 그때 대조하는 id도 조합 id다.
-- ---------------------------------------------------------------------
create or replace function app.can_access_ws_program(ws_key text, target_program_id uuid)
returns boolean language sql stable security definer set search_path = app, public as $fn$
  select app.is_admin()
      or app.get_scope_type(ws_key) = 'global'
      or (app.get_scope_type(ws_key) in ('program', 'project', 'fund')
          and app.get_scope_id(ws_key) = target_program_id);
$fn$;

comment on function app.can_access_ws_program(text, uuid) is
  '워크스페이스 키로 파라미터화한 단건 사업·조합 접근 판정. 단건 스코프 값은 원장마다 다르므로(program/project/fund) 셋을 함께 받는다 — 워크스페이스 키가 이미 어느 축인지 가르고 있어 값이 섞일 자리가 없다.';

-- ---------------------------------------------------------------------
-- (5) 접근 기간 기본값 — 조합은 존속기간 종료일을 쓴다
--
--     사업의 `end_date`에 해당하는 것이 조합에는 `term_end`(존속기간 종료)다. 없으면
--     종전대로 1년이다 — 담당자가 아무것도 채우지 않아도 기간이 생기는 것이 요점이다.
-- ---------------------------------------------------------------------
create or replace function app.default_access_end(p_program_id uuid)
returns timestamptz language plpgsql stable security definer set search_path = app, public as $fn$
declare
  v_row jsonb;
  v_end date;
begin
  v_row := app.program_row(p_program_id);
  -- 사업은 end_date, 조합은 term_end. 한 줄로 묻는 이유는 둘 다 "언제 끝나는가"의 답이고
  -- 원장마다 칸 이름만 다르기 때문이다.
  v_end := coalesce(nullif(v_row ->> 'end_date', ''), nullif(v_row ->> 'term_end', ''))::date;
  if v_end is null then
    return now() + interval '1 year';
  end if;
  return (v_end + interval '14 days')::timestamptz;
exception when others then
  return now() + interval '1 year';
end;
$fn$;

comment on function app.default_access_end(uuid) is
  '게스트 접근 종료 기본값(사업 종료일 또는 조합 존속기간 종료일 + 14일, 없으면 1년). 근거: 3_9_1 §8';

-- ---------------------------------------------------------------------
-- (6) 통합 원장의 키 화이트리스트 — 게스트 고정 3메뉴 + 문에만 'fund'를 연다
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'program_participants', 'program_overviews', 'program_announcements', 'program_questions'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_entity_key_check');
    execute format(
      'alter table public.%I add constraint %I check (entity_key = any (array[''program''::text, ''ma_program''::text, ''fund''::text]))',
      t, t || '_entity_key_check');
  end loop;
end $$;

comment on column public.program_participants.entity_key is
  '소유 원장: program(PROJECT) | ma_program(M&A) | fund(FUND — 조합, program_id는 funds.id). 모듈 계열은 아직 fund를 받지 않는다(온기보고를 여는 날 함께 연다).';

-- ---------------------------------------------------------------------
-- (7) 조합이 물리 삭제될 때의 연쇄 — 사업 원장 둘과 같은 장치
--     운영에서 조합은 소프트 삭제되므로 실제로는 시드 정리 경로에서만 탄다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_funds_cascade_children on public.funds;
create trigger trg_funds_cascade_children
  after delete on public.funds
  for each row execute function app.cascade_program_children('fund');

-- ---------------------------------------------------------------------
-- (8) 게스트가 볼 수 있는 맥락 — 조합을 union에 더한다
--
--     **죽은 상태의 값이 원장마다 다르다.** 사업은 FINISHED·CANCELLED이고 조합은
--     CLOSED(해산) 하나다 — LIQUIDATING(청산 중)은 아직 살아 있고, 그 구간에도 회수·정산
--     안내가 오간다. 값 집합을 공유하지 않고 원장별로 적는 이유가 여기 있다.
-- ---------------------------------------------------------------------
create or replace function app.guest_program_ids()
returns setof uuid language sql stable security definer set search_path = app, public as $fn$
  with live as (
    select id, guest_access_ends_at from public.programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.ma_programs
      where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select id, guest_access_ends_at from public.funds
      where deleted_at is null and status <> 'CLOSED'
  )
  select p.program_id
    from public.program_participants p
    join live g on g.id = p.program_id
   where p.user_id = app.current_app_user_id()
     and p.login_status = 'ACTIVE'
     and p.program_id = app.guest_session_program_id()
     and (g.guest_access_ends_at is null or g.guest_access_ends_at > now());
$fn$;

comment on function app.guest_program_ids() is
  '게스트가 볼 수 있는 맥락 집합(로그인 개방 + 원장 생존 + 세션 고정 맥락 일치). PROJECT·M&A 사업과 FUND 조합을 함께 본다.';

-- ---------------------------------------------------------------------
-- (9) 세션 클레임 — 'fund'도 맥락 종류로 받는다
--
--     2026-09-05에 `context_type`+`context_id`로 일반화하며 비워 둔 자리가 이 한 줄이다.
--     함수 이름은 `program_id`이지만 답하는 것은 '이 세션이 고정된 맥락'이며, 이름을 바꾸지
--     않는 이유는 그 이름으로 부르는 정책이 여럿이라 개명이 곧 정책 전수 재작성이기 때문이다.
-- ---------------------------------------------------------------------
create or replace function app.guest_session_program_id()
returns uuid language plpgsql stable security definer set search_path = app, public, auth as $fn$
declare
  v_type  text := nullif(auth.jwt() ->> 'context_type', '');
  v_claim text;
begin
  if v_type is null then
    -- 구 토큰 폴백(배포 직후 8시간). 새 토큰은 반드시 context_type을 싣는다.
    v_claim := auth.jwt() ->> 'program_id';
  elsif v_type in ('program', 'ma_program', 'fund') then
    v_claim := auth.jwt() ->> 'context_id';
  else
    return null;
  end if;

  if v_claim is null or v_claim = '' then
    return null;
  end if;
  return v_claim::uuid;
exception when others then
  return null;
end;
$fn$;

-- ---------------------------------------------------------------------
-- (10) 게스트가 고르는 맥락 목록 — 조합이 한 줄로 선다
--      조합의 제목 칸은 `name`이다. 별칭으로 흡수하고 화면은 원장을 몰라도 된다.
-- ---------------------------------------------------------------------
create or replace function public.guest_my_participations()
returns table(participant_id uuid, program_id uuid, entity_key text, workspace text,
              code text, title text, persona text, access_ends_at timestamptz)
language sql stable security definer set search_path = app, public as $fn$
  with live as (
    select 'program'::text as entity_key, id, code, title, guest_access_ends_at
      from public.programs    where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'ma_program', id, code, title, guest_access_ends_at
      from public.ma_programs where deleted_at is null and status not in ('FINISHED', 'CANCELLED')
    union all
    select 'fund', id, code, name, guest_access_ends_at
      from public.funds       where deleted_at is null and status <> 'CLOSED'
  )
  select p.id,
         p.program_id,
         p.entity_key,
         app.entity_key_workspace(p.entity_key),
         g.code,
         g.title,
         p.master_table,
         g.guest_access_ends_at
    from public.program_participants p
    join live g
      on g.id = p.program_id
     and g.entity_key = p.entity_key
   where p.user_id = app.current_app_user_id()
     and p.login_status in ('INVITED', 'ACTIVE')
     and (g.guest_access_ends_at is null or g.guest_access_ends_at > now())
   order by g.title;
$fn$;

-- ---------------------------------------------------------------------
-- (11) 로그인 개방 — 조합도 같은 경로로 연다
--
--      고치는 것은 둘뿐이다: 죽은 상태의 값(원장마다 다르다)과 기간 기본값을 채울 표 이름.
--      나머지(계정 확보·초대 레코드·명부 갱신·감사)는 원장을 가리지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.open_program_guest_access(p_participant_ids uuid[])
returns table(participant_id uuid, program_code text, target_name text, email text, phone text,
              account_is_new boolean)
language plpgsql
set search_path = app, public
as $fn$
declare
  v_uid       uuid := app.current_app_user_id();
  r           record;
  v_prog      jsonb;
  v_ws        text;
  v_code      text;
  v_status    text;
  v_name      text;
  v_email     text;
  v_phone     text;
  v_company   uuid;
  v_account   uuid;
  v_table     text;
  v_had       boolean;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    return;
  end if;

  for r in
    select pp.id, pp.program_id, pp.master_table, pp.master_id, pp.login_status, pp.user_id
      from public.program_participants pp
     where pp.id = any (p_participant_ids)
  loop
    v_prog   := app.program_row(r.program_id);
    v_ws     := app.program_ws(r.program_id);
    v_code   := v_prog ->> 'code';
    v_status := v_prog ->> 'status';

    if not app.is_program_manager(r.program_id) then
      raise exception '담당자(PM·MEMBER·운용역)만 게스트 로그인을 열 수 있습니다.' using errcode = '42501';
    end if;
    -- 죽은 상태의 값은 원장마다 다르다(사업 = 종료·취소, 조합 = 해산). 한 목록으로 뭉치면
    -- 청산 중(LIQUIDATING) 조합의 문이 열리지 않거나 반대로 멀쩡한 사업이 막힌다.
    if (v_ws = 'fund' and v_status = 'CLOSED')
       or (v_ws is distinct from 'fund' and v_status in ('FINISHED', 'CANCELLED')) then
      raise exception '종료된 사업·해산된 조합은 로그인을 열 수 없습니다.' using errcode = '22023';
    end if;
    if r.master_id is null or r.master_table is null then
      raise exception '원장에 연결되지 않은 참가자는 로그인 대상이 아닙니다.' using errcode = '22023';
    end if;

    -- 계정을 확보하고, 그 계정이 **이미 있었는지**(v_had)를 함께 정한다. 그 값이 담당자에게
    -- 나가는 안내를 가른다 — 있었으면 "기존 비밀번호로 들어오세요", 없었으면 초기
    -- 비밀번호(연락처)를 안내한다. 발급은 멱등이라 사후에는 구분되지 않으므로 여기서 본다.
    if r.user_id is not null then
      -- 명부 행이 이미 사람을 들고 있다. 그 계정을 연다 — 원장을 다시 보지 않는다.
      v_account := r.user_id;
      v_had     := true;
    else
      -- 옛 행(사람이 정해지기 전에 담긴 줄)과 원장 연락처로 여는 경로.
      select exists (
        select 1
          from public.users u
         where u.user_type in ('external_startup', 'external_expert', 'temporary_guest')
           and u.deleted_at is null
           and lower(u.email) = lower(
                 case when r.master_table = 'startups'
                      then (select nullif(s.contact ->> 'email', '') from public.startups s where s.id = r.master_id)
                      when r.master_table = 'networks'
                      then (select nullif(n.email, '') from public.networks n where n.id = r.master_id)
                 end)
      ) into v_had;

      v_account := public.issue_guest_account(r.master_table, r.master_id);
    end if;

    select u.name, u.email, u.phone, u.company_id
      into v_name, v_email, v_phone, v_company
      from public.users u
     where u.id = v_account;

    -- 초대 레코드는 명부 행당 1건. 사업코드는 로그인 요소가 아니라 안내·식별용으로 남는다.
    update public.guest_invitations
       set business_code     = v_code,
           name              = v_name,
           email             = v_email,
           phone             = v_phone,
           company_id        = v_company,
           app_user_id       = v_account,
           target_type       = 'PROGRAM',
           target_id         = r.program_id,
           invite_expires_at = now() + interval '1 year',
           otp_hash          = null,
           otp_expires_at    = null,
           otp_attempts      = 0
     where guest_invitations.participant_id = r.id;

    if not found then
      insert into public.guest_invitations
        (business_code, name, email, phone, invited_user_type, company_id,
         app_user_id, target_type, target_id, participant_id, created_by, invite_expires_at)
      select v_code, v_name, v_email, v_phone, u.user_type, v_company,
             v_account, 'PROGRAM', r.program_id, r.id, v_uid, now() + interval '1 year'
        from public.users u where u.id = v_account;
    end if;

    -- 이 맥락에 아직 기간이 없으면 기본값을 채운다. 원장이 셋이라 표 이름을 판정해 동적으로
    -- 쓴다. INVOKER라 여기서도 원장의 RLS가 걸리며, 바로 위에서 담당자임을 확인했으므로 통과한다.
    v_table := case v_ws
                 when 'project' then 'programs'
                 when 'mna'     then 'ma_programs'
                 when 'fund'    then 'funds'
               end;
    if v_table is not null and (v_prog ->> 'guest_access_ends_at') is null then
      execute format(
        'update public.%I set guest_access_ends_at = $2, updated_at = now()'
        || ' where id = $1 and guest_access_ends_at is null', v_table)
        using r.program_id, app.default_access_end(r.program_id);
    end if;

    update public.program_participants pp
       set user_id         = coalesce(pp.user_id, v_account),
           login_status    = case when pp.login_status = 'ACTIVE' then 'ACTIVE'::public.participant_login_status
                                  else 'INVITED'::public.participant_login_status end,
           invited_at      = coalesce(pp.invited_at, now()),
           login_opened_by = v_uid,
           login_opened_at = now(),
           updated_at      = now()
     where pp.id = r.id;

    perform app.log_guest_access(
      v_account,
      'GUEST_ACCESS_OPEN',
      'guest:login',
      jsonb_build_object('participant_id', r.id, 'program_id', r.program_id,
                         'workspace', v_ws,
                         'master_table', r.master_table, 'master_id', r.master_id,
                         'account_is_new', not v_had),
      null
    );

    participant_id := r.id;
    program_code   := v_code;
    target_name    := v_name;
    email          := v_email;
    phone          := v_phone;
    account_is_new := not v_had;
    return next;
  end loop;
end;
$fn$;

comment on function public.open_program_guest_access(uuid[]) is
  '명부 행의 게스트 로그인을 연다(그 사업·조합 담당자 전용, SECURITY INVOKER). PROJECT·M&A 사업과 FUND 조합 공용이며 한 줄은 app.program_row()가 원장을 찾아 읽는다.';

-- ---------------------------------------------------------------------
-- (12) 접근 기간 쓰기 — 조합 표를 받는다
-- ---------------------------------------------------------------------
create or replace function public.set_program_guest_access_window(
  p_program_id uuid,
  p_ends       timestamptz default null
)
returns void
language plpgsql
set search_path = app, public
as $fn$
declare
  v_ws    text;
  v_table text;
begin
  if p_program_id is null then
    raise exception '대상을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  v_ws := app.program_ws(p_program_id);
  v_table := case v_ws
               when 'project' then 'programs'
               when 'mna'     then 'ma_programs'
               when 'fund'    then 'funds'
             end;
  if v_table is null then
    raise exception '대상을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  if not app.is_program_manager(p_program_id) then
    raise exception '담당자(PM·MEMBER·운용역)만 접근 기간을 정할 수 있습니다.' using errcode = '42501';
  end if;

  -- 지난 날짜를 막지 않는다. 이미 끝난 사업의 문을 지금 닫는 것이 실제 운용이고,
  -- 담당자가 오늘 이후만 고를 수 있으면 그 일을 할 방법이 없다.
  execute format('update public.%I set guest_access_ends_at = $2, updated_at = now() where id = $1', v_table)
    using p_program_id, p_ends;

  perform app.log_guest_access(
    null,
    'GUEST_ACCESS_WINDOW',
    'guest:login',
    jsonb_build_object('program_id', p_program_id, 'workspace', v_ws, 'ends', p_ends),
    null
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- (13) 계정 목록 — 참여 칸이 조합도 센다
--
--      `ledger` CTE에 조합을 더하지 않으면 참여 건수(count(*))에는 잡히는데 목록
--      (jsonb_agg ... filter (where l.id is not null))에서는 빠져 **"3건인데 두 줄만
--      보인다"** 가 된다. 건수와 목록이 같은 자리에서 나와야 한다는 것이 이 함수의 규약이다.
-- ---------------------------------------------------------------------
-- **드롭하지 않고 replace한다.** 시그니처가 그대로이므로 드롭할 이유가 없고, 드롭하면
-- 부여된 EXECUTE가 함께 사라져 되돌려 놓는 일을 한 벌 더 지게 된다(그 복원을 빠뜨리면
-- 화면이 42501이 아니라 권한 오류로 죽는다).
create or replace function public.guest_accounts_list(
  p_search        text    default null,
  p_limit         integer default 50,
  p_offset        integer default 0,
  p_entity_key    text    default null,
  p_master_tables text[]  default null,
  p_only_orphans  boolean default false
)
returns table(user_id uuid, name text, email text, phone text, user_type text, is_active boolean,
              company_name text, identities jsonb, has_password boolean,
              created_at timestamptz, last_login_at timestamptz,
              program_count integer, open_count integer, programs jsonb, total_count bigint)
language plpgsql
stable
set search_path = app, public
as $fn$
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
  if p_entity_key is not null and p_entity_key not in ('program', 'ma_program', 'fund') then
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
    union all
    -- 조합의 제목 칸은 name이다. 값의 자리를 맞추는 일은 여기서 끝내고 화면은 원장을 모른다.
    select 'fund', id, code, name, status::text, guest_access_ends_at
      from public.funds       where deleted_at is null
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
                 'master_table',   pp.master_table,
                 'login_status',   pp.login_status,
                 'program_status', l.status,
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
      -- 원장의 SELECT 정책이 그대로 판정한다.
      left join public.startups   s  on gi.master_table = 'startups'   and s.id  = gi.master_id
      left join public.networks   n  on gi.master_table = 'networks'   and n.id  = gi.master_id
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
   -- 참여가 0건인 계정만. `links`는 p_entity_key로 좁혀지므로 이 축은 **좁히지 않고 부를 때만**
   -- 뜻이 맞는다.
   where not coalesce(p_only_orphans, false) or coalesce(k.program_count, 0) = 0
   order by a.is_active desc, a.name
   limit greatest(coalesce(p_limit, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$fn$;

comment on function public.guest_accounts_list(text, integer, integer, text, text[], boolean) is
  '게스트 계정 목록(내부 사용자 전용, INVOKER). p_master_tables는 어느 계정이 서는가(창구의 원장), p_entity_key는 참여 칸이 어느 맥락을 세는가(program/ma_program/fund)를 정하며, p_only_orphans는 참여가 0건인 계정만 남긴다. 근거: 3_9_2 §6';
