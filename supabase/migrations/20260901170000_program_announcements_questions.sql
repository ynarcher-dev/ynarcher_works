-- =====================================================================
-- [사업] 공지사항·QNA 원장 — 사업개요(20260901140000)에 이은 게스트향 고정 화면 2종
--
-- 공지사항(program_announcements): 담당자가 WORKS 사업 상세의 공지사항 탭에서 쓰고,
--   게스트가 사이드바 고정 메뉴 '공지사항'에서 읽는 사업 단위 게시판. 메뉴별
--   NOTICE(program_notices — 모듈 귀속, 메뉴당 한 건)와 축이 다르다: 이쪽은 사업
--   전체를 향한 글 목록이라 모듈에 매이지 않고 여러 건이 쌓인다.
--
-- QNA(program_questions): **게스트가 질문을 쓰고 담당자가 답변한다** — 게스트 쓰기가
--   콘텐츠 원장에 열리는 첫 사례다(기존 게스트 INSERT는 예약·만족도·평가뿐).
--   공개 범위는 본인 질문만이다(2026-09-01 사용자 결정, 1:1 문의함) — 게스트는 자기
--   질문과 그 답변만 보고, 담당자만 전체를 본다. 질문 본문은 순수 텍스트다(GUEST 앱은
--   에디터를 싣지 않는다 — lib/richText.ts 머리말). 답변은 WORKS 공용 리치텍스트다.
--   답변은 별도 원장 없이 질문 행의 answer_* 열에 둔다 — 질문 하나에 답변 하나이며,
--   추가 문의는 새 질문으로 잇는다(스레드를 두면 1:1 문의함이 채팅이 된다).
--
-- 범위: AC 원장만 만든다(NOTICE·사업개요와 같은 이유 — 게스트 로그인 개방이 AC뿐).
--   화면 쪽도 config(tables.announcements / tables.questions 유무)로 같은 경계를 긋는다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac. 데이터 등급: Internal(공지·문의 본문 — 개인정보 원장 아님.
--     질문 작성자 표시는 WORKS가 users를 임베드해 얻고, 게스트는 남의 질문 행 자체를
--     보지 못하므로 다른 참여자의 신원이 게스트에게 흐르지 않는다).
--   · 접근 주체: 내부 AC 사용자(공지 작성·수정, 질문 열람·답변·소프트 삭제),
--     외부 게스트(공지 읽기, 질문 쓰기·본인 것 읽기).
--   · Scope: program — 둘 다 사업개요와 같은 app.guest_program_ids() 단일 기준.
--     QNA 게스트 SELECT는 여기에 created_by = 본인이 AND로 더해진다(본인 질문만).
--   · RLS 즉시 활성화, SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft delete).
--   · 게스트 INSERT(질문)는 with check로 좁힌다: 본인 명의 + 세션에 고정된 살아 있는
--     사업 + answer_* 열이 비어 있을 것(자기 질문에 답변을 실어 보내는 위장 차단).
--     게스트 UPDATE 정책은 없다 — 올린 질문은 고칠 수 없고, 답변 열은 내부만 채운다.
--   · 신규 SECURITY DEFINER 없음. GRANT 변경 없음. Storage 무관.
--   · 감사 로그: 조회·수정 대상이 개인정보 원본·파일·Export·권한이 아니므로 적재 대상 아님.
--   · 운영 영향: 신규 테이블 2개뿐 — 기존 정책·프론트 쿼리 영향 없음.
-- 근거: 20260901120000_program_module_notices.sql(정책 형태),
--       20260901140000_program_overview.sql(사업 단위 게스트 SELECT 기준)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 공지사항 — WORKS 작성, GUEST 읽기 전용
-- ---------------------------------------------------------------------
create table if not exists public.program_announcements (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  title      text not null,
  body       text,
  created_by uuid references public.users(id) default app.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.program_announcements is
  '사업 공지사항(AC — 사업 단위 게시판). WORKS 사업 상세의 공지사항 탭에서 담당자가 쓰고,
   GUEST 고정 메뉴 공지사항에서 게스트가 읽는다. 모듈별 NOTICE(program_notices)와 축이 다르다';
comment on column public.program_announcements.body is
  '공지 본문(공용 리치텍스트 에디터 HTML). GUEST는 허용 목록 정화기를 거쳐 그린다';

create index if not exists idx_program_announcements_program
  on public.program_announcements (program_id, created_at desc);

drop trigger if exists trg_program_announcements_updated_at on public.program_announcements;
create trigger trg_program_announcements_updated_at
  before update on public.program_announcements
  for each row execute function app.set_updated_at();

alter table public.program_announcements enable row level security;

drop policy if exists program_announcements_ac_select on public.program_announcements;
create policy program_announcements_ac_select on public.program_announcements for select
  using (app.can_read_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_announcements_ac_insert on public.program_announcements;
create policy program_announcements_ac_insert on public.program_announcements for insert
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_announcements_ac_update on public.program_announcements;
create policy program_announcements_ac_update on public.program_announcements for update
  using (app.can_write_workspace('ac') and app.can_access_program(program_id))
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));
-- DELETE 정책은 만들지 않는다(deleted_at 기반 soft delete).

drop policy if exists program_announcements_guest_select on public.program_announcements;
create policy program_announcements_guest_select on public.program_announcements for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_id in (select app.guest_program_ids())
  );

-- ---------------------------------------------------------------------
-- (2) QNA — GUEST 질문 작성, WORKS 답변. 게스트에게는 본인 질문만 보인다.
-- ---------------------------------------------------------------------
create table if not exists public.program_questions (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete cascade,
  title       text not null,
  body        text,
  answer_body text,
  answered_by uuid references public.users(id),
  answered_at timestamptz,
  created_by  uuid references public.users(id) default app.current_app_user_id(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

comment on table public.program_questions is
  '사업 QNA(AC — 1:1 문의함). 게스트가 GUEST 고정 메뉴 QNA에서 질문을 쓰고 담당자가
   WORKS QNA 탭에서 답변한다. 게스트에게는 본인 질문만 보인다(2026-09-01 결정)';
comment on column public.program_questions.body is
  '질문 본문(순수 텍스트, 줄바꿈 보존 — GUEST 앱은 에디터를 싣지 않는다)';
comment on column public.program_questions.answer_body is
  '답변 본문(공용 리치텍스트 에디터 HTML). 비어 있으면 답변 대기다';

create index if not exists idx_program_questions_program
  on public.program_questions (program_id, created_at desc);
create index if not exists idx_program_questions_author
  on public.program_questions (created_by);

drop trigger if exists trg_program_questions_updated_at on public.program_questions;
create trigger trg_program_questions_updated_at
  before update on public.program_questions
  for each row execute function app.set_updated_at();

alter table public.program_questions enable row level security;

-- 내부: 담당자는 전체를 읽고, 답변·소프트 삭제는 UPDATE 하나로 처리한다.
-- 내부 INSERT 정책은 두지 않는다 — 질문의 출처는 게스트이고, 담당자는 답변으로만 관여한다.
drop policy if exists program_questions_ac_select on public.program_questions;
create policy program_questions_ac_select on public.program_questions for select
  using (app.can_read_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_questions_ac_update on public.program_questions;
create policy program_questions_ac_update on public.program_questions for update
  using (app.can_write_workspace('ac') and app.can_access_program(program_id))
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));

-- 게스트 읽기: 본인 질문만. 세션에 고정된 사업 조건을 함께 건다 — 같은 계정이 다른
-- 사업에 로그인했을 때 이전 사업의 문의가 따라오지 않게 한다.
drop policy if exists program_questions_guest_select on public.program_questions;
create policy program_questions_guest_select on public.program_questions for select
  using (
    app.is_guest()
    and deleted_at is null
    and created_by = app.current_app_user_id()
    and program_id in (select app.guest_program_ids())
  );

-- 게스트 쓰기: 본인 명의로, 세션에 고정된 살아 있는 사업에만. answer_* 를 비워 보내야
-- 한다 — 질문과 답변을 한 번에 실어 보내면 담당자가 하지 않은 답변이 원장에 남는다.
drop policy if exists program_questions_guest_insert on public.program_questions;
create policy program_questions_guest_insert on public.program_questions for insert
  with check (
    app.is_guest()
    and created_by = app.current_app_user_id()
    and program_id in (select app.guest_program_ids())
    and answer_body is null
    and answered_by is null
    and answered_at is null
  );
-- 게스트 UPDATE 정책은 없다 — 올린 질문은 고치지 못하고, 답변 열은 내부만 채운다.
