-- =====================================================================
-- [게스트 통합 계정 1/4] 원장 — 계정 키 · 자격증명 · 접근 기간
-- 정본: docs/docs_planning/3_9_1_guest_unified_account.md
-- 후속: 20260905130000(이관) → 20260905140000(판정) → 20260905150000(RPC)
--
-- 배경:
--   게스트 계정이 사업마다 별개였다. 초대 레코드(guest_invitations)가 명부 행당 1건인데
--   **비밀번호 해시가 그 행에 있었고**, 로그인 시 초대의 app_user_id가 비어 있으면
--   이메일 조회 없이 users 행을 새로 만들었다. 그래서 한 기업이 두 사업에 걸리면
--   계정 2개·비밀번호 2개였다. 불편의 표면은 사업코드였으나 실제로는 자격증명을
--   두 벌 안내하는 중이었다.
--
-- 이 마이그레이션이 세우는 것 셋:
--   (1) 계정의 키 — 이메일이 아니라 **원장 행**이다. 이메일로 묶으면 A기업 대표이자
--       B사 자문인 사람이 한 계정이 되는데, user_type·company_id·scope_type이 서로
--       배타라 한 계정이 두 인격을 가질 수 없다. 그 경우 계정 2개가 정상이다.
--   (2) 자격증명 — users가 아니라 별도 원장에 둔다. users의 SELECT는 내부 사용자
--       전원에게 열려 있어(참가자 명부가 게스트 이름을 붙이려면 그래야 한다) 해시를
--       거기 두면 전 직원이 읽는다. 잠금 카운터도 함께 옮긴다 — 초대 행에 세면
--       초대가 3건인 사람은 실질 잠금이 15회다.
--   (3) 접근 기간 — 계정이 아니라 **참여 줄**이 갖는다. 계정에 종료일 하나를 달면
--       사업이 둘일 때 답이 없다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest(자격증명) / admin(계정 키) / ac·mna·project(접근 기간)
--   - 데이터 등급: guest_credentials = Secret(비밀번호 해시·재설정 토큰),
--     users.guest_master_* = Internal, program_participants.access_* = Internal
--   - 접근 주체: guest_credentials는 **아무도 아니다** — service_role Edge Function만.
--     나머지 둘은 기존 원장의 정책을 그대로 물려받는다(컬럼 추가라 정책 변경 없음).
--   - Scope 기준: 해당 없음(자격증명은 RLS 경로 자체를 두지 않는다)
--   - 감사 로그: 계정 발급·정지는 후속 RPC 마이그레이션에서 app.log_guest_access()를 탄다.
--     이 파일은 DDL만 수행한다.
--   - SECURITY DEFINER 신설: 없음
--   - 운영 영향: 전부 add column / create table이라 기존 조회·정책이 깨지지 않는다.
--     기존 경로(초대 행의 password_hash)는 이 시점까지 그대로 동작한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 계정의 키 — 원장 행
--
--     'startups'(투자·보육 기업)와 'networks'(전문가·투자사 등 통합 원장) 둘뿐이다.
--     temporary_guest는 원장 행이 없으므로 두 칸이 비고, 그 경우 초대 행이 곧 계정인
--     종전 방식을 유지한다(그래서 유니크 인덱스는 부분 인덱스다).
-- ---------------------------------------------------------------------
alter table public.users
  add column if not exists guest_master_table text,
  add column if not exists guest_master_id    uuid;

alter table public.users drop constraint if exists users_guest_master_check;
alter table public.users add constraint users_guest_master_check check (
  (guest_master_table is null and guest_master_id is null)
  or (guest_master_table in ('startups', 'networks') and guest_master_id is not null)
);

-- 같은 원장 행에 계정은 하나뿐이다. 재운 계정(deleted_at)은 자리를 비켜 준다 —
-- 병합으로 흡수된 계정이 새 발급을 영원히 막으면 안 된다.
create unique index if not exists uq_users_guest_master
  on public.users (guest_master_table, guest_master_id)
  where guest_master_id is not null and deleted_at is null;

comment on column public.users.guest_master_table is
  '게스트 계정이 대표하는 원장: startups | networks. 내부 임직원은 null. 근거: 3_9_1 §4';
comment on column public.users.guest_master_id is
  '그 원장의 행 id. 계정의 키는 이메일이 아니라 이 값이다 — 같은 사람이 기업 인격과 전문가 인격을 함께 가지면 계정 2개가 정상이다.';

-- ---------------------------------------------------------------------
-- (2) 자격증명 원장 — 정책을 하나도 만들지 않는다
--
--     RLS를 켜고 정책을 비우면 Default Deny로 authenticated는 한 행도 읽지 못한다.
--     유일한 접근 경로는 service_role로 도는 Edge Function이며, 이것이 의도다.
--     users에 컬럼으로 두지 않은 이유가 여기 있다 — users는 내부 전원이 읽는다.
-- ---------------------------------------------------------------------
create table if not exists public.guest_credentials (
  user_id         uuid primary key references public.users(id) on delete cascade,
  -- PBKDF2-SHA256 해시(Edge Function이 생성). null이면 아직 초기 상태이고,
  -- 그때만 원장 연락처가 초기 비밀번호로 통한다.
  password_hash   text,
  password_set_at timestamptz,
  -- 무차별 대입은 서버가 센다(연속 5회 실패 시 15분 잠금). 계정 단위여야 한다 —
  -- 초대 행 단위로 세면 초대가 3건인 사람은 실질 잠금이 15회가 된다.
  login_attempts  integer not null default 0,
  locked_until    timestamptz,
  -- 재설정 링크. 값이 아니라 해시만 담고, 발급자에게도 원문을 돌려주지 않는다 —
  -- 링크는 게스트 본인 연락처로만 나간다(3_9_1 §3).
  reset_token_hash text,
  reset_expires_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.guest_credentials enable row level security;

-- 정책 없음이 곧 설계다. 아래 REVOKE는 RLS를 우회하는 테이블 권한까지 확실히 닫는다.
revoke all on table public.guest_credentials from anon, authenticated;

create index if not exists idx_guest_credentials_reset
  on public.guest_credentials (reset_expires_at)
  where reset_token_hash is not null;

comment on table public.guest_credentials is
  '게스트 자격증명(비밀번호 해시·잠금·재설정 토큰). RLS 정책을 만들지 않는다 — 접근 경로는 service_role Edge Function뿐이다. users에 두지 않은 이유: users의 SELECT는 내부 전원에게 열려 있다. 근거: 3_9_1 §5';
comment on column public.guest_credentials.password_hash is
  'null이면 초기 상태. 이때만 원장 연락처가 초기 비밀번호로 통하며, 한 번 정하면 새 사업에 추가되어도 연락처가 통하지 않는다.';

-- 갱신 시각 자동 유지(기존 공용 트리거 함수 재사용).
drop trigger if exists trg_guest_credentials_updated_at on public.guest_credentials;
create trigger trg_guest_credentials_updated_at
  before update on public.guest_credentials
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- (3) 접근 기간 — 참여 줄이 갖는다
--
--     "사업마다 기간이 다르다"가 문제가 되는 것은 기간을 계정에 붙일 때다.
--     줄마다 갖게 하면 만료된 줄만 목록에서 사라지고 계정과 다른 줄은 살아 있다.
--     null은 '제한 없음'이다 — 기존 행을 열어 둔 채로 이관하기 위한 값이며,
--     신규 개방은 RPC가 기본값(사업 종료일 + 14일)을 채운다.
-- ---------------------------------------------------------------------
alter table public.program_participants
  add column if not exists access_starts_at timestamptz,
  add column if not exists access_ends_at   timestamptz;

alter table public.program_participants drop constraint if exists program_participants_access_window_check;
alter table public.program_participants add constraint program_participants_access_window_check check (
  access_starts_at is null or access_ends_at is null or access_starts_at < access_ends_at
);

-- 게스트 조회 판정(app.guest_program_ids)이 매 요청 이 조합으로 좁힌다.
create index if not exists idx_program_participants_access
  on public.program_participants (user_id, login_status, access_ends_at);

comment on column public.program_participants.access_starts_at is
  '이 참여 줄의 접근 시작. null이면 개방 즉시. 근거: 3_9_1 §8';
comment on column public.program_participants.access_ends_at is
  '이 참여 줄의 접근 종료. null이면 제한 없음(사업 종료·차단은 별개 축으로 여전히 막는다). 기본값은 사업 종료일 + 14일이며 open_program_guest_access가 채운다.';
