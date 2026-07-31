-- =====================================================================
-- 레코드 코드(entity code) 전역 레지스트리 — 워크스페이스 간 코드 충돌 제거 + FUND 코드 신설
--
-- 배경:
--   사업코드(6자리 영숫자 난수)는 원장별로만 유니크했다(programs / ma_programs /
--   project_programs 각각 자기 테이블 안에서만 유니크). 원장이 물리적으로 분리돼 있어
--   AC 사업과 M&A 딜이 같은 코드를 받을 수 있었고, 코드로 레코드를 지목하는 순간
--   "어느 워크스페이스의 XXXXXX인가"를 되물어야 했다.
--
-- 해결:
--   코드 발급을 원장이 아니라 전역 레지스트리(public.entity_codes)가 소유한다.
--   코드는 레지스트리의 PK이므로 워크스페이스가 몇 개로 늘어도 절대 겹치지 않는다.
--   원장은 발급받은 코드를 자기 code 컬럼에 들고만 있는다(표시·검색용 사본).
--
-- 적용 원장: programs(AC) / ma_programs(M&A) / project_programs(PROJECT) / funds(FUND 신설)
--   원장을 추가할 때는 아래 (6)처럼 트리거 한 줄만 붙이면 된다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블 1개(public.entity_codes): RLS 활성 + **정책 0개**(Default Deny) +
--     anon/authenticated 테이블 권한 전부 revoke. 클라이언트는 이 표를 읽지도 쓰지도 못하며
--     오직 아래 트리거 함수만 접근한다. PostgREST 노출 없음.
--   - 신규 SECURITY DEFINER 함수 1개(public.assign_entity_code): trigger 반환형이라
--     PostgREST RPC로 호출할 수 없다. DEFINER가 필요한 이유는 '코드 중복 판정'이
--     호출자가 볼 권한이 없는 다른 워크스페이스의 코드까지 봐야 성립하기 때문이다
--     (INVOKER면 RLS에 가려 안 보이는 코드를 '비어 있다'고 오판해 충돌을 낸다).
--     함수 본문에 동적 SQL·사용자 입력 실행 없음, search_path 고정.
--   - funds.code는 기존 funds 정책이 그대로 커버하는 nullable 컬럼 1개 추가.
--     데이터 등급 Internal(개인정보 아님), 감사 로그/파일/Export 영향 없음.
--   - 멱등: if not exists / create or replace / on conflict do nothing.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 전역 코드 레지스트리
--     code가 PK다 — 유니크 보장을 애플리케이션 루프가 아니라 제약이 진다.
-- ---------------------------------------------------------------------
create table if not exists public.entity_codes (
  code         text primary key,
  entity_table text not null,
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  -- 한 레코드는 코드를 하나만 갖는다(재발급 시 기존 행을 지우지 않고 갱신하지도 않는다).
  unique (entity_table, entity_id)
);

comment on table public.entity_codes is
  '레코드 코드 전역 레지스트리. 워크스페이스(원장)를 가로질러 코드가 겹치지 않도록 code를 PK로 잡는다. 클라이언트 직접 접근 없음(RLS 정책 0개) — 발급은 assign_entity_code 트리거만 수행한다.';

alter table public.entity_codes enable row level security;

-- 정책을 만들지 않는다 = 모두 거부. 트리거 함수(DEFINER)만 이 표에 닿는다.
revoke all on table public.entity_codes from anon, authenticated;

-- ---------------------------------------------------------------------
-- (2) 코드 후보 생성 — 혼동 문자(0/O/1/I) 제외 32자 집합에서 6자리.
--     기존 gen_program_code()의 일반화판. 형식은 그대로 유지한다(이미 발급된 코드와 같은 모양).
-- ---------------------------------------------------------------------
create or replace function public.gen_entity_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text := '';
  i int;
begin
  for i in 1..6 loop
    candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return candidate;
end;
$$;

comment on function public.gen_entity_code() is
  '레코드 코드 후보(6자리 영숫자) 1건 생성. 유니크 보장은 entity_codes PK가 진다.';

-- ---------------------------------------------------------------------
-- (3) 코드 예약(claim) — 레지스트리에 자리를 잡는 데 성공해야 그 코드가 내 것이 된다.
--     경쟁 삽입은 PK 위반으로 튕기고, 그때는 다시 뽑는다.
-- ---------------------------------------------------------------------
create or replace function public.claim_entity_code(
  p_table text,
  p_id    uuid,
  p_code  text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  candidate text;
  tries     int := 0;
begin
  loop
    tries := tries + 1;
    -- 명시 코드는 첫 시도에서만 존중한다(충돌하면 그 코드는 못 쓴다 — 조용히 바꾸지 않는다).
    candidate := case when tries = 1 and p_code is not null and btrim(p_code) <> ''
                      then upper(btrim(p_code))
                      else public.gen_entity_code() end;

    begin
      insert into public.entity_codes (code, entity_table, entity_id)
      values (candidate, p_table, p_id);
      return candidate;
    exception when unique_violation then
      if tries = 1 and p_code is not null and btrim(p_code) <> '' then
        raise exception '이미 사용 중인 코드입니다: %', candidate using errcode = '23505';
      end if;
      -- 난수 충돌: 다시 뽑는다. 32^6(약 10.7억) 공간이라 실질적으로 1~2회면 끝난다.
      if tries > 50 then
        raise exception 'code_space_exhausted' using errcode = '54000';
      end if;
    end;
  end loop;
end;
$$;

comment on function public.claim_entity_code(text, uuid, text) is
  '전역 레지스트리에서 레코드 코드를 예약해 반환한다. 다른 워크스페이스의 코드까지 봐야 중복을 판정할 수 있어 SECURITY DEFINER다. 호출 권한은 revoke로 잠겨 있어 원장 트리거만 경유한다.';

-- 이 DEFINER 함수는 함수 안에서 호출자 권한을 따로 묻지 않는다. 대신 호출 자체를 잠근다 —
-- 아무 역할에도 EXECUTE가 없으므로 도달 경로는 원장 BEFORE INSERT 트리거 하나뿐이고,
-- 그 원장에 행을 넣을 수 있는지는 각 원장의 RLS가 이미 판정한 뒤다.
-- (함수 안에서 다시 판정하려면 원장별 정책을 여기에 복제해야 하고, 그 복제본이 곧 권한 구멍이 된다.)
revoke all on function public.claim_entity_code(text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- (4) 원장 공용 BEFORE INSERT 트리거 — code 미지정이면 전역 유니크 코드를 채운다.
-- ---------------------------------------------------------------------
create or replace function public.assign_entity_code()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  new.code := public.claim_entity_code(TG_TABLE_NAME, new.id, new.code);
  return new;
end;
$$;

comment on function public.assign_entity_code() is
  '원장 BEFORE INSERT 공용 트리거: 전역 레지스트리에서 유니크 코드를 받아 code에 채운다. 원장이 늘어도 이 함수 하나를 붙이면 된다.';

-- 반환형이 trigger라 PostgREST RPC 표면에 오르지 않는다(별도 revoke 불요).
-- 실제 코드 발급 권한은 위 claim_entity_code의 revoke가 잠근다.

-- ---------------------------------------------------------------------
-- (5) FUND 코드 신설 — 사업(programs)과 같은 형식·같은 발급 경로.
-- ---------------------------------------------------------------------
alter table public.funds
  add column if not exists code text;

comment on column public.funds.code is
  '펀드코드(6자리 영숫자 난수, 전역 유니크). 신규 등록 시 assign_entity_code 트리거가 부여한다.';

create unique index if not exists idx_funds_code on public.funds (code);

-- ---------------------------------------------------------------------
-- (6) 기존 코드 레지스트리 등재 + 교차 충돌 해소 + 미부여 백필
--     - 이미 쓰이던 코드는 최대한 보존한다(사람이 외워 둔 값이라 함부로 바꾸지 않는다).
--     - 원장 간 충돌이 실제로 있으면 나중 원장 쪽을 재발급한다.
--     - funds처럼 코드가 없던 원장은 새로 발급한다.
-- ---------------------------------------------------------------------
do $$
declare
  tbl  text;
  tbls constant text[] := array['programs', 'ma_programs', 'project_programs', 'funds'];
  r    record;
  new_code text;
begin
  foreach tbl in array tbls loop
    -- (a) 충돌 없는 기존 코드부터 레지스트리에 등재한다.
    execute format($f$
      insert into public.entity_codes (code, entity_table, entity_id)
      select t.code, %L, t.id
        from public.%I t
       where t.code is not null and btrim(t.code) <> ''
       on conflict do nothing
    $f$, tbl, tbl);

    -- (b) 등재에 실패한 행(= 다른 원장이 먼저 가져간 코드) + 코드가 없던 행을 재발급한다.
    for r in execute format($f$
      select t.id
        from public.%I t
       where not exists (
               select 1 from public.entity_codes c
                where c.entity_table = %L and c.entity_id = t.id)
    $f$, tbl, tbl)
    loop
      new_code := public.claim_entity_code(tbl, r.id, null);
      execute format('update public.%I set code = $1 where id = $2', tbl)
        using new_code, r.id;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (7) 원장 트리거를 공용 함수로 교체하고 원장별 구버전을 정리한다.
--     구버전은 자기 테이블 안에서만 유니크를 봤으므로 남겨 두면 안 된다.
-- ---------------------------------------------------------------------
drop trigger if exists trg_programs_assign_code on public.programs;
create trigger trg_programs_assign_code
  before insert on public.programs
  for each row execute function public.assign_entity_code();

drop trigger if exists trg_ma_programs_assign_code on public.ma_programs;
create trigger trg_ma_programs_assign_code
  before insert on public.ma_programs
  for each row execute function public.assign_entity_code();

drop trigger if exists trg_project_programs_assign_code on public.project_programs;
create trigger trg_project_programs_assign_code
  before insert on public.project_programs
  for each row execute function public.assign_entity_code();

drop trigger if exists trg_funds_assign_code on public.funds;
create trigger trg_funds_assign_code
  before insert on public.funds
  for each row execute function public.assign_entity_code();

drop function if exists public.programs_assign_code();
drop function if exists public.ma_programs_assign_code();
drop function if exists public.project_programs_assign_code();

-- gen_program_code()는 위 구버전 함수들만 쓰던 것이라 함께 정리한다(gen_entity_code로 승계).
drop function if exists public.gen_program_code();
