-- =====================================================================
-- 사업코드(program code) 신설: 사업 1건당 6자리 영숫자 난수 코드 자동 부여
--   * 형식: 6자리 [숫자 0-9 + 대문자 A-Z], 혼동 문자(0/O/1/I) 제외한 32자 집합
--   * 신규 사업: BEFORE INSERT 트리거가 코드 미지정 시 유니크 코드를 자동 채움
--   * 기존 사업: 본 마이그레이션에서 일괄 백필
--   * 유니크 인덱스로 중복 방지, 트리거는 충돌 시 재추첨
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블 없음(기존 public.programs 에 nullable 컬럼 1개 추가).
--   - RLS 영향 없음: 코드는 사업 소유 워크스페이스(AC) 데이터 등급 Internal,
--     기존 programs SELECT/INSERT/UPDATE 정책이 그대로 커버.
--   - 신규 함수 2개는 SECURITY DEFINER 아님(INVOKER). 권한 상승 없음,
--     외부 클라이언트가 직접 호출하지 않는 내부 생성/트리거 함수. search_path 고정.
--   - GRANT EXECUTE 추가 없음. 감사 로그/개인정보/파일/Export 영향 없음. 멱등.
-- =====================================================================

-- 1) 6자리 영숫자 코드 후보 1건 생성(유니크 보장 없음 — 호출부에서 충돌 검사).
create or replace function public.gen_program_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  -- 혼동 쉬운 0/O/1/I 를 제외한 32자 집합(숫자+대문자).
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

comment on function public.gen_program_code() is '사업코드 후보(6자리 영숫자) 1건 생성. 유니크 검사는 호출부 책임.';

-- 2) 코드 컬럼 + 유니크 인덱스.
alter table public.programs
  add column if not exists code text;

comment on column public.programs.code is '사업코드(6자리 영숫자 난수, 유니크). 신규 등록 시 트리거 자동 부여.';

create unique index if not exists idx_programs_code on public.programs (code);

-- 3) BEFORE INSERT 트리거: 코드 미지정 시 유니크할 때까지 재추첨하여 채움.
create or replace function public.programs_assign_code()
returns trigger
language plpgsql
volatile
set search_path = public
as $$
declare
  candidate text;
begin
  if new.code is not null then
    return new;
  end if;
  loop
    candidate := public.gen_program_code();
    exit when not exists (select 1 from public.programs where code = candidate);
  end loop;
  new.code := candidate;
  return new;
end;
$$;

comment on function public.programs_assign_code() is 'programs BEFORE INSERT: code 미지정 시 유니크 사업코드 자동 부여.';

drop trigger if exists trg_programs_assign_code on public.programs;
create trigger trg_programs_assign_code
  before insert on public.programs
  for each row execute function public.programs_assign_code();

-- 4) 기존 사업 코드 백필(코드 없는 행만, 충돌 시 재추첨).
do $$
declare
  r record;
  candidate text;
begin
  for r in select id from public.programs where code is null loop
    loop
      candidate := public.gen_program_code();
      exit when not exists (select 1 from public.programs where code = candidate);
    end loop;
    update public.programs set code = candidate where id = r.id;
  end loop;
end $$;
