-- =====================================================================
-- 공유 범위를 두 값으로 좁힌다 — 이름만 있고 동작이 없던 PUBLIC을 걷는다
--
-- 무엇이 문제였나
--   module_visibility는 세 값(INTERNAL_ONLY / GUEST_ONLY / PUBLIC)이었으나, PUBLIC을
--   가르는 분기가 DB에도 프론트에도 없었다. 이 값을 읽는 곳은 app.guest_module_ids()
--   하나뿐이고 거기서 `visibility in ('GUEST_ONLY','PUBLIC')`으로 한 묶음이었으므로,
--   담당자가 '전체공개(누구나)'를 골라도 실제로 열리는 것은 GUEST 포털뿐이었다.
--   program_modules에 anon 대상 정책은 한 줄도 없다(있었던 적도 없다).
--
--   즉 정보가 새는 사고가 아니라 그 반대다 — 밖에 열었다고 믿는데 아무도 못 보는
--   운영 사고이며, 선택지가 사실이 아닌 약속을 하고 있었다.
--
-- 이 마이그레이션이 하는 일
--   (1) 기존 PUBLIC 행을 GUEST_ONLY로 백필한다. 두 값은 지금까지 모든 판정에서
--       동일하게 취급되었으므로 실제 노출 범위가 바뀌는 행은 없다.
--   (2) CHECK 제약으로 신규 저장을 두 값으로 막는다.
--   (3) app.guest_module_ids()의 조건을 `= 'GUEST_ONLY'`로 좁힌다. (1)이 선행하므로
--       이 함수의 결과 집합은 변하지 않는다.
--
-- enum 값 자체는 삭제하지 않는다 — PostgreSQL에서 enum 값 제거는 그 타입에 의존하는
-- 컬럼·함수·인덱스를 모두 재작성해야 하고, 얻는 것은 카탈로그의 문자열 한 줄뿐이다.
-- 저장을 막는 것으로 목적은 이미 달성된다.
--
-- 로그인 없는 외부 노출은 이 축이 아니라 별도 축(모듈 링크 공유)이 답한다.
-- 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §7.1
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac(+ 사업 공용이므로 mna·project의 모듈도 같은 원장을 쓴다).
--     진입 주체는 내부 사용자와 guest.
--   · 데이터 등급: Internal. **새로 여는 데이터가 없다** — 이 마이그레이션은 저장 가능한
--     값을 줄이고 판정 조건을 좁히기만 한다.
--   · 접근 주체 변화 없음. 백필이 (3)보다 먼저 실행되므로 게스트가 보던 메뉴는 그대로 보인다.
--   · Scope: program → module. 신규 테이블·정책·트리거 없음.
--   · SECURITY DEFINER 함수 1종을 재정의하되 신설이 아니다(app.guest_module_ids).
--     search_path 고정·stable·무인자·반환 uuid 집합은 종전 그대로이며, 조건만 좁아진다.
--     execute 권한을 새로 주지 않는다(정책 안에서 소유자 권한으로 평가된다).
--   · 감사 로그: 해당 없음(개인정보 조회·다운로드·권한 변경 경로가 아니다).
--   · 물리 삭제 없음. 컬럼 값 정정 1회뿐이다.
--   · 프론트 영향: MODULE_VISIBILITY_OPTIONS에서 PUBLIC을 뺀 빌드가 함께 나간다.
--     순서는 무관하다 — 구 프론트가 PUBLIC을 보내면 CHECK가 거부하고(저장만 실패),
--     신 프론트는 두 값만 보내므로 어느 쪽이 먼저 배포돼도 데이터가 깨지지 않는다.
-- 근거: 20260716120000_program_module_visibility.sql, 20260827170000_guest_module_menu.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 백필 — 반드시 CHECK·함수 변경보다 먼저 실행되어야 한다
--     세 원장을 함께 손본다: 공유 범위는 사업 공용 모듈의 축이고, 한 원장만 좁히면
--     M&A·PROJECT 모듈 세팅이 저장 못 하는 값을 계속 들고 있게 된다.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['program_modules', 'ma_program_modules', 'project_program_modules'] loop
    execute format('update public.%I set visibility = ''GUEST_ONLY'' where visibility = ''PUBLIC''', t);
    -- 제약명은 테이블마다 고유해야 한다.
    begin
      execute format(
        'alter table public.%I add constraint %I check (visibility in (''INTERNAL_ONLY'', ''GUEST_ONLY''))',
        t, t || '_visibility_check');
    exception when duplicate_object then null; end;
  end loop;
end $$;

comment on column public.program_modules.visibility is
  '공유 범위: INTERNAL_ONLY(WORKS만) | GUEST_ONLY(WORKS+GUEST). 로그인한 사람 중 누가
   보는가만 답한다. 로그인 없는 외부 노출은 모듈 링크 공유(별도 축)가 판정한다.
   enum의 PUBLIC은 2026-09-02 폐지 — 값은 남아 있으나 CHECK가 저장을 막는다.';

-- ---------------------------------------------------------------------
-- (3) 게스트 판정 조건을 좁힌다 — (1) 덕분에 결과 집합은 변하지 않는다
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
     and m.visibility = 'GUEST_ONLY'
     and m.enabled
     and m.status <> 'CANCELLED';
$$;

comment on function app.guest_module_ids() is
  '게스트에게 공개된 모듈(공유 범위 WORKS+GUEST + 켜짐 + 취소 아님).
   게스트 메뉴 구성과 일정·슬롯·세션·글·링크·파일 노출의 단일 기준.';
