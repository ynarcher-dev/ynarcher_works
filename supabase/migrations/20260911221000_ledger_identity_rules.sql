-- =====================================================================
-- 원장 식별 규칙 — 확실한 키는 DB가 막고, 의심 조합은 화면이 한 번 멈춘다
--
-- 무엇이 문제였나 (2026-09-11 실측)
--   네 원장(startups·networks·ma_sellers·ma_buyers) 어디에도 유일 제약이 없었다. 중복 검사는
--   프론트의 "이름·이메일·전화 중 두 칸 일치 → 한 번 멈춤"뿐이었고, 그 규칙은 **원장의
--   정체성 키를 보지 않았다** — 실제 중복 5행은 전부 사업자등록번호가 같은 행인데 이메일·
--   전화가 비어 있어 통과했다(18건 중 사업자번호는 13건, 이메일·전화는 8건만 차 있었다).
--
-- 두 층으로 가른다
--   · 확실한 키: 있으면 같은 대상이라 확정할 수 있는 값. DB가 막는다(회원가입 중복확인과
--     같은 방식).
--       startups            사업자등록번호(사업체 단위 번호 — 공동대표도 회사가 하나면 행도
--                           하나다. 지점은 본점과 다른 번호를 받는다)
--       networks            사람에게는 확실한 키가 없다(공용 메일·대표번호). 이름 + (이메일
--                           또는 전화)를 확실한 조합으로 본다
--       ma_sellers/buyers   연결된 행은 스타트업 원장이 번호를 갖고(스타트업당 살아있는 행
--                           1건), 미연결 행만 자기 번호를 갖는다
--       users(내부)         이메일(게스트에는 이미 있던 유일 인덱스를 내부까지 넓힌다)
--   · 의심 조합: 이름·이메일·전화 중 두 칸 일치. 증거가 아니라 가능성이라 막지 않고 화면이
--     한 번 멈춘다(계열사가 대표번호를 함께 쓴다). 종전 그대로다.
--
-- 사업자등록번호가 없는 스타트업
--   발굴 단계에는 명함만 들고 등록하는 자리가 있어 번호를 필수로 두지 않는다. 대신
--   · 번호가 있는 기존 행과 이름 + 연락처가 같으면 막는다(그 기업이 이미 번호를 갖고 있다)
--   · 보육·투자로 올라갈 때 번호를 요구한다(구분이 바뀌는 순간에만 — 옛 행의 다른 칸을
--     고치는 일까지 막지 않는다)
--
-- M&A 원장과 스타트업 원장
--   미연결 셀러·바이어가 스타트업 원장에 있는 기업과 같으면(번호 또는 두 칸 일치) 저장을
--   막고 연결을 요구한다 — 연결 없이 저장하면 자료 참조·퀵 리뷰가 그 기업을 모르고 자료를
--   한 벌 더 올리게 된다. **반대 방향(스타트업 등록 시 M&A에 있는지)은 묻지 않는다** — M&A
--   권한이 없는 담당자에게 매각 검토 사실이 새어 나간다. 기밀이 중복보다 앞선다.
--
-- 게스트 발급
--   같은 이메일의 게스트 계정이 이미 있으면 종전에는 이름을 보지 않고 인격만 붙였다. 그래서
--   실수로 같은 이메일이 들어간 다른 사람(A기업 홍길동 / B기업 임꺽정)이 한 계정이 되어,
--   먼저 들어온 사람이 두 기업의 자료를 다 봤다. 이제 이름이 다르면 발급을 막는다 — 이메일은
--   한 사람이 하나씩 쓰는 값이라 "같은 이메일 + 다른 이름"은 오입력 말고는 생기지 않는다.
--
-- 정규화는 저장값 자체에 건다
--   사업자등록번호는 'XXX-XX-XXXXX' 한 모양으로 저장한다(거래처 등록번호가 숫자만 저장하는
--   것과 같은 이유 — 표기가 갈리면 같은 번호를 두 모양으로 세게 된다). 판정용 열을 따로
--   두지 않는다(같은 사실을 두 곳에 적지 않는다). 검증(체크섬)은 값이 바뀔 때만 본다 —
--   옛 시드 행에 검증을 통과하지 못하는 번호가 있고, 그 행의 다른 칸을 고치는 일까지 막을
--   이유가 없다.
--
-- 트리거는 INVOKER다
--   `app.find_startup_identity`가 startups를 직접 조인하므로 호출자의 SELECT 정책이 그대로
--   판정한다(내부 사용자는 전부 읽는다). 판정식을 복제하지 않는다.
--
-- 보안 게이트 사전 답변(11_migration_security_gate.md §2):
--   · 소유 워크스페이스: startup / networks / mna / admin(users)
--   · 데이터 등급: Personal (이메일·연락처를 견준다) — 새 표 없음, 새 노출면 없음
--   · 접근 주체: 내부 사용자(원장 쓰기 권한자). 게스트는 이 원장에 쓰지 못한다
--   · Scope 기준: global
--   · 감사 로그: 없음(거절이지 행위가 아니다). 발급 거절도 행을 만들지 않는다
--   · 운영 영향: 사업자번호 형식이 틀린 신규 입력, 중복 등록, 미연결 M&A 저장이 거절된다.
--     프론트가 같은 규칙을 먼저 보여 주므로(3_3_8 §5) 정상 입력은 여기까지 오지 않는다
--
-- 필수 SQL 체크리스트:
--   · 신규 테이블 없음 / DELETE 정책 없음 / Storage 무관
--   · SECURITY DEFINER 신설 없음(issue_guest_account는 기존 DEFINER 교체 — 권한 검사 유지)
--   · 트리거 함수·헬퍼는 search_path 고정, authenticated에만 EXECUTE
--   · 유일 인덱스는 살아있는 행(deleted_at·merged_into_id null)만 본다
--
-- 근거: docs/docs_planning/3_3_8_ledger_identity_dedup.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 정규화 헬퍼 — 화면(`lib/bizRegNo.ts`·`ledgerMatch.ts`)과 같은 규칙
-- ---------------------------------------------------------------------
create or replace function app.norm_biz_reg_no(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

comment on function app.norm_biz_reg_no(text) is
  '사업자등록번호에서 숫자만 남긴다. 빈 값은 null.';

create or replace function app.format_biz_reg_no(p text)
returns text
language sql
immutable
as $$
  select case
           when t.d is null then null
           when length(t.d) <> 10 then t.d
           else substr(t.d, 1, 3) || '-' || substr(t.d, 4, 2) || '-' || substr(t.d, 6, 5)
         end
    from (select app.norm_biz_reg_no(p) as d) t;
$$;

comment on function app.format_biz_reg_no(text) is
  '사업자등록번호의 저장 모양(XXX-XX-XXXXX). 10자리가 아니면 숫자만 돌려주고 검증은 is_valid_biz_reg_no가 한다.';

create or replace function app.is_valid_biz_reg_no(p text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := app.norm_biz_reg_no(p);
  w constant int[] := array[1, 3, 7, 1, 3, 7, 1, 3, 5];
  s int := 0;
  i int;
begin
  if d is null or length(d) <> 10 then
    return false;
  end if;
  for i in 1..9 loop
    s := s + substr(d, i, 1)::int * w[i];
  end loop;
  -- 아홉째 자리는 가중치 5를 곱한 값의 십의 자리까지 더한다(국세청 검증 규칙).
  s := s + (substr(d, 9, 1)::int * 5) / 10;
  return ((10 - (s % 10)) % 10) = substr(d, 10, 1)::int;
end;
$$;

comment on function app.is_valid_biz_reg_no(text) is
  '사업자등록번호 체크섬 검증(가중치 1,3,7,1,3,7,1,3,5). 10자리가 아니면 false.';

create or replace function app.norm_entity_name(p text)
returns text
language sql
immutable
as $$
  select nullif(
           regexp_replace(
             lower(regexp_replace(coalesce(p, ''),
               '주식회사|유한회사|유한책임회사|합자회사|합명회사|\(주\)|㈜|\(유\)|\(합\)', '', 'g')),
             '\s', '', 'g'),
           '');
$$;

comment on function app.norm_entity_name(text) is
  '이름 대조용 정규화 — 소문자·공백 제거·법인 형태 표기(주식회사·(주)·㈜…) 제거. `딜챗`과 `주식회사 딜챗`이 같은 이름이다.';

create or replace function app.norm_email(p text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(p, ''))), '');
$$;

create or replace function app.norm_phone(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

-- ---------------------------------------------------------------------
-- (2) 스타트업 원장에서 같은 기업을 찾는다 — 트리거 셋이 같은 함수를 부른다
--
--     p_require_biz  : 번호가 있는 행만 후보로 본다(스타트업 게이트 — 번호 없는 행끼리는
--                      확정 근거가 없어 화면이 경고만 한다)
--     p_require_name : 두 칸 일치에 이름이 반드시 들어가야 한다(스타트업 게이트). M&A 연결
--                      요구는 화면 엔진과 같은 2/3 규칙을 쓴다
-- ---------------------------------------------------------------------
create or replace function app.find_startup_identity(
  p_biz          text,
  p_name         text,
  p_email        text,
  p_phone        text,
  p_exclude      uuid    default null,
  p_require_biz  boolean default false,
  p_require_name boolean default false
)
returns uuid
language sql
stable
security invoker
set search_path = app, public
as $$
  with probe as (
    select app.format_biz_reg_no(p_biz) as biz,
           app.norm_entity_name(p_name) as nm,
           app.norm_email(p_email)      as em,
           app.norm_phone(p_phone)      as ph
  )
  select s.id
    from public.startups s, probe p
   where s.deleted_at is null
     and s.merged_into_id is null
     and (p_exclude is null or s.id <> p_exclude)
     and (
       (p.biz is not null and s.biz_reg_no = p.biz)
       or (
         (not p_require_biz or s.biz_reg_no is not null)
         and (not p_require_name or (p.nm is not null and app.norm_entity_name(s.name) = p.nm))
         and (
             (case when p.nm is not null and app.norm_entity_name(s.name) = p.nm then 1 else 0 end)
           + (case when p.em is not null and app.norm_email(s.email) = p.em then 1 else 0 end)
           + (case when p.ph is not null and app.norm_phone(s.phone) = p.ph then 1 else 0 end)
         ) >= 2
       )
     )
   order by (p.biz is not null and s.biz_reg_no = p.biz) desc, s.created_at
   limit 1;
$$;

comment on function app.find_startup_identity(text, text, text, text, uuid, boolean, boolean) is
  '살아있는 스타트업 중 같은 기업 하나 — 사업자등록번호가 같거나, 이름·이메일·전화 중 두 칸이 같다. INVOKER라 호출자의 SELECT 정책이 판정한다. 스타트업 게이트와 M&A 연결 요구가 함께 쓴다.';

-- ---------------------------------------------------------------------
-- (3) startups — 저장값 정규화·체크섬·확실한 키 게이트·승격 조건
-- ---------------------------------------------------------------------
create or replace function app.startups_identity_gate()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_norm     text;
  v_hit      uuid;
  v_hit_name text;
  v_hit_biz  text;
  v_live     boolean;
  v_changed  boolean;
begin
  v_norm := app.format_biz_reg_no(new.biz_reg_no);
  if v_norm is not null
     and (tg_op = 'INSERT' or v_norm is distinct from app.format_biz_reg_no(old.biz_reg_no)) then
    if not app.is_valid_biz_reg_no(v_norm) then
      raise exception '사업자등록번호 형식이 맞지 않습니다: %', new.biz_reg_no
        using errcode = '22023', hint = 'biz_reg_no_invalid';
    end if;
  end if;
  new.biz_reg_no := v_norm;

  v_live := new.deleted_at is null and new.merged_into_id is null;
  v_changed := tg_op = 'INSERT'
    or new.name  is distinct from old.name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.biz_reg_no is distinct from old.biz_reg_no
    or (old.deleted_at is not null and new.deleted_at is null)
    or (old.merged_into_id is not null and new.merged_into_id is null);

  -- 번호 없이 들어오는 행이 번호를 가진 기존 기업과 이름·연락처가 같으면, 그 기업은 이미
  -- 원장에 있다. 번호가 같은 경우는 유일 인덱스(uq_startups_biz_reg_no_live)가 막는다.
  if v_live and v_changed and new.biz_reg_no is null then
    v_hit := app.find_startup_identity(null, new.name, new.email, new.phone, new.id, true, true);
    if v_hit is not null then
      select s.name, s.biz_reg_no into v_hit_name, v_hit_biz from public.startups s where s.id = v_hit;
      raise exception '이미 등록된 기업입니다 — %(사업자등록번호 %). 새로 만들지 말고 그 행을 고치세요.',
        v_hit_name, v_hit_biz
        using errcode = '23505', hint = 'startup_identity_duplicate:' || v_hit;
    end if;
  end if;

  -- 보육·투자로 올라가는 순간에만 번호를 요구한다.
  if new.management_status in ('incubated', 'invested')
     and new.biz_reg_no is null
     and (tg_op = 'INSERT' or new.management_status is distinct from old.management_status) then
    raise exception '보육·투자 기업은 사업자등록번호가 있어야 합니다. 번호를 먼저 채우세요.'
      using errcode = '23514', hint = 'biz_reg_no_required';
  end if;

  return new;
end;
$$;

comment on function app.startups_identity_gate() is
  'startups BEFORE INSERT/UPDATE — 사업자등록번호를 XXX-XX-XXXXX로 정규화하고 값이 바뀔 때 체크섬을 본다. 번호 없는 행이 번호 있는 기존 기업과 이름·연락처가 같으면 거절(23505, hint startup_identity_duplicate:<id>). 보육·투자 전환 시 번호 필수(23514, hint biz_reg_no_required).';

-- 기존 값을 저장 모양으로 맞춘다(실측상 전부 이미 그 모양이라 0행이지만, 규칙이 선 뒤에는
-- 예외가 없어야 한다). 스키마 정리이지 업무 행위가 아니라 트리거를 끄고 한다.
alter table public.startups disable trigger user;
update public.startups
   set biz_reg_no = app.format_biz_reg_no(biz_reg_no)
 where biz_reg_no is distinct from app.format_biz_reg_no(biz_reg_no);
alter table public.startups enable trigger user;

drop trigger if exists trg_startups_identity_gate on public.startups;
create trigger trg_startups_identity_gate
  before insert or update on public.startups
  for each row execute function app.startups_identity_gate();

create unique index if not exists uq_startups_biz_reg_no_live
  on public.startups (biz_reg_no)
  where deleted_at is null and merged_into_id is null and biz_reg_no is not null;

comment on index public.uq_startups_biz_reg_no_live is
  '살아있는 스타트업의 사업자등록번호는 하나다. 비활성·병합 행은 제외한다 — 되살릴 때는 restore_entity와 게이트가 다시 본다.';

-- ---------------------------------------------------------------------
-- (4) networks — 이름 + (이메일 또는 전화)가 같은 살아있는 행은 하나다
-- ---------------------------------------------------------------------
create or replace function app.networks_identity_gate()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_nm      text := app.norm_entity_name(new.name);
  v_em      text := app.norm_email(new.email);
  v_ph      text := app.norm_phone(new.phone);
  v_hit     record;
  v_live    boolean;
  v_changed boolean;
begin
  v_live := new.deleted_at is null and new.merged_into_id is null;
  v_changed := tg_op = 'INSERT'
    or new.name  is distinct from old.name
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or (old.deleted_at is not null and new.deleted_at is null)
    or (old.merged_into_id is not null and new.merged_into_id is null);

  if v_live and v_changed and v_nm is not null and (v_em is not null or v_ph is not null) then
    select x.id, x.name, x.affiliation
      into v_hit
      from public.networks x
     where x.id <> new.id
       and x.deleted_at is null
       and x.merged_into_id is null
       and app.norm_entity_name(x.name) = v_nm
       and (
            (v_em is not null and app.norm_email(x.email) = v_em)
         or (v_ph is not null and app.norm_phone(x.phone) = v_ph)
       )
     order by x.created_at
     limit 1;
    if v_hit.id is not null then
      raise exception '이미 등록된 사람입니다 — %(%). 새로 만들지 말고 그 행을 고치세요.',
        v_hit.name, coalesce(v_hit.affiliation, '소속 없음')
        using errcode = '23505', hint = 'network_identity_duplicate:' || v_hit.id;
    end if;
  end if;
  return new;
end;
$$;

comment on function app.networks_identity_gate() is
  'networks BEFORE INSERT/UPDATE — 이름이 같고 이메일 또는 전화가 같은 살아있는 행이 있으면 거절(23505, hint network_identity_duplicate:<id>). 사람에게는 단일 확실 키가 없어 조합으로 본다.';

drop trigger if exists trg_networks_identity_gate on public.networks;
create trigger trg_networks_identity_gate
  before insert or update on public.networks
  for each row execute function app.networks_identity_gate();

-- ---------------------------------------------------------------------
-- (5) ma_sellers · ma_buyers — 미연결 행만 자기 번호를 갖고, 스타트업에 있는 기업은 연결한다
-- ---------------------------------------------------------------------
alter table public.ma_sellers add column if not exists biz_reg_no text;
alter table public.ma_buyers  add column if not exists biz_reg_no text;

comment on column public.ma_sellers.biz_reg_no is
  '사업자등록번호(XXX-XX-XXXXX). **스타트업 원장에 연결된 행은 비운다** — 번호는 스타트업이 갖고 여기 적으면 같은 사실이 두 곳에 산다. 미연결 행의 확실한 키.';
comment on column public.ma_buyers.biz_reg_no is
  '사업자등록번호(XXX-XX-XXXXX). 스타트업 원장에 연결된 행은 비운다(번호는 스타트업이 갖는다). 미연결 행의 확실한 키.';

create or replace function app.ma_party_identity_gate()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_norm     text;
  v_hit      uuid;
  v_hit_name text;
  v_live     boolean;
  v_changed  boolean;
begin
  v_norm := app.format_biz_reg_no(new.biz_reg_no);
  if v_norm is not null
     and (tg_op = 'INSERT' or v_norm is distinct from app.format_biz_reg_no(old.biz_reg_no)) then
    if not app.is_valid_biz_reg_no(v_norm) then
      raise exception '사업자등록번호 형식이 맞지 않습니다: %', new.biz_reg_no
        using errcode = '22023', hint = 'biz_reg_no_invalid';
    end if;
  end if;
  -- 연결된 행은 번호를 갖지 않는다 — 스타트업 원장이 정본이다.
  new.biz_reg_no := case when new.startup_id is not null then null else v_norm end;

  v_live := new.deleted_at is null and new.merged_into_id is null;
  v_changed := tg_op = 'INSERT'
    or new.name          is distinct from old.name
    or new.contact_email is distinct from old.contact_email
    or new.phone         is distinct from old.phone
    or new.biz_reg_no    is distinct from old.biz_reg_no
    or new.startup_id    is distinct from old.startup_id
    or (old.deleted_at is not null and new.deleted_at is null)
    or (old.merged_into_id is not null and new.merged_into_id is null);

  if v_live and v_changed and new.startup_id is null then
    v_hit := app.find_startup_identity(new.biz_reg_no, new.name, new.contact_email, new.phone, null, false, false);
    if v_hit is not null then
      select s.name into v_hit_name from public.startups s where s.id = v_hit;
      raise exception '스타트업 원장에 있는 기업입니다 — %. 새로 만들지 말고 스타트업 DB를 연결하세요.', v_hit_name
        using errcode = '23505', hint = 'startup_link_required:' || v_hit;
    end if;
  end if;
  return new;
end;
$$;

comment on function app.ma_party_identity_gate() is
  'ma_sellers·ma_buyers BEFORE INSERT/UPDATE — 사업자등록번호 정규화·체크섬, 연결된 행의 번호 비우기, 미연결 행이 스타트업 원장의 기업과 같으면 거절(23505, hint startup_link_required:<startup id>).';

drop trigger if exists trg_ma_sellers_identity_gate on public.ma_sellers;
create trigger trg_ma_sellers_identity_gate
  before insert or update on public.ma_sellers
  for each row execute function app.ma_party_identity_gate();

drop trigger if exists trg_ma_buyers_identity_gate on public.ma_buyers;
create trigger trg_ma_buyers_identity_gate
  before insert or update on public.ma_buyers
  for each row execute function app.ma_party_identity_gate();

create unique index if not exists uq_ma_sellers_startup_live
  on public.ma_sellers (startup_id)
  where deleted_at is null and merged_into_id is null and startup_id is not null;
create unique index if not exists uq_ma_sellers_biz_reg_no_live
  on public.ma_sellers (biz_reg_no)
  where deleted_at is null and merged_into_id is null and startup_id is null and biz_reg_no is not null;
create unique index if not exists uq_ma_buyers_startup_live
  on public.ma_buyers (startup_id)
  where deleted_at is null and merged_into_id is null and startup_id is not null;
create unique index if not exists uq_ma_buyers_biz_reg_no_live
  on public.ma_buyers (biz_reg_no)
  where deleted_at is null and merged_into_id is null and startup_id is null and biz_reg_no is not null;

-- ---------------------------------------------------------------------
-- (6) users — 내부 임직원 이메일도 하나다 (게스트 인덱스 uq_users_guest_email과 짝)
-- ---------------------------------------------------------------------
create unique index if not exists uq_users_internal_email
  on public.users (lower(email))
  where user_type not in ('external_startup', 'external_expert', 'temporary_guest')
    and deleted_at is null
    and email is not null;

comment on index public.uq_users_internal_email is
  '내부 임직원의 이메일은 하나다(대소문자 무시). 게스트 3유형은 uq_users_guest_email이 따로 본다 — 두 인덱스 사이(내부↔게스트)는 issue_guest_account가 막는다.';

-- ---------------------------------------------------------------------
-- (7) 권한 — 헬퍼는 authenticated만. 트리거 함수는 표 소유자가 붙이므로 부여하지 않는다.
-- ---------------------------------------------------------------------
revoke all on function app.norm_biz_reg_no(text) from public, anon;
revoke all on function app.format_biz_reg_no(text) from public, anon;
revoke all on function app.is_valid_biz_reg_no(text) from public, anon;
revoke all on function app.norm_entity_name(text) from public, anon;
revoke all on function app.norm_email(text) from public, anon;
revoke all on function app.norm_phone(text) from public, anon;
revoke all on function app.find_startup_identity(text, text, text, text, uuid, boolean, boolean) from public, anon;
grant execute on function app.norm_biz_reg_no(text) to authenticated;
grant execute on function app.format_biz_reg_no(text) to authenticated;
grant execute on function app.is_valid_biz_reg_no(text) to authenticated;
grant execute on function app.norm_entity_name(text) to authenticated;
grant execute on function app.norm_email(text) to authenticated;
grant execute on function app.norm_phone(text) to authenticated;
grant execute on function app.find_startup_identity(text, text, text, text, uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- (8) issue_guest_account — 같은 이메일인데 이름이 다르면 발급을 막는다
--     본문은 20260910224619의 것을 그대로 두고 ②번 분기 뒤에 대조 한 단락을 더한다.
--     시그니처가 같으므로 create or replace가 교체이며(오버로드 아님) ACL·주석은 아래에서
--     다시 적는다(드롭·재생성이 아니라 유지되지만, 규칙상 명시한다).
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
revoke all on function public.issue_guest_account(text, uuid, text, text, text) from anon;
grant execute on function public.issue_guest_account(text, uuid, text, text, text) to authenticated;

comment on function public.issue_guest_account(text, uuid, text, text, text) is
  '원장 행 × 사람에게 게스트 계정을 세우고 인격을 붙인다(멱등: 같은 이메일·같은 이름이면 그 계정을 그대로 돌려준다). 같은 이메일인데 이름이 다르면 거절한다(2026-09-11 — 두 사람이 한 계정이 되어 남의 기업 자료를 보는 사고를 막는다, 3_3_8 §6). 원장 값은 기본값이고 담당자가 넘긴 값이 이긴다. 근거: 3_9_1 §4, 3_9_2 §5';
