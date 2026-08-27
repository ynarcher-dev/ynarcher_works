-- =====================================================================
-- GUEST 메뉴 = WORKS 공개 모듈 (게스트 읽기 범위 개방)
--
-- 배경: WORKS 사업 상세의 '일정관리'는 program_modules를 쌓는 화면이고, 운영자는 그 카드에서
--   공유 범위(WORKS ONLY / WORKS+GUEST / 전체공개)와 기간(settings.start_date·end_date)을
--   이미 설정하고 있다. 그런데 게스트에게는 program_modules를 읽을 정책이 한 줄도 없어,
--   app.guest_module_ids()가 가리키는 그 모듈들을 정작 게스트 화면이 열거하지 못했다.
--   그 결과 GUEST 사이드바는 코드에 박힌 3개 메뉴로 남고, 일정 화면은 아무도 채우지 않는
--   program_timeline_items를 읽어 언제나 비어 있었다.
--
-- 이 마이그레이션이 하는 일
--   (1) app.guest_module_ids()를 좁힌다 — 꺼진 모듈(enabled=false)과 취소된 모듈은 게스트에게
--       없는 것으로 친다. 종전 정의는 공유 범위만 보아, WORKS에서 끈 메뉴가 게스트 쪽
--       일정·슬롯·세션 판정에는 그대로 살아 있었다.
--   (2) 게스트 SELECT 정책 4종을 더한다 — 모듈 자체(메뉴 줄)와 그 모듈이 담는 내용
--       (글쓰기 program_posts / URL첨부 program_links / 파일첨부 attachments).
--       넷 모두 뿌리는 하나다: app.guest_module_ids(). 공개 스위치를 여기 말고 어디에도
--       두지 않는다 — 두 곳에 두면 이중 관리가 되고, 어느 쪽이 진짜인지 판정할 근거가 없다.
--
-- 게스트에게 쓰기는 열지 않는다. 글·링크·파일은 운영자가 만들고 게스트는 읽기만 한다.
-- M&A·PROJECT 원장(ma_/project_ 계열)은 게스트 로그인 개방 대상이 아니므로 손대지 않는다
--   (3_9_workspace_guest.md §2 '적용 범위': 이번 개방 대상은 AC 사업).
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac(모듈·글·링크) / 공용(attachments). 진입 주체는 guest.
--   · 데이터 등급: Internal. 개인정보 원장은 열지 않는다 — 명부·원장·평가 결과는 대상 밖이다.
--   · 접근 주체: 외부 스타트업·전문가 게스트(읽기 전용).
--   · Scope: program → module. 세션에 고정된 사업(app.guest_session_program_id) 안에서,
--     담당자가 공유 범위를 올리고 켜 둔 모듈로만 좁혀진다. 게스트가 고를 수 있는 축이 없다.
--   · 신규 테이블 없음. 신규 SECURITY DEFINER 없음(기존 함수 1종을 더 좁게 재정의).
--   · 신규 정책은 모두 permissive SELECT이며 내부 정책과 OR로 병존한다. 내부 화면 쿼리에
--     영향이 없다(is_guest()가 false면 조건이 즉시 무너진다).
--   · attachments는 program_module_id가 있는 행만 대상이다. 이 열이 비어 있는 자료
--     (스타트업·전문가·회의록 첨부 등)는 게스트 조건 자체가 성립하지 않는다.
--   · DELETE 정책 신설 없음. INSERT/UPDATE 신설 없음. 물리 삭제 없음.
--   · 감사 로그: 파일 다운로드는 기존 material-download Edge Function이 access_logs를
--     적재하는 경로를 그대로 탄다(본 마이그레이션은 새 다운로드 경로를 만들지 않는다).
--   · 운영 영향: guest_module_ids()가 좁아지므로 기존 게스트 조회 범위도 함께 좁아진다
--     (꺼진·취소된 모듈에 매인 일정·슬롯·세션이 빠진다). 의도된 Default Deny 방향이다.
-- 근거: 20260827130000_program_guest_access.sql, 20260803230100_program_module_content.sql,
--       docs/docs_planning/3_9_workspace_guest.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 공개 모듈 판정을 좁힌다 — 공유 범위 + 켜짐 + 취소 아님
-- ---------------------------------------------------------------------
create or replace function app.guest_module_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select m.id
    from public.program_modules m
   where m.program_id in (select app.guest_program_ids())
     and m.visibility in ('GUEST_ONLY', 'PUBLIC')
     and m.enabled
     and m.status <> 'CANCELLED';
$$;

comment on function app.guest_module_ids() is
  '게스트에게 공개된 모듈(공유 범위 일부공개·전체공개 + 켜짐 + 취소 아님).
   게스트 메뉴 구성과 일정·슬롯·세션·글·링크·파일 노출의 단일 기준.';

-- ---------------------------------------------------------------------
-- (2) 게스트 읽기 정책 — 메뉴 줄과 그 안의 내용
-- ---------------------------------------------------------------------

-- 메뉴 줄 자체. GUEST 사이드바는 이 결과를 그대로 그린다.
drop policy if exists modules_guest_select on public.program_modules;
create policy modules_guest_select on public.program_modules for select
  using (app.is_guest() and id in (select app.guest_module_ids()));

-- 글쓰기 모듈의 글(읽기 전용). 소프트 삭제된 글은 게스트에게 없다.
drop policy if exists program_posts_guest_select on public.program_posts;
create policy program_posts_guest_select on public.program_posts for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id in (select app.guest_module_ids())
  );

-- URL첨부 모듈의 링크(읽기 전용).
drop policy if exists program_links_guest_select on public.program_links;
create policy program_links_guest_select on public.program_links for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id in (select app.guest_module_ids())
  );

-- 파일첨부 모듈의 파일. 사업 자료와 같은 행이므로, 모듈에 귀속된 행만 골라 연다
-- (program_module_id가 빈 자료는 이 조건에서 애초에 걸리지 않는다).
drop policy if exists attachments_guest_select on public.attachments;
create policy attachments_guest_select on public.attachments for select
  using (
    app.is_guest()
    and deleted_at is null
    and program_module_id is not null
    and program_module_id in (select app.guest_module_ids())
  );
