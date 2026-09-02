-- =====================================================================
-- 게스트: 아직 열리지 않은(준비)·취소된 메뉴의 '내용'을 닫는다
--
-- 무엇이 문제였나
--   app.guest_module_ids()는 메뉴가 게스트에게 **서는가**를 판정한다(공유 범위 + 켜짐 +
--   취소 아님). 그런데 메뉴 안의 내용(글·링크·파일·매칭 슬롯·멘토링 세션)까지 같은 함수로
--   열려 있어, 담당자가 아직 '준비' 단계로 둔 메뉴의 자료를 참여자가 그대로 열람·다운로드할
--   수 있었다. 메뉴 줄이 서는 것과 그 안이 열리는 것은 다른 물음인데 한 함수가 둘 다 답했다.
--
-- 이 마이그레이션이 하는 일
--   (1) app.guest_open_module_ids()를 새로 세운다 — guest_module_ids() ∩ 상태 진행·완료.
--       메뉴 줄·공지·일정은 종전대로 guest_module_ids()가 답하고(준비 단계 메뉴도 사이드바에
--       '준비' 배지를 달고 선다), 내용만 이 좁은 집합이 답한다.
--   (2) 내용 정책 3종(글 program_posts / 링크 program_links / 파일 attachments)과
--       매칭·멘토링 판정 함수 2종을 새 집합으로 갈아끼운다.
--
-- 완료(CLOSED)는 계속 열어 둔다 — 끝난 메뉴의 자료를 되돌아보는 것은 참여자의 정당한 용도다.
-- 닫는 대상은 '아직 열리지 않은 것'과 '없던 일이 된 것' 둘뿐이다.
--
-- 화면(GUEST ModulePage)은 같은 규칙으로 준비·취소 메뉴의 몸통을 블러+안내로 덮는다. 다만
-- 화면은 안내일 뿐이고 판정은 여기가 한다 — UI에서 숨기는 것은 보안이 아니다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac(모듈·글·링크·매칭·멘토링) / 공용(attachments). 진입 주체는 guest.
--   · 데이터 등급: Internal. 새로 여는 데이터가 없다 — 이 마이그레이션은 오직 좁힌다.
--   · 접근 주체: 외부 스타트업·전문가 게스트(읽기 전용, 매칭 예약·멘토링 응답만 쓰기).
--   · Scope: program → module → status. 게스트가 고를 수 있는 축이 없다.
--   · 신규 테이블 없음. 신규 SECURITY DEFINER 1종(app.guest_open_module_ids) —
--     기존 guest_module_ids()를 감싸 더 좁히기만 하며, 인자가 없어 주입면이 없다.
--     search_path 고정, stable, 반환은 uuid 집합뿐이다. execute 권한은 별도로 주지 않는다
--     (정책 안에서만 쓰이므로 소유자 권한으로 평가된다 — 기존 guest_* 함수와 같다).
--   · 신규 INSERT/UPDATE/DELETE 정책 없음. 기존 permissive SELECT 3종을 더 좁게 재정의.
--   · 내부 화면 쿼리 영향 없음(is_guest()가 false면 조건이 즉시 무너진다).
--   · 파생 효과: guest_slot_ids()/guest_mentoring_session_ids()가 좁아지므로 준비·취소
--     메뉴의 매칭 예약(bookings_guest_insert)·상담일지·만족도 쓰기도 함께 막힌다. 열리지
--     않은 메뉴에 참여가 먼저 꽂히는 것을 막는 것이 의도다.
--   · 감사 로그: 다운로드 경로(material-download)는 그대로다. 이 정책이 좁아지면 그 함수의
--     RLS 조회가 먼저 비므로 준비 단계 파일은 서명 URL 자체가 발급되지 않는다.
--   · 물리 삭제 없음.
-- 근거: 20260827170000_guest_module_menu.sql, 20260827130000_program_guest_access.sql,
--       docs/docs_planning/3_9_workspace_guest.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 내용 공개 판정 — 메뉴가 서는 것보다 한 단계 좁다
-- ---------------------------------------------------------------------
create or replace function app.guest_open_module_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select m.id
    from public.program_modules m
   where m.id in (select app.guest_module_ids())
     and m.status in ('OPEN', 'CLOSED');
$$;

comment on function app.guest_open_module_ids() is
  '게스트에게 내용까지 열린 모듈(공개 모듈 중 진행·완료).
   메뉴 줄·공지·일정은 guest_module_ids()가, 글·링크·파일·매칭·멘토링은 이 함수가 판정한다.';

-- ---------------------------------------------------------------------
-- (2) 내용 정책 교체 — 모두 기존보다 좁다
-- ---------------------------------------------------------------------

-- 글쓰기 모듈의 글.
drop policy if exists program_posts_guest_select on public.program_posts;
create policy program_posts_guest_select on public.program_posts for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id in (select app.guest_open_module_ids())
  );

-- URL첨부 모듈의 링크.
drop policy if exists program_links_guest_select on public.program_links;
create policy program_links_guest_select on public.program_links for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id in (select app.guest_open_module_ids())
  );

-- 파일첨부 모듈의 파일(사업개요 파일은 별도 정책이라 영향 없음).
drop policy if exists attachments_guest_select on public.attachments;
create policy attachments_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id is not null
    and program_module_id in (select app.guest_open_module_ids())
  );

-- 매칭 슬롯·멘토링 세션의 뿌리도 같은 집합으로 옮긴다. 예약·상담일지·만족도 정책은
-- 이 두 함수를 경유하므로 조건식을 손대지 않아도 함께 좁아진다.
create or replace function app.guest_slot_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select s.id
    from public.matching_slots s
    join public.matching_events e on e.id = s.matching_event_id
   where e.program_module_id in (select app.guest_open_module_ids());
$$;

create or replace function app.guest_mentoring_session_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select s.id
    from public.mentoring_sessions s
    join public.mentoring_relationships r on r.id = s.relationship_id
   where r.program_module_id in (select app.guest_open_module_ids());
$$;
