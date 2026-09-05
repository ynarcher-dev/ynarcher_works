-- =====================================================================
-- [게스트 통합 계정 1/4] 원장 — 계정 · 인격 매핑 · 자격증명 · 접근 기간
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
-- 세 축을 가른다:
--   (1) **계정 = 사람**이다. 로그인 ID(이메일) 하나, 비밀번호 하나.
--   (2) **자격(참가기업/참가전문가) = 참여 줄**이 갖는다(program_participants.master_table).
--       계정에 붙이지 않는 이유: 한 사람이 A기업 대표이면서 전문가로도 참여할 수 있고,
--       그때 계정을 갈라 두면 이메일이 같아 로그인에서 어느 쪽인지 가릴 수 없다.
--       자격을 줄로 내리면 계정은 하나로 두고 **들어간 맥락이 화면을 가른다**.
--   (3) **원장 행 ↔ 계정**은 별도 매핑표(guest_identities)가 답한다. 계정에 컬럼으로
--       달면 1:1이 되어 (2)가 성립하지 않고, 원장 이메일이 수정되면 같은 사람에게
--       계정이 하나 더 생긴다.
--
-- 자격증명을 users가 아니라 별도 원장에 두는 이유:
--   users의 SELECT는 내부 사용자 전원에게 열려 있다(참가자 명부가 게스트 이름을 붙이려면
--   그래야 한다). 해시를 거기 두면 전 직원이 읽는다. 잠금 카운터도 함께 옮긴다 —
--   초대 행에 세면 초대가 3건인 사람은 실질 잠금이 15회다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: guest(자격증명·인격 매핑) / ac·mna·project(접근 기간)
--   - 데이터 등급: guest_credentials = Secret(비밀번호 해시·재설정 토큰),
--     guest_identities = Internal, program_participants.access_* = Internal
--   - 접근 주체: guest_credentials는 **아무도 아니다**(service_role Edge Function만).
--     guest_identities는 내부 사용자 SELECT만(명부의 '계정' 열·발급 후보가 읽는다),
--     쓰기는 SECURITY DEFINER RPC 한 곳뿐이라 정책을 만들지 않는다.
--   - Scope 기준: guest_identities SELECT는 내부 사용자 여부만 본다 — 이 표가 답하는 것은
--     "이 원장 행에 계정이 있는가"뿐이고 그 사실은 명부 화면이 이미 보여 준다.
--   - 감사 로그: 계정 발급·정지는 후속 RPC 마이그레이션에서 app.log_guest_access()를 탄다.
--   - SECURITY DEFINER 신설: 없음(이 파일은 DDL만 수행한다)
--   - 운영 영향: 전부 create table / add column이라 기존 조회·정책이 깨지지 않는다.
--     기존 경로(초대 행의 password_hash)는 이 시점까지 그대로 동작한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 계정의 키 — 이메일
--
--     로그인이 이메일 + 비밀번호 2요소이므로 같은 이메일에 게스트 계정이 둘이면 어느
--     쪽인지 가릴 방법이 없다. 유일성을 원장이 강제한다.
--     내부 임직원은 대상이 아니다(그쪽은 Supabase Auth가 신원을 갖는다).
--     함수(app.is_guest_user_type)를 조건에 쓰지 않는 것은 인덱스 술어가 IMMUTABLE만
--     받기 때문이며, 그래서 유형 3종을 그대로 적는다.
-- ---------------------------------------------------------------------
create unique index if not exists uq_users_guest_email
  on public.users (lower(email))
  where user_type in ('external_startup', 'external_expert', 'temporary_guest')
    and deleted_at is null
    and email is not null;

comment on index public.uq_users_guest_email is
  '게스트 계정의 키는 이메일이다(로그인 2요소). 재운 계정(deleted_at)은 자리를 비켜 준다. 근거: 3_9_1 §4';

-- ---------------------------------------------------------------------
-- (2) 인격 매핑 — 원장 행 하나가 계정 하나를 가리킨다(계정은 여럿을 가질 수 있다)
--
--     한 계정이 A기업(참가기업)과 본인(참가전문가) 둘을 갖는 것이 정상이다. 반대로 한
--     원장 행을 두 계정이 나눠 가질 수는 없다 — 그러면 그 기업으로 들어온 사람이 누구인지
--     원장이 답하지 못한다. 그래서 PK가 (master_table, master_id)다.
--
--     이 표가 있어야 원장의 이메일이 수정돼도 같은 계정을 다시 찾는다. 계정 컬럼으로
--     달았다면 이메일이 바뀐 순간 계정이 하나 더 생겼을 것이다.
-- ---------------------------------------------------------------------
create table if not exists public.guest_identities (
  master_table text not null check (master_table in ('startups', 'networks')),
  master_id    uuid not null,
  user_id      uuid not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.users(id),
  primary key (master_table, master_id)
);

create index if not exists idx_guest_identities_user on public.guest_identities (user_id);

alter table public.guest_identities enable row level security;

-- 읽기는 내부 사용자 전원. 명부의 '계정' 열과 발급 후보 목록이 이 표를 읽어
-- "이 원장 행에 계정이 있는가"에 답한다 — 그 사실 자체는 명부가 이미 보여 준다.
drop policy if exists guest_identities_select on public.guest_identities;
create policy guest_identities_select on public.guest_identities for select
  using (app.current_app_user_id() is not null and not app.is_guest());

-- 쓰기 정책을 만들지 않는다. 유일한 경로는 자체 인가하는 issue_guest_account RPC이며,
-- 정책을 열면 그 RPC가 강제하는 조건(원장 실재·연락처 구비)을 우회할 수 있다.

comment on table public.guest_identities is
  '원장 행(startups·networks) → 게스트 계정 매핑. 한 계정이 여러 인격을 가질 수 있고(참가기업+참가전문가) 원장 행은 계정 하나만 가리킨다. 쓰기는 issue_guest_account RPC 전용. 근거: 3_9_1 §4';
comment on column public.guest_identities.master_table is
  '인격의 출처 원장: startups(참가기업) | networks(참가전문가). 화면을 가르는 자격은 계정이 아니라 참여 줄이 답하지만, 계정이 어떤 인격들을 갖고 있는지는 이 표가 답한다.';

-- ---------------------------------------------------------------------
-- (3) 자격증명 원장 — 정책을 하나도 만들지 않는다
--
--     RLS를 켜고 정책을 비우면 Default Deny로 authenticated는 한 행도 읽지 못한다.
--     유일한 접근 경로는 service_role로 도는 Edge Function이며, 이것이 의도다.
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
-- (4) 접근 기간 — 참여 줄이 갖는다
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

-- master_table은 이미 있는 컬럼이지만, 이번 개편에서 **자격의 단일 원천**이 되므로
-- 뜻을 다시 적는다. 종전에는 '원본 원장이 어디인가'만 답했다.
comment on column public.program_participants.master_table is
  '이 참여 줄의 자격이자 원장 출처: startups(참가기업) | networks(참가전문가). 게스트가 이 줄로 들어오면 그 자격의 화면이 열린다 — 자격은 계정이 아니라 줄이 갖는다(한 사람이 한 사업에 두 자격으로 참여하면 줄이 둘이고 화면도 둘이다). 근거: 3_9_1 §4';
