-- =====================================================================
-- [사업 모듈] 메뉴별 NOTICE(알림) 원장 — WORKS 담당자 작성, GUEST 읽기 전용
--
-- 배경: GUEST 메뉴 화면의 우측 칸은 비워 둔 자리였다. 담당자가 메뉴 단위로 짧은 알림
--   ("마감 연장", "제출 방법 변경" 등)을 세우고 게스트가 같은 자리에서 읽게 한다.
--   메뉴 머리의 '안내'(program_modules.settings.memo)는 메뉴의 지시문 한 벌이고,
--   NOTICE는 날짜가 있는 글 목록이라 원장이 따로 선다.
--
-- 범위: AC 원장 하나(program_notices)만 만든다. NOTICE는 게스트에게 닿기 위한
--   기능인데 게스트 로그인 개방은 AC뿐이므로(ProgramWorkspaceConfig.guestAccess,
--   20260827170000), M&A·PROJECT 원장(ma_/project_)은 만들지 않는다 — 읽을 사람이
--   없는 쓰기 화면만 남는다. 화면 쪽도 config(tables.notices 유무)로 같은 경계를 긋는다.
--   글쓰기(POST) 모듈에는 NOTICE를 세우지 않는다(그 자체가 글이다) — 이는 화면 구성
--   규칙이지 보안 경계가 아니므로 정책에는 넣지 않는다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac. 데이터 등급: Internal(운영 알림 — 개인정보 없음).
--   · 접근 주체: 내부 AC 사용자(작성·수정), 외부 게스트(읽기 전용).
--   · Scope: program → module. 내부는 can_access_program(), 게스트는
--     app.guest_module_ids() — 게스트 공개 판정을 이 함수 밖에 두 벌 두지 않는다.
--   · RLS 즉시 활성화, SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft delete).
--   · 신규 SECURITY DEFINER 없음. GRANT 변경 없음. Storage 무관.
--   · 감사 로그: 조회·수정 대상이 개인정보·파일·Export가 아니므로 적재 대상 아님.
--   · 운영 영향: 신규 테이블 1개뿐 — 기존 정책·프론트 쿼리 영향 없음.
-- 근거: 20260803230100_program_module_content.sql(program_links 형태),
--       20260827170000_guest_module_menu.sql(게스트 SELECT 정책 형태)
-- =====================================================================

create table if not exists public.program_notices (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs(id) on delete cascade,
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  title             text not null,
  body              text,
  created_by        uuid references public.users(id) default app.current_app_user_id(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.program_notices is
  '메뉴(모듈)별 NOTICE 알림 글(AC). WORKS 모듈 화면 우측에서 담당자가 쓰고,
   GUEST 메뉴 우측 같은 자리에서 게스트가 읽는다. 글쓰기(POST) 모듈은 대상이 아니다';
comment on column public.program_notices.body is
  '알림 본문(순수 텍스트, 줄바꿈 보존). 짧은 공지용이라 리치텍스트를 쓰지 않는다';

create index if not exists idx_program_notices_module
  on public.program_notices (program_module_id, created_at desc);
create index if not exists idx_program_notices_program
  on public.program_notices (program_id);

drop trigger if exists trg_program_notices_updated_at on public.program_notices;
create trigger trg_program_notices_updated_at
  before update on public.program_notices
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — program_links와 같은 경계(내부 AC + 게스트 읽기)
-- ---------------------------------------------------------------------
alter table public.program_notices enable row level security;

drop policy if exists program_notices_ac_select on public.program_notices;
create policy program_notices_ac_select on public.program_notices for select
  using (app.can_read_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_notices_ac_insert on public.program_notices;
create policy program_notices_ac_insert on public.program_notices for insert
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_notices_ac_update on public.program_notices;
create policy program_notices_ac_update on public.program_notices for update
  using (app.can_write_workspace('ac') and app.can_access_program(program_id))
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));
-- DELETE 정책은 만들지 않는다(deleted_at 기반 soft delete).

-- 게스트 읽기 — 공개 판정의 단일 기준(app.guest_module_ids())을 그대로 쓴다.
drop policy if exists program_notices_guest_select on public.program_notices;
create policy program_notices_guest_select on public.program_notices for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id in (select app.guest_module_ids())
  );
