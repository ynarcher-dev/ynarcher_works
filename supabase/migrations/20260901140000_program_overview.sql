-- =====================================================================
-- [사업] 사업개요 원장 — WORKS 담당자 작성, GUEST 로그인 직후 첫 화면 읽기 전용
--
-- 배경: 사업에는 참여자에게 건네는 소개문이 설 자리가 없었다. 담당자가 WORKS 사업
--   상세의 '사업개요' 탭에서 공용 리치텍스트 에디터로 사업소개를 쓰고, 게스트는
--   로그인 직후 첫 화면(사이드바 최상단 고정 메뉴 '사업개요')에서 같은 내용을 읽는다.
--
-- 범위: AC 원장 하나(program_overviews)만 만든다. NOTICE(20260901120000)와 같은 이유 —
--   게스트에게 닿기 위한 기능인데 게스트 로그인 개방은 AC뿐이므로 ma_/project_ 원장은
--   만들지 않고, 화면 쪽도 config(tables.overviews 유무)로 같은 경계를 긋는다.
--
-- 형태: 사업 1건 = 개요 1건이므로 program_id가 곧 PK다(1:1). deleted_at을 두지 않는
--   이유: 행 자체가 '개요'라는 자리 하나라서 내리는 것과 비우는 것이 같은 사실이다 —
--   내용을 비우면 body가 null일 뿐 행은 남는다(물리 삭제 없음).
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac. 데이터 등급: Internal(사업 소개문 — 개인정보 없음).
--   · 접근 주체: 내부 AC 사용자(작성·수정), 외부 게스트(읽기 전용).
--   · Scope: program. 내부는 app.can_access_program(), 게스트는 app.guest_program_ids()
--     — 게스트 조회 범위 판정을 이 함수 밖에 두 벌 두지 않는다. 모듈 공유 범위가 아니라
--     사업 단위로 여는 이유: 개요는 메뉴(모듈)가 아니라 사업 자체의 소개라, 로그인이
--     열린 게스트라면 공개 메뉴가 하나도 없어도 읽을 수 있어야 한다.
--   · RLS 즉시 활성화, SELECT/INSERT/UPDATE 분리, DELETE 정책 없음.
--   · 신규 SECURITY DEFINER 없음. GRANT 변경 없음. Storage 무관.
--   · 감사 로그: 조회·수정 대상이 개인정보·파일·Export·권한이 아니므로 적재 대상 아님.
--   · 운영 영향: 신규 테이블 1개뿐 — 기존 정책·프론트 쿼리 영향 없음.
-- 근거: 20260901120000_program_module_notices.sql(경계·정책 형태),
--       20260827130000_program_guest_access.sql(app.guest_program_ids)
-- =====================================================================

create table if not exists public.program_overviews (
  program_id uuid primary key references public.programs(id) on delete cascade,
  body       text,
  created_by uuid references public.users(id) default app.current_app_user_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.program_overviews is
  '사업개요(사업소개문, AC — 사업 1건당 1건, program_id가 PK). WORKS 사업 상세의 사업개요
   탭에서 담당자가 쓰고, GUEST 로그인 직후 첫 화면에서 게스트가 읽는다';
comment on column public.program_overviews.body is
  '소개 본문(공용 리치텍스트 에디터 HTML). GUEST는 허용 목록 정화기(sanitizeRichText)를 거쳐 그린다';

drop trigger if exists trg_program_overviews_updated_at on public.program_overviews;
create trigger trg_program_overviews_updated_at
  before update on public.program_overviews
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS — program_notices와 같은 경계(내부 AC + 게스트 읽기), 단 스코프는 사업 단위
-- ---------------------------------------------------------------------
alter table public.program_overviews enable row level security;

drop policy if exists program_overviews_ac_select on public.program_overviews;
create policy program_overviews_ac_select on public.program_overviews for select
  using (app.can_read_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_overviews_ac_insert on public.program_overviews;
create policy program_overviews_ac_insert on public.program_overviews for insert
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));

drop policy if exists program_overviews_ac_update on public.program_overviews;
create policy program_overviews_ac_update on public.program_overviews for update
  using (app.can_write_workspace('ac') and app.can_access_program(program_id))
  with check (app.can_write_workspace('ac') and app.can_access_program(program_id));
-- DELETE 정책은 만들지 않는다(행은 남고 body만 비운다).

-- 게스트 읽기 — 조회 범위 판정의 단일 기준(app.guest_program_ids())을 그대로 쓴다.
drop policy if exists program_overviews_guest_select on public.program_overviews;
create policy program_overviews_guest_select on public.program_overviews for select
  using (app.is_guest() and program_id in (select app.guest_program_ids()));
